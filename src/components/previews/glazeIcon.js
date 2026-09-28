// ---------------------------------------------------------------------------
// Glaze card preview — the app icon floating over the app's own backdrop.
//
// Everything is taken from Glaze's source rather than approximated: the
// backdrop's radial gradient and aurora blobs (index.css .backdrop/.aurora),
// the glossy tile with its inset highlight, inner shade and pink glow
// (.app-icon), the embossed droplet path (ui.tsx AppIcon), and the motion
// itself — the empty state's `float`: 6s ease-in-out, up a tenth of the
// icon's height and back, tilting from -2° to 2°. The aurora drifts on its
// own slow 26s clock as it does there, and a few stars twinkle.
//
// It fills the card's whole image area (like the Hardwarium clip), because
// the backdrop is half of what makes the icon look like Glaze.
// ---------------------------------------------------------------------------

const DROP = new Path2D("M12 2.5s-6.5 7-6.5 11.3a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5z");

// The card's image area is 340 × 127.2 units; the canvas matches it.
const ASPECT = 340 / (212 * 0.6);

const FLOAT_SEC = 6;
const DRIFT_SEC = 26;

// [x, y, size, phase] — a handful of Glaze's star specks, as fractions.
const STARS = [
  [0.08, 0.14, 1, 0.0], [0.23, 0.61, 1, 1.3], [0.37, 0.32, 1.5, 2.1],
  [0.52, 0.83, 1, 0.7], [0.66, 0.22, 1, 2.9], [0.79, 0.57, 1.5, 1.8],
  [0.91, 0.09, 1, 0.4], [0.15, 0.88, 1, 2.5], [0.86, 0.8, 1, 3.3],
];

// CSS `ease-in-out`, near enough: a symmetric cubic.
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Fills the current path's inside with an inset shadow — how CSS draws
 * `box-shadow: inset`. The shape is clipped, and a ring around it (a huge
 * rect with the shape cut out) is filled with only its shadow falling in.
 */
function insetShadow(ctx, shape, { x = 0, y, blur, color }) {
  ctx.save();
  ctx.clip(shape);
  ctx.shadowColor = color;
  ctx.shadowOffsetX = x;
  ctx.shadowOffsetY = y;
  ctx.shadowBlur = blur;
  const ring = new Path2D();
  ring.rect(-1e4, -1e4, 2e4, 2e4);
  ring.addPath(shape);
  ctx.fillStyle = "#000";
  ctx.fill(ring, "evenodd");
  ctx.restore();
}

export function createGlazeIcon(size = 512) {
  const W = size * 2;
  const H = Math.round(W / ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Icon size, and the scale from Glaze's 112px empty-state icon to it, so
  // its pixel-valued shadows and float distance carry over in proportion.
  const S = Math.round(H * 0.42);
  const k = S / 112;
  const R = S * 0.28;

  const tile = new Path2D();
  tile.roundRect(-S / 2, -S / 2, S, S, R);
  const tileFill = ctx.createLinearGradient(0, -S / 2, 0, S / 2);
  tileFill.addColorStop(0, "#ff8fb2");
  tileFill.addColorStop(0.55, "#f4507f");
  tileFill.addColorStop(1, "#e2366b");

  // .backdrop: radial-gradient(120% 90% at 30% 0%, …), drawn as a circle
  // squashed into that ellipse.
  function backdrop() {
    // The ellipse stops short of the bottom corners; CSS pads past the last
    // stop with its colour, so do the same, or those pixels stay transparent
    // and the icon's glow tints them.
    ctx.fillStyle = "#030102";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W * 0.3, 0);
    ctx.scale(1.2 * W, 0.9 * H);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "#4a0c2c");
    g.addColorStop(0.4, "#24061a");
    g.addColorStop(0.75, "#0a0207");
    g.addColorStop(1, "#030102");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  // .aurora: four soft blobs over a box 20% larger than the view on every
  // side, drifting between two transforms.
  const BLOBS = [
    [0.28, 0.22, 0.3, 0.24, "255, 200, 225", 0.8],
    [0.42, 0.34, 0.42, 0.3, "214, 70, 150", 0.7],
    [0.62, 0.5, 0.36, 0.26, "180, 60, 150", 0.4],
    [0.86, 0.22, 0.5, 0.4, "120, 15, 60", 0.7],
  ];
  // Glaze blurs its aurora by 40px. Drawing it at quarter size and scaling
  // it up does the same softening for nearly nothing, where a canvas blur
  // filter every frame would not.
  const AQ = 4;
  const auroraCanvas = document.createElement("canvas");
  auroraCanvas.width = Math.round(W / AQ);
  auroraCanvas.height = Math.round(H / AQ);
  const actx = auroraCanvas.getContext("2d");

  function aurora(t) {
    const p = easeInOut((Math.sin((t / DRIFT_SEC) * Math.PI * 2 - Math.PI / 2) + 1) / 2);
    const bw = W * 1.4, bh = H * 1.4;
    actx.setTransform(1 / AQ, 0, 0, 1 / AQ, 0, 0);
    actx.clearRect(0, 0, W, H);
    paintAurora(actx, p, bw, bh);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(auroraCanvas, 0, 0, W, H);
  }

  function paintAurora(ctx, p, bw, bh) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.translate(bw * (-0.02 + 0.05 * p), bh * (-0.01 + 0.03 * p));
    ctx.rotate(((-3 + 6 * p) * Math.PI) / 180);
    ctx.scale(1 + 0.08 * p, 1 + 0.08 * p);
    ctx.translate(-bw / 2, -bh / 2);
    // Dimmed from the original: on the site these sit behind a full page of
    // content; on a card, full strength would outshine the icon.
    ctx.globalAlpha = 0.55;
    for (const [x, y, rx, ry, rgb, a] of BLOBS) {
      ctx.save();
      ctx.translate(x * bw, y * bh);
      ctx.scale(rx * bw, ry * bh);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${rgb}, ${a})`);
      g.addColorStop(0.7, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    ctx.restore();
  }

  function stars(t) {
    for (const [x, y, s, phase] of STARS) {
      ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.2 + phase * 2));
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x * W, y * H, s * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function icon(t) {
    // float: 0% and 100% at rest tilted -2°, 50% lifted 10px tilted +2°.
    const phase = (t % FLOAT_SEC) / FLOAT_SEC;
    const e = easeInOut(phase < 0.5 ? phase * 2 : 2 - phase * 2);
    ctx.save();
    ctx.translate(W / 2, H / 2 + S * 0.05 - 10 * k * e);
    ctx.rotate(((-2 + 4 * e) * Math.PI) / 180);

    // The pink glow under it: 0 14px 40px -10px, the negative spread
    // approximated by casting it from a tile 10px smaller all round.
    ctx.save();
    ctx.shadowColor = "rgba(244, 80, 127, 0.7)";
    ctx.shadowOffsetY = 14 * k;
    ctx.shadowBlur = 40 * k;
    const inner = new Path2D();
    inner.roundRect(-S / 2 + 10 * k, -S / 2 + 10 * k, S - 20 * k, S - 20 * k, R);
    ctx.fillStyle = "#f4507f";
    ctx.fill(inner);
    ctx.restore();

    ctx.fillStyle = tileFill;
    ctx.fill(tile);
    insetShadow(ctx, tile, { y: 1.5 * k, blur: 1 * k, color: "rgba(255, 255, 255, 0.65)" });
    insetShadow(ctx, tile, { y: -3 * k, blur: 8 * k, color: "rgba(120, 0, 40, 0.35)" });

    // The droplet: 0.56 of the tile, in a 24-unit viewBox, embossed with a
    // light edge below and a dark one above.
    const d = (S * 0.56) / 24;
    ctx.save();
    ctx.scale(d, d);
    ctx.translate(-12, -12);
    ctx.save();
    ctx.translate(0, 1 / d * k);
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fill(DROP);
    ctx.translate(0, -2 / d * k);
    ctx.fillStyle = "rgba(90, 0, 30, 0.35)";
    ctx.fill(DROP);
    ctx.restore();
    ctx.fillStyle = "#9a1747";
    ctx.fill(DROP);
    ctx.save();
    ctx.translate(9.6, 13.8);
    ctx.rotate((20 * Math.PI) / 180);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#ffc2d6";
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.3, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    ctx.restore();
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    backdrop();
    aurora(t);
    stars(t);
    icon(t);
  }

  return { canvas, draw, fill: true, aspect: W / H, focusY: 0.5 };
}
