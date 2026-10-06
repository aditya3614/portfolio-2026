// ---------------------------------------------------------------------------
// FlowJS card preview — the app's first screen, mid-run: the dark editor on
// the left with line 4 lit, and on the right the picture FlowJS draws for
// that line, a `filter` testing each price against `p < 50`.
//
// Copied from the live app rather than imagined: the cream page and its
// terracotta dot field, the editor's ink panel and syntax colours, the
// active-line tint and arrow, and the filter stage itself — its terracotta
// badge and border, the rule, the items turning to a sage tick or a dashed
// cross, and the BUILDING… row underneath growing one cell per kept item
// until it becomes the RESULT. The values are those of its default example,
// "Array pipeline".
//
// The app steps through this by hand or on Play; here it plays on its own
// loop, one item per beat, holds on the result, then starts over. Time 0
// falls in the hold, so the reduced-motion still is the finished filter.
//
// Both panels run off the bottom edge, so it reads as a crop of the screen
// rather than a diagram of it.
// ---------------------------------------------------------------------------

// The card's image area is 340 × 127.2 units; the canvas matches it.
const ASPECT = 340 / (212 * 0.6);

// FlowJS's tokens.
const CREAM = "#faf9f5";
const INK = "#141413";
const TERRA = "#d97757";
const SLATE = "#73726c";
const STONE = "#87867f";
const FOG = "#b0aea5";
const MIST = "#c6c4ba";
const HAIR_SOFT = "rgba(20, 20, 19, 0.1)";
const TINT = "rgba(20, 20, 19, 0.04)";
const MONO = "'Source Code Pro', Menlo, Consolas, 'Courier New', monospace";
const SANS = "Inter, Helvetica, Arial, sans-serif";

// The editor's syntax colours, by token kind.
const SYNTAX = {
  k: TERRA,        // keywords
  i: CREAM,        // identifiers
  p: "#ebcece",    // properties
  n: "#6a9bcc",    // numbers
  o: "#6f6a64",    // punctuation and operators
  c: STONE,        // comments
};
// The example, as [kind, text] runs per line.
const CODE = [
  [["c", "// Three shoppers, three baskets."]],
  [["k", "const "], ["i", "prices "], ["o", "= ["], ["n", "12"], ["o", ", "], ["n", "40"], ["o", ", "], ["n", "7"], ["o", ", "], ["n", "95"], ["o", ", "], ["n", "23"], ["o", "];"]],
  [],
  [["k", "const "], ["i", "affordable "], ["o", "= "], ["i", "prices"], ["o", "."], ["p", "filter"], ["o", "("], ["i", "p "], ["o", "=> "], ["i", "p "], ["o", "< "], ["n", "50"], ["o", ");"]],
  [["k", "const "], ["i", "withTax "], ["o", "= "], ["i", "affordable"], ["o", "."], ["p", "map"], ["o", "("], ["i", "p "], ["o", "=> "], ["i", "p "], ["o", "* "], ["n", "1.2"], ["o", ");"]],
  [["k", "const "], ["i", "total "], ["o", "= "], ["i", "withTax"], ["o", "."], ["p", "reduce"], ["o", "(("], ["i", "sum"], ["o", ", "], ["i", "p"], ["o", ") => "], ["i", "sum "], ["o", "+ "], ["i", "p"], ["o", ", "], ["n", "0"], ["o", ");"]],
];
const ACTIVE_LINE = 3;

const PRICES = [12, 40, 7, 95, 23];
const keeps = (v) => v < 50;

// Timeline, in seconds: one item per beat, then the result holds.
const FIRST = 0.7;
const BEAT = 0.85;
const DONE = FIRST + PRICES.length * BEAT;
const CYCLE = DONE + 3.2;
const START_AT = DONE + 1.2;  // where t = 0 falls: in the hold
const RESET = 0.35;           // fade-out before the loop starts over

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);

export function createFlowJsHero(size = 512) {
  const W = size * 2;
  const H = Math.round(W / ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Everything below is laid out in the app's own CSS pixels, scaled up so
  // its 14.5px code is still legible on a card.
  const S = W / 731;
  const VH = H / S;

  // The page: cream with a terracotta dot every 28px. A few dots brighten
  // and fade, the way FlowJS's DotField flickers.
  const page = document.createElement("canvas");
  page.width = W;
  page.height = H;
  {
    const p = page.getContext("2d");
    p.fillStyle = CREAM;
    p.fillRect(0, 0, W, H);
    p.fillStyle = "rgba(217, 119, 87, 0.32)";
    p.beginPath();
    for (let y = 14; y < VH; y += 28) {
      for (let x = 14; x < 731; x += 28) {
        p.moveTo((x + 1.3) * S, y * S);
        p.arc(x * S, y * S, 1.3 * S, 0, Math.PI * 2);
      }
    }
    p.fill();
  }
  const FLICKER = [[2, 1, 0], [7, 8, 1.7], [25, 0, 0.9], [11, 9, 2.6], [24, 9, 3.4], [0, 6, 4.1]];

  // Panels: the editor, and the filter stage beside it.
  const ED = { x: 18, y: 18, w: 282, h: 300 };
  const ST = { x: 318, y: 18, w: 395, h: 262 };

  function rounded(x, y, w, h, r) {
    const path = new Path2D();
    path.roundRect(x, y, w, h, r);
    return path;
  }

  function editor() {
    const panel = rounded(ED.x, ED.y, ED.w, ED.h, 16);
    ctx.fillStyle = INK;
    ctx.fill(panel);
    ctx.save();
    ctx.clip(panel);
    ctx.textBaseline = "middle";
    const lineH = 27;
    const top = ED.y + 20;
    CODE.forEach((runs, i) => {
      const y = top + i * lineH + lineH / 2;
      if (i === ACTIVE_LINE) {
        ctx.fillStyle = "rgba(217, 119, 87, 0.16)";
        ctx.fillRect(ED.x + 46, y - lineH / 2, ED.w, lineH);
        ctx.fillStyle = TERRA;
        ctx.fillRect(ED.x + 46, y - lineH / 2, 2, lineH);
        ctx.font = `9px ${MONO}`;
        ctx.fillText("▶", ED.x + 34, y);
      }
      ctx.font = `14.5px ${MONO}`;
      ctx.fillStyle = "#5f5e59";
      ctx.textAlign = "right";
      ctx.fillText(String(i + 1), ED.x + 32, y);
      ctx.textAlign = "left";
      let x = ED.x + 54;
      for (const [kind, text] of runs) {
        ctx.fillStyle = SYNTAX[kind];
        ctx.font = kind === "c" ? `italic 14.5px ${MONO}` : `14.5px ${MONO}`;
        ctx.fillText(text, x, y);
        x += ctx.measureText(text).width;
      }
    });
    ctx.restore();
  }

  // One value in its box: the kept / dropped / not-yet-tested item chips.
  function item(x, y, value, state, alpha) {
    const box = rounded(x, y, 62, 40, 8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `17px ${MONO}`;
    if (state === "keep") {
      ctx.fillStyle = "rgba(120, 140, 93, 0.17)";
      ctx.fill(box);
      ctx.strokeStyle = "rgba(120, 140, 93, 0.7)";
      ctx.lineWidth = 1;
      ctx.stroke(box);
      ctx.fillStyle = INK;
      ctx.fillText(`${value} ✓`, x + 31, y + 20.5);
    } else if (state === "drop") {
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = SLATE;
      ctx.lineWidth = 1.5;
      ctx.stroke(box);
      ctx.fillStyle = FOG;
      ctx.fillText(`${value} ×`, x + 31, y + 20.5);
    } else {
      ctx.strokeStyle = HAIR_SOFT;
      ctx.lineWidth = 1;
      ctx.stroke(box);
      ctx.fillStyle = MIST;
      ctx.fillText(String(value), x + 31, y + 20.5);
    }
    ctx.restore();
  }

  // A cell of the result row: its index above a value chip.
  function cell(x, y, index, value, p) {
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(x + 23, y + 26);
    const k = 0.6 + 0.4 * p;
    ctx.scale(k, k);
    ctx.strokeStyle = HAIR_SOFT;
    ctx.lineWidth = 1;
    ctx.stroke(rounded(-23, -26, 46, 52, 8));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = STONE;
    ctx.font = `10px ${MONO}`;
    ctx.fillText(String(index), 0, -17);
    const chip = rounded(-15, -9, 30, 26, 4);
    ctx.fillStyle = TINT;
    ctx.fill(chip);
    ctx.stroke(chip);
    ctx.fillStyle = INK;
    ctx.font = `500 14px ${MONO}`;
    ctx.fillText(String(value), 0, 4.5);
    ctx.restore();
  }

  function stage(e, fade) {
    const box = rounded(ST.x, ST.y, ST.w, ST.h, 8);
    ctx.fillStyle = CREAM;
    ctx.fill(box);
    ctx.save();
    ctx.clip(box);

    const done = e >= DONE;
    ctx.textBaseline = "middle";

    // Head: the badge and its one-line story.
    ctx.font = `600 16px ${MONO}`;
    const badgeW = ctx.measureText("filter").width + 28;
    ctx.fillStyle = TERRA;
    ctx.fill(rounded(ST.x + 24, ST.y + 20, badgeW, 30, 4));
    ctx.fillStyle = INK;
    ctx.fillText("filter", ST.x + 38, ST.y + 35.5);
    ctx.font = `15px ${SANS}`;
    ctx.fillStyle = SLATE;
    ctx.fillText("keeps only the items that pass a test", ST.x + 40 + badgeW, ST.y + 35.5);

    // The rule, hung off a terracotta hairline.
    const ry = ST.y + 64;
    ctx.fillStyle = "rgba(217, 119, 87, 0.55)";
    ctx.fillRect(ST.x + 24, ry, 2, 30);
    ctx.font = `700 12px ${SANS}`;
    ctx.letterSpacing = "1px";
    ctx.fillStyle = SLATE;
    ctx.fillText("RULE", ST.x + 40, ry + 15.5);
    ctx.letterSpacing = "0px";
    ctx.font = `17px ${MONO}`;
    ctx.fillText("p →", ST.x + 86, ry + 15.5);
    ctx.fillStyle = INK;
    ctx.fillText("p < 50", ST.x + 86 + ctx.measureText("p → ").width, ry + 15.5);

    // The items, each settling as its beat arrives.
    const iy = ST.y + 112;
    PRICES.forEach((v, i) => {
      const at = FIRST + i * BEAT;
      const x = ST.x + 24 + i * 70;
      if (e < at) item(x, iy, v, "wait", fade);
      else {
        const p = easeOut((e - at) / 0.25);
        if (p < 1) item(x, iy, v, "wait", fade * (1 - p));
        item(x, iy, v, keeps(v) ? "keep" : "drop", fade * p);
      }
    });

    // Foot: BUILDING… gathering the kept items, RESULT once done.
    const fy = ST.y + 174;
    ctx.fillStyle = "rgba(20, 20, 19, 0.04)";
    ctx.fillRect(ST.x, fy, ST.w, ST.h);
    ctx.fillStyle = HAIR_SOFT;
    ctx.fillRect(ST.x, fy, ST.w, 1);
    ctx.font = `700 12px ${SANS}`;
    ctx.letterSpacing = "1px";
    ctx.fillStyle = SLATE;
    ctx.fillText(done ? "RESULT" : "BUILDING…", ST.x + 24, fy + 42);
    ctx.letterSpacing = "0px";
    const cx0 = ST.x + 140;
    ctx.font = `17px ${MONO}`;
    ctx.fillStyle = MIST;
    ctx.fillText("[", cx0 - 14, fy + 42);
    let n = 0;
    PRICES.forEach((v, i) => {
      if (!keeps(v)) return;
      const p = easeOut((e - (FIRST + i * BEAT) - 0.1) / 0.35);
      cell(cx0 + n * 54, fy + 16, n, v, p * fade);
      n += 1;
    });
    ctx.fillStyle = MIST;
    const kept = PRICES.filter((v, i) => keeps(v) && e >= FIRST + i * BEAT).length;
    ctx.fillText("]", cx0 + Math.max(kept, 0) * 54 + 2, fy + 42);

    ctx.restore();

    // The active border: terracotta, doubled inside as the app does.
    ctx.strokeStyle = TERRA;
    ctx.lineWidth = 2;
    ctx.stroke(rounded(ST.x + 0.5, ST.y + 0.5, ST.w - 1, ST.h - 1, 8));
  }

  function draw(t) {
    const e = (t + START_AT) % CYCLE;
    // The last moment of the loop fades the stage's progress back out, so
    // the restart isn't a jump.
    const fade = 1 - clamp01((e - (CYCLE - RESET)) / RESET);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(page, 0, 0);
    for (const [col, row, phase] of FLICKER) {
      const a = Math.max(0, Math.sin(t * 0.9 + phase * 1.7)) ** 3;
      if (a < 0.02) continue;
      ctx.fillStyle = `rgba(217, 119, 87, ${0.85 * a})`;
      ctx.beginPath();
      ctx.arc((14 + col * 28) * S, (14 + row * 28) * S, 1.8 * S, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.setTransform(S, 0, 0, S, 0, 0);
    editor();
    stage(e, fade);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { canvas, draw, fill: true, aspect: W / H, focusY: 0.5 };
}
