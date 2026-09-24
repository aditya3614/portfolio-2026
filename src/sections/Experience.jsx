import { useEffect, useRef, useState } from "react";
import { EXPERIENCE } from "../data/experience";
import { ACCENT } from "../theme";
import { useScrollProgressRef } from "../hooks/useScrollProgress";
import { JOURNEY_POSES } from "../components/runner";
import "../experience.css";

/**
 * EXPERIENCE — a run across the companies, hung in space like stars.
 *
 * Each company name is spelled out in the sun's blocks (same square pixels,
 * hairline gaps and heat palette as SunHero) and left floating somewhere
 * along a zig-zag that heads off into the dark. Scrolling draws a dotted
 * line from the current name out to the next one, and the little doodled
 * runner from About sets off along it; the camera follows him, pulling in
 * close to each name as he reaches it. The run ends at Juspay, arms up —
 * and the camera, instead of stopping, punches on down the corridor into
 * About.
 *
 * How it's built:
 *
 *  - **Words are sampled, not drawn.** Each name is rendered once into an
 *    offscreen canvas and read back on a block grid; every covered cell
 *    becomes a block, placed in world space around that word's centre.
 *  - **One camera, a single divide.** Everything — blocks, line, dust, the
 *    runner's feet — is a world point projected as (p - cam).xy * F / dz.
 *    At a hold the camera sits exactly F in front of the word, so the word
 *    renders at the size it was sampled at.
 *  - **Plain canvas 2D, bucketed by colour.** Same trick as SunHero: one
 *    path per palette step, filled once each.
 *  - **The runner is DOM.** An SVG with the same hand-drawn line boil as in
 *    About, positioned every frame at the projected point on the line. His
 *    stride is driven by distance run, not time, so scrolling back runs him
 *    backwards and stopping stops him.
 *
 * Driven by real document scroll via useScrollProgressRef — the same single
 * timeline every other section reads. See Projects.jsx for why nothing here
 * captures the wheel.
 */

const COUNT = EXPERIENCE.length;
// --- The hand-off to About -------------------------------------------------
// After the last company the camera doesn't stop: it eases to the middle of
// the corridor and carries straight on, the names falling away past the lens,
// toward the spot where About's globe opens — and About fades in around it
// while the camera is still moving, so its own flight picks up the motion.
//
// About opens with its globe 0.05 * min(1, aspect) of the viewport below
// mid-screen (see its opening camera in About.jsx), so that's where the
// camera's line of flight is steered to.
const ABOUT_DROP = 0.05;
const OUTRO = 1.2; // slots of scroll for the flight out
// Slots past the end of it. Short on purpose: About's fade-in takes the last
// fifth of a viewport of this section's scroll, so it overlaps the end of
// the flight rather than following a pause.
const TAIL = 0.1;
const OUT_DEPTH = 4; // how far the camera travels on the way out, in F
// And on the way in: while this section fades in over Projects its camera
// is already moving, so the handover carries Projects' forward motion
// instead of freezing on a still frame.
const PRE_ROLL = 1.2; // in F

// Straight from SunHero — hot core through to the cold rim.
const PALETTE = ["#ffe800", "#ffc400", "#ff8a00", "#ff4d0d", "#b33100", "#6b1d00"];
const INK = "#f4ede4"; // the runner's colour, from About — also the line's

const FONT = "'Arial Black', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const GAP_RATIO = 0.1; // hairline between blocks, as in SunHero
const LINE_HEIGHT = 0.92; // em, for names that wrap on a phone

const DITHER = 0.28;
const SHIMMER = 0.05;
const SHIMMER_FPS = 12; // chunky on purpose, like the sun

// Fraction of each leg's scroll spent standing at a company. Without it the
// page is always mid-run and never lets you read anything.
const DWELL = 0.45;
const SMOOTHING = 5; // per second — how tightly the camera follows the scroll

const APPROACH = 2.2; // how far back (in F) the section opens before the first name
// Laid out the way Projects lays out its cards: a corridor flown straight
// down, with each company alternating left and right of the path and close
// enough behind the last that the next few are always in view ahead.
const LEG_DEPTH = 0.95; // how far each company sits behind the last, in F
const SIDE = 0.25; // how far off the path each sits, in viewport widths
const SIDE_NARROW = 0.16;
// The camera flies down the middle, but leans this share of the way toward
// the side the runner is on, so the company he's at is framed, not cropped.
const CAM_FOLLOW = 0.3;
// A phone has no room to spare either side, so there the camera swings most
// of the way over to each company.
const CAM_FOLLOW_NARROW = 0.65;
// On a phone the name you're at is the only one worth reading; the rest
// shrink to this share of their size until you reach them.
const DISTANT_SCALE_NARROW = 0.5;
// Depth (in F) over which names further down the corridor condense out of
// the dark: the next one is fully there, the one after it only a glimmer.
const FOG = [2.0, 2.5];
// The story: how he gets from each company to the next, in order. Runs out
// of legs? It starts over.
const LEGS = ["run", "cycle", "surf", "fly"];
// Steps per leg for the modes animated by distance travelled (scroll back
// and he pedals backwards); the others animate on the clock instead, since
// a cape still flutters and a wave still rolls when you stop scrolling.
const STRIDES = { run: 22, cycle: 14 };
const FLUTTER = { surf: 5, fly: 7 }; // frames per second
const LIFT = 1.5; // how high the flight arcs above the line, in figure heights

// Every pose as one flat list, so the DOM can mount them all once and the
// frame loop only flips which one is showing.
const POSES = Object.entries(JOURNEY_POSES).flatMap(([name, v]) =>
  Array.isArray(v[0]) ? v.map((parts, frame) => ({ name, frame, parts })) : [{ name, frame: 0, parts: v }]
);
const poseAt = (name, frame = 0) => POSES.findIndex((q) => q.name === name && q.frame === frame);
const STAND = poseAt("stand");
const CHEER = poseAt("cheer");

const DOT_SPACING = 2.6; // line dots, in blocks
const DUST_COUNT = 320;

const LENS_RADIUS = 110; // px
const LENS_GROW = 0.8;
const PARALLAX = 0.035; // camera sway toward the pointer, in viewport widths

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Scroll progress (0..1) -> "raw" position along the run: -1 is the opening
// approach, 0..COUNT-1 the companies. The camera uses a stepped version with
// a hold at each whole number; the line uses raw, so it can start drawing
// toward the next name while you're still standing at this one.
const H = DWELL / 2;
// A long stretch of scroll per leg of the run, plus the opening approach,
// the flight out, and the hold while About takes over.
const SLOTS = COUNT + H + OUTRO + TAIL;
const SCROLL_LENGTH_VH = 100 + SLOTS * 110;
const toRaw = (p) => p * SLOTS - 1;
// Where the flight out begins: the end of the hold at the last company.
const OUT_AT = COUNT - 1 + H;
const toSlot = (raw) => {
  // The opening approach doesn't hold at its start the way the stops do —
  // it's already under way when the section arrives, and eases out into
  // the first company.
  if (raw < -H) {
    const t = clamp((raw + 1) / (1 - H), 0, 1);
    return -1 + (1 - Math.pow(1 - t, 3));
  }
  const i = Math.floor(raw);
  return clamp(i + smoothstep(H, 1 - H, raw - i), -1, COUNT - 1);
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// Two lines, split at whichever space balances them best. Only used on a
// phone, where one line would shrink a long name down to a handful of rows.
function splitLines(text) {
  const words = text.split(" ");
  if (words.length < 2 || text.length < 9) return [text];
  let best = [text];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Sets `lines` as large as fits in maxW x maxH and reads them back on a grid
 * of `block`-sized cells. Returns the covered cells' centres relative to the
 * word's centre, in CSS px at a scale of 1.
 */
function sampleWord(block, maxW, maxH, lines) {
  const SUB = 4; // samples per block edge
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `900 100px ${FONT}`;
  const widest = Math.max(...lines.map((l) => probe.measureText(l).width));
  const size = Math.min((100 * maxW) / widest, maxH / (lines.length * LINE_HEIGHT));

  const cols = Math.ceil((widest * size) / 100 / block) + 2;
  const rows = Math.ceil((lines.length * LINE_HEIGHT * size) / block) + 2;
  const canvas = document.createElement("canvas");
  canvas.width = cols * SUB;
  canvas.height = rows * SUB;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.scale(SUB / block, SUB / block);
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  const midY = (rows * block) / 2;
  lines.forEach((line, i) => {
    const y = midY + (i - (lines.length - 1) / 2) * LINE_HEIGHT * size;
    ctx.fillText(line, (cols * block) / 2, y);
  });

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const pts = [];
  let top = Infinity;
  let bottom = -Infinity;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let sy = 0; sy < SUB; sy++) {
        const row = (r * SUB + sy) * canvas.width;
        for (let sx = 0; sx < SUB; sx++) sum += data[(row + c * SUB + sx) * 4 + 3];
      }
      if (sum / (SUB * SUB * 255) > 0.4) {
        const y = (r - rows / 2 + 0.5) * block;
        pts.push((c - cols / 2 + 0.5) * block, y);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return {
    xy: Float32Array.from(pts),
    n: pts.length / 2,
    halfW: (cols * block) / 2,
    // The inked extent, not the canvas box — the runner stands under the
    // letters themselves, not under empty padding.
    halfH: Math.max(-top, bottom) + block / 2,
  };
}

// "Aug 2022 — Jan 2023" -> "AUG ’22", for the timeline under the run.
// Several roles can start in the same year, so the year alone isn't enough.
function tickLabel(period) {
  const start = period.split("—")[0].trim();
  const m = start.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  return m ? `${m[1].toUpperCase()} ’${m[2].slice(2)}` : start;
}

// Types a string in through a run of block glyphs, left to right — the HUD's
// way of saying the value just changed.
const GLYPHS = "█▓▒░/\\<>_-+=#";
function Decode({ text, className, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = text;
      return;
    }
    const start = performance.now();
    const DURATION = 520;
    let raf;
    const step = (now) => {
      const t = clamp((now - start) / DURATION, 0, 1);
      const shown = Math.floor(t * text.length);
      let out = text.slice(0, shown);
      for (let i = shown; i < text.length; i++) {
        out += text[i] === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      el.textContent = out;
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <span ref={ref} className={className} style={style} aria-label={text} />;
}

export default function Experience() {
  const sectionRef = useRef(null);
  const stackRef = useRef(null);
  const canvasRef = useRef(null);
  const hudRef = useRef(null);
  const markerRef = useRef(null);
  const topRef = useRef(null);
  const timelineRef = useRef(null);
  const runnerRef = useRef(null);
  const flipRef = useRef(null);
  // Every pose is mounted up front; the loop shows one at a time.
  const poseRefs = useRef([]);

  const { progressRef, entryRef } = useScrollProgressRef(sectionRef);

  const [active, setActive] = useState(0);
  const [everActive, setEverActive] = useState(false);
  const activeRef = useRef(false);
  const rafIdRef = useRef(null);
  const tickRef = useRef(null);

  // Don't set anything up, or run the loop, until this section is near the
  // viewport — otherwise every canvas on the page renders from first paint.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        activeRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          setEverActive(true);
          if (rafIdRef.current == null && tickRef.current) {
            rafIdRef.current = requestAnimationFrame(tickRef.current);
          }
        }
      },
      { rootMargin: "50% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!everActive) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let narrow = false;
    let block = 4;
    let F = 1000; // focal length, px: a point F in front of the camera is at scale 1
    let runH = 36; // runner height, world px
    let words = [];
    // Per company: world centre (x, y, z) and the point on the line under it
    // where the runner stands.
    let centres = [];
    let anchors = [];
    let dust = null;
    const layout = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (!width || !height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      narrow = width < 760;
      F = Math.max(width, height) * 1.1;
      block = narrow ? Math.max(2.2, width / 150) : Math.max(3, Math.min(6, width / 320));
      runH = narrow ? 30 : clamp(height * 0.045, 30, 46);
      const maxW = width * (narrow ? 0.72 : 0.4);
      const maxH = height * (narrow ? 0.16 : 0.15);

      words = EXPERIENCE.map((item) =>
        sampleWord(block, maxW, maxH, narrow ? splitLines(item.company) : [item.company])
      );

      // The zig-zag: left, right, left… each a little further down the
      // corridor, with a touch of height jitter so the row doesn't read as
      // ruled.
      const side = width * (narrow ? SIDE_NARROW : SIDE);
      const jitter = rng(7);
      centres = words.map((_, i) => [
        (i % 2 ? 1 : -1) * side,
        // On a phone the names are nearly full-width, so there's no room to
        // zig sideways alone — the path climbs as well, each company above
        // the last, so the way ahead is always up the screen and never runs
        // through the text underneath.
        (narrow
          ? -i * 0.16 + (jitter() - 0.5) * 0.03
          : (i % 2 ? 1 : -1) * 0.06 + (jitter() - 0.5) * 0.05) * height,
        i * LEG_DEPTH * F,
      ]);
      anchors = words.map((w, i) => [
        centres[i][0],
        centres[i][1] + w.halfH + runH * 1.35,
        centres[i][2],
      ]);

      // A sparse field of specks through the whole volume — the only thing
      // that tells you you're moving between names.
      const rand = rng(42);
      const span = centres[COUNT - 1];
      dust = new Float32Array(DUST_COUNT * 4);
      for (let k = 0; k < DUST_COUNT; k++) {
        dust[k * 4] = (rand() * 2 - 1) * width * 1.4;
        dust[k * 4 + 1] = (rand() * 2 - 1) * height * 1.1;
        dust[k * 4 + 2] = -(APPROACH + PRE_ROLL) * F + rand() * (span[2] + (APPROACH + PRE_ROLL + OUT_DEPTH + 2) * F);
        dust[k * 4 + 3] = rand();
      }

    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(canvas);

    // --- pointer ------------------------------------------------------------
    let pointerX = 0;
    let pointerY = 0;
    let present = 0;
    const onMove = (e) => {
      const box = canvas.getBoundingClientRect();
      pointerX = e.clientX - box.left;
      pointerY = e.clientY - box.top;
      // Touch has no hover, and a lens that pops up under a scrolling thumb
      // just looks like a glitch.
      present = e.pointerType === "mouse" ? 1 : 0;
    };
    const onLeave = () => {
      present = 0;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    // --- frame --------------------------------------------------------------
    const buckets = PALETTE.map(() => []);
    const dots = [];
    const specks = [];
    let p = null;
    let lens = 0;
    let swayX = 0;
    let swayY = 0;
    let previous = 0;
    let clock = 0;
    let pose = -1;
    let facing = 1;

    const lerp3 = (a, b, t) => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];

    const tick = (now) => {
      if (!activeRef.current) {
        rafIdRef.current = null;
        previous = 0;
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);

      // Fades in over Projects, and deliberately never fades out — About
      // sits above this one and covers it.
      const fade = entryRef.current;
      if (stackRef.current) {
        stackRef.current.style.opacity = fade;
        stackRef.current.style.pointerEvents = fade > 0.01 ? "auto" : "none";
      }
      if (!width || !words.length) return;

      const dt = previous ? Math.min((now - previous) / 1000, 1 / 20) : 0;
      previous = now;
      clock += dt;

      // Smooth the scroll itself, then derive everything from it — the line
      // and the camera stay locked together however fast you scroll.
      const target = progressRef.current;
      p = p === null || reduced ? target : p + (target - p) * (1 - Math.exp(-SMOOTHING * dt));
      if (Math.abs(target - p) < 1e-5) p = target;
      const raw = toRaw(p);
      const slot = toSlot(raw);

      let i = Math.floor(slot);
      let f = slot - i;
      if (i >= COUNT - 1) {
        i = COUNT - 1;
        f = 0;
      }

      // --- where everyone is -----------------------------------------------
      // The camera flies straight down the corridor, keeping pace with the
      // runner in depth, while he zig-zags across it from one company to the
      // next.
      const cx = width / 2;
      const NEAR = F * 0.12;
      // 0 until the last hold ends, then 0 -> 1 on the way out.
      const u = clamp((raw - OUT_AT) / OUTRO, 0, 1);
      // Eases in from the stop, and is still gliding at the end rather than
      // braking to a halt — About's camera takes over from a moving one.
      const travel = OUT_DEPTH * F * u * u * (2 - u);
      // The line of flight swings to where About's globe will sit.
      const settle = smoothstep(0, 0.6, u);
      const cy =
        height * (narrow ? 0.36 : 0.4) +
        (height * (0.5 + ABOUT_DROP * Math.min(1, width / height)) - height * (narrow ? 0.36 : 0.4)) * settle;

      const follow = narrow ? CAM_FOLLOW_NARROW : CAM_FOLLOW;
      // Vertically: half-way on a desktop, all the way up the climb on a phone.
      const followY = narrow ? 1 : 0.5;
      let run;
      let cam;
      let runT = 0;
      if (i < 0) {
        // Opening: fly in down the corridor toward the first name. No runner
        // yet.
        const t = slot + 1; // already eased, in toSlot
        run = anchors[0];
        const c = centres[0];
        const pre = (1 - entryRef.current) * PRE_ROLL * F;
        cam = [c[0] * follow * t, c[1] * followY * t, c[2] - F - (1 - t) * APPROACH * F - pre];
      } else {
        const next = Math.min(i + 1, COUNT - 1);
        runT = easeInOut(f);
        run = lerp3(anchors[i], anchors[next], runT);
        const c = lerp3(centres[i], centres[next], runT);
        cam = [c[0] * follow, c[1] * followY, c[2] - F];
      }

      // The way out: to the middle of the corridor, then straight on.
      if (u > 0) {
        cam = [cam[0] * (1 - settle), cam[1], cam[2] + travel];
      }

      const swayK = reduced ? 0 : 1 - Math.exp(-3 * dt);
      const nx = present ? pointerX / width - 0.5 : 0;
      const ny = present ? pointerY / height - 0.5 : 0;
      swayX += (nx * PARALLAX * width - swayX) * swayK;
      swayY += (ny * PARALLAX * height - swayY) * swayK;
      // The pointer sway eases out on the way out, so nothing drifts off the
      // line of flight.
      const steady = 1 - settle;
      cam[0] += swayX * steady;
      cam[1] += swayY * steady;

      // --- HUD --------------------------------------------------------------
      const near = clamp(Math.round(slot), 0, COUNT - 1);
      setActive((prev) => (prev === near ? prev : near));
      if (hudRef.current) {
        // Away while he's running, back as he arrives.
        const between = Math.min(f, 1 - f);
        const shown = slot < -0.3 ? 0 : (1 - smoothstep(0.03, 0.16, between)) * (1 - smoothstep(0, 0.1, u));
        hudRef.current.style.opacity = String(shown);
        hudRef.current.style.transform = `translate3d(0, ${(1 - shown) * 10}px, 0)`;
        // Sits under the company it describes, on that company's side of the
        // corridor. On a phone there's only room for the middle.
        let hx = width / 2;
        if (!narrow) {
          const half = Math.min(260, (width - 32) / 2);
          hx = clamp(width / 2 + centres[near][0] * (1 - follow), half + 16, width - half - 16);
        }
        hudRef.current.style.left = `${hx}px`;
      }
      if (markerRef.current) {
        const t = COUNT > 1 ? clamp(slot, 0, COUNT - 1) / (COUNT - 1) : 0;
        markerRef.current.style.left = `${t * 100}%`;
      }
      // The section's chrome clears out of the way on the way out, so what
      // About fades in over is just space.
      const chrome = String(1 - smoothstep(0.15, 0.6, u));
      if (topRef.current) topRef.current.style.opacity = chrome;
      if (timelineRef.current) timelineRef.current.style.opacity = chrome;

      // --- words ------------------------------------------------------------
      lens += (present - lens) * (reduced ? 1 : 1 - Math.exp(-8 * dt));
      const tq = reduced ? 0 : Math.floor(clock * SHIMMER_FPS) / SHIMMER_FPS;
      const hotX = reduced ? 0 : Math.sin(clock * 0.33) * 0.55;
      const hotY = reduced ? 0 : Math.cos(clock * 0.21) * 0.35;
      const size = block * (1 - GAP_RATIO);

      for (const b of buckets) b.length = 0;
      dots.length = 0;
      specks.length = 0;

      for (let w = 0; w < COUNT; w++) {
        const word = words[w];
        const [wx, wy, wz] = centres[w];
        const dz = wz - cam[2];
        if (dz < NEAR) continue;
        const s = F / dz;
        const ox = cx + (wx - cam[0]) * s;
        const oy = cy + (wy - cam[1]) * s;
        // The name's own scale on top of perspective: full size at the one
        // you're at (or heading into), smaller for the rest on a phone.
        const focus = 1 - clamp(Math.abs(w - Math.max(slot, 0)), 0, 1);
        const sw = s * (narrow ? DISTANT_SCALE_NARROW + (1 - DISTANT_SCALE_NARROW) * focus : 1);
        // Off screen entirely.
        if (ox + word.halfW * sw < 0 || ox - word.halfW * sw > width) continue;
        if (oy + word.halfH * sw < 0 || oy - word.halfH * sw > height) continue;
        if (s > 6) continue;

        // Only the next few are really there; the ones after them are still
        // out in the dark, and condense out of it block by block as you get
        // closer.
        const fog = 1 - smoothstep(FOG[0] * F, FOG[1] * F, dz);
        if (fog <= 0) continue;
        // Distant names read cooler and dimmer — the same palette, further
        // down the ramp.
        const cool = clamp((dz / F - 1) * 0.16, 0, 0.55);
        let px = size * sw * dpr;
        // Far off, a name is a few pixels wide; drawing all its blocks at
        // sub-pixel size is wasted work. Thin them out instead, so it reads
        // as a cluster of stars.
        // And close up, as the camera flies past a name, it dissolves out of
        // the way rather than filling the screen with blocks.
        const keep = (px < 1.4 ? px / 1.4 : 1) * fog * (1 - smoothstep(1.8, 3.2, s));
        if (keep <= 0) continue;
        px = Math.max(1, Math.round(px));
        const salt = w * 97.3;

        for (let k = 0; k < word.n; k++) {
          if (keep < 1 && hash(k, salt) > keep) continue;
          const bx = word.xy[k * 2];
          const by = word.xy[k * 2 + 1];
          let sx = ox + bx * sw;
          let sy = oy + by * sw;

          let grow = 1;
          let boost = 0;
          if (lens > 0.01) {
            const ddx = sx - pointerX;
            const ddy = sy - pointerY;
            const d = Math.hypot(ddx, ddy) || 1;
            const L = Math.exp(-(d * d) / (LENS_RADIUS * LENS_RADIUS)) * lens * Math.min(1, s);
            if (L > 0.01) {
              grow += L * LENS_GROW;
              boost = L * 0.35;
              sx += (ddx / d) * L * block * 1.6 * s;
              sy += (ddy / d) * L * block * 1.6 * s;
            }
          }

          const u = bx / word.halfW - hotX;
          const v = (by / word.halfH - hotY) * 0.6;
          let heat = 1.02 - Math.hypot(u, v) * 0.62 - cool + boost;
          heat += (hash(k, 3 + w) - 0.5) * DITHER;
          heat += Math.sin(tq * 1.4 + hash(k, 2 + w) * Math.PI * 2) * SHIMMER;
          const idx = clamp(Math.floor((1 - heat) * PALETTE.length), 0, PALETTE.length - 1);
          const q = grow === 1 ? px : Math.round(px * grow);
          buckets[idx].push(Math.round(sx * dpr - q / 2), Math.round(sy * dpr - q / 2), q, q);
        }
      }

      // --- the line ---------------------------------------------------------
      // Each leg draws itself out from the name you're at toward the next,
      // starting while you're still standing there, and finishing just after
      // the runner sets off — so he's always running onto line that's there.
      for (let l = 0; l < COUNT - 1; l++) {
        const reveal = reduced
          ? (raw >= l + H ? 1 : 0)
          : smoothstep(l, l + H + 0.15, raw);
        if (reveal <= 0) continue;
        const a = anchors[l];
        const b = anchors[l + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const steps = Math.ceil((len * reveal) / (block * DOT_SPACING));
        for (let d = 0; d <= steps; d++) {
          const t = Math.min(reveal, (d * block * DOT_SPACING) / len);
          const dz = a[2] + (b[2] - a[2]) * t - cam[2];
          if (dz < NEAR) continue;
          const s = F / dz;
          // The stretch already run, rushing past the lens, would otherwise
          // blow up into a trail of huge squares.
          // Thinned out on the way there, so it dissolves instead of ending in
          // a stub.
          if (s > 2.2 || (s > 1.5 && hash(d, l + 11) < (s - 1.5) / 0.7)) continue;
          const sx = cx + (a[0] + (b[0] - a[0]) * t - cam[0]) * s;
          const sy = cy + (a[1] + (b[1] - a[1]) * t - cam[1]) * s;
          if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue;
          const q = Math.max(1, Math.round(block * 0.6 * s * dpr));
          dots.push(Math.round(sx * dpr - q / 2), Math.round(sy * dpr - q / 2), q, q);
        }
      }

      // --- dust -------------------------------------------------------------
      for (let k = 0; k < DUST_COUNT; k++) {
        const dz = dust[k * 4 + 2] - cam[2];
        if (dz < NEAR) continue;
        const s = F / dz;
        const sx = cx + (dust[k * 4] - cam[0]) * s;
        const sy = cy + (dust[k * 4 + 1] - cam[1]) * s;
        if (sx < 0 || sx > width || sy < 0 || sy > height) continue;
        const q = Math.max(1, Math.round((1 + dust[k * 4 + 3] * 2.5) * Math.min(s, 2.5) * dpr));
        specks.push(Math.round(sx * dpr), Math.round(sy * dpr), q, q);
      }

      // --- paint ------------------------------------------------------------
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const fillRects = (rects, style, alpha) => {
        if (!rects.length) return;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = style;
        ctx.beginPath();
        for (let r = 0; r < rects.length; r += 4) ctx.rect(rects[r], rects[r + 1], rects[r + 2], rects[r + 3]);
        ctx.fill();
      };
      fillRects(specks, PALETTE[4], 0.45);
      fillRects(dots, INK, 0.55);
      // Coolest first, so the hot core lands on top.
      for (let c = PALETTE.length - 1; c >= 0; c--) fillRects(buckets[c], PALETTE[c], 1);
      ctx.globalAlpha = 1;

      // --- runner -----------------------------------------------------------
      const el = runnerRef.current;
      if (el) {
        const moving = f > 0.002 && f < 0.998 && i >= 0 && i < COUNT - 1;
        const arrived = i >= COUNT - 1 && slot >= COUNT - 1 - 1e-3;
        const mode = LEGS[Math.max(i, 0) % LEGS.length];
        const airborne = moving && mode === "fly";

        // The flight leaves the line and arcs over it, touching back down at
        // the next company.
        const x = run[0];
        let y = run[1];
        const z = run[2];
        if (airborne && !reduced) {
          y -= Math.sin(Math.PI * runT) * runH * LIFT;
          y += Math.sin(clock * 5) * runH * 0.05;
        }
        const dz = z - cam[2];
        const visible = smoothstep(-0.4, -0.08, slot);
        if (dz < NEAR || visible <= 0) {
          el.style.opacity = "0";
        } else {
          const s = F / dz;
          const sx = cx + (x - cam[0]) * s;
          const sy = cy + (y - cam[1]) * s;
          // In the air he's drawn lying flat, so the pose only fills a strip
          // of its box; drawn bigger to read at the same weight.
          const h = runH * s * (airborne ? 1.35 : 1);
          // 48 x 32 box, centred on x, ground (y 29.4) on the line.
          el.style.opacity = String(visible);
          el.style.height = `${h}px`;
          el.style.transform = `translate3d(${sx - h * 0.75}px, ${sy - h * (29.4 / 32)}px, 0)`;

          let next = STAND;
          // At the last company he stays — arms up, as the camera carries on
          // past him.
          if (arrived) next = CHEER;
          else if (moving) {
            const frame = STRIDES[mode]
              ? Math.floor((i + runT) * STRIDES[mode]) % 2
              : reduced ? 0 : Math.floor(clock * FLUTTER[mode]) % 2;
            next = poseAt(mode, frame);
          }
          if (next !== pose) {
            // A new vehicle (or getting off one) pops in; a new frame of the
            // same one just swaps.
            const swapped = pose < 0 || POSES[pose].name !== POSES[next].name;
            poseRefs.current.forEach((node, n) => {
              if (node) node.style.opacity = n === next ? "1" : "0";
            });
            const node = poseRefs.current[next];
            if (swapped && node && !reduced && pose >= 0) {
              node.animate(
                [
                  { transform: "scale(0.3)", opacity: 0 },
                  { transform: "scale(1.12)", opacity: 1, offset: 0.7 },
                  { transform: "scale(1)", opacity: 1 },
                ],
                { duration: 320, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
              );
            }
            pose = next;
          }

          // Faces the way this leg of the zig-zag goes — or, standing at a
          // company, the way the next one does.
          const leg = clamp(i, 0, COUNT - 2);
          const dir = Math.sign(centres[leg + 1][0] - centres[leg][0]) || 1;
          if (dir !== facing && flipRef.current) {
            facing = dir;
            flipRef.current.setAttribute("transform", dir < 0 ? "translate(48 0) scale(-1 1)" : "");
          }
        }
      }
    };
    tickRef.current = tick;
    if (activeRef.current && rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      tickRef.current = null;
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everActive]);

  const item = EXPERIENCE[active];

  return (
    // -100vh for the same reason as Projects: a pinned section's progress
    // completes one viewport before its box ends, so without this there'd be
    // a viewport-tall gap where neither section is on screen.
    <section
      ref={sectionRef}
      aria-label="Experience"
      style={{ position: "relative", height: `${SCROLL_LENGTH_VH}vh`, marginTop: "-100vh" }}
    >
      <div ref={stackRef} className="space-ground xp-stack">
        <canvas ref={canvasRef} className="xp-canvas" aria-hidden="true" />

        {/* The runner from About, with the same hand-drawn line boil — and
            the bike, board and cape he picks up along the way. */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <filter id="xp-boil">
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="1">
              <animate attributeName="seed" values="1;4;7;2" dur="0.5s" calcMode="discrete" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="1.1" />
          </filter>
        </svg>
        <svg ref={runnerRef} className="xp-runner" viewBox="0 0 48 32" aria-hidden="true">
          <g filter="url(#xp-boil)">
            <g ref={flipRef}>
              {POSES.map((q, n) => (
                <g
                  key={`${q.name}-${q.frame}`}
                  ref={(node) => { poseRefs.current[n] = node; }}
                  className="xp-pose"
                  style={{ opacity: n === STAND ? 1 : 0 }}
                >
                  {q.parts.map((part, j) => (
                    <path key={j} d={part.d} className={`xp-part-${part.kind}`} />
                  ))}
                </g>
              ))}
            </g>
          </g>
        </svg>

        <div ref={topRef} className="xp-top">
          <span style={{ color: ACCENT }}>EXPERIENCE</span>
          <span className="xp-counter">
            {item.id} / {String(COUNT).padStart(2, "0")}
          </span>
        </div>

        {/* The canvas spells the company; everything else is real text. */}
        <div ref={hudRef} className="xp-hud" aria-live="polite">
          <h3 className="xp-sr-only">{item.company}</h3>
          <div className="xp-meta">
            <Decode text={item.role.toUpperCase()} style={{ color: ACCENT }} />
            <span className="xp-dot" />
            <Decode text={item.period} className="xp-period" />
          </div>
          <p className="xp-blurb" key={item.id}>{item.blurb}</p>
        </div>

        <div ref={timelineRef} className="xp-timeline" aria-hidden="true">
          <div className="xp-track">
            <span ref={markerRef} className="xp-marker" style={{ background: ACCENT }} />
            {EXPERIENCE.map((entry, i) => (
              <span
                key={entry.id}
                className={`xp-tick${i === active ? " is-active" : ""}`}
                style={{ left: `${COUNT > 1 ? (i / (COUNT - 1)) * 100 : 0}%` }}
              >
                {tickLabel(entry.period)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
