// ---------------------------------------------------------------------------
// Glaze card preview — the landing hero at glazed.website: the blue app icon
// floating over warm paper, a blue aurora rising off the bottom edge.
//
// Everything is taken from Glaze's stylesheet rather than approximated: the
// paper and its dotted grid with the faint accent glow at the top
// (.backdrop::before), the aurora's gradients, blur and slow 30s drift
// (.aurora), the white dot fields masked into two pools inside it (.stars),
// the film grain (.grain), and the glossy tile with its inset highlight,
// inner shade, accent glow and embossed droplet (.app-icon). The icon's
// motion is the hero's `float`: 6s ease-in-out, up 10px and back, tilting
// from -2° to 2°.
//
// Only the aurora and the icon move, so the paper, dots, stars and grain are
// painted once into layers and each frame just stacks them.
// ---------------------------------------------------------------------------

const DROP = new Path2D("M12 2.5s-6.5 7-6.5 11.3a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5z");

// The card's image area is 340 × 127.2 units; the canvas matches it.
const ASPECT = 340 / (212 * 0.6);

const PAPER = "#f7f6f2";
const FLOAT_SEC = 6;
const DRIFT_SEC = 30;

// CSS `ease-in-out`, near enough: a symmetric cubic.
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function layer(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

/**
 * Fills a CSS `radial-gradient(rx ry at cx cy, …)` over the whole canvas:
 * a unit circle squashed into that ellipse.
 */
function ellipseGradient(ctx, cx, cy, rx, ry, stops, w, h) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(-cx / rx, -cy / ry, w / rx, h / ry);
  ctx.restore();
}

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

export function createGlazeHero(size = 512) {
  const W = size * 2;
  const H = Math.round(W / ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Icon size, and the scale from the hero's 112px icon to it, so every
  // pixel value from the stylesheet (shadows, dot pitch, float distance)
  // carries over in proportion.
  const S = Math.round(H * 0.4);
  const k = S / 112;
  const R = S * 0.28;
  const ICON_Y = H * 0.42;

  // --- Paper: the accent glow at the top and the dotted grid, faded out
  // toward the edges by the same radial mask the site uses.
  const [paper, pctx] = layer(W, H);
  pctx.fillStyle = PAPER;
  pctx.fillRect(0, 0, W, H);
  ellipseGradient(pctx, W / 2, 0, W * 0.6, H * 0.9,
    [[0, "rgba(59, 116, 209, 0.09)"], [0.7, "rgba(59, 116, 209, 0)"]], W, H);
  {
    const [dots, dctx] = layer(W, H);
    const pitch = 22 * k;
    dctx.fillStyle = "rgba(20, 20, 20, 0.11)";
    dctx.beginPath();
    for (let y = pitch / 2; y < H; y += pitch) {
      for (let x = (W / 2) % pitch; x < W; x += pitch) {
        dctx.moveTo(x + 1.2 * k, y);
        dctx.arc(x, y, 1.2 * k, 0, Math.PI * 2);
      }
    }
    dctx.fill();
    dctx.globalCompositeOperation = "destination-in";
    ellipseGradient(dctx, W / 2, H * 0.3, W * 0.5, H * 0.95,
      [[0.35, "#000"], [0.85, "rgba(0, 0, 0, 0)"]], W, H);
    pctx.drawImage(dots, 0, 0);
  }

  // --- Aurora: a band along the bottom, 20% wider than the view so its
  // drift never shows an edge. Blurred once here instead of every frame.
  const AW = Math.round(W * 1.2);
  const AH = Math.round(H * 0.62);
  const AURORA_TOP = H - AH * 0.78;
  const [aurora, actx] = layer(AW, AH);
  {
    const [band, bctx] = layer(AW, AH);
    const fade = bctx.createLinearGradient(0, AH, 0, 0);
    fade.addColorStop(0, "#3164b5");
    fade.addColorStop(0.3, "#9dbae8");
    fade.addColorStop(0.62, "#e4e9ef");
    fade.addColorStop(1, "rgba(247, 246, 242, 0)");
    bctx.fillStyle = fade;
    bctx.fillRect(0, 0, AW, AH);
    ellipseGradient(bctx, AW * 0.24, AH, AW * 0.34, AH * 0.46,
      [[0, "rgba(255, 255, 255, 0.95)"], [0.7, "rgba(255, 255, 255, 0)"]], AW, AH);
    ellipseGradient(bctx, AW * 0.72, AH * 1.04, AW * 0.26, AH * 0.34,
      [[0, "rgba(255, 255, 255, 0.75)"], [0.7, "rgba(255, 255, 255, 0)"]], AW, AH);
    actx.filter = `blur(${Math.round(18 * k)}px)`;
    actx.drawImage(band, 0, 0);
  }

  // --- Stars and grain, which sit on top of the aurora but don't move.
  const [overlay, octx] = layer(W, H);
  {
    const SH = H * 0.34;
    for (const [cx, rx, ry, inner, outer, alpha] of [
      [0.24, 0.38, 0.75, 0.25, 0.72, 0.85],
      [0.74, 0.28, 0.6, 0.15, 0.7, 0.6],
    ]) {
      const [pool, sctx] = layer(W, H);
      const pitch = 6 * k;
      sctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      sctx.beginPath();
      for (let y = H - pitch / 2; y > H - SH; y -= pitch) {
        for (let x = pitch / 2; x < W; x += pitch) {
          sctx.moveTo(x + 1.1 * k, y);
          sctx.arc(x, y, 1.1 * k, 0, Math.PI * 2);
        }
      }
      sctx.fill();
      sctx.globalCompositeOperation = "destination-in";
      ellipseGradient(sctx, W * cx, H, W * rx, SH * ry,
        [[inner, "#000"], [outer, "rgba(0, 0, 0, 0)"]], W, H);
      octx.drawImage(pool, 0, 0);
    }

    // Grain: speckled noise, multiplied in at 8% like the site's
    // feTurbulence layer.
    const [grain, gctx] = layer(W, H);
    const img = gctx.createImageData(W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 20;
    }
    gctx.putImageData(img, 0, 0);
    octx.globalCompositeOperation = "multiply";
    octx.drawImage(grain, 0, 0);
  }

  const tile = new Path2D();
  tile.roundRect(-S / 2, -S / 2, S, S, R);
  const tileFill = ctx.createLinearGradient(0, -S / 2, 0, S / 2);
  tileFill.addColorStop(0, "#769edf");
  tileFill.addColorStop(0.55, "#3b74d1");
  tileFill.addColorStop(1, "#3263b2");

  function drawAurora(t) {
    // drift: 30s alternate, translate(-1.5%) scale(1) → translate(1.5%, -1%)
    // scale(1.04), with the default `ease` — ease-in-out is close enough.
    const p = easeInOut((Math.sin((t / DRIFT_SEC) * Math.PI - Math.PI / 2) + 1) / 2);
    const s = 1 + 0.04 * p;
    ctx.save();
    ctx.translate(W / 2 + AW * (-0.015 + 0.03 * p), AURORA_TOP + AH / 2 - AH * 0.01 * p);
    ctx.scale(s, s);
    ctx.drawImage(aurora, -AW / 2, -AH / 2);
    ctx.restore();
  }

  function drawIcon(t) {
    // float: 0% and 100% at rest tilted -2°, 50% lifted 10px tilted +2°.
    const phase = (t % FLOAT_SEC) / FLOAT_SEC;
    const e = easeInOut(phase < 0.5 ? phase * 2 : 2 - phase * 2);
    ctx.save();
    ctx.translate(W / 2, ICON_Y + 5 * k - 10 * k * e);
    ctx.rotate(((-2 + 4 * e) * Math.PI) / 180);

    // The accent glow under it: 0 14px 36px -12px, the negative spread
    // approximated by casting it from a tile 12px smaller all round.
    ctx.save();
    ctx.shadowColor = "rgba(59, 116, 209, 0.55)";
    ctx.shadowOffsetY = 14 * k;
    ctx.shadowBlur = 36 * k;
    const inner = new Path2D();
    inner.roundRect(-S / 2 + 12 * k, -S / 2 + 12 * k, S - 24 * k, S - 24 * k, R);
    ctx.fillStyle = "#3b74d1";
    ctx.fill(inner);
    ctx.restore();

    ctx.fillStyle = tileFill;
    ctx.fill(tile);
    insetShadow(ctx, tile, { y: 1.5 * k, blur: 1 * k, color: "rgba(255, 255, 255, 0.65)" });
    insetShadow(ctx, tile, { y: -3 * k, blur: 8 * k, color: "rgba(24, 46, 84, 0.35)" });

    // The droplet: 0.56 of the tile, in a 24-unit viewBox, embossed with a
    // light edge below and a dark one above.
    const d = (S * 0.56) / 24;
    ctx.save();
    ctx.scale(d, d);
    ctx.translate(-12, -12);
    ctx.save();
    ctx.translate(0, (1 / d) * k);
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.fill(DROP);
    ctx.translate(0, (-2 / d) * k);
    ctx.fillStyle = "rgba(18, 35, 63, 0.35)";
    ctx.fill(DROP);
    ctx.restore();
    ctx.fillStyle = "#1a345e";
    ctx.fill(DROP);
    ctx.save();
    ctx.translate(9.6, 13.8);
    ctx.rotate((20 * Math.PI) / 180);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#c4d5f1";
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.3, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    ctx.restore();
  }

  function draw(t) {
    ctx.drawImage(paper, 0, 0);
    drawAurora(t);
    ctx.drawImage(overlay, 0, 0);
    drawIcon(t);
  }

  return { canvas, draw, fill: true, aspect: W / H, focusY: 0.5 };
}
