// ---------------------------------------------------------------------------
// FlowJS card preview — the project's pixel mascot, looking around.
//
// The grid, gradient and colours are copied from FlowJS's src/mascot.js (the
// single source for its logo and favicon), so this is the same character,
// not a redraw. Behind it are a few dots from FlowJS's page background: a
// terracotta grid at the same pitch relative to the mascot as in its header,
// with the odd dot flickering the way its DotField does.
//
// On FlowJS the eyes only blink, every 6s. A card is on screen for a few
// seconds, so here the loop is a little livelier — a glance left, a glance
// right, then the blink — but nothing else moves. The eyes jump a whole
// pixel when they glance, never slide: this is pixel art, and half-pixel
// eyes would read as blur.
// ---------------------------------------------------------------------------

const GRID = 12;
const ROWS = [
  ".....dd.....",
  ".....##.....",
  "..########..",
  ".##########.",
  ".##########.",
  ".##ee##ee##.",
  ".##ee##ee##.",
  "############",
  ".##########.",
  "..dddddddd..",
  "...dd..dd...",
  "...dd..dd...",
];
const STOPS = [[0, "#F77B6E"], [0.5, "#E4483F"], [1, "#CC322B"]];
const DEEP = "#A32320";
const EYE = "#141413";
const EYES = [[3, 5], [7, 5]]; // top-left cell of each 2×2 eye

// FlowJS's dot colour, and its pitch in mascot pixels (28px dots around a
// 36px, 12-cell mascot).
const DOT_RGB = "217, 119, 87";
const DOT_PITCH = 28 / 3;

// One look-around, in seconds. Blink timing follows FlowJS's keyframes:
// shut quickly, open a little slower.
const LOOP = 7;
const GLANCES = [
  { from: 2.2, to: 3.2, dx: -1 },
  { from: 3.5, to: 4.5, dx: 1 },
];
const BLINK_AT = 6.2;
const BLINK_CLOSE = 0.12;
const BLINK_OPEN = 0.22;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function eyeOpenness(t) {
  const s = t - BLINK_AT;
  if (s < 0 || s > BLINK_CLOSE + BLINK_OPEN) return 1;
  if (s < BLINK_CLOSE) return 1 - 0.9 * easeInOut(s / BLINK_CLOSE);
  return 0.1 + 0.9 * easeInOut((s - BLINK_CLOSE) / BLINK_OPEN);
}

export function createFlowJsMascot(size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Whole canvas pixels per mascot pixel keeps every edge crisp. The mascot
  // takes about half the canvas; the rest is room for the dots.
  const unit = Math.floor((size * 0.5) / GRID);
  const ox = Math.round((size - unit * GRID) / 2);
  const oy = Math.round((size - unit * GRID) / 2);

  const body = ctx.createLinearGradient(ox + 2 * unit, oy + unit, ox + 10 * unit, oy + 9 * unit);
  STOPS.forEach(([o, c]) => body.addColorStop(o, c));

  // A 3×3 grid of dots centred on the mascot; the middle one hides behind it.
  const pitch = DOT_PITCH * unit;
  const dots = [];
  for (let r = -1; r <= 1; r++) {
    for (let c = -1; c <= 1; c++) {
      if (r === 0 && c === 0) continue;
      dots.push({ x: size / 2 + c * pitch, y: size / 2 + r * pitch, phase: (r * 3 + c) * 1.7 });
    }
  }
  const dotR = unit * 0.45;

  function draw(time) {
    const t = ((time % LOOP) + LOOP) % LOOP;
    ctx.clearRect(0, 0, size, size);

    // Dots rest at FlowJS's grid alpha and now and then flicker up — each on
    // its own slow clock, so it's never more than one or two at a time.
    for (const d of dots) {
      const lift = Math.pow(Math.max(0, Math.sin(time * 0.7 + d.phase)), 6);
      const a = 0.32 + 0.45 * lift;
      if (lift > 0.02) {
        ctx.fillStyle = `rgba(${DOT_RGB}, ${a * 0.16})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, dotR * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${DOT_RGB}, ${a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body, with the eye cells filled as body so a glance leaves no hole.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const ch = ROWS[y][x];
        if (ch === ".") continue;
        ctx.fillStyle = ch === "d" ? DEEP : body;
        ctx.fillRect(ox + x * unit, oy + y * unit, unit, unit);
      }
    }

    const glance = GLANCES.find((g) => t >= g.from && t < g.to);
    const dx = glance ? glance.dx : 0;
    const h = 2 * unit * eyeOpenness(t);
    ctx.fillStyle = EYE;
    for (const [ex, ey] of EYES) {
      // Blink squashes toward the eye's middle, as FlowJS's scaleY does.
      ctx.fillRect(ox + (ex + dx) * unit, oy + (ey + 1) * unit - h / 2, 2 * unit, h);
    }
  }

  // Same footprint as the pixel pets; `pixelated` keeps the mascot's edges
  // hard when the card is close enough to magnify the texture.
  return { canvas, draw, size: 140, y: 40, pixelated: true };
}
