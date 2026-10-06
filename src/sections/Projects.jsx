import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { PROJECTS, ACCENT } from "../data/projects";
import SectionLabel from "../components/SectionLabel";
import { useScrollProgressRef } from "../hooks/useScrollProgress";
import { GROUND } from "../theme";
import { PREVIEWS } from "../components/previews";

/**
 * SPACE FLIGHT GALLERY
 * A scroll-driven 3D project gallery. Cards are scattered through Z-space;
 * scrolling flies the camera forward through them, producing true
 * perspective parallax (near cards move fast across the screen, far
 * cards move slowly). Built with vanilla three.js (r128) inside React.
 *
 * Driven entirely by real document scroll (via useScrollProgressRef) — the
 * same mechanism Hero uses — rather than capturing the wheel and running an
 * independent virtual-scroll state. Two different scroll engines (native vs.
 * a hand-rolled one that preventDefault()s the wheel) can desync from each
 * other, which is what caused the section to visually get stuck partway:
 * the fake scroll state and the browser's real scroll position stop
 * agreeing about where the page is. Reading the same real scrollY that
 * every other section reads means there's only ever one source of truth,
 * and every input method — wheel, trackpad, touch, scrollbar drag, keyboard
 * — works identically for free, on every device, with no extra code.
 */

const CARD_W = 340;
const CARD_H = 212;
const SPACING = 640;
const START_Z = 520;

// Project previews (components/previews): the canvas resolution behind each
// one, and how far ahead of the camera a card can be and still be worth
// repainting — by ~2200 units the fog has swallowed nearly all of it.
const PREVIEW_TEX = 512;
const PREVIEW_RANGE = 2200;
// The card's top share that holds the picture; the title, tag and link sit
// in the band below it. Full-bleed previews fill exactly this area.
const IMAGE_FRACTION = 0.6;

// A phone viewport is both narrower and much taller than a desktop one, so
// the same 55deg vertical FOV shows roughly a quarter of the horizontal
// world width. At full size the cards — and especially their sideways
// scatter — run off both edges long before they're close enough to read.
// Shrinking the card and pulling the scatter toward the centre keeps the
// whole card inside the frame through the readable part of its approach,
// without touching the flight path itself.
const NARROW_QUERY = "(max-width: 700px)";
const NARROW_CARD_SCALE = 0.58;
const NARROW_JITTER_SCALE = 0.42;

// Scroll distance the whole flight plays out over. ~70vh per card gives
// enough room to read each one without dragging.
const SCROLL_LENGTH_VH = PROJECTS.length * 70;

export default function Projects() {
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const stackRef = useRef(null);
  const mountRef = useRef(null);

  const { progressRef, entryRef } = useScrollProgressRef(sectionRef);

  // Breakpoint lives in state (not a ref) because the scene is built once:
  // crossing it rebuilds the cards at the other size. That's rare enough —
  // an orientation change or a desktop window drag — to be worth the rebuild.
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(NARROW_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const [ready, setReady] = useState(false);

  // Whether the render loop should be running at all right now. Building
  // the scene (WebGL renderer, 900 stars, 10 hand-drawn card textures) is
  // deferred until the section is actually near the viewport — doing it
  // unconditionally on mount would run it, and its render loop, at the same
  // time as Hero's own canvas, right when the page is heaviest (first
  // load). After that first build, the same flag keeps pausing/resuming the
  // loop as the section scrolls in and out of range, so it never burns a
  // frame budget it doesn't need to.
  const [everActive, setEverActive] = useState(false);
  const activeRef = useRef(false);
  const rafIdRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => {
    // Observe the section, never the stack: the stack is position:fixed, so
    // it always intersects the viewport no matter where the page is
    // scrolled, and observing it would defeat the deferral entirely.
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

    // Card size is baked into the geometry rather than mesh.scale, because
    // the render loop rewrites mesh.scale every frame for the hover pulse.
    const cardScale = narrow ? NARROW_CARD_SCALE : 1;
    const jitterScale = narrow ? NARROW_JITTER_SCALE : 1;
    const cardW = CARD_W * cardScale;
    const cardH = CARD_H * cardScale;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // -------------------------------------------------------------
    // Scene / camera / renderer
    // -------------------------------------------------------------
    // No scene background: the canvas is transparent so the shared ground
    // (.space-ground on the stack) shows through, identical to the hero's
    // black — which is what keeps the handoff between them invisible.
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(GROUND, 0.00075);

    const camera = new THREE.PerspectiveCamera(55, width / height, 1, 12000);
    camera.position.set(0, 0, START_Z);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // -------------------------------------------------------------
    // Starfield / dust particles
    // -------------------------------------------------------------
    const STAR_COUNT = 900;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starCol = new Float32Array(STAR_COUNT * 3);
    const lastCardZ = -(PROJECTS.length - 1) * SPACING - 200;
    const white = new THREE.Color(0xffffff);
    const gray = new THREE.Color(0x8a8a90);
    const red = new THREE.Color(ACCENT);
    for (let i = 0; i < STAR_COUNT; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 2600;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 1600;
      starPos[i * 3 + 2] = Math.random() * (START_Z - lastCardZ + 1500) + (lastCardZ - 800);
      const r = Math.random();
      const c = r < 0.06 ? red : r < 0.4 ? gray : white;
      starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 2.6, vertexColors: true, transparent: true, opacity: 0.75,
      sizeAttenuation: true, depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // a handful of bigger floating "debris" squares for depth cueing
    const DEBRIS_COUNT = 26;
    const debrisGroup = new THREE.Group();
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const size = 4 + Math.random() * 10;
      const geo = new THREE.PlaneGeometry(size, size);
      const col = [0xffffff, 0xff3b30, 0x5a1614, 0x9a9aa0][Math.floor(Math.random() * 4)];
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 + Math.random() * 0.4, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 2200,
        (Math.random() - 0.5) * 1300,
        Math.random() * (START_Z - lastCardZ) + (lastCardZ - 400)
      );
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      debrisGroup.add(mesh);
    }
    scene.add(debrisGroup);

    // -------------------------------------------------------------
    // Card texture generator
    // -------------------------------------------------------------
    function makeCardTexture(project) {
      const w = 1024, h = Math.round((1024 * CARD_H) / CARD_W);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");

      // Panel fades to pure black at the edges instead of a flat fill +
      // hard border — so the card has no visible edge and reads as a denser
      // patch of the same black space behind it, not a pasted-on rectangle.
      const pad = 22;
      const imgH = h * IMAGE_FRACTION;
      const vignette = ctx.createRadialGradient(
        w / 2, imgH * 0.5, 0,
        w / 2, imgH * 0.5, Math.max(w, imgH) * 0.62
      );
      vignette.addColorStop(0, "#070708");
      vignette.addColorStop(0.55, "#020202");
      vignette.addColorStop(1, "#000000");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      // top meta row
      ctx.font = "26px 'Courier New', monospace";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.textAlign = "left";
      ctx.fillText(`${project.id} — ${project.year}`, pad + 14, pad + 38);

      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(w - pad - 22, pad + 28, 9, 0, Math.PI * 2);
      ctx.fill();

      // title
      ctx.font = "600 46px Helvetica, Arial, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(project.title, pad + 14, imgH + 62);

      // tag + link
      ctx.font = "20px 'Courier New', monospace";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(project.tag, pad + 14, imgH + 100);

      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const label = "VIEW CASE STUDY ›";
      const labelRight = w - pad - 14;
      const labelW = ctx.measureText(label).width;
      ctx.fillText(label, labelRight, imgH + 100);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      // Where the label sits, in the card's UV space (v runs bottom to top),
      // padded to a comfortable target: a click inside it opens the case
      // study, anywhere else on the card opens the live project.
      const padX = 18, padY = 22;
      tex.userData.caseZone = {
        u0: (labelRight - labelW - padX) / w, u1: (labelRight + padX) / w,
        v0: 1 - (imgH + 100 + padY) / h, v1: 1 - (imgH + 100 - 20 - padY) / h,
        // The underline that answers hovering it: under the text, its width.
        x: (labelRight - labelW / 2) / w, y: 1 - (imgH + 108) / h, width: labelW / w,
      };
      return tex;
    }

    // -------------------------------------------------------------
    // Focus frame: a hairline of light around the hovered card, with a
    // soft glare travelling round it. Not the accent red, which is kept for
    // small markers — this is closer to light catching a glass edge, white
    // with a cool tint from About's palette. One shader on a plane slightly
    // larger than the card: everything but the edge and its faint outer
    // glow is fully transparent, and it's additive, so it only ever adds
    // light to whatever is behind it.
    // -------------------------------------------------------------
    const FRAME_MARGIN = 10;
    function makeFocusFrame() {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uHalf: { value: new THREE.Vector2(cardW / 2, cardH / 2) },
          uLine: { value: 0.9 * (narrow ? 0.8 : 1) },
        },
        vertexShader: `
          varying vec2 vPos;
          void main() {
            vPos = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uOpacity;
          uniform vec2 uHalf;
          uniform float uLine;
          varying vec2 vPos;

          void main() {
            // Distance to the card's edge (negative inside, positive out).
            vec2 q = abs(vPos) - uHalf;
            float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);

            // A crisp hairline on the edge, antialiased by screen-space size.
            float aa = fwidth(d);
            float line = 1.0 - smoothstep(uLine * 0.5, uLine * 0.5 + aa, abs(d));
            // A faint bloom just outside it.
            float glow = exp(-max(d, 0.0) / 3.5) * step(0.0, d);

            // Position round the edge, 0..1, measured on the card squashed
            // to a square so the glare keeps one pace along long and short
            // sides alike.
            float a = atan(vPos.y / uHalf.y, vPos.x / uHalf.x) / 6.2831853 + 0.5;
            // Two glints, one strong and one faint opposite it, gliding
            // round once every ~9 seconds.
            float g1 = pow(0.5 + 0.5 * cos(6.2831853 * (a - uTime * 0.11)), 14.0);
            float g2 = pow(0.5 + 0.5 * cos(6.2831853 * (a + 0.5 - uTime * 0.11)), 22.0) * 0.45;
            float glare = g1 + g2;

            // Colour drifts slowly round the edge: white through ice blue
            // to a little lilac, never warm.
            vec3 ice = vec3(0.74, 0.84, 1.0);
            vec3 lilac = vec3(0.82, 0.78, 1.0);
            vec3 tint = mix(ice, lilac, 0.5 + 0.5 * sin(6.2831853 * a * 2.0 + uTime * 0.4));
            vec3 col = mix(tint, vec3(1.0), glare * 0.7);

            float alpha = line * (0.16 + 0.84 * glare) + glow * glare * 0.35;
            gl_FragColor = vec4(col * alpha * uOpacity, 1.0);
          }
        `,
      });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(cardW + FRAME_MARGIN * 2, cardH + FRAME_MARGIN * 2),
        mat
      );
      mesh.position.z = 0.6;
      // After the cards and their previews, so nothing paints over it.
      mesh.renderOrder = 2;
      return mesh;
    }

    // -------------------------------------------------------------
    // Placeholder art: a very basic pixel-art cat/dog, 2-frame walk cycle.
    // Drawn as blocky fillRect cells (not an image asset) onto a tiny
    // canvas, then applied with nearest-neighbor filtering so it stays
    // chunky/pixelated at any scale instead of blurring.
    // -------------------------------------------------------------
    const PET_COLS = 9, PET_ROWS = 7;
    function petCells(species, frame) {
      const cat = species === "cat";
      const body = cat
        ? [[1,1],[6,1],
           [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
           [1,3],[2,3],[3,3],[4,3],[5,3],[6,3],
           [2,4],[3,4],[4,4],[5,4]]
        : [[0,2],[1,1],
           [1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],
           [1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],
           [2,4],[3,4],[4,4],[5,4],[6,4]];
      const eyes = cat ? [[2,2],[5,2]] : [[2,2],[6,2]];
      const tail = frame === 0
        ? (cat ? [[7,2]] : [[8,3]])
        : (cat ? [[7,1]] : [[8,2]]);
      const legsA = cat ? [[1,5],[3,5],[5,5]] : [[1,5],[3,5],[5,5],[7,5]];
      const legsB = cat ? [[2,5],[4,5],[6,5]] : [[2,5],[4,5],[6,5],[8,5]];
      return { body, eyes, tail, legs: frame === 0 ? legsA : legsB };
    }
    function drawPet(ctx, species, frame, w, h) {
      ctx.clearRect(0, 0, w, h);
      const unit = Math.floor(w / PET_COLS);
      const offX = (w - unit * PET_COLS) / 2;
      const offY = (h - unit * PET_ROWS) / 2;
      const { body, eyes, tail, legs } = petCells(species, frame);
      ctx.fillStyle = "#e9e4d8";
      [...body, ...tail, ...legs].forEach(([x, y]) => {
        ctx.fillRect(offX + x * unit, offY + y * unit, unit, unit);
      });
      ctx.fillStyle = ACCENT;
      eyes.forEach(([x, y]) => {
        ctx.fillRect(offX + x * unit, offY + y * unit, unit, unit);
      });
    }

    // -------------------------------------------------------------
    // Cards
    // -------------------------------------------------------------
    const cardGroup = new THREE.Group();
    const cardMeshes = [];
    const rand = (seed) => { // simple deterministic pseudo-random
      const x = Math.sin(seed * 999.13) * 43758.5453;
      return x - Math.floor(x);
    };

    PROJECTS.forEach((project, i) => {
      const geo = new THREE.PlaneGeometry(cardW, cardH);
      const tex = makeCardTexture(project);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);

      const side = i % 2 === 0 ? 1 : -1;
      const jitterX = side * (90 + rand(i + 1) * 190) * jitterScale;
      const jitterY = (rand(i + 7) - 0.5) * 220 * jitterScale;
      mesh.position.set(jitterX, jitterY, -i * SPACING - 200);
      mesh.rotation.set(
        (rand(i + 3) - 0.5) * 0.16,
        (rand(i + 5) - 0.5) * 0.4,
        (rand(i + 11) - 0.5) * 0.14
      );
      mesh.userData = { project, baseScale: 1, hovered: false, caseZone: tex.userData.caseZone };

      const frame = makeFocusFrame();
      mesh.add(frame);
      mesh.userData.frame = frame;

      const zone = tex.userData.caseZone;
      const underline = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.width * cardW, 1.2 * cardScale),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
      );
      underline.position.set((zone.x - 0.5) * cardW, (zone.y - 0.5) * cardH, 0.5);
      underline.renderOrder = 2;
      mesh.add(underline);
      mesh.userData.underline = underline;

      // A real project brings its own small animation into the image area
      // (see components/previews), which says how big it is and where it sits.
      const makePreview = PREVIEWS[project.preview];
      if (makePreview) {
        const preview = makePreview(PREVIEW_TEX);
        const { video } = preview;
        let tex;
        if (video) {
          // Reduced motion never plays the clip; it holds on a settled frame.
          if (reducedMotion) {
            video.addEventListener("loadeddata", () => { video.currentTime = preview.still; }, { once: true });
          }
          tex = new THREE.VideoTexture(video);
        } else {
          preview.draw(0);
          tex = new THREE.CanvasTexture(preview.canvas);
        }
        // Both are in the project's real colours; without this, three
        // treats them as linear and washes them out.
        tex.colorSpace = THREE.SRGBColorSpace;
        if (preview.pixelated) tex.magFilter = THREE.NearestFilter;
        const mat = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false,
          blending: preview.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        let pw, ph, py;
        if (preview.fill) {
          // Full bleed: the card's whole image area, edge to edge from the
          // top, stopping where the title band begins.
          pw = cardW;
          ph = cardH * IMAGE_FRACTION;
          py = cardH / 2 - ph / 2;
          // Crop like object-fit: cover — fill the width and trim the
          // height (or the reverse), keeping `focusY` of the clip in view
          // (0 its top, 1 its bottom).
          const areaAspect = pw / ph;
          if (areaAspect > preview.aspect) {
            tex.repeat.set(1, preview.aspect / areaAspect);
            tex.offset.set(0, (1 - tex.repeat.y) * (1 - preview.focusY));
          } else {
            tex.repeat.set(areaAspect / preview.aspect, 1);
            tex.offset.set((1 - tex.repeat.x) / 2, 0);
          }
        } else {
          pw = (preview.width ?? preview.size) * cardScale;
          ph = (preview.height ?? preview.size) * cardScale;
          py = preview.y * cardScale;
        }
        const previewMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
        previewMesh.position.set(0, py, 0.5);
        // Card and preview are both transparent, so three sorts them by
        // distance and, half a unit apart, the card can win and paint over
        // it. Drawing previews after all cards fixes the order; the depth
        // test still hides one behind any nearer card.
        previewMesh.renderOrder = 1;
        mesh.add(previewMesh);
        mesh.userData.preview = { draw: preview.draw, video, tex, mat, geo: previewMesh.geometry };
      } else {
        // pixel-pet overlay, sitting where the old placeholder image was
        const species = i % 2 === 0 ? "cat" : "dog";
        const petCanvas = document.createElement("canvas");
        petCanvas.width = 96; petCanvas.height = 72;
        const petCtx = petCanvas.getContext("2d");
        drawPet(petCtx, species, 0, petCanvas.width, petCanvas.height);
        const petTex = new THREE.CanvasTexture(petCanvas);
        petTex.magFilter = THREE.NearestFilter;
        petTex.minFilter = THREE.NearestFilter;
        // Same ordering fix as the previews above: without it the pet can
        // draw before its card and, writing depth, punch a black box in it.
        const petMat = new THREE.MeshBasicMaterial({ map: petTex, transparent: true, depthWrite: false });
        const petMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(120 * cardScale, 90 * cardScale),
          petMat
        );
        petMesh.position.set(0, 38 * cardScale, 0.5);
        petMesh.renderOrder = 1;
        mesh.add(petMesh);
        mesh.userData.pet = { species, frame: 0, ctx: petCtx, tex: petTex, w: petCanvas.width, h: petCanvas.height, mat: petMat, geo: petMesh.geometry };
      }

      cardGroup.add(mesh);
      cardMeshes.push(mesh);
    });
    scene.add(cardGroup);

    // -------------------------------------------------------------
    // Flight distance — mapped directly from real scroll progress, not
    // accumulated wheel deltas, so it can never drift out of sync with
    // where the browser actually thinks the page is scrolled to.
    //
    // The flight deliberately ends on open space rather than a wall: this
    // section hands straight over to Experience, so anything sitting at the
    // end reads as a dead end in the middle of one continuous journey.
    // -------------------------------------------------------------
    const maxScroll = START_Z - (lastCardZ - 280);
    const state = { currentZ: START_Z, mouseX: 0, mouseY: 0, camX: 0, camY: 0 };

    const onMouseMove = (e) => {
      const rect = mount.getBoundingClientRect();
      state.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      state.mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };
    mount.addEventListener("mousemove", onMouseMove);

    // -------------------------------------------------------------
    // Hover raycasting
    // -------------------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const mouseVec = new THREE.Vector2();
    let hoveredMesh = null;
    let hoveringCase = false;

    // Which card is under a point (in -1..1 screen coords), and whether the
    // point is on its VIEW CASE STUDY label.
    const pick = (x, y) => {
      mouseVec.set(x, y);
      raycaster.setFromCamera(mouseVec, camera);
      const hit = raycaster.intersectObjects(cardMeshes, false)[0];
      if (!hit) return { mesh: null, onCase: false };
      const z = hit.object.userData.caseZone;
      const { x: u, y: v } = hit.uv;
      return { mesh: hit.object, onCase: u >= z.u0 && u <= z.u1 && v >= z.v0 && v <= z.v1 };
    };

    // The card opens the live project; only its VIEW CASE STUDY label opens
    // the case study. Placeholders have no live link, so the whole card
    // leads to the case study. The pick is redone from the click itself
    // rather than trusting the last hover, because a tap on a phone arrives
    // without a mousemove before it.
    const onClick = (e) => {
      const rect = mount.getBoundingClientRect();
      const { mesh, onCase } = pick(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      );
      if (!mesh) return;
      mesh.userData.pulse = 1;
      const { project } = mesh.userData;
      const live = project.links?.find((l) => l.label === "LIVE SITE")?.href;
      if (live && !onCase) window.open(live, "_blank", "noopener,noreferrer");
      else navigate(`/work/${project.slug}`);
    };
    mount.addEventListener("click", onClick);

    // -------------------------------------------------------------
    // Resize
    // -------------------------------------------------------------
    const onResize = () => {
      width = mount.clientWidth; height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", onResize);

    // -------------------------------------------------------------
    // Animation loop — pauses itself whenever the IntersectionObserver
    // above says this section isn't near the viewport, and is restarted by
    // that same observer. So it only ever runs while it could plausibly be
    // on screen, on top of the one-time deferred start.
    // -------------------------------------------------------------
    const clock = new THREE.Clock();

    const tick = () => {
      if (!activeRef.current) {
        rafIdRef.current = null;
        // The loop is what pauses clips that leave range, so a clip still
        // playing when the loop itself stops would decode off screen for
        // good. The range check in the loop restarts it on the way back.
        cardMeshes.forEach((m) => m.userData.preview?.video?.pause());
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);

      const targetZ = START_Z - progressRef.current * maxScroll;

      // ease camera toward the real-scroll-derived position
      state.currentZ += (targetZ - state.currentZ) * Math.min(1, dt * 8);

      // mouse parallax offset
      state.camX += (state.mouseX * 26 - state.camX) * Math.min(1, dt * 3);
      state.camY += (-state.mouseY * 16 - state.camY) * Math.min(1, dt * 3);

      camera.position.z = state.currentZ;
      camera.position.x = state.camX;
      camera.position.y = state.camY;
      camera.lookAt(state.camX * 0.5, state.camY * 0.5, state.currentZ - 400);

      // gentle debris drift
      debrisGroup.children.forEach((d, i) => {
        d.rotation.z += dt * 0.15 * (i % 2 === 0 ? 1 : -1);
      });

      // raycast for hover
      const { mesh: newHovered, onCase } = pick(state.mouseX, -state.mouseY);
      hoveringCase = onCase;

      if (newHovered !== hoveredMesh) {
        if (hoveredMesh) hoveredMesh.userData.hovered = false;
        hoveredMesh = newHovered;
        if (hoveredMesh) {
          hoveredMesh.userData.hovered = true;
          mount.style.cursor = "pointer";
        } else {
          mount.style.cursor = "default";
        }
      }

      // card hover/pulse scale animation
      cardMeshes.forEach((m) => {
        let target = m.userData.hovered ? 1.06 : 1;
        if (m.userData.pulse) {
          target += Math.sin(m.userData.pulse * Math.PI) * 0.12;
          m.userData.pulse += dt * 3;
          if (m.userData.pulse > 1) m.userData.pulse = 0;
        }
        m.userData.baseScale += (target - m.userData.baseScale) * Math.min(1, dt * 8);
        m.scale.setScalar(m.userData.baseScale);
        m.material.opacity = m.userData.hovered ? 1 : 0.96;
      });
      // The focus frame fades in on the hovered card while its glare keeps
      // travelling; with reduced motion the glare holds still. The case
      // study label gets its underline only while it's the thing pointed at.
      cardMeshes.forEach((m) => {
        const u = m.userData.frame.material.uniforms;
        u.uOpacity.value += ((m.userData.hovered ? 1 : 0) - u.uOpacity.value) * Math.min(1, dt * 6);
        u.uTime.value = reducedMotion ? 1.5 : state.elapsed || 0;
        const line = m.userData.underline.material;
        line.opacity += ((m.userData.hovered && hoveringCase ? 0.85 : 0) - line.opacity) * Math.min(1, dt * 12);
      });

      // pixel-pet walk cycle — toggles all sprites together every ~350ms,
      // redrawing the tiny (96x72) canvases rather than doing it per-frame
      stars.rotation.z += dt * 0.002;
      state.petTimer = (state.petTimer || 0) + dt;
      if (state.petTimer > 0.35) {
        state.petTimer = 0;
        cardMeshes.forEach((m) => {
          const pet = m.userData.pet;
          if (!pet) return;
          pet.frame = pet.frame === 0 ? 1 : 0;
          drawPet(pet.ctx, pet.species, pet.frame, pet.w, pet.h);
          pet.tex.needsUpdate = true;
        });
      }

      // Project previews run only while their card is ahead of the camera
      // and near enough to see through the fog; past that they hold their
      // last frame, so ten cards of previews cost what one does. Drawn ones
      // repaint at ~30fps — plenty for a slow turn — and videos play/pause
      // on the same range, so no clip decodes off screen. Reduced motion
      // keeps the still frame set at build time.
      state.elapsed = (state.elapsed || 0) + dt;
      state.previewTimer = (state.previewTimer || 0) + dt;
      if (!reducedMotion && state.previewTimer > 1 / 30) {
        state.previewTimer = 0;
        cardMeshes.forEach((m) => {
          const preview = m.userData.preview;
          if (!preview) return;
          const ahead = state.currentZ - m.position.z;
          const inRange = ahead > -60 && ahead < PREVIEW_RANGE;
          if (preview.video) {
            // play() rejects if the browser refuses; the card then just
            // shows the clip's first frame, which is fine.
            if (inRange && preview.video.paused) preview.video.play().catch(() => {});
            else if (!inRange && !preview.video.paused) preview.video.pause();
            return;
          }
          if (!inRange) return;
          preview.draw(state.elapsed);
          preview.tex.needsUpdate = true;
        });
      }

      // Fades in over Hero (two different worlds — the sky and this), but
      // deliberately does NOT fade out at the end. Experience is the same
      // black space with the same starfield, and it sits above this one, so
      // it simply covers this: crossfading two identical backgrounds is what
      // makes a continuous stretch of space read as two separate scenes.
      const stackOpacity = entryRef.current;
      if (stackRef.current) {
        stackRef.current.style.opacity = stackOpacity;
        stackRef.current.style.pointerEvents = stackOpacity > 0.01 ? "auto" : "none";
      }

      renderer.render(scene, camera);
    };
    tickRef.current = tick;
    if (activeRef.current && rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(tick);
    }
    setReady(true);

    // -------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      tickRef.current = null;
      window.removeEventListener("resize", onResize);
      mount.removeEventListener("mousemove", onMouseMove);
      mount.removeEventListener("click", onClick);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      cardMeshes.forEach((m) => {
        m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose();
        for (const extra of [m.userData.frame, m.userData.underline]) {
          extra.geometry.dispose(); extra.material.dispose();
        }
        const pet = m.userData.pet;
        if (pet) { pet.geo.dispose(); pet.mat.dispose(); pet.tex.dispose(); }
        const preview = m.userData.preview;
        if (preview) {
          preview.geo.dispose(); preview.mat.dispose(); preview.tex.dispose();
          // Dropping the source is what actually releases the decoder.
          if (preview.video) { preview.video.pause(); preview.video.removeAttribute("src"); preview.video.load(); }
        }
      });
      starGeo.dispose(); starMat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everActive, narrow]);

  return (
    // The -100vh margin is load-bearing, not cosmetic. A pinned section's
    // progress reaches 1 one viewport before its box ends (its travel is
    // height - viewport), so Hero releases one full viewport before its
    // section is actually over. Without this pull-up, that leaves a
    // viewport-tall gap between Hero releasing and this section arriving,
    // where the bare page background shows through — which is exactly the
    // "stuck half-way, blank slab on screen" symptom. Starting one viewport
    // early lines this section's entry up precisely with Hero's release.
    // Any pinned section added after this one needs the same treatment.
    <section
      ref={sectionRef}
      style={{ position: "relative", height: `${SCROLL_LENGTH_VH}vh`, marginTop: "-100vh" }}
    >
      <div ref={stackRef} className="space-ground" style={styles.stack}>
        <div ref={mountRef} style={styles.canvasMount} />

        <div className="section-top">
          <SectionLabel>Projects</SectionLabel>
        </div>

        {!ready && <div style={styles.loading}>INITIALIZING FLIGHT…</div>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const mono = "'Courier New', monospace";

const styles = {
  stack: {
    position: "fixed",
    inset: 0,
    // Above every Hero layer (which top out at 4), so this fades in over
    // Hero rather than the page background showing through the seam.
    zIndex: 5,
    overflow: "hidden",
    fontFamily: mono,
    color: "#fff",
    userSelect: "none",
    opacity: 0,
    pointerEvents: "none",
  },
  // pan-y, never none: this div covers the whole viewport, and `none` tells
  // the browser not to scroll at all when a finger starts here — which makes
  // the page completely unscrollable by touch from this section onward.
  // pan-y still blocks pinch-zoom and horizontal drags on the 3D scene.
  canvasMount: { position: "absolute", inset: 0, touchAction: "pan-y" },
  loading: {
    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, letterSpacing: 2, color: "rgba(255,255,255,0.4)", pointerEvents: "none",
  },
};
