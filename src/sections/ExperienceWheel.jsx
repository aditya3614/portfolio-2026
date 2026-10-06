import { useEffect, useRef, useState } from "react";
import { EXPERIENCE } from "../data/experience";
import { ACCENT, GROUND } from "../theme";
import { useScrollProgressRef } from "../hooks/useScrollProgress";
import { paintCard } from "../components/wheelCards";
import { qAxis, qIdentity, qRot, qSlerp, cssMatrix } from "../components/quat";
import "../experience-wheel.css";

/**
 * EXPERIENCE (wheel) — one card per role, turned by scroll.
 *
 *  1. The cards open as a ring facing the viewer, each laid along the
 *     circle, with the section title in the middle.
 *  2. Scrolling folds the ring: the whole thing swings 120° about a diagonal
 *     axis (pointing up-right and out of the screen), which curls it into a
 *     hook toward the top right and lays it down as a drum on its side. The
 *     ring's top card lands at the front, the one clockwise of it just above.
 *     Each card meanwhile turns on its own, from its slant on the ring to
 *     upright on the drum — some pass edge-on on the way.
 *  3. Scrolling on spins the drum: the card above comes down to the front,
 *     tipped back until it arrives, and the current one rolls on below,
 *     tipped the other way. The caption on the left and the list on the
 *     right follow along.
 *
 * Each card is a painted space scene in its company's colours, with the
 * company's logo set on it — see components/wheelCards.js.
 *
 * The cards are DOM with CSS 3D transforms, written every frame from a few
 * lines of maths below; their art is painted once into a canvas each. Driven
 * by real document scroll via useScrollProgressRef, like every section.
 *
 * (The earlier journey version lives in Experience.jsx, kept but unused.)
 */

const COUNT = EXPERIENCE.length;
const STEP = (Math.PI * 2) / COUNT; // angle between cards on the ring
// ...and on the drum, closer — so as one card leaves the front the next is
// already arriving and there's always a card near the middle, a stream
// rather than a slideshow. The ring's spacing closes up to this through the
// turn.
const DRUM_STEP = Math.min(STEP, (40 * Math.PI) / 180);

// --- Scroll beats, in "units" of one viewport of scroll each ---------------
const RING_HOLD = 0.35; // the ring, before anything turns
const FLATTEN = 1; // ring -> drum
const DWELL = 0.3; // share of each card's step spent holding it at the front
const H = DWELL / 2;
// The last viewport belongs to About, whose globe approaches over it.
const TAIL = 1;
const SPIN_AT = RING_HOLD + FLATTEN;
const UNITS = SPIN_AT + (COUNT - 1) + H + TAIL;
const SCROLL_LENGTH_VH = 100 + UNITS * 100;
const SMOOTHING = 6; // per second

// --- Geometry ---------------------------------------------------------------
const CARD_RATIO = 1.45; // width / height
const RING_SCALE = 0.6; // card size on the ring, relative to the front of the drum
const RING_SCALE_NARROW = 0.42; // a phone's ring is tighter
const PERSPECTIVE = 1400; // px
const NEIGHBOUR = 1.38; // gap to the next card on the drum, in card heights
const NEIGHBOUR_NARROW = 1.75; // a phone's cards are near full width; give them air
// The drum's arc: cards away from the front are drawn in to the left, so the
// stream swings in to the middle and back out along a shallow curve rather
// than a plumb line. In card widths, at the full (1 − cos) of their angle.
const ARC = 1.15;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// The fold: the rotation that takes the ring (in the screen's plane) to the
// drum (on its side), sending the ring's top to the drum's front and its
// right-hand side to the drum's top. A single 120° turn about (-1, 1, -1)
// — the axis the fold curls round, which is why the cards bunch toward the
// top right on the way.
const FOLD = qAxis(-1, 1, -1, (Math.PI * 2) / 3);
const ringAngle = (i, spacing) => -Math.PI / 2 + i * spacing; // card 0 at the top

// Spin position: 0..COUNT-1 is the card at the front of the drum, with a
// hold at each.
const toSlot = (q) => {
  const i = Math.floor(q);
  return clamp(i + smoothstep(H, 1 - H, q - i), 0, COUNT - 1);
};

// "Aug 2022 — Jan 2023" ... "2024 — Now" -> "Aug 2022 — Now", for the ring.
const SPAN = `${EXPERIENCE[0]?.period.split("—")[0].trim() ?? ""} — ${
  EXPERIENCE[COUNT - 1]?.period.split("—").pop().trim() ?? ""
}`;

export default function ExperienceWheel() {
  const sectionRef = useRef(null);
  const stackRef = useRef(null);
  const stageRef = useRef(null);
  const cardRefs = useRef([]);
  const artRefs = useRef([]);
  const centreRef = useRef(null);
  const captionRef = useRef(null);
  const listRef = useRef(null);

  const { progressRef, entryRef } = useScrollProgressRef(sectionRef);

  const [active, setActive] = useState(0);
  const [everActive, setEverActive] = useState(false);
  const activeRef = useRef(false);
  const rafIdRef = useRef(null);
  const tickRef = useRef(null);

  // Card art, once.
  useEffect(() => {
    artRefs.current.forEach((c, i) => c && paintCard(c, EXPERIENCE[i], i, CARD_RATIO));
  }, []);

  // Set up and run only near the viewport, like every section.
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
    const stage = stageRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = stage.clientWidth;
    let height = stage.clientHeight;
    let narrow = width < 760;
    let cardW = 300;
    let ringR = 200;
    let drumR = 400;
    const layout = () => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      narrow = width < 760;
      // The front card at a quarter of the frame across (a phone: most of it).
      cardW = narrow ? Math.min(width * 0.62, 300) : clamp(Math.min(width * 0.27, height * 0.42 * CARD_RATIO), 240, 440);
      ringR = narrow ? width * 0.3 : Math.min(width * 0.3, height * 0.36);
      // The drum is sized so the cards either side of the front one — the
      // next above, the previous below — sit NEIGHBOUR card-heights away on
      // screen. Solved through the perspective: a card DRUM_STEP round the
      // drum is R·sin up and R·(1−cos) back, and its screen offset is
      // R·sin·P / (P + R·(1−cos)).
      const y = (narrow ? NEIGHBOUR_NARROW : NEIGHBOUR) * (cardW / CARD_RATIO);
      const sn = Math.sin(DRUM_STEP);
      const cn = 1 - Math.cos(DRUM_STEP);
      drumR = (y * PERSPECTIVE) / Math.max(1, sn * PERSPECTIVE - y * cn);
      cardRefs.current.forEach((el) => {
        if (!el) return;
        el.style.width = `${cardW}px`;
        el.style.height = `${cardW / CARD_RATIO}px`;
      });
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(stage);

    let p = null;
    let previous = 0;
    const tick = (now) => {
      if (!activeRef.current) {
        rafIdRef.current = null;
        previous = 0;
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);
      const dt = previous ? Math.min((now - previous) / 1000, 1 / 20) : 0;
      previous = now;

      const entry = entryRef.current;
      if (stackRef.current) {
        stackRef.current.style.opacity = entry;
        stackRef.current.style.pointerEvents = entry > 0.01 ? "auto" : "none";
      }

      const target = progressRef.current;
      p = p === null || reduced ? target : p + (target - p) * (1 - Math.exp(-SMOOTHING * dt));
      if (Math.abs(target - p) < 1e-5) p = target;
      const raw = p * UNITS;

      // Beats.
      const hold = clamp(raw / RING_HOLD, 0, 1);
      const sLin = clamp((raw - RING_HOLD) / FLATTEN, 0, 1);
      const s = easeInOut(clamp(sLin / 0.8, 0, 1));
      // Once folded, the drum glides down from where the ring's top card
      // was to the middle of the frame.
      const descend = easeInOut(smoothstep(0.55, 1, sLin));
      const q = raw - SPIN_AT;
      const slot = toSlot(q);
      const tail = clamp((raw - (UNITS - TAIL)) / TAIL, 0, 1);

      // Ring -> drum.
      // The ring keeps its size through the fold — the cards bunch up round
      // the top card, still in view — and opens out to the drum's radius as
      // it glides down.
      const R = lerp(ringR, drumR, descend);
      const spacing = lerp(STEP, DRUM_STEP, s);
      const fold = qSlerp(qIdentity, FOLD, s);
      // The drum's spin about the horizontal axis brings card `slot` round
      // to the front; each next card waits above.
      const spin = qAxis(1, 0, 0, -slot * DRUM_STEP);
      // A touch of turn while the ring is held, and a gentle swell as the
      // section arrives — it's already moving as it comes in.
      const ringSpin = reduced ? 0 : (1 - hold) * 0.35;
      const arrive = lerp(0.82, 1, entry);
      const showFade = smoothstep(0.3, 1, descend);

      for (let i = 0; i < COUNT; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        const a = ringAngle(i, spacing) + ringSpin * (1 - s);
        // The fold pivots on the ring's top card, which holds its place while
        // the rest of the ring swings round and stacks up behind it; the
        // spin then turns the drum about its own centre.
        const rel = qRot(fold, [R * Math.cos(a), R * Math.sin(a) + R, 0]);
        const centre = qRot(fold, [0, R, 0]);
        const turned = qRot(spin, [rel[0] - centre[0], rel[1] - centre[1], rel[2] - centre[2]]);
        // Round the back of the drum the cards fade away.
        const facing = smoothstep(-0.15, 0.35, turned[2] / R);
        // The pivot is the ring's top card's spot on screen — fixed while the
        // ring folds (however the drum's radius grows), then gliding down to
        // the middle.
        const pivotY = -ringR * (1 - descend);
        // Round the curve: the further a card is from the front, the more it
        // sits off to the left.
        const away = 1 - Math.cos(Math.atan2(-turned[1], turned[2]));
        const arcX = -ARC * cardW * away * descend;
        const pos = [
          centre[0] + turned[0] + arcX,
          pivotY + centre[1] + turned[1],
          centre[2] + turned[2],
        ];

        // Its own turn: from lying along the ring (never upside down) to
        // upright on the drum, tipped back with the curve at the place the
        // drum will put it.
        let rz = a + Math.PI / 2;
        rz = Math.atan2(Math.sin(rz), Math.cos(rz));
        if (rz > Math.PI / 2) rz -= Math.PI;
        if (rz < -Math.PI / 2) rz += Math.PI;
        const ad = ringAngle(i, DRUM_STEP);
        const at = qRot(spin, qRot(FOLD, [Math.cos(ad), Math.sin(ad), 0]));
        const tilt = clamp(Math.atan2(-at[1], at[2]), -1.3, 1.3);
        const turn = qSlerp(qAxis(0, 0, 1, rz), qAxis(1, 0, 0, tilt), s);
        const scale = lerp(narrow ? RING_SCALE_NARROW : RING_SCALE, 1, s) * arrive;

        const opacity = lerp(1, facing, showFade);

        el.style.transform = `translate(-50%, -50%) ${cssMatrix(turn, scale, pos)}`;
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = String(Math.round(pos[2] + 5000));
        el.style.pointerEvents = opacity > 0.4 ? "auto" : "none";
      }

      // Words.
      const near = clamp(Math.round(slot), 0, COUNT - 1);
      setActive((prev) => (prev === near ? prev : near));
      if (centreRef.current) {
        const k = 1 - smoothstep(0, 0.35, s);
        centreRef.current.style.opacity = String(k);
        centreRef.current.style.transform = `translate(-50%, -50%) scale(${lerp(0.9, 1, k) * arrive})`;
      }
      if (captionRef.current) {
        // Comes up through the fold, and simply changes as cards turn.
        const k = smoothstep(0.2, 0.9, s) * (1 - tail);
        captionRef.current.style.opacity = String(k);
        captionRef.current.style.transform = `translate3d(0, calc(-50% + ${((1 - k) * 12).toFixed(1)}px), 0)`;
      }
      if (listRef.current) listRef.current.style.opacity = String(1 - tail);
      // Clear the stage as About's globe comes up over it.
      stage.style.opacity = String(1 - smoothstep(0, 0.45, tail));
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everActive]);

  // Scroll the page to card i's hold — the list and the cards are links into
  // the same scroll timeline, never a separate state.
  const goTo = (i) => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const unit = SPIN_AT + i;
    window.scrollTo({ top: window.scrollY + rect.top + (unit / UNITS) * total, behavior: "smooth" });
  };

  const item = EXPERIENCE[active];

  return (
    // -100vh for the same reason as Projects: a pinned section's progress
    // completes one viewport before its box ends.
    <section
      ref={sectionRef}
      aria-label="Experience"
      style={{ position: "relative", height: `${SCROLL_LENGTH_VH}vh`, marginTop: "-100vh" }}
    >
      <div ref={stackRef} className="space-ground xw-stack" style={{ backgroundColor: GROUND }}>
        <div className="xw-top">
          <span style={{ color: ACCENT }}>EXPERIENCE</span>
          <span className="xw-counter">
            {item.id} / {String(COUNT).padStart(2, "0")}
          </span>
        </div>

        <div ref={stageRef} className="xw-stage" style={{ perspective: `${PERSPECTIVE}px` }}>
          {EXPERIENCE.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              ref={(el) => { cardRefs.current[i] = el; }}
              className="xw-card"
              onClick={() => goTo(i)}
              aria-label={`${entry.company}, ${entry.role}, ${entry.period}`}
            >
              <canvas ref={(el) => { artRefs.current[i] = el; }} className="xw-art" />
            </button>
          ))}

          <div ref={centreRef} className="xw-centre" aria-hidden="true">
            <div className="xw-centre-title">Experience</div>
            <div className="xw-centre-span">{SPAN.toUpperCase()}</div>
          </div>
        </div>

        <div ref={captionRef} className="xw-caption" aria-live="polite">
          <div className="xw-period">{item.period.toUpperCase()}</div>
          <h3 className="xw-company">{item.company}</h3>
          <div className="xw-role" style={{ color: ACCENT }}>{item.role.toUpperCase()}</div>
          <p className="xw-blurb" key={item.id}>{item.blurb}</p>
        </div>

        <ol ref={listRef} className="xw-list">
          {EXPERIENCE.map((entry, i) => (
            <li key={entry.id}>
              <button
                type="button"
                className={i === active ? "is-active" : ""}
                onClick={() => goTo(i)}
              >
                {entry.company}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
