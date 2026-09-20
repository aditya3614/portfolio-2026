import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { PROJECTS, ACCENT } from "../data/projects";
import { useScrollProgressRef } from "../hooks/useScrollProgress";
import { GROUND } from "../theme";

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

// Scroll distance the whole flight plays out over. ~70vh per card gives
// enough room to read each one without dragging.
const SCROLL_LENGTH_VH = PROJECTS.length * 70;

export default function Projects() {
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const stackRef = useRef(null);
  const mountRef = useRef(null);
  const hudRefs = {
    vel: useRef(null),
    z: useRef(null),
    scrl: useRef(null),
    scrlBar: useRef(null),
  };
  const hoverLinkRef = useRef(null);

  const { progressRef, entryRef } = useScrollProgressRef(sectionRef);

  const [hoveredTitle, setHoveredTitle] = useState(null);
  const [hoveredSlug, setHoveredSlug] = useState(null);
  const [soundOn, setSoundOn] = useState(false);
  const [ready, setReady] = useState(false);

  // audio (procedural, no external asset)
  const audioRef = useRef({ ctx: null, gain: null, osc: null });
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      const a = audioRef.current;
      if (next && !a.ctx) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = 60;
          gain.gain.value = 0;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          audioRef.current = { ctx, gain, osc };
        } catch (e) {
          // audio unsupported — HUD toggle still works visually
        }
      } else if (a.ctx) {
        a.ctx.resume?.();
      }
      if (!next && audioRef.current.gain) {
        audioRef.current.gain.gain.value = 0;
      }
      return next;
    });
  }, []);

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

    // -------------------------------------------------------------
    // Scene / camera / renderer
    // -------------------------------------------------------------
    // No scene background: the canvas is transparent so the shared grid
    // ground (.space-ground on the stack) shows through, identical to the
    // hero's — which is what keeps the handoff between them invisible.
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
      const imgH = h * 0.6;
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
      ctx.fillText("VIEW CASE STUDY ›", w - pad - 14, imgH + 100);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
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
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
      const tex = makeCardTexture(project);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);

      const side = i % 2 === 0 ? 1 : -1;
      const jitterX = side * (90 + rand(i + 1) * 190);
      const jitterY = (rand(i + 7) - 0.5) * 220;
      mesh.position.set(jitterX, jitterY, -i * SPACING - 200);
      mesh.rotation.set(
        (rand(i + 3) - 0.5) * 0.16,
        (rand(i + 5) - 0.5) * 0.4,
        (rand(i + 11) - 0.5) * 0.14
      );
      mesh.userData = { project, baseScale: 1, hovered: false };

      // pixel-pet overlay, sitting where the old placeholder image was
      const species = i % 2 === 0 ? "cat" : "dog";
      const petCanvas = document.createElement("canvas");
      petCanvas.width = 96; petCanvas.height = 72;
      const petCtx = petCanvas.getContext("2d");
      drawPet(petCtx, species, 0, petCanvas.width, petCanvas.height);
      const petTex = new THREE.CanvasTexture(petCanvas);
      petTex.magFilter = THREE.NearestFilter;
      petTex.minFilter = THREE.NearestFilter;
      const petMat = new THREE.MeshBasicMaterial({ map: petTex, transparent: true });
      const petMesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), petMat);
      petMesh.position.set(0, 38, 0.5);
      mesh.add(petMesh);
      mesh.userData.pet = { species, frame: 0, ctx: petCtx, tex: petTex, w: petCanvas.width, h: petCanvas.height, mat: petMat, geo: petMesh.geometry };

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
    const state = { currentZ: START_Z, velocity: 0, mouseX: 0, mouseY: 0, camX: 0, camY: 0 };

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

    const onClick = () => {
      if (hoveredMesh) {
        hoveredMesh.userData.pulse = 1;
        navigate(`/work/${hoveredMesh.userData.project.slug}`);
      }
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
      if (!activeRef.current) { rafIdRef.current = null; return; }
      rafIdRef.current = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);

      const targetZ = START_Z - progressRef.current * maxScroll;

      // ease camera toward the real-scroll-derived position
      const prevZ = state.currentZ;
      state.currentZ += (targetZ - state.currentZ) * Math.min(1, dt * 8);
      state.velocity = Math.abs(state.currentZ - prevZ) / Math.max(dt, 0.0001) * 0.06;

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
      mouseVec.set(state.mouseX, -state.mouseY);
      raycaster.setFromCamera(mouseVec, camera);
      const hits = raycaster.intersectObjects(cardMeshes);
      const newHovered = hits.length > 0 ? hits[0].object : null;

      if (newHovered !== hoveredMesh) {
        if (hoveredMesh) hoveredMesh.userData.hovered = false;
        hoveredMesh = newHovered;
        if (hoveredMesh) {
          hoveredMesh.userData.hovered = true;
          setHoveredTitle(hoveredMesh.userData.project.title);
          setHoveredSlug(hoveredMesh.userData.project.slug);
          mount.style.cursor = "pointer";
        } else {
          setHoveredTitle(null);
          setHoveredSlug(null);
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
      // outline emulation: tint hovered card border via a thin red frame overlay
      cardMeshes.forEach((m) => {
        if (!m.userData.frame) {
          const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(CARD_W + 4, CARD_H + 4));
          const frameMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 });
          const frame = new THREE.LineSegments(frameGeo, frameMat);
          m.add(frame);
          m.userData.frame = frame;
        }
        m.userData.frame.material.opacity += ((m.userData.hovered ? 0.9 : 0) - m.userData.frame.material.opacity) * 0.2;
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

      // audio feedback
      if (soundOnRef.current && audioRef.current.gain) {
        const g = Math.min(0.05, state.velocity * 0.0015);
        audioRef.current.gain.gain.value += (g - audioRef.current.gain.gain.value) * 0.1;
        audioRef.current.osc.frequency.value = 50 + state.velocity * 1.5;
      } else if (audioRef.current.gain) {
        audioRef.current.gain.gain.value *= 0.9;
      }

      // Fades in over Hero (two different worlds — the sky and this), but
      // deliberately does NOT fade out at the end. Experience is the same
      // black space with the same starfield, and it sits above this one, so
      // it simply covers this: crossfading two identical backgrounds is what
      // makes a continuous stretch of space read as two separate scenes.
      const p = progressRef.current;
      const stackOpacity = entryRef.current;
      if (stackRef.current) {
        stackRef.current.style.opacity = stackOpacity;
        stackRef.current.style.pointerEvents = stackOpacity > 0.01 ? "auto" : "none";
      }

      // HUD text (direct DOM writes — avoids per-frame React re-render)
      if (hudRefs.vel.current) hudRefs.vel.current.textContent = state.velocity.toFixed(2);
      if (hudRefs.z.current) hudRefs.z.current.textContent = Math.round(Math.abs(state.currentZ - START_Z));
      if (hudRefs.scrl.current) hudRefs.scrl.current.textContent = Math.round(p * 100) + "%";
      if (hudRefs.scrlBar.current) hudRefs.scrlBar.current.style.width = (p * 100) + "%";

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
        const pet = m.userData.pet;
        if (pet) { pet.geo.dispose(); pet.mat.dispose(); pet.tex.dispose(); }
      });
      starGeo.dispose(); starMat.dispose();
      if (audioRef.current.ctx) audioRef.current.ctx.close?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everActive]);

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

        {/* bottom bar */}
        <div style={styles.bottomBar}>
          <div ref={hoverLinkRef} style={styles.hoverLink}>
            {hoveredTitle ? `/work/${hoveredSlug}` : ""}
          </div>
          <div style={styles.bottomCenter}>
            <span>VEL <b ref={hudRefs.vel} style={styles.hudNum}>0.00</b></span>
            <span style={styles.dot}>·</span>
            <span>Z <b ref={hudRefs.z} style={styles.hudNum}>0</b></span>
            <span style={styles.dot}>·</span>
            <span>{PROJECTS.length} PROJECTS — SCROLL TO FLY</span>
          </div>
          <div style={styles.bottomRight}>
            <span onClick={toggleSound} style={styles.sndToggle}>
              SND [{soundOn ? "ON" : "OFF"}]
            </span>
            <span style={styles.scrlWrap}>
              <span style={styles.scrlBarTrack}>
                <span ref={hudRefs.scrlBar} style={styles.scrlBarFill} />
              </span>
              SCRL <b ref={hudRefs.scrl} style={styles.hudNum}>000%</b>
            </span>
          </div>
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
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "16px 24px", fontSize: 11, letterSpacing: 0.5,
    borderTop: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)",
  },
  hoverLink: { minWidth: 160, color: ACCENT, fontSize: 11 },
  bottomCenter: { display: "flex", alignItems: "center", gap: 10 },
  dot: { opacity: 0.3 },
  hudNum: { color: "#fff", fontWeight: 700 },
  bottomRight: { display: "flex", alignItems: "center", gap: 18 },
  sndToggle: { cursor: "pointer", color: "rgba(255,255,255,0.7)" },
  scrlWrap: { display: "flex", alignItems: "center", gap: 8 },
  scrlBarTrack: { width: 60, height: 4, background: "rgba(255,255,255,0.15)", position: "relative", overflow: "hidden" },
  scrlBarFill: { position: "absolute", left: 0, top: 0, bottom: 0, width: "0%", background: ACCENT },
};
