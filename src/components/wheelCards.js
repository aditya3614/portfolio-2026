// Card art for the Experience wheel: a painted space scene per role, with the
// company's own logo set on it.
//
// Nothing here is a picture — every background is painted once, procedurally,
// into the card's canvas: domain-warped noise for clouds, marble and gas,
// mapped through a colour ramp per scene, then lit with glows, stars and the
// odd streak at full resolution. Each scene picks up its company's own colour
// (Prepmonkey's amber, nucleo's teal, Smallcase's and Juspay's blues), so a
// card reads as that company before the logo does.
//
// The logos come from src/assets/companies as flat images on a solid
// background. That background is keyed out here, dark ink is lifted to white
// so it reads on a night sky, and brand colour is kept — see cutLogo().

const LOGOS = import.meta.glob("../assets/companies/*.{png,jpg,jpeg,webp,svg}", {
  eager: true,
  import: "default",
});
const logoFor = (company) => {
  const key = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hit = Object.keys(LOGOS).find((k) => k.toLowerCase().includes(`/${key}.`));
  return hit ? LOGOS[hit] : null;
};

// Per company: which scene, and whether the logo keeps its colour or goes
// white (a blue mark on a blue scene would disappear). Anything not listed
// falls back by position.
// `logo` is "keep" (brand colour, dark ink lifted to white), "original"
// (exactly as drawn — for light scenes), "white", a colour the whole mark
// is set in, or "ink:#hex" — brand colour kept, the neutral lettering (black
// or white) set in that colour instead.
const STYLE = {
  kodeflip: { scene: "fluted", logo: "white" },
  prepmonkey: { scene: "rosa", logo: "#252a5c" },
  nucleo: { scene: "mint", logo: "ink:#123c2c" },
  smallcase: { scene: "swirl", logo: "white" },
  juspay: { scene: "clouds", logo: "original" },
};
const SCENES = ["fluted", "horizon", "mint", "swirl", "clouds", "mauve", "harvest", "velaris"];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
// Colour ramp: stops [[t, "#hex"], ...], t ascending.
const ramp = (stops) => {
  const s = stops.map(([t, c]) => [t, hex(c)]);
  return (t) => {
    t = clamp(t, 0, 1);
    let k = 0;
    while (k < s.length - 2 && t > s[k + 1][0]) k++;
    const [t0, c0] = s[k];
    const [t1, c1] = s[k + 1];
    const f = smooth(0, 1, (t - t0) / (t1 - t0 || 1));
    return [mix(c0[0], c1[0], f), mix(c0[1], c1[1], f), mix(c0[2], c1[2], f)];
  };
};

// --- Noise ------------------------------------------------------------------
// Seeded value noise and fbm. Cheap, and the scenes are painted at a fraction
// of the card's resolution and scaled up, so it never has to be fast.
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256).map(() => rand());
  const lattice = (x, y) => val[perm[(perm[x & 255] + y) & 511]];
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a0 = lattice(xi, yi);
    const b0 = lattice(xi + 1, yi);
    const a1 = lattice(xi, yi + 1);
    const b1 = lattice(xi + 1, yi + 1);
    return mix(mix(a0, b0, fx), mix(a1, b1, fx), fy);
  };
  const fbm = (x, y, oct = 5) => {
    let s = 0;
    let amp = 0.5;
    for (let o = 0; o < oct; o++) {
      s += amp * noise(x, y);
      x = x * 2.03 + 17.1;
      y = y * 2.03 + 9.7;
      amp *= 0.5;
    }
    return s;
  };
  return { fbm, rand };
}

// Domain warp, after Inigo Quilez: noise fed its own output twice over, which
// is what turns plain fbm into flowing gas and marble.
function warp(n, x, y, k = 3.2) {
  const qx = n.fbm(x, y);
  const qy = n.fbm(x + 5.2, y + 1.3);
  const rx = n.fbm(x + k * qx + 1.7, y + k * qy + 9.2);
  const ry = n.fbm(x + k * qx + 8.3, y + k * qy + 2.8);
  return { f: n.fbm(x + k * rx, y + k * ry), qx, qy, rx, ry };
}

// --- Scenes -----------------------------------------------------------------
// Each returns a per-pixel colour for (u, v) in 0..1 over the card, plus an
// overlay painted afterwards at full resolution.

// Soft colour fields: each blob is a gaussian pool of one colour, and a
// pixel is the weighted blend of every pool reaching it — the out-of-focus
// mesh gradient look. `base` fills where no pool reaches.
function blend(u, v, base, blobs) {
  let r = base[0] * 0.25;
  let g = base[1] * 0.25;
  let b = base[2] * 0.25;
  let w = 0.25;
  for (const [cx, cy, rx, ry, col, k] of blobs) {
    const dx = (u - cx) / rx;
    const dy = (v - cy) / ry;
    const f = Math.exp(-(dx * dx + dy * dy)) * k;
    r += col[0] * f;
    g += col[1] * f;
    b += col[2] * f;
    w += f;
  }
  return [r / w, g / w, b / w];
}

const scenes = {
  // Launch window: a royal-blue dusk sky lifting to lilac, a light trail
  // drawn straight across it.
  launch: {
    seed: 11,
    pixel(n, u, v) {
      const w = warp(n, u * 2.2, v * 2.2, 1.6);
      const sky = ramp([[0, "#101d7a"], [0.35, "#2a47c4"], [0.7, "#8f8fd0"], [1, "#e7d7e4"]]);
      return sky(u * 0.75 + v * 0.35 - 0.05 + (w.f - 0.5) * 0.18);
    },
    overlay(ctx, W, H, n) {
      stars(ctx, W, H, n, 40, 0.35);
      const y = H * 0.76;
      const x0 = W * 0.3;
      // The trail, then its hot white core and a pin-point head.
      const g = ctx.createLinearGradient(x0, 0, W, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.08, "rgba(255,250,240,0.95)");
      g.addColorStop(0.6, "rgba(255,236,220,0.75)");
      g.addColorStop(1, "rgba(255,230,230,0.35)");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowColor = "rgba(200,215,255,0.9)";
      ctx.shadowBlur = H * 0.08;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(W, y - H * 0.03);
      ctx.lineTo(W, y + H * 0.045);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillRect(x0 - W * 0.04, y - 1, W * 0.045, 2);
      ctx.restore();
    },
  },

  // Ember eclipse: a black disc with a burning rim, low in clouds of amber
  // and rust on deep navy.
  eclipse: {
    seed: 23,
    pixel(n, u, v) {
      const w = warp(n, u * 2.6 + 3, v * 2.6, 3.4);
      const base = ramp([[0, "#05060f"], [0.45, "#0d1030"], [0.62, "#5a1a12"], [0.8, "#e0621c"], [1, "#ffd27a"]]);
      // Clouds band through the middle, around the disc.
      const band = Math.exp(-Math.pow((v - 0.42 + (w.qx - 0.5) * 0.4) / 0.3, 2));
      return base(w.f * 0.9 * (0.45 + band * 0.75) + w.rx * 0.25);
    },
    overlay(ctx, W, H, n) {
      stars(ctx, W, H, n, 70, 0.5);
      // Up and to the right, clear of the logo in the middle.
      const cx = W * 0.79;
      const cy = H * 0.3;
      const r = H * 0.15;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 2.4);
      glow.addColorStop(0, "rgba(255,170,80,0.9)");
      glow.addColorStop(0.15, "rgba(255,110,40,0.55)");
      glow.addColorStop(1, "rgba(255,60,20,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // The ring of light bent round the top — a lensed accretion arc.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(255,225,170,0.9)";
      ctx.lineWidth = H * 0.012;
      ctx.shadowColor = "rgba(255,150,60,1)";
      ctx.shadowBlur = H * 0.05;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.04, r * 1.04, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#020203";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    },
  },

  // Neon portal: a cyan opening torn through a violet cave.
  portal: {
    seed: 37,
    pixel(n, u, v) {
      const w = warp(n, u * 3, v * 3, 2.6);
      const dx = (u - 0.66) * 1.5;
      const dy = v - 0.5;
      const d = Math.hypot(dx, dy * 0.8) + (w.f - 0.5) * 0.45;
      const open = smooth(0.34, 0.12, d);
      const rim = smooth(0.5, 0.25, d) - open;
      const wall = ramp([[0, "#05030e"], [0.5, "#1a0a3a"], [0.8, "#4b1f8f"], [1, "#9a4dff"]]);
      const c = wall(w.f * 0.8 + rim * 0.6);
      // Cyan opening, burning to white at its heart.
      // Kept saturated: a white heart turns grey under the card's vignette.
      const core = smooth(0.9, 1, open) * 0.45;
      const hot = [mix(10, 210, core), mix(205, 250, core), mix(235, 255, core)];
      return [mix(c[0], hot[0], open), mix(c[1], hot[1], open), mix(c[2], hot[2], open)];
    },
    overlay(ctx, W, H, n) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(W * 0.66, H * 0.5, 0, W * 0.66, H * 0.5, H * 0.6);
      g.addColorStop(0, "rgba(60,240,255,0.35)");
      g.addColorStop(1, "rgba(80,40,200,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      stars(ctx, W, H, n, 30, 0.3);
    },
  },

  // Indigo marble: slow swirls of navy, cobalt and violet with thin bright
  // veins, glittering.
  marble: {
    seed: 51,
    pixel(n, u, v) {
      const w = warp(n, u * 2.4, v * 2.4, 4);
      const bands = 0.5 + 0.5 * Math.sin((u * 1.4 + v + w.rx * 2.6) * 7 + w.f * 9);
      const vein = Math.pow(1 - Math.abs(bands * 2 - 1), 10);
      const body = ramp([[0, "#040616"], [0.4, "#0d1a5c"], [0.7, "#2c4fd6"], [0.88, "#7d3fc8"], [1, "#c58cff"]]);
      const c = body(w.f * 0.8 + bands * 0.25);
      return [mix(c[0], 225, vein * 0.55), mix(c[1], 210, vein * 0.55), mix(c[2], 255, vein * 0.6)];
    },
    overlay(ctx, W, H, n) {
      stars(ctx, W, H, n, 140, 0.25); // glitter in the stone
    },
  },

  // Harvest: a light, out-of-focus wash — butter yellow and apricot
  // drifting over peach and cream. The one daylight card.
  harvest: {
    seed: 83,
    light: true,
    grain: 0.035,
    pixel(n, u, v) {
      const w = warp(n, u * 1.6, v * 1.6, 1.2);
      const du = u + (w.qx - 0.5) * 0.22;
      const dv = v + (w.qy - 0.5) * 0.22;
      return blend(du, dv, hex("#fff7ec"), [
        [0.22, 0.12, 0.42, 0.42, hex("#f6cf6c"), 1.2],
        [0.55, 0.28, 0.22, 0.22, hex("#ecae55"), 1.3],
        [0.86, 0.4, 0.28, 0.3, hex("#efb768"), 1],
        [0.5, 0.92, 0.42, 0.32, hex("#f3c3b3"), 1.15],
        [0.03, 0.95, 0.24, 0.3, hex("#fffaf3"), 1.4],
        [0.97, 0.92, 0.22, 0.24, hex("#fffaf3"), 1.2],
        [0.97, 0.04, 0.2, 0.18, hex("#fcecd8"), 1],
      ]);
    },
    overlay() {},
  },

  // Velaris: near black, lit from within by one soft column of mint, a
  // shadow to its left.
  velaris: {
    seed: 97,
    grain: 0.05,
    pixel(n, u, v) {
      const w = warp(n, u * 1.8, v * 1.8, 1.6);
      const du = u + (w.qx - 0.5) * 0.25;
      const dv = v + (w.qy - 0.5) * 0.25;
      const c = blend(du, dv, hex("#020403"), [
        [0.62, 0.55, 0.62, 0.7, hex("#0e3a22"), 1.1],
        [0.6, 0.45, 0.16, 0.5, hex("#73d796"), 1.6],
        [0.67, 0.75, 0.12, 0.3, hex("#57c27e"), 0.8],
        [0.3, 0.3, 0.22, 0.38, hex("#000000"), 1.8],
        [0.05, 0.6, 0.25, 0.5, hex("#04130a"), 0.9],
      ]);
      return c;
    },
    overlay() {},
  },

  // Auralis: slow diagonal bands of ember red through the dark, lit at
  // their crests, under heavy film grain.
  auralis: {
    seed: 109,
    grain: 0.11,
    pixel(n, u, v) {
      const w = warp(n, u * 1.4, v * 1.4, 2.2);
      const t = Math.sin((u * 1.8 - v * 1.2) * 5.2 + (w.f - 0.5) * 6 + w.rx * 2);
      const band = smooth(-0.15, 0.95, t);
      const glow = 0.55 + 0.6 * blend(u, v, [0, 0, 0], [
        [0.3, 0.55, 0.35, 0.45, [1, 1, 1], 1.2],
        [0.62, 0.25, 0.3, 0.3, [1, 1, 1], 1],
      ])[0];
      const red = ramp([[0, "#060202"], [0.45, "#3a0c0a"], [0.8, "#8a221d"], [1, "#b4332b"]]);
      return red(band * glow * 0.95);
    },
    overlay() {},
  },

  // Mauve haze: pale grey, one soft bloom of plum standing off to the left
  // and fading out toward the right.
  mauve: {
    seed: 131,
    light: true,
    grain: 0.04,
    pixel(n, u, v) {
      const w = warp(n, u * 1.5, v * 1.5, 1);
      const du = u + (w.qx - 0.5) * 0.12;
      const dv = v + (w.qy - 0.5) * 0.12;
      return blend(du, dv, hex("#e9e6e8"), [
        [0.3, 0.45, 0.3, 0.75, hex("#a48a9e"), 1.1],
        [0.28, 0.6, 0.12, 0.4, hex("#5a3452"), 2.6],
        [0.4, 0.05, 0.2, 0.25, hex("#9a7a92"), 0.6],
        [0.82, 0.55, 0.35, 0.7, hex("#eceaeb"), 1.4],
        [0.03, 0.5, 0.08, 0.6, hex("#e3e0e2"), 1],
      ]);
    },
    overlay() {},
  },

  // Watercolour clouds: butter-yellow blotches with soft, ragged edges
  // drifting over cream, the way a wash dries on paper.
  clouds: {
    seed: 149,
    light: true,
    grain: 0.045,
    pixel(n, u, v) {
      const w = warp(n, u * 2.6, v * 2.6, 2.4);
      const sky = ramp([[0, "#fffaf0"], [0.42, "#fbecc4"], [0.55, "#f7dc8a"], [0.75, "#f4d06a"], [1, "#efc457"]]);
      // A ragged threshold, not a smooth ramp, is what gives the blotches
      // their dried-edge look.
      const blot = smooth(0.3, 0.38, w.f) * 0.5 + smooth(0.4, 0.5, w.f) * 0.38 + w.rx * 0.18;
      return sky(blot);
    },
    overlay() {},
  },

  // Fluted glass: black, and a warm glow rising from the bottom left, seen
  // through vertical glass reeds — each reed bends the light a little and
  // catches a thin highlight along its edge.
  fluted: {
    seed: 163,
    grain: 0.03,
    pixel(n, u, v) {
      const REEDS = 8;
      const local = (u * REEDS) % 1;
      // Inside each reed the image is shifted and stretched, as a lens would.
      const su = u + (local - 0.5) * 0.14;
      const reach = 1 - smooth(0.42, 0.8, su);
      const rise = smooth(0.3, 1, v);
      const g = clamp(rise * reach * 0.95 + smooth(0.85, 1.1, v) * smooth(0.35, 0.05, su) * 0.4, 0, 1);
      const glow = ramp([[0, "#000000"], [0.3, "#241104"], [0.55, "#86410f"], [0.78, "#c26a2c"], [0.92, "#d9a27a"], [1, "#d8cfc8"]]);
      const c = glow(g);
      // Edge highlight at one side of every reed, a shade at the other.
      const hi = Math.exp(-Math.pow((local - 0.03) / 0.035, 2)) * (0.07 + g * 0.25);
      const lo = smooth(0.8, 1, local) * 0.25;
      return [
        clamp(c[0] * (1 - lo) + hi * 255, 0, 255),
        clamp(c[1] * (1 - lo) + hi * 255, 0, 255),
        clamp(c[2] * (1 - lo) + hi * 255, 0, 255),
      ];
    },
    overlay() {},
  },

  // Red horizon: warm cream sky over the curved rim of a red planet, its
  // edge soft and grainy, the red paling as it falls away below.
  horizon: {
    seed: 181,
    light: true,
    grain: 0.06,
    pixel(n, u, v) {
      const w = warp(n, u * 3, v * 3, 1);
      const edge = 0.6 + Math.pow(u - 0.5, 2) * 0.55 + (w.f - 0.5) * 0.015;
      const d = v - edge;
      const cover = smooth(-0.045, 0.025, d);
      const red = ramp([[0, "#e4473b"], [0.12, "#e14a3e"], [0.3, "#e8796b"], [0.5, "#f0ab9f"]]);
      const c = red(Math.max(0, d) * 1.6);
      const sky = hex("#f6f3ec");
      return [mix(sky[0], c[0], cover), mix(sky[1], c[1], cover), mix(sky[2], c[2], cover)];
    },
    overlay() {},
  },

  // Mint haze: a pale mint field, a smoky dark-green cloud drifting through
  // it, and a soft lemon glow beneath.
  mint: {
    seed: 193,
    light: true,
    grain: 0.04,
    pixel(n, u, v) {
      const w = warp(n, u * 2, v * 2, 1.8);
      const du = u + (w.qx - 0.5) * 0.18;
      const dv = v + (w.qy - 0.5) * 0.18;
      return blend(du, dv, hex("#a7dab9"), [
        [0.56, 0.22, 0.2, 0.26, hex("#46634c"), 2.2],
        [0.46, 0.5, 0.14, 0.2, hex("#5f7a5c"), 1.4],
        [0.6, 0.78, 0.17, 0.28, hex("#e5e8b5"), 1.9],
        [0.66, 0.6, 0.12, 0.16, hex("#c9d79e"), 1],
        [0.12, 0.5, 0.35, 0.8, hex("#a5d8b6"), 1.3],
        [0.92, 0.5, 0.3, 0.8, hex("#a3d6b4"), 1.3],
      ]);
    },
    overlay() {},
  },

  // Blue swirl: silky streams of cobalt and sky blue wound round a dark
  // eye, like long-exposure water.
  swirl: {
    seed: 211,
    grain: 0.02,
    pixel(n, u, v) {
      // Coordinates twisted round the eye, then streaked along the twist.
      const cx = u - 0.48;
      const cy = v - 0.42;
      const r = Math.hypot(cx * 1.4, cy);
      const th = Math.atan2(cy, cx * 1.4) + 1.6 * Math.exp(-r * 2.2);
      const x = Math.cos(th) * r;
      const y = Math.sin(th) * r;
      const w = warp(n, x * 2.2 + 3, y * 5 + 1, 3);
      const eye = Math.exp(-Math.pow(r / 0.18, 2));
      const blue = ramp([[0, "#06142e"], [0.3, "#173f7d"], [0.55, "#3576c0"], [0.78, "#5aa0db"], [1, "#9fd2f0"]]);
      return blue(clamp(w.f * 1.15 - eye * 0.55 + 0.08, 0, 1));
    },
    overlay() {},
  },

  // Rosa marble: dusty rose and cream folded through each other, with thin
  // dark plum veins tracing the folds — fluid, like ink in milk.
  rosa: {
    seed: 223,
    light: true,
    grain: 0.025,
    pixel(n, u, v) {
      const w = warp(n, u * 2.6 + 4, v * 2.6, 4.2);
      const t = w.f * 1.25 - 0.12;
      const body = ramp([[0, "#f3e1dc"], [0.38, "#ecc9c2"], [0.52, "#c98089"], [0.75, "#b2606d"], [1, "#9d4c5b"]]);
      const c = body(t);
      // Veins along the folds, where the warp turns sharpest.
      const fold = Math.abs(w.rx - w.ry);
      const vein = Math.pow(smooth(0.06, 0, fold), 2) * smooth(0.45, 0.7, t);
      // Faint concentric contours inside the rose, like the reference.
      const ring = 0.5 + 0.5 * Math.sin(w.f * 46);
      const contour = smooth(0.9, 1, ring) * smooth(0.35, 0.6, t) * 0.12;
      const dark = [70, 22, 38];
      const k = clamp(vein * 0.75 + contour, 0, 1);
      return [mix(c[0], dark[0], k), mix(c[1], dark[1], k), mix(c[2], dark[2], k)];
    },
    overlay() {},
  },

  // Prismatic galaxy: a spiral seen at a slant, a warm core, blue-white arms
  // and pink dust lanes.
  galaxy: {
    seed: 67,
    pixel(n, u, v) {
      const cx = 0.6;
      const cy = 0.5;
      // Tilt the disc: squash vertically, then rotate.
      let x = (u - cx) * 1.45;
      let y = (v - cy) * 2.2;
      const a0 = -0.5;
      [x, y] = [x * Math.cos(a0) - y * Math.sin(a0), x * Math.sin(a0) + y * Math.cos(a0)];
      const r = Math.hypot(x, y) + 1e-4;
      const th = Math.atan2(y, x);
      const w = warp(n, u * 3.5, v * 3.5, 2);
      const arm = 0.5 + 0.5 * Math.cos(2 * th - Math.log(r) * 4.2 + w.f * 2.2);
      const disc = Math.exp(-r * 2.4);
      const core = Math.exp(-r * r * 60);
      const lum = disc * (0.35 + 0.9 * Math.pow(arm, 3)) * (0.6 + w.f) + core * 1.4;
      const space = ramp([[0, "#03040c"], [0.3, "#16205a"], [0.55, "#5d7dff"], [0.75, "#ff8fc0"], [0.9, "#fff1e8"], [1, "#ffffff"]]);
      return space(lum * 1.15);
    },
    overlay(ctx, W, H, n) {
      stars(ctx, W, H, n, 160, 0.6);
    },
  },
};

// Stars: mostly faint specks, a few bright ones with a cross-glint.
function stars(ctx, W, H, n, count, bright) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < count; k++) {
    const x = n.rand() * W;
    const y = n.rand() * H;
    const b = Math.pow(n.rand(), 3) * bright;
    const s = 0.6 + n.rand() * 1.4;
    ctx.fillStyle = `rgba(255,255,255,${(0.25 + b).toFixed(3)})`;
    ctx.fillRect(x, y, s, s);
    if (b > 0.35) {
      ctx.fillStyle = `rgba(220,230,255,${(b * 0.5).toFixed(3)})`;
      ctx.fillRect(x - 5, y + s / 2 - 0.5, 10 + s, 1);
      ctx.fillRect(x + s / 2 - 0.5, y - 5, 1, 10 + s);
    }
  }
  ctx.restore();
}

// Film grain: every pixel nudged lighter or darker at random — the texture
// that makes a soft gradient read as photographed rather than computed.
function grain(ctx, W, H, amount, n) {
  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;
  const amp = amount * 255;
  for (let k = 0; k < px.length; k += 4) {
    const d = (n.rand() - 0.5) * 2 * amp;
    px[k] = clamp(px[k] + d, 0, 255);
    px[k + 1] = clamp(px[k + 1] + d, 0, 255);
    px[k + 2] = clamp(px[k + 2] + d, 0, 255);
  }
  ctx.putImageData(data, 0, 0);
}

// --- Logos ------------------------------------------------------------------
const loadImage = (src) =>
  new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

// Keys the flat background out of a logo image and returns a trimmed
// transparent canvas. The background colour is read off the corners; each
// pixel's alpha is its distance from it, and its colour is un-blended from it
// so anti-aliased edges don't keep a halo. Dark ink on a light ground is
// lifted to white; `tint` "white" or "#hex" sets the whole mark in one colour.
function cutLogo(img, tint) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const at = (x, y) => (y * w + x) * 4;
  const corners = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)];
  const bg = [0, 1, 2].map((ch) => corners.reduce((s, i) => s + px[i + ch], 0) / 4);
  const bgLum = (bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114) / 255;

  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      const d = Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]);
      // A generous floor: flat logo files carry compression noise and
      // near-white fringes, which would otherwise come through as a faint box.
      const a = smooth(42, 120, d);
      if (a <= 0.02) {
        px[i + 3] = 0;
        continue;
      }
      // Un-blend from the background.
      let r = clamp((px[i] - bg[0] * (1 - a)) / a, 0, 255);
      let g = clamp((px[i + 1] - bg[1] * (1 - a)) / a, 0, 255);
      let b = clamp((px[i + 2] - bg[2] * (1 - a)) / a, 0, 255);
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      if (tint === "original") {
        // As drawn.
      } else if (tint && tint.startsWith("ink:")) {
        if (sat < 0.25) [r, g, b] = hex(tint.slice(4));
      } else if (tint && tint[0] === "#") {
        [r, g, b] = hex(tint);
      } else if (tint === "white" || (bgLum > 0.5 && lum < 0.35 && sat < 0.25)) {
        r = g = b = 255;
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = Math.round(a * 255);
      if (a > 0.3) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  if (x1 <= x0 || y1 <= y0) return c;
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(c, -x0, -y0);
  return out;
}

// --- The card ---------------------------------------------------------------
const LOW = 3; // scenes are painted at 1/LOW resolution and scaled up

/** Paints `item`'s card into `canvas` (width W, height W / ratio). */
export async function paintCard(canvas, item, i, ratio, W = 720) {
  // A newer paint of the same canvas (React runs effects twice in dev)
  // supersedes this one — two interleaved paints share a context and garble
  // each other's state.
  const token = (canvas.__paint = (canvas.__paint || 0) + 1);
  const H = Math.round(W / ratio);
  const key = item.company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const style = STYLE[key] || { scene: SCENES[i % SCENES.length], logo: "keep" };
  const scene = scenes[style.scene];
  const n = makeNoise(scene.seed + i * 101);

  // Scene, low-res then up.
  const lw = Math.ceil(W / LOW);
  const lh = Math.ceil(H / LOW);
  const low = document.createElement("canvas");
  low.width = lw;
  low.height = lh;
  const lctx = low.getContext("2d");
  const img = lctx.createImageData(lw, lh);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const [r, g, b] = scene.pixel(n, x / lw, y / lh);
      const k = (y * lw + x) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(low, 0, 0, W, H);
  scene.overlay(ctx, W, H, n);

  // A soft vignette, so the logo and the corners sit in shadow — not on a
  // daylight scene, which keeps its corners bright.
  if (!scene.light) {
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, W * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
  if (scene.grain) grain(ctx, W, H, scene.grain, n);

  // The logo, centred, sized to its shape — a wide wordmark gets more width,
  // a square mark more height — on a pool of shadow for legibility.
  const src = await loadImage(logoFor(item.company));
  if (canvas.__paint !== token) return;
  if (src) {
    const mark = cutLogo(src, style.logo);
    const aspect = mark.width / mark.height;
    const maxW = W * (aspect > 2 ? 0.56 : 0.34);
    const maxH = H * (aspect > 2 ? 0.26 : 0.44);
    const s = Math.min(maxW / mark.width, maxH / mark.height);
    const dw = mark.width * s;
    const dh = mark.height * s;
    const lx = (W - dw) / 2;
    const ly = (H - dh) / 2;
    if (!scene.light) {
      const pool = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(dw, dh) * 0.85);
      pool.addColorStop(0, "rgba(0,0,0,0.28)");
      pool.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    ctx.shadowColor = scene.light ? "rgba(120,60,10,0.18)" : "rgba(0,0,0,0.6)";
    ctx.shadowBlur = H * (scene.light ? 0.03 : 0.05);
    ctx.drawImage(mark, lx, ly, dw, dh);
    ctx.restore();
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = `${Math.round(H * 0.042)}px 'Courier New', monospace`;
  ctx.fillStyle = scene.light ? "rgba(90,45,15,0.75)" : "rgba(255,255,255,0.7)";
  ctx.fillText(item.period.toUpperCase(), W * 0.045, H - H * 0.06);
  ctx.textAlign = "right";
  ctx.fillText(item.id, W - W * 0.045, H - H * 0.06);
}
