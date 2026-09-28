// ---------------------------------------------------------------------------
// Frontend Performance Lab card preview — its performance-history chart, as
// a live feed.
//
// Drawn from scratch after the project's Overview chart (nothing taken from
// its code): a daily score line in its terracotta, flat runs and sharp
// corners, a soft fill down to the baseline, faint gridlines, and release
// tags hung on hairlines. The project's chart is light; this one is set on
// the card's dark panel, so the same terracotta carries it.
//
// The motion is the one thing a monitoring chart does all day: new days
// arrive at the right edge while history slides off the left, releases pass
// by, and the latest point pulses. It never loops or resets — the series is
// generated as it goes, from a fixed seed, so it's the same run every visit.
// ---------------------------------------------------------------------------

const LINE = "#cf6a43";
const LINE_RGB = "207, 106, 67";
const INK = "255, 255, 255";
const MONO = "'Courier New', monospace";

// Score axis, as in the project: 90 at the baseline, a line at 91 and 92.
const Y_MIN = 90;
const Y_MAX = 93;
const LEVELS = [91.5, 92, 92.5];

const VISIBLE = 24;      // days across the plot
const PER_SEC = 0.6;     // days arriving per second
const RELEASE_EVERY = 6; // days between release tags
const PULSE_SEC = 1.6;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPerfLabChart(size = 512) {
  // Card units the chart occupies: the width of the image area, from just
  // under the card's meta row down to just above its title.
  const WIDTH = 300, HEIGHT = 86;
  const W = size * 2;
  const H = Math.round((W * HEIGHT) / WIDTH);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const left = 70, right = W - 18;
  const top = 58, bottom = H - 14;
  const dx = (right - left) / (VISIBLE - 1);
  const yOf = (v) => bottom - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (bottom - top);

  // The series grows on demand. A day mostly holds its level and now and
  // then steps up or down half a point — the plateaus-and-dips shape of a
  // real daily median, not noise.
  const rnd = mulberry32(20260923);
  const values = [1];
  const value = (i) => {
    while (values.length <= i) {
      const prev = values[values.length - 1];
      const r = rnd();
      const step = r < 0.45 ? 0 : r < 0.72 ? 1 : -1;
      values.push(Math.min(LEVELS.length - 1, Math.max(0, prev + step)));
    }
    return LEVELS[values[i]];
  };

  const fill = ctx.createLinearGradient(0, top, 0, bottom);
  fill.addColorStop(0, `rgba(${LINE_RGB}, 0.22)`);
  fill.addColorStop(1, `rgba(${LINE_RGB}, 0.03)`);

  // Where history leaves: a fade over the first stretch of the plot, so days
  // slide into the dark instead of being clipped at an edge.
  const fade = ctx.createLinearGradient(left, 0, left + dx * 3, 0);
  fade.addColorStop(0, "rgba(0, 0, 0, 1)");
  fade.addColorStop(1, "rgba(0, 0, 0, 0)");

  function draw(t) {
    // `head` is the (fractional) day at the right edge; the plot always
    // starts full.
    const head = VISIBLE + t * PER_SEC;
    const last = Math.floor(head);
    const frac = head - last;
    const first = Math.max(0, Math.floor(head - VISIBLE) - 1);
    const xOf = (i) => right - (head - i) * dx;
    const tipV = value(last) + (value(last + 1) - value(last)) * frac;

    ctx.clearRect(0, 0, W, H);

    // Gridlines, then the baseline a little firmer.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(${INK}, 0.08)`;
    for (const v of [91, 92]) {
      ctx.beginPath();
      ctx.moveTo(left, yOf(v));
      ctx.lineTo(right, yOf(v));
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${INK}, 0.22)`;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    // Releases: a hairline from the tag down to the baseline.
    ctx.font = `600 19px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const firstRelease = Math.ceil((first - 2) / RELEASE_EVERY) * RELEASE_EVERY + 2;
    for (let i = firstRelease; i <= last; i += RELEASE_EVERY) {
      const x = xOf(i);
      if (x < left) continue;
      const label = `v2.${15 + Math.floor(i / RELEASE_EVERY)}.0`;
      const bw = ctx.measureText(label).width + 18;
      ctx.strokeStyle = `rgba(${INK}, 0.16)`;
      ctx.beginPath();
      ctx.moveTo(x, top - 12);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.fillStyle = "rgba(10, 10, 11, 0.9)";
      ctx.strokeStyle = `rgba(${INK}, 0.28)`;
      ctx.beginPath();
      ctx.roundRect(x - bw / 2, top - 46, bw, 32, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(${INK}, 0.62)`;
      ctx.fillText(label, x, top - 29);
    }

    // The series up to the tip, as one path for the fill and one stroke.
    ctx.beginPath();
    ctx.moveTo(xOf(first), yOf(value(first)));
    for (let i = first + 1; i <= last; i++) ctx.lineTo(xOf(i), yOf(value(i)));
    ctx.lineTo(right, yOf(tipV));
    ctx.lineJoin = "miter";
    ctx.lineWidth = 4;
    ctx.strokeStyle = LINE;
    ctx.stroke();
    ctx.lineTo(right, bottom);
    ctx.lineTo(xOf(first), bottom);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // The latest point, with a ring that breathes out from it.
    const ty = yOf(tipV);
    const p = (t % PULSE_SEC) / PULSE_SEC;
    ctx.strokeStyle = `rgba(${LINE_RGB}, ${0.55 * (1 - p)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(right, ty, 7 + p * 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = LINE;
    ctx.beginPath();
    ctx.arc(right, ty, 7, 0, Math.PI * 2);
    ctx.fill();

    // Fade the left edge out of everything drawn so far.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, left + dx * 3, H);
    ctx.globalCompositeOperation = "source-over";

    // Axis labels sit in the gutter, outside the fade.
    ctx.font = `20px ${MONO}`;
    ctx.textAlign = "right";
    ctx.fillStyle = `rgba(${INK}, 0.4)`;
    for (const v of [90, 91, 92]) ctx.fillText(String(v), left - 16, yOf(v));
  }

  return { canvas, draw, width: WIDTH, height: HEIGHT, y: 31 };
}
