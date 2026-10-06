// ---------------------------------------------------------------------------
// Shipped card preview — the art from its landing hero: a year of
// contribution squares sweeping up from crimson into green, the wrapped card
// with its bar chart and three stats pinned under it, and a "Your card is
// ready" toast bobbing at the top.
//
// Taken from the live page rather than invented: every square's position and
// colour (the grid below), the cream sheet on its crimson ground, the card's
// and toast's sizes, shadows and hairline rings, and the motion — squares pop
// in along the diagonal (`cell-in`, 22ms apart), the card rises, its bars grow
// one after another (`bar-in`), and the toast bobs 8px on a 5s cycle.
//
// On the site the build plays once. Here it loops: the finished hero holds
// for most of the cycle, the squares fold away along the same diagonal, and
// it builds again. Time 0 lands in the hold, so the still shown for reduced
// motion is the finished hero.
// ---------------------------------------------------------------------------

// The card's image area is 340 × 127.2 units; the canvas matches it.
const ASPECT = 340 / (212 * 0.6);

const CRIMSON = "#a52a3c";
const CREAM = "#fbfaf6";
const LINE = "#ebe7e0";
const INK = "#17161a";
const MUTED = "#6c6a70";
const SERIF = "Newsreader, Georgia, 'Times New Roman', serif";
const SANS = "'Instrument Sans', Helvetica, Arial, sans-serif";

// The hero's squares, one string per row of its 24px grid: a digit is an
// index into PALETTE, a dot is an empty cell.
const PALETTE = [
  "#5fd38a", "#9be8b5", "#2e7d4f", "#1f5c3a", "#f7b6c2",
  "#e8627a", "#b73049", "#7e1d2c", "#5a1a26", "#3a0f18",
];
const GRID = [
  "",
  "..............03033...",
  "...........303.131332.",
  "..........000012010002",
  "...........0001013130.",
  "......8774.808032220..",
  ".....8.86884.8588.....",
  "...688856.95849657....",
  "...4755895956566565...",
  "..5.6586595854.8......",
  "..98566568998585687...",
  "....895446665549698...",
  "..45588456686884589...",
  "....8485886856558.8...",
  "...8549.658665988.....",
  "....9..998.6.68.......",
  "....6555554..56.......",
  "....68788..4..........",
];
// Each square's delay on the site: 420ms, then 22ms per step along x + y.
const CELLS = GRID.flatMap((row, y) =>
  [...row].flatMap((c, x) =>
    c === "." ? [] : [{ x, y, color: PALETTE[c], delay: 0.42 + 0.022 * (x + y - 10) }],
  ),
);
const LAST_CELL = Math.max(...CELLS.map((c) => c.delay));

// [height, colour] for the card's ten bars, each 70ms behind the last.
const BARS = [
  [0.38, "#e7e4de"], [0.55, "#a8e2b8"], [0.44, "#e7e4de"], [0.72, "#e8627a"],
  [0.6, "#e7e4de"], [0.86, "#e8627a"], [0.66, "#a8e2b8"], [0.94, "#e8627a"],
  [0.78, "#e7e4de"], [1, "#e8627a"],
];
const STATS = [
  ["CONTRIBUTIONS", "3,762", "↑ 24%", "#2e9b5b"],
  ["STREAK", "52d", "↑ 8d", "#2e9b5b"],
  ["REST DAYS", "31", "↓ 12", CRIMSON],
];

// The loop, in seconds. The build starts a little into the site's timeline
// so the first squares appear straight away.
const CYCLE = 9;
const LEAD = 0.35;
const OUT = 0.8;  // how long the fold-away takes, at the end of the cycle
const HOLD_AT_ZERO = 2.8;  // where t = 0 falls: after the build, mid-hold
const BOB_SEC = 5;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// cubic-bezier(.2, .8, .2, 1), the site's ease, near enough.
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 4);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createShippedHero(size = 512) {
  const W = size * 2;
  const H = Math.round(W / ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // The cream sheet sits inset on the crimson ground, as the whole page does.
  const M = Math.round(H * 0.05);
  const sheet = new Path2D();
  sheet.roundRect(M, M, W - 2 * M, H - 2 * M + 40, 22);

  // The hero art is a 560 × 500 box in site pixels; scale it to the sheet
  // and centre it. Everything below is drawn in those site pixels.
  const s = ((H - 2 * M) * 0.9) / 500;
  const ox = (W - 560 * s) / 2;
  const oy = M + ((H - 2 * M) - 500 * s) / 2;

  function background() {
    ctx.fillStyle = CRIMSON;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = "rgba(40, 0, 10, 0.55)";
    ctx.shadowOffsetY = 30;
    ctx.shadowBlur = 60;
    ctx.fillStyle = CREAM;
    ctx.fill(sheet);
    ctx.restore();
  }

  function cells(e, out) {
    // Batched by colour: one path per palette step.
    for (const color of PALETTE) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const c of CELLS) {
        if (c.color !== color) continue;
        // In: cell-in, 0.5s from 30% scale. Out: the same, backwards, in
        // the same diagonal order, squeezed into the fold-away.
        let p = easeOut((e + LEAD - c.delay) / 0.5);
        if (out > 0) p = Math.min(p, 1 - easeOut((out * OUT - (c.delay - 0.42) * 0.8) / 0.3));
        if (p <= 0.01) continue;
        const k = 0.3 + 0.7 * p;
        const half = 10 * k;
        const r = 5 * k;
        ctx.roundRect(32 + c.x * 24 + 10 - half, c.y * 24 + 10 - half, half * 2, half * 2, r);
      }
      ctx.fill();
    }
  }

  function toast(t, alpha) {
    if (alpha <= 0) return;
    const bob = -8 * easeInOut(1 - Math.abs(((t % BOB_SEC) / BOB_SEC) * 2 - 1));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(377, 70 + bob);
    const box = new Path2D();
    box.roundRect(0, 0, 176, 42, 12);
    ctx.save();
    ctx.shadowColor = "rgba(90, 26, 38, 0.35)";
    ctx.shadowOffsetY = 10;
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#fff";
    ctx.fill(box);
    ctx.restore();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke(box);
    // Shipped's mark: nine squares climbing to the top right.
    for (const [x, y, c] of [
      [7.8, 0.6, 5], [11.4, 0.6, 5], [15, 0.6, 6], [11.4, 4.2, 6], [15, 4.2, 7],
      [7.8, 7.8, 5], [15, 7.8, 7], [4.2, 11.4, 6], [0.6, 15, 0],
    ]) {
      ctx.fillStyle = PALETTE[c];
      ctx.beginPath();
      ctx.roundRect(16 + x, 12 + y, 2.4, 2.4, 0.8);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.font = `600 14px ${SANS}`;
    ctx.textBaseline = "middle";
    ctx.fillText("Your card is ready", 42, 21.5);
    ctx.restore();
  }

  function card(e, alpha) {
    // rise: 0.9s from 14px down and transparent, starting at 500ms.
    const p = easeOut((e + LEAD - 0.5) / 0.9);
    const a = p * alpha;
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(0, 279 + 14 * (1 - p));
    const box = new Path2D();
    box.roundRect(0, 0, 440, 221, 12);
    ctx.save();
    ctx.shadowColor = "rgba(90, 26, 38, 0.45)";
    ctx.shadowOffsetY = 24;
    ctx.shadowBlur = 48;
    ctx.fillStyle = "#fff";
    ctx.fill(box);
    ctx.restore();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.stroke(box);

    // Bars: 92px tall, 10px apart, each growing up from the baseline.
    const bw = (400 - 9 * 10) / 10;
    BARS.forEach(([h, color], i) => {
      const g = easeOut((e + LEAD - 0.7 - i * 0.07) / 0.9);
      if (g <= 0) return;
      const bh = 92 * h * g;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(20 + i * (bw + 10), 112 - bh, bw, bh, [4, 4, 0, 0]);
      ctx.fill();
    });

    ctx.textBaseline = "alphabetic";
    const col = (400 - 32) / 3;
    STATS.forEach(([label, value, delta, color], i) => {
      const x = 20 + i * (col + 16);
      ctx.fillStyle = MUTED;
      ctx.font = `500 11px ${SANS}`;
      ctx.letterSpacing = "0.9px";
      ctx.fillText(label, x, 140);
      ctx.letterSpacing = "-0.6px";
      ctx.fillStyle = INK;
      ctx.font = `400 30px ${SERIF}`;
      ctx.fillText(value, x, 172);
      ctx.letterSpacing = "0px";
      ctx.fillStyle = color;
      ctx.font = `500 11px ${SANS}`;
      ctx.fillText(delta, x, 191);
    });
    ctx.restore();
  }

  function draw(t) {
    const e = (t + HOLD_AT_ZERO) % CYCLE;
    const out = clamp01((e - (CYCLE - OUT)) / OUT);
    // The toast arrives as the squares finish, and leaves with the card.
    const toastIn = easeOut((e + LEAD - LAST_CELL) / 0.5);
    const fade = 1 - easeOut(out * 1.6);

    background();
    ctx.save();
    ctx.clip(sheet);
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    cells(e, out);
    toast(t, toastIn * fade);
    card(e, fade);
    ctx.restore();
  }

  return { canvas, draw, fill: true, aspect: W / H, focusY: 0.5 };
}
