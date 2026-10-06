// Original organ score in an Interstellar-ish idiom (drone, ticking clock,
// arpeggiated pipe organ, cathedral reverb, swell then silence).
// 96 BPM, 4/4 → one bar = 2.5s, 8 bars = 20s. Writes score.wav.
const fs = require("fs");
const SR = 44100, DUR = 22, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
const BEAT = 0.625, BAR = 2.5;
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;

// Pipe organ: 16'/8'/4'/2⅔'/2' style partials, two slightly detuned ranks
// split across the channels for width.
const ORGAN = [[0.5, 0.35], [1, 1], [2, 0.55], [3, 0.3], [4, 0.22], [6, 0.1], [8, 0.06]];
function organ(t0, dur, midi, amp, { attack = 0.02, release = 0.12, chiff = 0.25, partials = ORGAN } = {}) {
  const f = mf(midi);
  const s0 = Math.floor(t0 * SR), len = Math.floor((dur + release) * SR);
  let seed = midi * 9301 + s0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const n = s0 + i; if (n < 0 || n >= N) continue;
    const t = i / SR;
    let env = t < attack ? t / attack : 1;
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / release);
    let a = 0, b = 0;
    for (const [h, g] of partials) {
      const fh = f * h; if (fh > 9000) continue;
      a += g * Math.sin(TAU * fh * t);
      b += g * Math.sin(TAU * fh * 1.0018 * t + 0.7);
    }
    // Pipe "chiff": a breath of filtered noise at the onset.
    lp += 0.2 * (rnd() - lp);
    const ch = t < 0.06 ? chiff * lp * (1 - t / 0.06) : 0;
    const v = amp * env * 0.18;
    L[n] += v * (a * 0.75 + b * 0.25) + ch * amp * 0.3;
    R[n] += v * (a * 0.25 + b * 0.75) + ch * amp * 0.3;
  }
}

// Clock tick: a short bright click with a tiny pitched body.
function tick(t0, amp) {
  const s0 = Math.floor(t0 * SR);
  let seed = s0 + 1, prev = 0;
  for (let i = 0; i < SR * 0.05; i++) {
    const n = s0 + i; if (n >= N) break;
    const t = i / SR;
    seed = (seed * 16807) % 2147483647;
    const w = (seed / 2147483647) * 2 - 1;
    const hp = w - prev; prev = w;
    const v = amp * (hp * Math.exp(-t * 900) * 0.5 + Math.sin(TAU * 2600 * t) * Math.exp(-t * 260) * 0.35 + Math.sin(TAU * 900 * t) * Math.exp(-t * 120) * 0.2);
    L[n] += v * 0.9; R[n] += v;
  }
}

// Low sine drop for the dive into the black hole.
function boom(t0, amp) {
  const s0 = Math.floor(t0 * SR); let ph = 0;
  for (let i = 0; i < SR * 2.5; i++) {
    const n = s0 + i; if (n >= N) break;
    const t = i / SR, f = 30 + 45 * Math.exp(-t * 3);
    ph += TAU * f / SR;
    const v = amp * Math.sin(ph) * Math.min(1, t / 0.01) * Math.exp(-t * 1.6);
    L[n] += v; R[n] += v;
  }
}

// Noise riser leading into the dive.
function riser(t0, dur, amp) {
  const s0 = Math.floor(t0 * SR); let seed = 777, lp = 0;
  for (let i = 0; i < SR * dur; i++) {
    const n = s0 + i; if (n >= N) break;
    const p = i / (SR * dur);
    seed = (seed * 16807) % 2147483647;
    const w = (seed / 2147483647) * 2 - 1;
    lp += (0.02 + 0.5 * p * p) * (w - lp);
    const v = amp * lp * p * p;
    L[n] += v; R[n] += v * 0.9;
  }
}

// --- Score (cut points: 4.375 boom, 8.4375, 12.1875, 15 swell, 17.5 silence) ---
const T1 = 4.375;
organ(0, T1 + 0.1, 33, 0.9, { attack: 1.8, release: 0.4, chiff: 0 });           // A1
organ(0.3, T1 - 0.2, 40, 0.55, { attack: 2.0, release: 0.4, chiff: 0 });        // E2
organ(2.0, T1 - 1.9, 76, 0.18, { attack: 1.5, release: 0.3, chiff: 0 });        // E5
organ(2.6, T1 - 2.5, 81, 0.12, { attack: 1.2, release: 0.3, chiff: 0 });        // A5
riser(2.9, T1 - 2.9, 0.5);
boom(T1, 0.9);

// Arpeggio sections, each starting on the 8th-note grid from T1.
const E8 = BEAT / 2;
const sections = [
  { at: T1,                 bass: 33, notes: [57, 60, 64, 69, 72, 69, 64, 60], step: E8,     dyn: 0.45 }, // Am  — projects
  { at: T1 + 6 * E8,        bass: 29, notes: [53, 57, 60, 65, 69, 65, 60, 57], step: E8,     dyn: 0.52 }, // F
  { at: T1 + 13 * E8,       bass: 28, notes: [55, 60, 64, 67, 72, 67, 64, 60], step: E8 / 2, dyn: 0.6 },  // C/E — experience
  { at: T1 + 19 * E8,       bass: 31, notes: [55, 59, 62, 67, 71, 74, 71, 67], step: E8 / 2, dyn: 0.66 }, // G
  { at: T1 + 25 * E8,       bass: 33, notes: [69, 72, 76, 81, 84, 81, 76, 72], step: E8 / 2, dyn: 0.72 }, // Am  — about
  { at: T1 + 30 * E8,       bass: 29, notes: [65, 69, 72, 77, 81, 77, 72, 69], step: E8 / 2, dyn: 0.8 },  // F
];
sections.forEach((c, i) => {
  const until = i < sections.length - 1 ? sections[i + 1].at : 15;
  const len = until - c.at;
  organ(c.at, len, c.bass, 0.8 * c.dyn + 0.2, { attack: 0.25, release: 0.3, chiff: 0 });
  organ(c.at, len, c.bass + 12, 0.35 * c.dyn, { attack: 0.25, release: 0.3, chiff: 0 });
  const count = Math.round(len / c.step);
  for (let k = 0; k < count; k++) {
    const m = c.notes[k % c.notes.length] + (c.step < E8 && c.notes[0] < 66 && Math.floor(k / 8) % 2 ? 12 : 0);
    organ(c.at + k * c.step, c.step * 0.95, m, c.dyn * (k % 4 === 0 ? 1 : 0.75), { attack: 0.008, release: 0.08 });
  }
});

// Swell 15–17.5: full organ on A minor, 16ths racing on top.
const swell = [21, 33, 45, 52, 57, 60, 64, 69, 76];
swell.forEach((m, j) => organ(15, BAR, m, 0.9 - j * 0.04, { attack: 1.4, release: 0.02, chiff: 0 }));
for (let k = 0; k < 16; k++) {
  const m = [69, 72, 76, 81, 84, 81, 76, 72][k % 8];
  organ(15 + k * BEAT / 4, BEAT / 4 * 0.95, m, 0.5 + 0.5 * (k / 16), { attack: 0.006, release: 0.05 });
}

// Silence at 17.5 (only the room rings), then one soft chord under the contact.
[41, 57, 60, 64].forEach((m) => organ(18.0, 2.6, m, 0.32, { attack: 0.9, release: 1.2, chiff: 0 }));

// Clock: every 1.25s in the intro and outro, softly under the arpeggio, gone in the swell.
for (let t = 0.0; t < 21; t += 1.25) {
  if (t >= 15 && t < 17.9) continue;
  tick(t, t >= T1 && t < 15 ? 0.22 : 0.55);
}

// --- Swell automation on bar 7: crescendo, then a hard cut at 17.5 -------
for (let n = Math.floor(15 * SR); n < Math.floor(17.5 * SR); n++) {
  const p = (n / SR - 15) / BAR;
  const g = 0.7 + 0.8 * p * p;
  L[n] *= g; R[n] *= g;
}

// --- Freeverb (cathedral) -------------------------------------------------
function comb(size, fb, damp) { const b = new Float32Array(size); let i = 0, s = 0; return (x) => { const y = b[i]; s = y * (1 - damp) + s * damp; b[i] = x + s * fb; i = (i + 1) % size; return y; }; }
function allpass(size) { const b = new Float32Array(size); let i = 0; return (x) => { const bo = b[i]; b[i] = x + bo * 0.5; i = (i + 1) % size; return bo - x; }; }
function reverb(inp, spread) {
  const cs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((s) => comb(Math.round((s + spread) * SR / 44100 * 1.6), 0.9, 0.35));
  const as = [556, 441, 341, 225].map((s) => allpass(s + spread));
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) { let y = 0; const x = inp[n] * 0.015; for (const c of cs) y += c(x); for (const a of as) y = a(y); out[n] = y; }
  return out;
}
const wl = reverb(L, 0), wr = reverb(R, 23);

// Mix, soft-clip, fade out, normalise.
const outL = new Float32Array(N), outR = new Float32Array(N);
let peak = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const fade = t > 19.2 ? Math.max(0, 1 - (t - 19.2) / 0.8) : 1;
  outL[n] = Math.tanh((L[n] * 0.8 + wl[n] * 0.9) * 1.2) * fade;
  outR[n] = Math.tanh((R[n] * 0.8 + wr[n] * 0.9) * 1.2) * fade;
  peak = Math.max(peak, Math.abs(outL[n]), Math.abs(outR[n]));
}
const OUT = SR * 20, buf = Buffer.alloc(44 + OUT * 4), g = 0.89 / peak;
buf.write("RIFF", 0); buf.writeUInt32LE(36 + OUT * 4, 4); buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(OUT * 4, 40);
for (let n = 0; n < OUT; n++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[n] * g)) * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[n] * g)) * 32767), 46 + n * 4);
}
fs.writeFileSync(__dirname + "/score.wav", buf);
console.log("score.wav written, peak", peak.toFixed(3));
