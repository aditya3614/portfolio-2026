// ---------------------------------------------------------------------------
// Repo Atlas card preview — its landing hero: the orbit globe hanging in the
// black over a skyline of pink columns that slowly breathe up and down.
//
// The globe is the existing port of Repo Atlas's GlobeBackdrop
// (repoAtlasGlobe.js), drawn here at hero scale. The skyline is copied from
// the landing page's .skyline: 28 columns edge to edge, each a fade from its
// pink (--skyline, #ee4f8d) up to nothing, swaying between its own low and
// high height (--h-lo / --h-hi) on a 12s ease-in-out cycle, offset by the
// same per-column delays the page uses, so the heights roll across the row
// the way they do there. The columns sit a hairline apart, as on the page.
//
// No headline: the card carries the title, and the globe over the skyline
// is what makes the page recognisable.
// ---------------------------------------------------------------------------
import { createRepoAtlasGlobe } from "./repoAtlasGlobe";

// The card's image area is 340 × 127.2 units; the canvas matches it.
const ASPECT = 340 / (212 * 0.6);

const SKYLINE = "238, 79, 141";
const SWAY_SEC = 12;

// [--h-lo, --h-hi, animation-delay in seconds] for each column, in order.
const COLUMNS = [
  [0.573, 0.99, -0.75], [0.611, 0.826, -4.67], [0.598, 0.836, -4.76],
  [0.667, 1, -1.85], [0.538, 0.97, -2.08], [0.696, 1, -6.34],
  [0.613, 1, -7.13], [0.587, 0.794, -5.71], [0.684, 1, -7.2],
  [0.555, 0.904, -4.75], [0.597, 0.964, -11.17], [0.583, 0.814, -10.09],
  [0.631, 1, -4.37], [0.66, 1, -10.35], [0.589, 0.99, -5.42],
  [0.611, 1, -10.29], [0.608, 1, -8.99], [0.648, 0.986, -7.28],
  [0.522, 0.771, -5.39], [0.661, 1, -6.61], [0.602, 0.948, -11.61],
  [0.522, 0.827, -9.56], [0.555, 0.78, -11.89], [0.631, 1, -7.35],
  [0.641, 1, -6.64], [0.667, 1, -10.6], [0.645, 0.902, -7.81],
  [0.542, 0.969, -1.68],
];

// CSS `ease-in-out`, near enough: a symmetric cubic.
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createRepoAtlasHero(size = 512) {
  const W = size * 2;
  const H = Math.round(W / ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // The globe's canvas puts the sphere at 0.3 of its side, so this makes a
  // sphere about four fifths of the card's height across. Its haze runs off
  // the top and bottom, but has faded to almost nothing by then.
  const globe = createRepoAtlasGlobe(Math.round(H * 1.35));
  const G = globe.canvas.width;
  const gx = (W - G) / 2;
  const gy = H * 0.46 - G / 2;

  // The skyline is about a third of the page's height there; a little more
  // here, so the columns still read on a card this short.
  const SKY_H = H * 0.4;
  const colW = W / COLUMNS.length;
  const hairline = Math.max(1, Math.round(W / 1024));
  const fade = ctx.createLinearGradient(0, H, 0, H - SKY_H);
  fade.addColorStop(0, `rgba(${SKYLINE}, 1)`);
  fade.addColorStop(1, `rgba(${SKYLINE}, 0)`);

  function skyline(t) {
    ctx.fillStyle = fade;
    COLUMNS.forEach(([lo, hi, delay], i) => {
      // skyline-sway: low at 0% and 100%, high at 50%, ease-in-out each way.
      const p = (((t - delay) % SWAY_SEC) + SWAY_SEC) % SWAY_SEC / SWAY_SEC;
      const e = easeInOut(p < 0.5 ? p * 2 : 2 - p * 2);
      const h = SKY_H * (lo + (hi - lo) * e);
      const x = Math.round(i * colW);
      const x2 = Math.round((i + 1) * colW);
      // The column is scaled from its foot, so its fade is squashed with it.
      ctx.save();
      ctx.translate(0, H);
      ctx.scale(1, h / SKY_H);
      ctx.translate(0, -H);
      ctx.fillRect(x, H - SKY_H, x2 - x - hairline, SKY_H);
      ctx.restore();
    });
  }

  function draw(t) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    skyline(t);
    globe.draw(t);
    ctx.drawImage(globe.canvas, gx, gy);
  }

  return { canvas, draw, fill: true, aspect: W / H, focusY: 0.5 };
}
