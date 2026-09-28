// ---------------------------------------------------------------------------
// Repo Atlas card preview — the project's own landing globe, in miniature.
//
// A port of Repo Atlas's GlobeBackdrop (src/components/GlobeBackdrop.tsx in
// that repo): nine seeded orbits whose crossings make a sphere, one pink
// orbit carrying a soft filled disc, and specks riding the orbits like
// commits landing. Same seeds, same palette (its night theme), so the card
// shows the real thing rather than an impression of it.
//
// What's left out is deliberate. The original draws itself in over 3.4s and
// sits behind a headline at full size; here it is a small, already-finished
// object on a card that flies past, so all it does is turn. The card is on
// screen for a few seconds, so the turn is quicker than the landing page's
// (which is ~1 rad per 18s, too slow to notice in passing) but still calm.
//
// What's added is a little shine, because on a card it has no page-sized
// haze to sit in: a blurred copy of the orbits laid over them as a glow, a
// faint glassy highlight on the upper left, and a stronger haze. The card
// draws it additively, so all of that reads as light on the dark panel.
// ---------------------------------------------------------------------------

const STEPS = 128;
const RINGS = 9;

// Repo Atlas night-theme tokens (--globe-line, --globe-node, --globe-accent).
const LINE = "rgba(255, 226, 238, 0.6)";
const NODE = "rgba(255, 240, 246, 0.95)";
const ACCENT = "#f0518f";
const ACCENT_RGB = "240, 81, 143";

const SPIN_PER_SEC = 0.16;
const BASE_TILT = -0.3;

// Deterministic PRNG, identical to the project's own, so the seeds below
// reproduce exactly the globe on its landing page.
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

function buildRings() {
  const rnd = mulberry32(20260922);
  const rings = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < RINGS; i++) {
    // Orbit normals spread over the sphere on a Fibonacci spiral, jittered a
    // little so they don't read as a grid.
    const y = 1 - (2 * (i + 0.5)) / RINGS + (rnd() - 0.5) * 0.18;
    const rho = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * golden + (rnd() - 0.5) * 0.5;
    const n = [rho * Math.cos(phi), y, rho * Math.sin(phi)];

    // Two axes lying in the orbit's plane.
    const h = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [h[1] * n[2] - h[2] * n[1], h[2] * n[0] - h[0] * n[2], h[0] * n[1] - h[1] * n[0]];
    const ul = Math.hypot(u[0], u[1], u[2]);
    u = u.map((c) => c / ul);
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];

    // Every third orbit is a great circle; the rest are smaller, lifted off
    // the centre, so the sphere isn't all equators.
    const r = i % 3 === 0 ? 1 : 0.8 + rnd() * 0.16;
    const lift = Math.sqrt(1 - r * r);
    const start = rnd() * Math.PI * 2;

    const pts = new Float32Array((STEPS + 1) * 3);
    for (let s = 0; s <= STEPS; s++) {
      const a = start + (s / STEPS) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const d = Math.sin(a) * r;
      for (let k = 0; k < 3; k++) pts[s * 3 + k] = n[k] * lift + u[k] * c + v[k] * d;
    }

    rings.push({
      pts,
      accent: i === 1 || i === 5,
      filled: i === 1,
      width: 0.8 + rnd() * 0.5,
    });
  }
  return rings;
}

function buildNodes() {
  const rnd = mulberry32(4242);
  const nodes = [];
  for (let r = 0; r < RINGS; r++) {
    const count = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) {
      nodes.push({
        ring: r,
        at: rnd(),
        speed: (0.008 + rnd() * 0.02) * (rnd() < 0.5 ? -1 : 1),
        phase: rnd() * Math.PI * 2,
        size: rnd() < 0.2 ? 2.6 + rnd() * 1.4 : 1 + rnd() * 1.2,
      });
    }
  }
  return nodes;
}

/**
 * Creates the preview on its own square canvas. `draw(seconds)` repaints it
 * for that moment; the caller owns the clock and decides how often to call
 * it (and uploads the canvas as a texture afterwards).
 */
export function createRepoAtlasGlobe(size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const out = canvas.getContext("2d");

  // The orbits and nodes are drawn sharp on their own layer, then composited
  // twice: once blurred (the glow) and once as they are. Without canvas
  // filter support the glow is skipped rather than faked.
  const layer = document.createElement("canvas");
  layer.width = layer.height = size;
  const ctx = layer.getContext("2d");
  const canGlow = "filter" in out;

  const rings = buildRings();
  const nodes = buildNodes();

  // The haze reaches 1.5 radii, so 0.3 of the canvas keeps it fully inside
  // — otherwise the fillRect below would show as a faint square.
  const radius = size * 0.3;
  const cx = size / 2;
  const cy = size / 2;
  // The original was tuned at a 228px radius. Strokes and specks scale with
  // the globe, a touch heavier than strict proportion so they survive being
  // minified onto a small card instead of shimmering away.
  const k = radius / 160;

  const px = new Float32Array(STEPS + 1);
  const py = new Float32Array(STEPS + 1);
  const pz = new Float32Array(STEPS + 1);

  const haze = out.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.5);
  haze.addColorStop(0, `rgba(${ACCENT_RGB}, 0.24)`);
  haze.addColorStop(0.6, `rgba(${ACCENT_RGB}, 0.07)`);
  haze.addColorStop(1, `rgba(${ACCENT_RGB}, 0)`);

  // A soft sheen high on the left of the sphere, as if lit from there.
  const hx = cx - radius * 0.38, hy = cy - radius * 0.42;
  const sheen = out.createRadialGradient(hx, hy, 0, hx, hy, radius * 0.75);
  sheen.addColorStop(0, "rgba(255, 236, 244, 0.13)");
  sheen.addColorStop(1, "rgba(255, 236, 244, 0)");
  const glowBlur = `blur(${Math.round(radius * 0.035)}px)`;

  function draw(t) {
    const spin = 0.6 + t * SPIN_PER_SEC;
    const tilt = BASE_TILT + Math.sin(t / 23) * 0.1;
    const cs = Math.cos(spin), ss = Math.sin(spin);
    const ct = Math.cos(tilt), st = Math.sin(tilt);

    const project = (pts, i, out) => {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      // Spin about Y, then tilt about X.
      const x2 = x * cs + z * ss;
      const z2 = -x * ss + z * cs;
      px[out] = cx + x2 * radius;
      py[out] = cy + (y * ct - z2 * st) * radius;
      pz[out] = y * st + z2 * ct;
    };

    ctx.clearRect(0, 0, size, size);

    // The faint outer edge, so the orbits read as one sphere.
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = k;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    for (const ring of rings) {
      for (let i = 0; i <= STEPS; i++) project(ring.pts, i, i);

      if (ring.filled) {
        ctx.globalAlpha = 0.13;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.moveTo(px[0], py[0]);
        for (let i = 1; i <= STEPS; i++) ctx.lineTo(px[i], py[i]);
        ctx.closePath();
        ctx.fill();
      }

      // Short segments, each with its own alpha, so the far side of the
      // sphere fades out behind the near side.
      ctx.lineWidth = ring.width * k;
      ctx.strokeStyle = ring.accent ? ACCENT : LINE;
      for (let i = 0; i < STEPS; i++) {
        const depth = (pz[i] + pz[i + 1]) * 0.5;
        const alpha = 0.14 + 0.86 * Math.pow((depth + 1) / 2, 1.5);
        ctx.globalAlpha = alpha * (ring.accent ? 1 : 0.7);
        ctx.beginPath();
        ctx.moveTo(px[i], py[i]);
        ctx.lineTo(px[i + 1], py[i + 1]);
        ctx.stroke();
      }
    }

    for (const node of nodes) {
      const ring = rings[node.ring];
      const at = node.at + t * node.speed;
      const i = Math.min(STEPS, Math.floor((((at % 1) + 1) % 1) * STEPS));
      project(ring.pts, i, 0);
      const front = Math.pow((pz[0] + 1) / 2, 1.6);
      const pulse = 0.6 + 0.4 * Math.sin(t / 1.1 + node.phase);
      ctx.fillStyle = ring.accent ? ACCENT : NODE;

      if (node.size > 2.4) {
        ctx.globalAlpha = 0.14 * front * pulse;
        ctx.beginPath();
        ctx.arc(px[0], py[0], node.size * 2.6 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = (0.2 + 0.8 * front) * pulse * (ring.accent ? 1 : 0.85);
      ctx.beginPath();
      ctx.arc(px[0], py[0], node.size * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Composite: haze, sheen, the glow, then the sharp orbits on top.
    out.clearRect(0, 0, size, size);
    out.fillStyle = haze;
    out.fillRect(0, 0, size, size);
    out.fillStyle = sheen;
    out.beginPath();
    out.arc(cx, cy, radius, 0, Math.PI * 2);
    out.fill();
    if (canGlow) {
      out.filter = glowBlur;
      out.globalCompositeOperation = "lighter";
      out.globalAlpha = 0.85;
      out.drawImage(layer, 0, 0);
      out.filter = "none";
      out.globalCompositeOperation = "source-over";
      out.globalAlpha = 1;
    }
    out.drawImage(layer, 0, 0);
  }

  // `size` is the square's side in card units (the card is 340 wide) and `y`
  // its centre, in the image area above the title. The globe is a third of
  // the canvas across, so this gives a sphere ~110 units wide whose haze and
  // glow still fade out before the canvas edge.
  return { canvas, draw, size: 184, y: 40, additive: true };
}
