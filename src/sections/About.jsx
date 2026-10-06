import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ABOUT, CONTACT, PHOTOS } from "../data/about";
import SectionLabel from "../components/SectionLabel";
import { useScrollProgressRef } from "../hooks/useScrollProgress";
import "../about.css";
import { RUNNER_FRAMES } from "../components/runner";

/**
 * ABOUT — fly into a world made of dust and find the moments it was made of.
 *
 *  1. A sphere of fine, cool dust turns slowly under the title.
 *  2. Scrolling flies the camera at it until it's far bigger than the
 *     screen. As it looms, the dust thins out speck by speck — it dissolves
 *     rather than exploding — and what's left of it scatters into the
 *     starfield, drifting gently, that the rest of the section sits on.
 *  3. Inside it all along was a ring of photos. They show first as tiny
 *     coloured specks within the sphere's outline, then spread and grow as
 *     the camera flies into them, and keep turning slowly round the copy,
 *     evenly spaced. The story plays out in the middle one paragraph at a
 *     time, and the page ends on a contact screen.
 *
 * How the pieces split:
 *
 *  - **Dust is one draw call.** Lighting and the dissolve are computed in
 *    the vertex shader from a single uniform; each point carries its own
 *    threshold, so it thins out unevenly instead of fading as a sheet.
 *  - **Photos are DOM, placed by hand.** Every frame each one's spot on
 *    the ring is worked out in a few lines of maths and written as a
 *    transform. That keeps them sharp, round and hoverable.
 *  - **The ring orbits around the words, not through them.** It's a flat
 *    loop in the plane of the screen, and every photo is placed the same
 *    distance from its neighbours, wherever it is on the loop
 *    and whatever the screen shape. Any that drift behind the copy are
 *    dimmed.
 *
 * Driven by real document scroll through useScrollProgressRef — the single
 * timeline every section on this page reads.
 */

const SCROLL_LENGTH_VH = 960;
const SMOOTHING = 6;

// Beats, as fractions of the section's scroll.
const TITLE_OUT = [0.025, 0.085];
// Arrival from Experience. Instead of a quick crossfade, this section fades
// in over a full viewport of Experience's flight out, with its camera
// starting ARRIVAL_DEPTH times further back and closing to the opening frame
// as it does — so the globe comes up out of the dark ahead of Experience's
// camera and grows as it's approached, and this section's own flight simply
// carries on from there.
const ARRIVAL = 1; // viewports
const ARRIVAL_DEPTH = 3;
const FLIGHT = [0.025, 0.385]; // camera: far off -> the sphere overfills the screen
const DISSOLVE = [0.42, 1]; // share of the flight over which the dust thins out
const CLOUD = [0.22, 0.435]; // camera flies into the photo ring
// Scroll positions where each story paragraph, then the contact screen,
// takes over — spread evenly from STORY_FROM to STORY_TO, however many
// paragraphs there are. At this section length that's roughly one screen
// of scrolling per paragraph.
const STORY_FROM = 0.46;
const STORY_TO = 0.92;
// How long each beat needs on screen for its animation to finish — worked
// out from the effects written into its copy, so adding a {magic|…} or a
// {chase|…} to a paragraph automatically buys it the time it needs. The
// scroll is held at the next paragraph's edge until this has elapsed (see
// the scroll hold in the effect), and the progress tick fills over it.
function dwellFor(text) {
  const count = (type) => (text.match(new RegExp(`\\{${type}\\|`, "g")) || []).length;
  const magic = count("magic") > 0;
  const marks = count("mark");
  let ms = 1500; // entrance + a beat to read
  if (magic) ms = Math.max(ms, 2600);
  if (marks) ms = Math.max(ms, (magic ? 1600 : 850) + 300 * marks + 700);
  if (count("underline")) ms = Math.max(ms, 2300);
  if (count("circle")) ms = Math.max(ms, 2600);
  if (count("chase")) ms = Math.max(ms, 6500); // run + the catch, held a beat
  if (/\{[^|}]+\}/.test(text)) ms = Math.max(ms, 1800); // the name's shine
  return ms;
}
const STAGE_DWELL = [
  ...ABOUT.story.map(dwellFor),
  dwellFor(CONTACT.heading) + 400, // contact: let the icons land
];
const STAGE_COUNT = ABOUT.story.length + 1;
const STAGE_AT = Array.from(
  { length: STAGE_COUNT },
  (_, i) => STORY_FROM + ((STORY_TO - STORY_FROM) * i) / (STAGE_COUNT - 1)
);

const RADIUS = 2.2;
// Photo ring: virtual camera distance at the start and end of the fly-in.
const CLOUD_FAR = 9;
const CLOUD_NEAR = 2.3;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

const dustVertex = /* glsl */ `
  uniform float uFade;
  uniform float uScale;
  uniform float uMax;
  uniform float uTime;
  uniform float uAspect;
  attribute vec4 aRand; // x: survives as a star, y: size, z: brightness/phase, w: dissolve threshold
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 dir = normalize(position);
    // About a sixth of the dust never dissolves: it becomes the stars. As
    // the sphere thins, these scatter outward at their own rates — so the
    // field that's left is the globe's own dust spread through space, not
    // a separate backdrop — and then keep drifting for good.
    float star = step(aRand.x, 0.17);
    float settled = star * uFade;
    float spread = mix(0.18, 0.5 + aRand.y * 2.8, star);
    vec3 p = position * (1.0 + uFade * spread);
    p += settled * 0.26 * vec3(
      sin(uTime * 0.8 + aRand.z * 40.0),
      cos(uTime * 0.68 + aRand.y * 40.0),
      sin(uTime * 0.6 + aRand.w * 40.0)
    );

    // Most stars faint, a few bright — squared, so the bright ones are rare.
    // That spread of brightness is what gives the reference its depth.
    float bright = 0.45 + 0.55 * aRand.z * aRand.z;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;
    float size = uScale * (0.6 + aRand.y * 0.8) / max(depth, 0.001);
    // Once scattered they're much further off and would shrink to nothing;
    // held at a crisp speck instead — the brighter, the slightly bigger.
    float starSize = max(size * 1.3, uMax * (0.45 + 0.4 * bright));
    gl_PointSize = min(mix(size, starSize, settled), uMax);

    // Lit from above with a bright limb, and bluer toward the top — the
    // reference's sphere is ice-blue along its crown and near-white specks
    // across a dark face.
    vec3 nv = normalize(normalMatrix * dir);
    float rim = 1.0 - abs(nv.z);
    float top = smoothstep(-0.3, 1.0, nv.y);
    float lit = 0.22 + 0.85 * top + 0.8 * rim * rim;
    vColor = mix(aColor, vec3(0.42, 0.62, 1.0), top * 0.45);
    // As stars they cool to one pale sky blue, not the sphere's deeper
    // periwinkle — a consistent, soft tint with some near-white.
    vColor = mix(vColor, mix(vec3(0.63, 0.78, 0.95), vec3(0.9, 0.94, 1.0), aRand.y * 0.5), settled * 0.8);

    // The rest go each at their own moment, so it thins speck by speck.
    float gone = (1.0 - star) * smoothstep(aRand.w * 0.85, aRand.w * 0.85 + 0.15, uFade);
    // Stars lose the sphere's lighting — there's no ball left to light.
    float shade = mix(lit, bright, settled);

    float twinkle = 0.75 + 0.25 * sin(uTime * (0.8 + aRand.z * 2.0) + aRand.z * 40.0);
    vAlpha = 0.95 * shade * twinkle * (1.0 - gone);
    gl_Position = projectionMatrix * mv;

    // A quieter pocket in the middle, where the words sit: stars there are
    // thinned out (not just dimmed), so the centre reads as open space.
    vec2 ndc = gl_Position.xy / gl_Position.w;
    ndc.x *= uAspect;
    float keep = smoothstep(0.08, 0.75, length(ndc));
    vAlpha *= mix(1.0, step(aRand.w, 0.15 + 0.85 * keep) * mix(0.55, 1.0, keep), settled);
  }
`;

// Crisp rather than soft: the reference dust is pin-sharp specks, and a
// gaussian falloff at this size just reads as fog.
const dustFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.32, 0.5, d)) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

// Brand glyphs, drawn on a 24-unit grid in currentColor.
const ICONS = {
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </>
  ),
  x: (
    <>
      <path d="M4.5 4h4.2l10.8 16h-4.2z" fill="currentColor" />
      <path d="M19 4.2l-6 6.8M5 19.8l6-6.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  linkedin: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.2 10.5v6M8.2 7.4v.1M11.8 16.5v-6M11.8 13.3c0-1.7 1-2.8 2.4-2.8s2.2 1 2.2 2.6v3.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  substack: <path d="M5 4h14v2.2H5zM5 8h14v2.2H5zM5 12h14v8.5l-7-3.9-7 3.9z" fill="currentColor" />,
  github: (
    <path
      d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    />
  ),
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 7l8.5 6 8.5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
};


// ---------------------------------------------------------------------------
// Inline effects in the copy — see the key in data/about.js. All of them are
// CSS/SVG keyed off the enclosing .about-stage.is-in, so each plays as its
// paragraph arrives and resets when it leaves (and replays on the way back).
// ---------------------------------------------------------------------------

// {type|text} or {text}; split() with two capture groups yields
// [plain, type, content, plain, type, content, …].
const FX = /\{(?:(\w+)\|)?(.+?)\}/;

// "magic" assembles out of dots. As its paragraph comes in, a scattered
// cloud of burnt-orange dots over the word flies into place — each dot
// finds its row first and then slides along it, so the rows sweep in
// sideways, left to right, and lock into a fine dot-matrix of the letters.
// Then the dots dissolve into the solid word in the same orange, which is
// what stays: the dots are the transition, the text is the resting state,
// so it reads as cleanly as the words around it.
//
// The grid is sampled from the word itself, drawn in its own computed font,
// so the dot letters sit exactly where the solid ones then appear. The
// word's colour change is plain CSS, so it can't be left invisible.
const MAGIC_PAD = 14; // room for the scattered cloud around the word
const MAGIC_INK = "#e0602a";

function MagicWord({ active, children }) {
  const textRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const text = textRef.current;
    const canvas = canvasRef.current;
    if (!text || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    // Lay out the canvas and sample the word into a dot grid.
    const build = () => {
      const w = text.offsetWidth;
      const h = text.offsetHeight;
      if (!w || !h) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = w + MAGIC_PAD * 2;
      const ch = h + MAGIC_PAD * 2;
      canvas.width = Math.ceil(cw * dpr);
      canvas.height = Math.ceil(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;

      const cs = getComputedStyle(text);
      const fontSize = parseFloat(cs.fontSize) || 24;
      const off = document.createElement("canvas");
      off.width = Math.ceil(w);
      off.height = Math.ceil(h);
      const octx = off.getContext("2d", { willReadFrequently: true });
      octx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in octx) octx.letterSpacing = cs.letterSpacing;
      const m = octx.measureText(text.textContent);
      const asc = m.fontBoundingBoxAscent || fontSize * 0.8;
      const desc = m.fontBoundingBoxDescent || fontSize * 0.2;
      octx.fillStyle = "#fff";
      octx.fillText(text.textContent, 0, (h - (asc + desc)) / 2 + asc);
      const data = octx.getImageData(0, 0, off.width, off.height).data;

      // A regular grid; a dot wherever its cell centre falls inside a glyph.
      // Fine enough that the word is legible while it's still dots.
      const step = Math.max(1.6, fontSize / 14);
      const ox = MAGIC_PAD + text.offsetLeft;
      const oy = MAGIC_PAD + text.offsetTop;
      const dots = [];
      for (let y = step / 2; y < off.height; y += step) {
        for (let x = step / 2; x < off.width; x += step) {
          if (data[(Math.floor(y) * off.width + Math.floor(x)) * 4 + 3] > 120) {
            dots.push({
              tx: ox + x,
              ty: oy + y,
              // Scattered anywhere over the word's box (and a little past it).
              sx: MAGIC_PAD * 0.4 + Math.random() * (cw - MAGIC_PAD * 0.8),
              sy: MAGIC_PAD * 0.5 + Math.random() * (ch - MAGIC_PAD),
              // Left to right sweep, with a little jitter so it isn't a wipe.
              delay: (x / w) * 0.3 + Math.random() * 0.18,
            });
          }
        }
      }
      return { dpr, cw, ch, r: step * 0.36, dots };
    };

    const drawAt = (g, t) => {
      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      ctx.clearRect(0, 0, g.cw, g.ch);
      ctx.fillStyle = MAGIC_INK;
      const clamp = (v) => Math.min(1, Math.max(0, v));
      const easeOut = (v) => 1 - Math.pow(1 - v, 3);
      const easeInOut = (v) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
      // Cloud fades up, each dot travels over 0.75s after its delay, and
      // once they've all settled they hand over to the solid word (whose
      // colour fades in over the same window, in CSS).
      const appear = clamp(t / 0.25) * (1 - clamp((t - HANDOFF) / 0.4));
      for (const d of g.dots) {
        const raw = clamp((t - 0.2 - d.delay) / 0.75);
        // Rows first, then along them: y settles on a fast ease, x on a
        // slower one — that's what makes the rows slide in sideways.
        const ky = easeOut(clamp(raw * 1.7));
        const kx = easeInOut(raw);
        const x = d.sx + (d.tx - d.sx) * kx;
        const y = d.sy + (d.ty - d.sy) * ky;
        // Scattered dots read slightly dimmer and smaller than set ones.
        ctx.globalAlpha = appear * (0.55 + 0.45 * raw);
        ctx.beginPath();
        ctx.arc(x, y, g.r * (0.8 + 0.2 * raw), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const SETTLED = 0.2 + 0.48 + 0.75; // last dot has settled
    const HANDOFF = SETTLED - 0.05; // matches the CSS colour transition
    const END = HANDOFF + 0.4; // dots gone; the solid word remains
    const geo = build();
    if (!geo) return;

    if (!active) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t0 = performance.now();
      const frame = (now) => {
        const t = (now - t0) / 1000;
        drawAt(geo, Math.min(t, END));
        if (t < END) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active]);

  return (
    <>
      <span ref={textRef} className="about-fx-magic__text">
        {children}
      </span>
      <canvas
        ref={canvasRef}
        className="about-fx-magic__swarm"
        style={{ left: -MAGIC_PAD, top: -MAGIC_PAD, width: 0, height: 0 }}
        aria-hidden="true"
      />
    </>
  );
}

// The doodled stick figure — see components/runner.js.

// The last frame of the chase. The runner never reaches back — he's caught
// mid-stride, frozen in his usual running pose. The chaser has lunged in
// and hooked an arm over his neck: shoulder, up over the runner's
// shoulder, and a little curl down in front of his neck. The CSS parks the
// chaser's box 9 viewBox units behind the runner's, which is exactly where
// that hand lands on the runner's neck (his x ≈ 12.8, y ≈ 8.8).
const CAUGHT = {
  chaser:
    "M12.8 8.6 11 18M12.2 11.2 17.2 9.4 21.6 8.4 23.4 10.2M12 11.5 9 14.4 7.8 17.4M11 18 14.6 22.8 16.2 29.4M11 18 8.4 23.4 5.6 28.6",
  lead: RUNNER_FRAMES[0],
};

// Where the catch happens: under this word in the phrase (its centre is
// measured from the laid-out text, so it holds at any size or font).
const CATCH_WORD = "feeling";

function ChaseTrack() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const track = ref.current;
    const host = track?.closest(".about-fx-chase");
    const textNode = host?.firstChild;
    if (!host || !textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const measure = () => {
      const idx = textNode.textContent.indexOf(CATCH_WORD);
      const box = host.getBoundingClientRect();
      let centre = box.width / 2;
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(textNode, idx);
        range.setEnd(textNode, idx + CATCH_WORD.length);
        const r = range.getBoundingClientRect();
        centre = r.left + r.width / 2 - box.left;
      }
      // Both boxes share the stage's transform, so the offset is exact.
      host.style.setProperty("--catch", `${centre.toFixed(1)}px`);
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <span ref={ref} className="about-chase__track">
      <Runner role="lead" />
      <Runner role="chaser" />
    </span>
  );
}

function Runner({ role }) {
  return (
    <svg className={`about-runner about-runner--${role}`} viewBox="0 0 24 32" aria-hidden="true">
      <g filter="url(#about-boil)">
        <circle cx="13.4" cy="5.2" r="3.1" />
        <g className="about-runner__run">
          {RUNNER_FRAMES.map((d, i) => (
            <path key={i} className={`about-runner__f${i}`} d={d} />
          ))}
        </g>
        <path className="about-runner__caught" d={CAUGHT[role]} />
      </g>
    </svg>
  );
}

function Fx({ type, order, active, children }) {
  switch (type) {
    case "magic":
      return (
        <span className="about-fx about-fx-magic">
          <MagicWord active={active}>{children}</MagicWord>
        </span>
      );
    case "chase":
      // The sketchy underline; once it's drawn, two doodled figures run
      // along beneath it, one chasing the other, until — right under the
      // last word, "feeling" — the chaser catches the runner with an arm over
      // his neck. And that's where it ends.
      return (
        <span className="about-fx about-fx-underline about-fx-chase">
          {children}
          <svg viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength="1" d="M3 9C38 4 70 12 104 8S170 3 197 7" />
            <path pathLength="1" d="M10 13C52 9 96 15 140 11S184 10 194 11" />
          </svg>
          <span className="about-chase" aria-hidden="true">
            {/* Hand-drawn "line boil": the displacement noise re-seeds a few
                times a second, so the strokes jitter like frames of a
                flipbook. */}
            <svg width="0" height="0" style={{ position: "absolute" }}>
              <filter id="about-boil">
                <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="1">
                  <animate attributeName="seed" values="1;4;7;2" dur="0.5s" calcMode="discrete" repeatCount="indefinite" />
                </feTurbulence>
                <feDisplacementMap in="SourceGraphic" scale="1.1" />
              </filter>
            </svg>
            <ChaseTrack />
          </span>
        </span>
      );
    case "mark":
      return (
        <span className="about-fx about-fx-mark" style={{ "--o": order }}>
          {children}
        </span>
      );
    case "underline":
      // Two slightly different wobbly strokes, the second drawn just after
      // the first — the double pass is what makes it read as hand-drawn.
      return (
        <span className="about-fx about-fx-underline">
          {children}
          <svg viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength="1" d="M3 9C38 4 70 12 104 8S170 3 197 7" />
            <path pathLength="1" d="M10 13C52 9 96 15 140 11S184 10 194 11" />
          </svg>
        </span>
      );
    case "circle":
      // A loose, overshooting loop — starts left of centre, goes round, and
      // runs past its own start, the way a pen circles a word.
      return (
        <span className="about-fx about-fx-circle">
          {children}
          <svg viewBox="0 0 200 70" preserveAspectRatio="none" aria-hidden="true">
            <path
              pathLength="1"
             
              d="M62 12C120 2 186 8 194 30 201 52 150 66 96 65 42 64 4 54 6 34 8 16 46 7 88 6 112 6 132 8 148 13"
            />
          </svg>
        </span>
      );
    default:
      return <span className="about-name">{children}</span>;
  }
}

function Rich({ text, active }) {
  const parts = text.split(FX);
  const out = [];
  let order = 0;
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) out.push(parts[i]);
    if (i + 2 < parts.length) {
      out.push(
        <Fx key={i} type={parts[i + 1]} order={order++} active={active}>
          {parts[i + 2]}
        </Fx>
      );
    }
  }
  return out;
}

export default function About() {
  const sectionRef = useRef(null);
  const stackRef = useRef(null);
  const mountRef = useRef(null);
  const titleRef = useRef(null);
  const coreRef = useRef(null);
  const stagesRef = useRef(null);
  const bubbleRefs = useRef([]);
  const imgRefs = useRef([]);
  const stageRef = useRef(-1);
  const hoverRef = useRef(false);

  const { progressRef, entryRef } = useScrollProgressRef(sectionRef, ARRIVAL);

  const [everActive, setEverActive] = useState(false);
  const [stage, setStage] = useState(-1);
  const [openIndex, setOpenIndex] = useState(null);
  const activeRef = useRef(false);
  const rafIdRef = useRef(null);
  const tickRef = useRef(null);

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

  // Lightbox closes on Escape, and on any scroll — the page moving under an
  // open photo would otherwise leave it floating over the wrong section.
  useEffect(() => {
    if (openIndex == null) return;
    const close = () => setOpenIndex(null);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close);
    };
  }, [openIndex]);

  useEffect(() => {
    if (!everActive) return;
    const mount = mountRef.current;
    let width = mount.clientWidth;
    let height = mount.clientHeight;

    const LOW_POWER =
      width < 760 ||
      (navigator.hardwareConcurrency || 8) <= 4 ||
      window.matchMedia("(pointer: coarse)").matches;
    const DUST_COUNT = LOW_POWER ? 12000 : 24000;
    const pixelRatio = Math.min(window.devicePixelRatio, LOW_POWER ? 1.5 : 2);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: !LOW_POWER, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // -------------------------------------------------------------
    // Dust sphere
    // -------------------------------------------------------------
    const pos = new Float32Array(DUST_COUNT * 3);
    const rand = new Float32Array(DUST_COUNT * 4);
    const col = new Float32Array(DUST_COUNT * 3);
    // The reference palette: periwinkle, ice blue, white, a little mint.
    const palette = [
      [0.34, new THREE.Color(0x6f9cf0)],
      [0.3, new THREE.Color(0xa9c6ff)],
      [0.26, new THREE.Color(0xf2f6ff)],
      [0.1, new THREE.Color(0xbff7e6)],
    ];
    for (let i = 0; i < DUST_COUNT; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = Math.random() < 0.92
        ? RADIUS * (1 - Math.pow(Math.random(), 3) * 0.06)
        : RADIUS * Math.cbrt(Math.random()) * 0.95;
      pos[i * 3] = Math.cos(a) * s * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = Math.sin(a) * s * r;
      rand.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      let t = Math.random();
      let c = palette[0][1];
      for (const [w, pc] of palette) { if (t < w) { c = pc; break; } t -= w; }
      col.set([c.r, c.g, c.b], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));
    dustGeo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    const dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uFade: { value: 0 },
        uScale: { value: 0 },
        uMax: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
      },
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.rotation.z = 0.12;
    scene.add(dust);

    // -------------------------------------------------------------
    // Photo ring — placed by hand each frame.
    // -------------------------------------------------------------
    const n = PHOTOS.length;
    const ring = PHOTOS.map(() => ({
      dim: 1, // eased: dims while passing behind the copy
      live: false,
    }));

    // The loop's shape on screen (a circle, or a tall oval on a portrait
    // phone) and an arc-length table for it. Equal steps of *angle* bunch
    // photos up at the ends of an oval, so they're placed by distance
    // instead — see placeRing.
    let ringW = 1;
    let ringH = 1;
    const ARC_STEPS = 360;
    const arcAngle = new Float32Array(ARC_STEPS + 1);
    const arcLen = new Float32Array(ARC_STEPS + 1);
    const buildArc = () => {
      let total = 0;
      let px = ringW, py = 0;
      for (let k = 0; k <= ARC_STEPS; k++) {
        const a = (k / ARC_STEPS) * Math.PI * 2;
        const x = Math.cos(a) * ringW, y = Math.sin(a) * ringH;
        total += Math.hypot(x - px, y - py);
        arcAngle[k] = a;
        arcLen[k] = total;
        px = x; py = y;
      }
      for (let k = 0; k <= ARC_STEPS; k++) arcLen[k] /= total;
    };
    // Fraction of the way round (0..1, by distance) -> unit-loop point.
    const pointAt = (u) => {
      u -= Math.floor(u);
      let lo = 0, hi = ARC_STEPS;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (arcLen[mid] < u) lo = mid; else hi = mid;
      }
      const t = (u - arcLen[lo]) / (arcLen[hi] - arcLen[lo] || 1);
      const a = lerp(arcAngle[lo], arcAngle[hi], t);
      return [Math.cos(a), Math.sin(a)];
    };
    // Where each photo sits, as fractions round the loop, starting from
    // u0. Every neighbour the same straight-line distance apart: even
    // spacing *along* an oval still looks uneven where it bends hardest, so
    // this finds the one gap that, stepped n times, comes back round to the
    // start exactly. On a circle it's simply equal angles.
    const slots = new Float32Array(n);
    const stepFrom = (u, gap) => {
      const [ax, ay] = pointAt(u);
      let lo = 0, hi = 0.5;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        const [bx, by] = pointAt(u + mid);
        if (Math.hypot((bx - ax) * ringW, (by - ay) * ringH) < gap) lo = mid; else hi = mid;
      }
      return u + (lo + hi) / 2;
    };
    const placeRing = (u0) => {
      let lo = 0, hi = 2 * Math.max(ringW, ringH);
      for (let k = 0; k < 18; k++) {
        const gap = (lo + hi) / 2;
        let u = u0;
        for (let i = 0; i < n; i++) u = stepFrom(u, gap);
        if (u - u0 < 1) lo = gap; else hi = gap;
      }
      const gap = (lo + hi) / 2;
      let u = u0;
      for (let i = 0; i < n; i++) { slots[i] = u; u = stepFrom(u, gap); }
    };

    let camStart = 9;
    let camEnd = 4;
    let baseSize = 72;
    let box = null;
    const layout = () => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
      const fit = Math.min(1, camera.aspect);
      camStart = RADIUS / (tanHalf * fit * 0.44);
      // Close enough that the sphere spans ~1.6x the screen's short side.
      const want = RADIUS / (tanHalf * fit * 1.6);
      camEnd = Math.sqrt(want * want + RADIUS * RADIUS);
      // ~1.4px specks at the start distance, whatever the screen.
      dustMat.uniforms.uScale.value = 1.5 * camStart * pixelRatio * Math.min(1.3, height / 900);
      dustMat.uniforms.uMax.value = 2.6 * pixelRatio;
      dustMat.uniforms.uAspect.value = camera.aspect;

      baseSize = 74 * Math.min(1.1, Math.max(0.7, Math.min(width, height) / 850));
      box = stagesRef.current?.getBoundingClientRect() ?? null;

      // A true circle around the copy, sized off the short side so it fits
      // the screen. A portrait phone has no room for a circle *and*
      // readable text inside it, so there it's a tall oval, above and below
      // the words. Either way it stays clear of the edges (with headroom
      // for the 1.16x hover scale), so nothing ever gets pushed in and
      // breaks the spacing.
      const edge = (baseSize / 2) * 1.16 + 12;
      const portrait = width < height;
      const ringR = Math.min(width, height) * 0.34;
      ringW = Math.min(portrait ? width * 0.44 : ringR, width / 2 - edge);
      ringH = Math.min(portrait ? height * 0.34 : ringR, height / 2 - edge - 36);
      buildArc();
    };

    // Each photo's average colour, for its speck and glow.
    const swatch = document.createElement("canvas");
    swatch.width = swatch.height = 1;
    const sctx = swatch.getContext("2d", { willReadFrequently: true });
    const colourise = (i) => {
      const img = imgRefs.current[i];
      const el = bubbleRefs.current[i];
      if (!img || !el) return;
      try {
        sctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = sctx.getImageData(0, 0, 1, 1).data;
        const lift = (v) => Math.round(lerp(v, 255, 0.35));
        el.style.setProperty("--c", `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`);
      } catch {
        // A tainted canvas just means the default colour stays.
      }
    };
    const imgCleanups = [];
    imgRefs.current.forEach((img, i) => {
      if (!img) return;
      if (img.complete && img.naturalWidth) colourise(i);
      else {
        const onLoad = () => colourise(i);
        img.addEventListener("load", onLoad);
        imgCleanups.push(() => img.removeEventListener("load", onLoad));
      }
    });

    const state = { p: progressRef.current, px: 0, py: 0, tx: 0, ty: 0, spin: 0, spinRate: 1, contact: 0, stagedAt: -Infinity, stagedAtMs: -Infinity };
    const onPointerMove = (e) => {
      state.px = (e.clientX / window.innerWidth) * 2 - 1;
      state.py = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const onResize = () => {
      width = mount.clientWidth;
      height = mount.clientHeight;
      renderer.setSize(width, height);
      layout();
    };
    window.addEventListener("resize", onResize);

    // -------------------------------------------------------------
    // Scroll hold. However fast someone scrolls, they can't get past a
    // paragraph before its animation has played out:
    //
    //  - while the shown beat is still playing, the scroll can go as far
    //    as the edge of the next beat's range, and no further;
    //  - once it's done, it can go into the next beat but not past it —
    //    so a stage can never be jumped over, only reached.
    //
    // Wheel and touch are *capped*, not reverted: the page scrolls
    // normally right up to the edge and simply stops there, so there's no
    // snap-back and nothing to feel laggy. Scrolling up is never held.
    // Scrollbar drags and jump keys can't be intercepted, so as a backstop
    // an overshoot is eased back to the edge from the scroll handler.
    // -------------------------------------------------------------
    const EDGE = 0.004; // stop this short of the next threshold
    const maxProgress = () => {
      const s = stageRef.current;
      if (s >= STAGE_AT.length - 1) return Infinity;
      const busy = s >= 0 && performance.now() - state.stagedAtMs < STAGE_DWELL[s];
      const next = busy ? s + 1 : s + 2;
      return next < STAGE_AT.length ? STAGE_AT[next] - EDGE : Infinity;
    };
    const limitY = () => {
      const max = maxProgress();
      if (max === Infinity) return Infinity;
      const el = sectionRef.current;
      if (!el) return Infinity;
      const top = el.getBoundingClientRect().top + window.scrollY;
      return top + (el.offsetHeight - window.innerHeight) * max;
    };
    const onWheel = (e) => {
      if (e.deltaY <= 0 || e.ctrlKey) return;
      const limit = limitY();
      if (limit === Infinity) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      const room = limit - window.scrollY;
      if (room <= 0.5) { e.preventDefault(); return; }
      if (dy > room) {
        e.preventDefault();
        window.scrollTo(0, limit);
      }
    };
    let touchY = 0;
    const onTouchStart = (e) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e) => {
      const y = e.touches[0].clientY;
      const dy = touchY - y; // > 0: finger moving up, page scrolling down
      touchY = y;
      if (dy <= 0) return;
      const limit = limitY();
      if (limit !== Infinity && window.scrollY >= limit - 1) e.preventDefault();
    };
    const onScrollHold = () => {
      const limit = limitY();
      if (limit !== Infinity && window.scrollY > limit + 2) window.scrollTo(0, limit);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("scroll", onScrollHold, { passive: true });

    layout();
    // Again once webfonts have settled — the copy box is what the ring
    // dims itself behind.
    const relayout = setTimeout(layout, 600);

    // -------------------------------------------------------------
    // Loop
    // -------------------------------------------------------------
    const clock = new THREE.Clock();
    const centre = new THREE.Vector3();

    const tick = () => {
      if (!activeRef.current) { rafIdRef.current = null; return; }
      rafIdRef.current = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;

      const target = progressRef.current;
      state.p += (target - state.p) * Math.min(1, dt * SMOOTHING);
      if (Math.abs(target - state.p) < 0.0002) state.p = target;
      const p = state.p;

      // Camera: closes in logarithmically — equal scroll, equal apparent
      // growth — so it feels like steady flight rather than a slow start
      // and a sudden lurch at the end.
      const e = smoothstep(FLIGHT[0], FLIGHT[1], p);
      const arriving = Math.pow(1 - entryRef.current, 1.6);
      const camZ = camStart * Math.pow(camEnd / camStart, e) * (1 + ARRIVAL_DEPTH * arriving);
      camera.position.set(0, 0, camZ);
      // Sphere sits low under the title at first; dead centre as it looms.
      camera.lookAt(0, lerp(0.5, 0, smoothstep(0, 0.6, e)), 0);

      const fade = smoothstep(DISSOLVE[0], DISSOLVE[1], e);
      // The starfield keeps turning at close to the globe's own pace.
      dust.rotation.y += dt * lerp(0.08, 0.07, fade);
      dustMat.uniforms.uFade.value = fade;
      dustMat.uniforms.uTime.value = time;

      centre.set(0, 0, 0).project(camera);
      if (coreRef.current) {
        const scx = (centre.x * 0.5 + 0.5) * width;
        const scy = (-centre.y * 0.5 + 0.5) * height;
        coreRef.current.style.opacity = String(1 - smoothstep(0.3, 0.65, e));
        coreRef.current.style.transform =
          `translate3d(${scx}px, ${scy}px, 0) translate(-50%, -50%) scale(${1 + e * 2})`;
      }

      // Story stage. The scroll only sets where the text is *headed*; what's
      // shown walks there one paragraph at a time. Going forward, each one
      // is held for its full dwell (the scroll hold below normally makes
      // this moot — it's the backstop for a scrollbar drag or a jump key);
      // going back, steps are quick. (A React update only on a real step.)
      let want = -1;
      for (let i = 0; i < STAGE_AT.length; i++) if (p >= STAGE_AT[i]) want = i;
      const shown = stageRef.current;
      const need = want > shown ? (shown < 0 ? 0 : STAGE_DWELL[shown] / 1000) : 0.35;
      if (want !== shown && time - state.stagedAt >= need) {
        const next = shown + Math.sign(want - shown);
        stageRef.current = next;
        state.stagedAt = time;
        state.stagedAtMs = performance.now();
        setStage(next);
      }
      const s = stageRef.current;
      state.contact += ((s === STAGE_AT.length - 1 ? 1 : 0) - state.contact) * Math.min(1, dt * 5);

      // ---------------------------------------------------------
      // Photo ring
      // ---------------------------------------------------------
      const zoom = smoothstep(CLOUD[0], CLOUD[1], p);
      const d = CLOUD_FAR * Math.pow(CLOUD_NEAR / CLOUD_FAR, zoom);
      // Turns on its own and a little with scroll; eases to a stop while a
      // photo is hovered, so it doesn't slide out from under the cursor.
      state.spinRate += ((hoverRef.current ? 0 : 1) - state.spinRate) * Math.min(1, dt * 4);
      state.spin += dt * 0.07 * state.spinRate;
      // Turn, as a fraction of the way round.
      const turn = (state.spin + p * 1.4) / (Math.PI * 2);
      // A little drift toward the pointer: the whole ring moves together,
      // so the spacing never changes.
      state.tx += (state.px - state.tx) * Math.min(1, dt * 2);
      state.ty += (state.py - state.ty) * Math.min(1, dt * 2);
      // Flying in: the ring grows from a cluster to full size.
      const f = CLOUD_NEAR / d;
      const cx = width / 2 + state.tx * 10;
      const cy = height / 2 + state.ty * 8;
      const appear = smoothstep(CLOUD[0], CLOUD[0] + 0.05, p);
      const live = s >= 0;
      if (appear > 0.001) placeRing(turn);

      for (let i = 0; i < n; i++) {
        const b = ring[i];
        const el = bubbleRefs.current[i];
        if (!el) continue;
        if (appear <= 0.001) {
          el.style.opacity = "0";
          if (b.live) { el.classList.remove("live"); b.live = false; }
          continue;
        }
        const [ux, uy] = pointAt(slots[i]);
        const x = cx + ux * ringW * f;
        const y = cy + uy * ringH * f;

        // A coloured speck while far, blooming into the photo as the camera
        // arrives among them.
        const nearness = CLOUD_NEAR / d; // ~0.25 far -> 1 arrived
        const bloom = smoothstep(0.4, 0.9, nearness);
        // Sized with real width/height, never a CSS scale(): a scaled-down
        // element is rasterised big and resampled, which softens the edge
        // until the circle stops looking like a circle. Drawn at its true
        // pixel size, the browser anti-aliases a clean round edge.
        // Every photo the same size once arrived, so the ring reads as an
        // even circle of equals.
        const size = Math.max(4, Math.round(lerp(5, baseSize, bloom)));
        const half = size / 2;

        // Dim anything passing behind the copy.
        let behind = false;
        if (box && live) {
          behind = x + half > box.left && x - half < box.right &&
            y + half > box.top && y - half < box.bottom;
        }
        b.dim += ((behind ? 0.3 : 1) - b.dim) * Math.min(1, dt * 6);

        // Dimmed by darkening, not transparency — a see-through photo lets
        // the stars show through it and reads as a ghostly blob instead of
        // a solid disc. Opacity is only for the first moment it appears.
        el.style.opacity = String(appear);
        el.style.filter = `brightness(${(b.dim * (1 - state.contact * 0.45)).toFixed(3)})`;
        el.style.width = el.style.height = `${size}px`;
        el.style.transform = `translate3d(${x - half}px, ${y - half}px, 0)`;

        const isLive = live && !behind && nearness > 0.95;
        if (isLive !== b.live) { el.classList.toggle("live", isLive); b.live = isLive; }
      }

      // The words wait for the globe to arrive.
      const landed = smoothstep(0.6, 1, entryRef.current);
      const titleK = (1 - smoothstep(TITLE_OUT[0], TITLE_OUT[1], p)) * landed;
      if (titleRef.current) {
        titleRef.current.style.opacity = String(titleK);
        titleRef.current.style.transform = `translate3d(0, ${(1 - titleK) * -20}px, 0)`;
      }

      if (stackRef.current) {
        // Opaque well before the camera arrives, so what's seen for most of
        // the approach is the globe itself, not two scenes blended.
        const o = smoothstep(0, 0.4, entryRef.current);
        stackRef.current.style.opacity = o;
        stackRef.current.style.pointerEvents = o > 0.01 ? "auto" : "none";
      }

      renderer.render(scene, camera);
    };
    tickRef.current = tick;
    if (activeRef.current && rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      tickRef.current = null;
      clearTimeout(relayout);
      imgCleanups.forEach((fn) => fn());
      window.removeEventListener("resize", onResize);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("scroll", onScrollHold);
      window.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      dustGeo.dispose(); dustMat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everActive]);

  const open = openIndex != null ? PHOTOS[openIndex] : null;
  const stageClass = (i) =>
    stage === i ? "is-in" : stage > i ? "is-past" : "is-future";
  const contactStage = ABOUT.story.length;

  return (
    // -100vh for the same reason as Projects and Experience: a pinned
    // section's progress completes one viewport before its box ends.
    <section
      ref={sectionRef}
      style={{ position: "relative", height: `${SCROLL_LENGTH_VH}vh`, marginTop: "-100vh" }}
    >
      <div ref={stackRef} className="space-ground about" style={styles.stack}>
        <div ref={mountRef} style={styles.canvasMount} />
        <div ref={coreRef} className="about-core" />

        <div style={styles.topBar}>
          <SectionLabel>{ABOUT.eyebrow}</SectionLabel>
        </div>

        <div ref={titleRef} style={styles.title}>
          <h2 style={styles.heading}>
            {ABOUT.heading.split("\n").map((line, i) => (
              <span key={i} style={styles.headingLine}>{line}</span>
            ))}
          </h2>
        </div>

        <div
          className="about-bubbles"
          onPointerOver={(e) => { if (e.target.closest(".about-bubble.live")) hoverRef.current = true; }}
          onPointerOut={(e) => { if (e.target.closest(".about-bubble")) hoverRef.current = false; }}
        >
          {PHOTOS.map((photo, i) => (
            <button
              key={i}
              type="button"
              ref={(el) => { bubbleRefs.current[i] = el; }}
              className="about-bubble"
              onClick={() => photo.src && setOpenIndex(i)}
              aria-label={photo.label || `Photo ${i + 1}`}
            >
              <span className="about-bubble__disc">
                {photo.src && (
                  <img
                    ref={(el) => { imgRefs.current[i] = el; }}
                    src={photo.src}
                    alt=""
                    draggable={false}
                  />
                )}
              </span>
              {photo.label && <span className="about-bubble__label">{photo.label}</span>}
            </button>
          ))}
        </div>

        {/* Every stage shares one grid cell, so the box is always the size of
            the largest — which is what the ring dims itself behind. */}
        <div className="about-stages-wrap">
          <div ref={stagesRef} className="about-stages">
            {ABOUT.story.map((para, i) => (
              <p key={i} className={`about-stage ${stageClass(i)}`}>
                {/* Long paragraphs step down a size, so none of them turns
                    into a wall of text in the middle of the screen; the
                    opening line steps up. */}
                <span
                  className={`about-para${i === 0 ? " about-para--intro" : ""}${para.trim().split(/\s+/).length > 28 ? " about-para--long" : ""}`}
                >
                  <Rich text={para} active={stage === i} />
                </span>
              </p>
            ))}

            <div className={`about-stage about-contact ${stageClass(contactStage)}`}>
              <span className="about-badge">
                <span className="about-badge__dot" aria-hidden="true" />
                {CONTACT.badge}
              </span>
              <h3 className="about-contact__heading">
                {CONTACT.heading.split("\n").map((line, i) => (
                  <span key={i} className="about-contact__line"><Rich text={line} active={stage === contactStage} /></span>
                ))}
              </h3>
              <div className="about-links">
                {CONTACT.links.map((link, j) => (
                  <a
                    key={link.id}
                    className={`about-link about-link--${link.id}`}
                    style={{ "--j": j }}
                    href={link.href || undefined}
                    target={link.href && !link.href.startsWith("mailto:") ? "_blank" : undefined}
                    rel="noreferrer"
                    aria-label={link.label}
                    aria-disabled={!link.href || undefined}
                    tabIndex={stage === contactStage ? 0 : -1}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[link.id]}</svg>
                    <span className="about-link__label">{link.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Which beat of the story you're on. */}
        {/* The active tick fills over its beat's dwell — so a held scroll
            reads as "this is still playing", not as the page being stuck. */}
        <div
          className="about-progress"
          data-on={stage >= 0 || undefined}
          style={{ "--dwell": `${STAGE_DWELL[Math.max(0, stage)]}ms` }}
        >
          {[...ABOUT.story, CONTACT].map((_, i) => (
            <span key={i} className={i === stage ? "on" : undefined} />
          ))}
        </div>

        {open && (
          <div className="about-lightbox" onClick={() => setOpenIndex(null)}>
            <figure onClick={(e) => e.stopPropagation()}>
              <img src={open.src} alt={open.label || ""} />
              {open.label && <figcaption>{open.label}</figcaption>}
            </figure>
          </div>
        )}
      </div>
    </section>
  );
}

const mono = "'Courier New', monospace";

const styles = {
  stack: {
    position: "fixed",
    inset: 0,
    zIndex: 7, // above Experience (6) — fades in over its neighbour
    overflow: "hidden",
    fontFamily: mono,
    color: "#fff",
    userSelect: "none",
    opacity: 0,
    pointerEvents: "none",
  },
  // pan-y, never none — see Projects.jsx: `none` on a full-viewport overlay
  // kills touch scrolling for the whole section.
  canvasMount: { position: "absolute", inset: 0, touchAction: "pan-y" },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0, display: "flex",
    alignItems: "center", justifyContent: "space-between", padding: "22px 32px",
    fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.75)",
  },
  title: {
    position: "absolute", top: "10vh", left: 0, right: 0, padding: "0 24px",
    display: "flex", justifyContent: "center", textAlign: "center",
    pointerEvents: "none", willChange: "opacity, transform",
  },
  heading: {
    display: "flex", flexDirection: "column",
    fontFamily: "Geist, Helvetica, Arial, sans-serif", fontWeight: 400,
    fontSize: "clamp(22px, 2.6vw, 36px)", lineHeight: 1.15, letterSpacing: "-0.02em", color: "#fff",
  },
  headingLine: { display: "block" },
  // Placement lives in about.css — it moves above the hint on a phone.
};
