import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EXPERIENCE } from "../data/experience";
import { ACCENT } from "../theme";
import juspayLogoUrl from "../assets/juspay-logo.svg";
import { useScrollProgressRef } from "../hooks/useScrollProgress";

// Maps an experience entry's `logo` field to its actual asset. Only current
// employment gets a real logo — everything else falls back to a generated
// monogram, rather than inventing marks for companies that aren't real.
const LOGOS = { juspay: juspayLogoUrl };

/**
 * EXPERIENCE — a flight down the spiral arm of a barred spiral galaxy.
 *
 * Everything on screen is generated: there is no galaxy image anywhere in
 * this file. One buffer of points, placed into four logarithmic arms around
 * a bulge and a central bar, drawn in a single pass. Scrolling flies the
 * camera along a spiral of its own — winding inward and sinking into the
 * disc at the same time — and each role is a star it passes on the way down.
 *
 * Three decisions carry the whole thing:
 *
 *  1. **Nothing per-star runs on the CPU.** The arms are built once into a
 *     static buffer. Rotation is a property on the parent object and
 *     twinkle is a function of time inside the vertex shader, so a frame
 *     costs one draw call no matter how many stars are in it. Animating
 *     26,000 points in JavaScript would spend the entire frame budget
 *     writing to an array before drawing anything.
 *  2. **The roles are DOM, not geometry.** In 3D each one is a single
 *     additive sprite on the arm; the words live in HTML on top. Text baked
 *     into a canvas texture and flown past at this speed is mush at any
 *     resolution you can afford, and it costs a megabyte of texture memory
 *     to be mush. HTML text is sharp on every display and free.
 *  3. **Star count follows the device.** See LOW_POWER — a phone gets a
 *     smaller buffer and a lower pixel ratio, because additive blending is
 *     fill-rate bound and fill rate is exactly what a phone doesn't have.
 *
 * Driven by real document scroll via useScrollProgressRef — the same single
 * timeline every other section reads. See Projects.jsx for why nothing here
 * captures the wheel.
 */

// --- The galaxy ------------------------------------------------------------
const GALAXY_RADIUS = 18;
const CORE_RADIUS = 2.6;
// Four lanes — two major, two minor between them (see buildGalaxy). What
// decides whether a spiral reads as a spiral isn't the arm count, it's the
// ratio between how far apart adjacent windings sit and how far stars
// scatter off the spine. Windings sit (2*PI/SPIN)/ARMS apart, so doubling
// the arms halves the gap — but lowering SPIN buys it straight back. At
// SPIN 0.30 four arms sit 5.2 units apart against 1.2 of scatter, a ratio
// of 4.5: better separated than the two-arm version was, with twice the
// structure on screen.
const ARMS = 4;
// Radians of winding per unit of radius. This single number is the
// difference between a tight pinwheel and a nearly circular disc.
// Winding rate, and the lever that pays for the extra arms above.
const SPIN = 0.3;
const BAR_LENGTH = 3.4; // the "barred" in barred spiral — the Milky Way has one

// --- The flight ------------------------------------------------------------
// Both radius and height decay exponentially rather than linearly. A linear
// approach covers most of the distance early and then crawls the last
// stretch, because what reads as speed is the *ratio* of distance travelled
// to distance remaining, not the distance itself.
const CAM_R0 = 27;
const CAM_R1 = 1.7;
const CAM_Y0 = 10.5;
const CAM_Y1 = 0.5;
// More winding than the galaxy's own arms have, on purpose — the flight
// should feel like it's corkscrewing down through the structure rather than
// coasting along one arm.
const TURNS = 3.1;
// How far ahead along its own path the camera looks. This is what turns an
// orbit into a flight: aiming at the core keeps the core pinned dead centre
// and the whole galaxy just rotates around it like a turntable, with almost
// no optical flow. Aiming down the spiral instead sends stars streaming past
// the edges of frame, which is the entire sensation of moving.
const LOOK_AHEAD = 0.075;

const SCROLL_LENGTH_VH = EXPERIENCE.length * 95;
const SMOOTHING = 5;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// Exponential spiral, shared by the camera and (at an offset) the roles.
const camRadius = (p) => CAM_R0 * Math.pow(CAM_R1 / CAM_R0, p);
const camHeight = (p) => CAM_Y0 * Math.pow(CAM_Y1 / CAM_Y0, p);
const camAngle = (p) => p * TURNS * Math.PI * 2;

// Where each role sits along that flight. Kept clear of both ends so the
// first isn't on screen before the viewer has seen the galaxy at all, and
// the last isn't still arriving as the section hands over.
const nodeProgress = (i) =>
  EXPERIENCE.length > 1 ? 0.12 + (i * 0.76) / (EXPERIENCE.length - 1) : 0.5;

/**
 * Builds the whole galaxy into one set of typed arrays.
 *
 * Four populations, blended by weight rather than drawn separately — a
 * single buffer is one draw call, and the populations only differ in how
 * their positions are sampled:
 *
 *   disc   the arms themselves, on a logarithmic spiral
 *   bulge  the dense flattened sphere at the centre
 *   bar    the straight span through the core
 *   halo   sparse faint stars well outside the disc
 */
function buildGalaxy(count) {
  const position = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);

  // Two colours and the ramp between them: warm old stars at the centre,
  // hot young ones in the arms. That's the real physical gradient, and a
  // third band in the middle only fought both ends of it.
  const coreCol = new THREE.Color("#ffd2a0"); // old, warm core stars
  const midCol = new THREE.Color("#fff2e2");
  const armCol = new THREE.Color("#a3c9ff"); // hot young arm stars, light blue
  const hiiCol = new THREE.Color("#ff6f91"); // star-forming knots
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    let x;
    let y;
    let z;
    let r;

    const roll = Math.random();
    let faint = 1; // inter-arm stars are dimmed so the arms stay dominant

    if (roll < 0.09) {
      // Bulge: flattened sphere, densest at the centre.
      r = Math.pow(Math.random(), 2.1) * CORE_RADIUS;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.cos(phi) * 0.5; // flattened — a bulge, not a ball
      z = r * Math.sin(phi) * Math.sin(theta);
    } else if (roll < 0.145) {
      // Bar: a straight span through the core, thin in the other two axes.
      const along = (Math.random() - 0.5) * 2 * BAR_LENGTH;
      x = along;
      y = (Math.random() - 0.5) * 0.36;
      z = (Math.random() - 0.5) * 1.5 * (1 - Math.abs(along) / BAR_LENGTH) ;
      r = Math.hypot(x, z);
    } else if (roll < 0.97) {
      // Disc: the arms. Classic logarithmic spiral — the branch sets which
      // arm, and the spin term winds it further the further out it sits.
      const t = Math.pow(Math.random(), 0.5); // bias inward: discs are denser at the middle
      r = CORE_RADIUS * 0.45 + t * GALAXY_RADIUS;

      // A minority of disc stars belong to no arm at all. Real discs have a
      // faint smooth population between the arms, and without it the gaps
      // read as empty slots cut out of a disc rather than as darker lanes
      // between brighter ones — which is what actually makes arms look like
      // arms instead of like spokes.
      const interArm = Math.random() < 0.24;
      if (interArm) faint = 0.5;
      // Odd lanes are the minor arms: same geometry, fewer and fainter
      // stars. Four equal arms read as a pinwheel; a major/minor alternation
      // is what real multi-arm discs look like and it keeps the two dominant
      // arms legible as the structure while the others fill the disc.
      const lane = i % ARMS;
      const minor = lane % 2 === 1;
      if (minor) faint = 0.62;
      const branch = (lane / ARMS) * Math.PI * 2;
      const angle = interArm ? Math.random() * Math.PI * 2 : branch + r * SPIN;
      // Arm width is a ratio against the 9.2-unit gap between windings, not
      // an absolute. 0.135 puts the arm's body at about a quarter of the gap
      // — wide enough to have mass and an inner/outer edge, narrow enough
      // that the dark lane between arms survives. Any tighter and the arms
      // come out as bright threads with a galaxy-shaped hole around them.
      const armWidth = interArm ? 0.34 : minor ? 0.075 : 0.065;

      // Scatter, raised to a power so most stars sit close to the arm's
      // spine and a few stray far. Uniform scatter gives fuzzy tubes; this
      // is what gives an arm a bright spine and a soft edge.
      const scatter = (axis) =>
        Math.pow(Math.random(), 2.4) * (Math.random() < 0.5 ? 1 : -1) * r * axis;

      x = Math.cos(angle) * r + scatter(armWidth);
      y = scatter(0.028); // the disc is thin — this is what keeps it a disc
      z = Math.sin(angle) * r + scatter(armWidth);
    } else {
      // Halo: sparse, faint, well outside everything else. Stops the disc
      // from ending against nothing.
      r = GALAXY_RADIUS * (1 + Math.random() * 1.6);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.cos(phi) * 0.55;
      z = r * Math.sin(phi) * Math.sin(theta);
    }

    position[i * 3] = x;
    position[i * 3 + 1] = y;
    position[i * 3 + 2] = z;

    // Colour by distance from the centre: warm old core, white middle,
    // blue-white arms. This gradient is most of what makes a field of dots
    // read as a galaxy rather than as confetti.
    const f = clamp01(r / GALAXY_RADIUS);
    if (f < 0.34) c.copy(coreCol).lerp(midCol, f / 0.34);
    else c.copy(midCol).lerp(armCol, (f - 0.34) / 0.66);

    // A few pink star-forming knots out in the arms, and the occasional
    // red giant. Both are real, and both stop the gradient reading as a
    // smooth airbrush.
    const tint = Math.random();
    if (tint > 0.988 && f > 0.3) c.copy(hiiCol);
    else if (tint > 0.975) c.lerp(coreCol, 0.85);

    color[i * 3] = c.r;
    color[i * 3 + 1] = c.g;
    color[i * 3 + 2] = c.b;

    // Mostly tiny with a few bright ones — a field of identically sized
    // dots is the single most artificial-looking thing in a starfield.
    size[i] = (0.55 + Math.pow(Math.random(), 3.2) * 2.8) * faint;
    seed[i] = Math.random();
  }

  return { position, color, size, seed };
}

// A bright star with a cross glint, for the handful of foreground stars that
// sit in front of everything. Round dots alone never read as *brilliant* —
// the glint is the cue that something is blowing out the exposure.
function makeGlintTexture() {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.22);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(220,235,255,0.5)");
  g.addColorStop(1, "rgba(180,210,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);

  ctx.globalCompositeOperation = "lighter";
  for (const vertical of [false, true]) {
    const grad = vertical
      ? ctx.createLinearGradient(0, 0, 0, s)
      : ctx.createLinearGradient(0, 0, s, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.75)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    if (vertical) ctx.fillRect(s / 2 - 1.5, 0, 3, s);
    else ctx.fillRect(0, s / 2 - 1.5, s, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft round dot, drawn once and shared by every sprite that needs a glow.
function makeGlowTexture() {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.5)");
  g.addColorStop(0.55, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function Experience() {
  const sectionRef = useRef(null);
  const stackRef = useRef(null);
  const mountRef = useRef(null);
  const counterRef = useRef(null);
  const hintRef = useRef(null);
  const panelRefs = useRef([]);
  const dotRefs = useRef([]);

  const { progressRef, entryRef } = useScrollProgressRef(sectionRef);

  const [everActive, setEverActive] = useState(false);
  const activeRef = useRef(false);
  const rafIdRef = useRef(null);
  const tickRef = useRef(null);

  // Same deferral as Projects: don't build a WebGL scene, or run its render
  // loop, until this section is actually near the viewport — otherwise every
  // 3D section on the page is rendering at once from first paint.
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
    const mount = mountRef.current;
    let width = mount.clientWidth;
    let height = mount.clientHeight;

    // Additive blending is fill-rate bound, and fill rate is the one thing
    // a phone GPU is short of. Both levers here are about pixels touched
    // per frame, not about geometry: fewer stars, and fewer physical pixels
    // under each of them.
    const LOW_POWER =
      width < 760 ||
      (navigator.hardwareConcurrency || 8) <= 4 ||
      window.matchMedia("(pointer: coarse)").matches;
    const STAR_COUNT = LOW_POWER ? 26000 : 52000;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.5, 220);

    // How far back the whole flight sits, as a multiple of its desktop path.
    //
    // A portrait viewport's horizontal field of view is a fraction of its
    // vertical one, so a path framed on a desktop puts a phone *inside* the
    // disc for most of the section — close enough that the arms fall outside
    // frame entirely and all that's left is scattered dots. Flying the same
    // path further out is what restores the galaxy as an object you can see
    // the shape of.
    let fit = 1;
    // reframe() runs once before the markers exist, and placeMarkers()
    // closes over a `const` still in its temporal dead zone at that point,
    // so the first call has to be skipped explicitly. `typeof` is no help:
    // touching a TDZ binding throws even inside typeof.
    let markersBuilt = false;
    // How much of the look-ahead survives. On a wide screen the camera aims
    // down its own path and the galaxy sits off-centre, which is what makes
    // the flight feel flown. A portrait viewport has no horizontal room to
    // spare, so the same aim throws the galaxy clean out of frame — on
    // narrow screens the aim is pulled back toward the core and the sense of
    // motion comes from the banking and the approach instead.
    let aimK = 1;
    let rollK = 1;
    const reframe = () => {
      const aspect = width / height;
      const narrow = Math.min(1, Math.max(0, (1.3 - aspect) / 0.75)); // 0 wide -> 1 portrait
      fit = aspect >= 1.3 ? 1 : Math.min(2.5, 1.3 / Math.max(aspect, 0.42));
      aimK = 1 - narrow * 0.78;
      rollK = 1 - narrow * 0.55;
      if (markersBuilt) placeMarkers();
    };
    reframe();

    const renderer = new THREE.WebGLRenderer({
      antialias: !LOW_POWER, // MSAA on a full-screen additive field is not cheap
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW_POWER ? 1.5 : 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // -------------------------------------------------------------
    // The galaxy: one buffer, one material, one draw call.
    // -------------------------------------------------------------
    const { position, color, size, seed } = buildGalaxy(STAR_COUNT);
    const galaxyGeo = new THREE.BufferGeometry();
    galaxyGeo.setAttribute("position", new THREE.BufferAttribute(position, 3));
    galaxyGeo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    galaxyGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    galaxyGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

    const galaxyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uFade: { value: 0 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aSeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vBright;
        varying float vDepth;

        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float depth = max(-mv.z, 0.6);
          vDepth = depth;

          // Twinkle lives here rather than in a JS loop: it's a pure
          // function of time and a per-star seed, so the GPU evaluates it
          // for free and the position buffer never has to be re-uploaded.
          float tw = 0.72 + 0.28 * sin(uTime * (0.5 + aSeed * 1.6) + aSeed * 50.0);
          vBright = tw;

          // Perspective sizing, clamped hard. The ceiling matters more than
          // it looks: this flight passes within a unit or two of individual
          // stars, and without a cap each one swells into a screen-filling
          // quad — the field stops reading as stars and starts reading as
          // out-of-focus bokeh.
          // Wider size range than before. Perspective already shrinks the
          // far stars, but letting the near ones grow further is half of
          // what separates foreground from background in a field that has
          // no other occlusion cues to work with.
          float s = aSize * uPixelRatio * (52.0 / depth) * tw;
          gl_PointSize = clamp(s, 0.45, 12.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform float uFade;
        varying vec3 vColor;
        varying float vBright;
        varying float vDepth;

        void main() {
          // Round the point off and give it a soft falloff. Square points
          // are the other giveaway that a starfield is a buffer of dots.
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          float a = smoothstep(0.25, 0.01, r2);

          // Distance falloff — the depth cue that was missing. A star field
          // where everything is equally bright reads as a flat sheet of
          // dots no matter how correct the perspective is, because
          // brightness is the cue the eye actually uses for depth once
          // there's nothing to occlude anything else. Near stars now burn,
          // far ones sink toward the background, and the disc gains a
          // front and a back.
          // Gentle rate and a floor that isn't near zero. Steeper than this
          // and the establishing shot — where the camera is 30+ units out
          // and every star is "far" — drains to almost nothing before the
          // flight has started.
          float dim = clamp(exp(-vDepth * 0.015), 0.28, 1.0);
          // Slight cool shift with distance, the space equivalent of
          // aerial perspective — reinforces the same ordering in hue.
          vec3 col = mix(vColor * vec3(0.72, 0.8, 1.0), vColor, dim);

          // Deliberately dim per star. Thousands of these overlap through
          // the core, and additive blending accumulates — at full strength
          // the centre saturates to flat white and every trace of spiral
          // structure is lost inside it. Brightness has to come from the
          // pile-up, not from each star.
          gl_FragColor = vec4(col * vBright * 0.74 * dim, a * uFade);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false, // an additive star field has nothing to occlude
      blending: THREE.AdditiveBlending,
    });

    const galaxy = new THREE.Points(galaxyGeo, galaxyMat);
    // Tilted off the ecliptic so the flight arrives at an angle rather than
    // straight down the axis — a disc seen face-on reads as a flat target.
    galaxy.rotation.x = 0.12;
    scene.add(galaxy);

    // -------------------------------------------------------------
    // Core bloom — one big additive sprite. Cheaper by orders of magnitude
    // than a post-processing bloom pass, and at this distance visually
    // indistinguishable from one.
    // -------------------------------------------------------------
    const glowTex = makeGlowTexture();
    const coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color("#ffd9a8"),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      })
    );
    coreGlow.scale.setScalar(CORE_RADIUS * 4.2);
    galaxy.add(coreGlow);

    // -------------------------------------------------------------
    // Foreground glints — a handful of brilliant near stars in front of
    // the disc. Cheap (a dozen sprites) and they do a lot: something has to
    // be unambiguously *in front* for the haze behind it to read as depth.
    // -------------------------------------------------------------
    const glintTex = makeGlintTexture();
    const glints = [];
    for (let i = 0; i < (LOW_POWER ? 7 : 13); i++) {
      const rnd = (n) => {
        const x = Math.sin(i * 91.7 + n * 47.3) * 43758.5453;
        return x - Math.floor(x);
      };
      const mat = new THREE.SpriteMaterial({
        map: glintTex,
        color: new THREE.Color().setHSL(0.58 + rnd(1) * 0.12, 0.3, 0.92),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const sp = new THREE.Sprite(mat);
      const rr = GALAXY_RADIUS * (0.25 + rnd(2) * 0.95);
      const th = rnd(3) * Math.PI * 2;
      sp.position.set(
        Math.cos(th) * rr,
        (rnd(4) - 0.5) * GALAXY_RADIUS * 0.5,
        Math.sin(th) * rr
      );
      const scale = 0.9 + rnd(5) * 1.9;
      sp.scale.setScalar(scale);
      galaxy.add(sp);
      glints.push({ sp, mat, base: scale, phase: rnd(6) * 6.28 });
    }

    // -------------------------------------------------------------
    // Role markers — one additive sprite each, sitting on the arm the
    // camera is about to fly past.
    // -------------------------------------------------------------
    const markers = EXPERIENCE.map((item, i) => {
      const p = nodeProgress(i);
      // Inside the camera's own radius and a little ahead of it in angle,
      // so it sits between the camera and the core — which is where the
      // camera is looking, so it's reliably in frame as it's approached.
      const r = camRadius(p) * fit * 0.62;
      const a = camAngle(p) + 0.42;
      const mat = new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(item.color),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(Math.cos(a) * r, camHeight(p) * fit * 0.45, Math.sin(a) * r);
      galaxy.add(sprite);
      return { sprite, mat, item, p };
    });

    // Positions depend on `fit`, which changes with the viewport.
    function placeMarkers() {
      for (const m of markers) {
        const r = camRadius(m.p) * fit * 0.62;
        const a = camAngle(m.p) + 0.42;
        m.sprite.position.set(Math.cos(a) * r, camHeight(m.p) * fit * 0.45, Math.sin(a) * r);
      }
    }
    placeMarkers();
    markersBuilt = true;

    // -------------------------------------------------------------
    // Pointer parallax — a small offset applied to the camera, never a
    // rotation of the galaxy. Turning the galaxy on hover fights the
    // scroll-driven flight; nudging the camera reads as leaning in.
    // -------------------------------------------------------------
    const state = { p: progressRef.current, px: 0, py: 0, camX: 0, camY: 0, active: -1 };
    const onPointerMove = (e) => {
      const rect = mount.getBoundingClientRect();
      state.px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      state.py = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const onPointerLeave = () => { state.px = 0; state.py = 0; };
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerLeave);

    const onResize = () => {
      width = mount.clientWidth;
      height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      galaxyMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      reframe();
    };
    window.addEventListener("resize", onResize);

    // -------------------------------------------------------------
    // Loop
    // -------------------------------------------------------------
    const clock = new THREE.Clock();
    const target = new THREE.Vector3();


    const tick = () => {
      if (!activeRef.current) { rafIdRef.current = null; return; }
      rafIdRef.current = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.getElapsedTime();

      // Ease toward the real scroll position rather than snapping to it —
      // wheel steps and trackpad flicks become one continuous glide.
      const want = progressRef.current;
      state.p += (want - state.p) * Math.min(1, dt * SMOOTHING);
      if (Math.abs(want - state.p) < 0.0002) state.p = want;
      const p = state.p;

      // Differential rotation: the galaxy turns as a whole, slowly. Real
      // discs shear (the inside laps the outside), but shearing a static
      // buffer means rewriting every position every frame — the one thing
      // this section is built to avoid.
      galaxy.rotation.y += dt * 0.012;

      galaxyMat.uniforms.uTime.value = time;
      galaxyMat.uniforms.uFade.value = smoothstep(0, 0.05, p) * 0.95;
      for (let i = 0; i < glints.length; i++) {
        const gl = glints[i];
        const tw = 0.7 + 0.3 * Math.sin(time * 1.1 + gl.phase);
        gl.mat.opacity = smoothstep(0, 0.06, p) * 0.85 * tw;
        gl.sp.scale.setScalar(gl.base * (0.88 + tw * 0.2));
      }
      coreGlow.material.opacity = 0.22 + smoothstep(0.35, 1, p) * 0.3;

      // --- Flight ---------------------------------------------------
      const a = camAngle(p);
      const r = camRadius(p) * fit;
      camera.position.set(
        Math.cos(a) * r + state.camX,
        camHeight(p) * fit + state.camY,
        Math.sin(a) * r
      );
      // Look down its own path, inward — not at the core. aimK pulls that
      // aim back toward the core as the viewport narrows (see reframe).
      const la = camAngle(p + LOOK_AHEAD * aimK);
      const lr = camRadius(p + LOOK_AHEAD * aimK) * fit * 0.45 * aimK;
      target.set(
        Math.cos(la) * lr,
        camHeight(p + LOOK_AHEAD * aimK) * fit * 0.3 * aimK,
        Math.sin(la) * lr
      );
      camera.lookAt(target);
      // Bank into the turn. Small in absolute terms, but rolling the horizon
      // is most of what separates "flown" from "dollied".
      camera.rotation.z += Math.sin(p * Math.PI) * 0.38 * rollK;

      state.camX += (state.px * 0.9 - state.camX) * Math.min(1, dt * 3);
      state.camY += (-state.py * 0.6 - state.camY) * Math.min(1, dt * 3);

      // --- Roles ----------------------------------------------------
      let nearest = -1;
      let nearestK = 0;
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        // Triangular window around this role's point on the flight.
        const k = 1 - smoothstep(0, 0.13, Math.abs(p - m.p));
        const pulse = 0.85 + 0.15 * Math.sin(time * 2 + i);
        m.mat.opacity = 0.25 + k * 0.75;
        m.sprite.scale.setScalar((0.28 + k * 0.95) * pulse);
        if (k > nearestK) { nearestK = k; nearest = i; }
      }

      // Panels are written straight to the DOM rather than through state —
      // a setState here would re-render the section on every frame of the
      // flight, for text that is usually unchanged.
      for (let i = 0; i < panelRefs.current.length; i++) {
        const el = panelRefs.current[i];
        if (!el) continue;
        const k = 1 - smoothstep(0, 0.115, Math.abs(p - nodeProgress(i)));
        el.style.opacity = String(k);
        el.style.transform = `translate3d(0, ${(1 - k) * 22}px, 0)`;
        el.style.visibility = k > 0.01 ? "visible" : "hidden";
        const dot = dotRefs.current[i];
        if (dot) {
          dot.style.opacity = String(0.25 + k * 0.75);
          dot.style.transform = `scale(${1 + k * 0.9})`;
        }
      }

      // The hint has made its point by the time the first role arrives, and
      // on a narrow screen it wraps into the panel underneath it.
      if (hintRef.current) {
        hintRef.current.style.opacity = String(1 - smoothstep(0.04, 0.12, p));
      }

      if (nearest !== state.active) {
        state.active = nearest;
        if (counterRef.current) {
          counterRef.current.textContent =
            nearest >= 0
              ? `${EXPERIENCE[nearest].id} / ${String(EXPERIENCE.length).padStart(2, "0")}`
              : "";
        }
      }

      // Fades in over Projects, and deliberately never fades out — About
      // sits above this one and covers it, and crossfading two identical
      // black backgrounds is what makes the handoff invisible.
      if (stackRef.current) {
        const o = entryRef.current;
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
      window.removeEventListener("resize", onResize);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerLeave);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      galaxyGeo.dispose();
      galaxyMat.dispose();
      glints.forEach((g) => g.mat.dispose());
      glintTex.dispose();
      markers.forEach((m) => m.mat.dispose());
      coreGlow.material.dispose();
      glowTex.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everActive]);

  return (
    // -100vh for the same reason as Projects: a pinned section's progress
    // completes one viewport before its box ends, so without this there'd be
    // a viewport-tall gap where neither section is on screen.
    <section
      ref={sectionRef}
      style={{ position: "relative", height: `${SCROLL_LENGTH_VH}vh`, marginTop: "-100vh" }}
    >
      <div ref={stackRef} className="space-ground" style={styles.stack}>
        <div ref={mountRef} style={styles.canvasMount} />

        <div style={styles.topBar}>
          <span style={styles.eyebrow}>EXPERIENCE</span>
          <span ref={counterRef} style={styles.counter} />
        </div>

        {/* One panel per role, all mounted, all but the active one hidden.
            Mounting them up front keeps the flight free of layout work. */}
        <div style={styles.panelWrap}>
          {EXPERIENCE.map((item, i) => (
            <article
              key={item.id}
              ref={(el) => { panelRefs.current[i] = el; }}
              style={styles.panel}
            >
              <div style={styles.period}>{item.period}</div>
              <div style={styles.companyRow}>
                {LOGOS[item.logo] ? (
                  <img src={LOGOS[item.logo]} alt="" style={styles.logo} />
                ) : (
                  <span style={{ ...styles.monogram, background: item.color }}>
                    {item.company[0]}
                  </span>
                )}
                <h3 style={styles.company}>{item.company}</h3>
              </div>
              <div style={{ ...styles.role, color: item.color }}>{item.role}</div>
              <p style={styles.blurb}>{item.blurb}</p>
            </article>
          ))}
        </div>

        <div style={styles.rail}>
          {EXPERIENCE.map((item, i) => (
            <span
              key={item.id}
              ref={(el) => { dotRefs.current[i] = el; }}
              style={{ ...styles.railDot, background: item.color }}
            />
          ))}
        </div>

        <div ref={hintRef} style={styles.hint}>SCROLL TO FALL INTO THE CORE</div>
      </div>
    </section>
  );
}

const mono = "'Courier New', monospace";

const styles = {
  stack: {
    position: "fixed",
    inset: 0,
    zIndex: 6, // above Projects (5) — fades in over its neighbour
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
  eyebrow: { color: ACCENT },
  counter: { color: "rgba(255,255,255,0.55)" },
  // Every panel occupies the same box; only one is visible at a time.
  panelWrap: {
    position: "absolute", left: 0, bottom: 0, width: "min(430px, 86vw)",
    height: "min(340px, 46vh)", margin: "0 0 68px 32px", pointerEvents: "none",
  },
  panel: {
    position: "absolute", left: 0, bottom: 0, width: "100%",
    opacity: 0, visibility: "hidden", willChange: "opacity, transform",
  },
  period: {
    fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,0.5)", marginBottom: 14,
  },
  companyRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 },
  logo: { height: 26, width: "auto", display: "block" },
  monogram: {
    width: 26, height: 26, borderRadius: "50%", display: "grid",
    placeItems: "center", color: "#0a0a0d", fontWeight: 700,
    fontFamily: "Helvetica, Arial, sans-serif", fontSize: 14,
  },
  company: {
    margin: 0, fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600,
    fontSize: "clamp(21px, 2.4vw, 30px)", color: "#fff",
    textShadow: "0 2px 22px rgba(0,0,0,0.8)",
  },
  role: { fontSize: 12.5, letterSpacing: 1, marginBottom: 12 },
  blurb: {
    margin: 0, fontSize: 12.5, lineHeight: 1.75,
    color: "rgba(255,255,255,0.62)", textShadow: "0 1px 16px rgba(0,0,0,0.85)",
  },
  rail: {
    position: "absolute", right: 30, top: "50%", transform: "translateY(-50%)",
    display: "flex", flexDirection: "column", gap: 14,
  },
  railDot: {
    width: 5, height: 5, borderRadius: "50%", display: "block",
    opacity: 0.25, transition: "none",
  },
  hint: {
    position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
    fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.4)",
    whiteSpace: "nowrap", // it wrapped into the role panel on narrow screens
  },
};
