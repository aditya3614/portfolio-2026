import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ABOUT, PHOTOS } from "../data/about";
import { ACCENT, GROUND } from "../theme";
import { useScrollProgressRef } from "../hooks/useScrollProgress";

/**
 * ABOUT — a planet whose crust is photographs.
 *
 * Scrolling pulls every photo in from deep space and lands it on its own
 * patch of a sphere, one wave after another, until the tiles close over
 * each other and the thing stops reading as a swarm and starts reading as
 * a world. Then it just turns.
 *
 * What makes it a planet rather than the usual cloud-of-billboards version
 * of this effect, in rough order of how much each one matters:
 *
 *  1. Tiles lie ON the surface — each one is oriented by its own surface
 *     normal and curved to the sphere (see makeTileGeometry), instead of
 *     facing the camera. Billboards always betray themselves the moment
 *     the group turns: every card pivots to follow you, so the sphere
 *     shears instead of rotating.
 *  2. There's a solid body underneath. Backface culling plus an opaque
 *     core means the far side is genuinely hidden — you see a lit ball,
 *     not a translucent lantern with cards floating inside it.
 *  3. One directional sun, no fill. The terminator is the whole illusion;
 *     a uniformly lit sphere flattens into a disc (same note as Experience).
 *     Tiles are MeshStandard, so they take that light like real terrain.
 *  4. A fresnel atmosphere that's brightest on the sunward limb, so the
 *     edge glows off-centre rather than as an even halo ring.
 *
 * Driven by real document scroll through useScrollProgressRef — the single
 * timeline every section on this page reads. See Projects.jsx for why
 * nothing here touches the wheel.
 */

const SCROLL_LENGTH_VH = 440;

const RADIUS = 2.25;
const TILE_LIFT = 1.004; // tiles float a hair off the core so they never z-fight
const TILE_ASPECT = 0.8; // portrait, like a photo print

// The section runs in three acts, and these are the beats between them:
//
//   0             -> ASSEMBLY_END   tiles fly in and close into a planet
//   ASSEMBLY_END  -> EXPLODE_START  it just turns, whole, and is looked at
//   EXPLODE_START -> 1              it bursts, and the words are what's left
//
// The middle act is not dead space. Going straight from the last tile
// landing to the blast gives the viewer nothing to lose — the planet has to
// exist as a finished object for a beat before it's worth destroying.
const ASSEMBLY_END = 0.4;
const TILE_FLIGHT = 0.22; // each tile's own share of that window
const EXPLODE_START = 0.6;
const SMOOTHING = 6;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
// Steeper ease-out than smoothstep: tiles arrive fast and settle slowly,
// which is what makes them feel caught by gravity rather than parked.
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
// Barely eased on purpose. A real detonation is all over in its first
// instants, and that's what a time-based one should do — but this one is
// driven by the scroll wheel, where the viewer owns the clock. Front-load
// it and the entire explosion is spent in the first few degrees of a
// scroll that then has nothing left to show for the rest of its travel.
// Just enough curve to give the launch a kick, then honest continuous
// motion the whole way down.
const easeBlast = (t) => Math.pow(t, 0.85);

// Deterministic per-tile noise — the layout must be identical on every
// reload, or the planet reshuffles itself each time the page is opened.
function hash(i, seed) {
  const n = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Fibonacci lattice. Evenly spaces N points over a sphere with no clustering
 * at the poles — the failure mode of the obvious lat/long grid, where tiles
 * pile up top and bottom and leave the equator bare.
 */
function fibonacciDirection(i, n) {
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);
}

/**
 * A curved patch rather than a flat card. Each plane vertex is pushed out
 * onto the sphere of radius R, then pulled back to the origin so the mesh
 * can be positioned and rotated normally. Flat tiles on a sphere this size
 * leave visible facets — the silhouette comes out as a polygon and the
 * seams between neighbours gap open as they tilt away from each other.
 */
function makeTileGeometry(w, h, R) {
  const geo = new THREE.PlaneGeometry(w, h, 6, 6);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), R).setLength(R);
    pos.setXYZ(i, v.x, v.y, v.z - R);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generated stand-in for a real photograph. Deliberately not a flat grey
 * box: the globe's texture at a distance comes from tiles differing in
 * tone, so uniform placeholders would hide exactly the quality being built
 * here. Each one gets its own hue, vignette and grain, plus a soft figure
 * so the tiles read as portraits at a glance.
 */
function makePlaceholderTexture(index, caption) {
  const w = 256;
  const h = Math.round(w / TILE_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Warm sand through to cold slate, cycled so neighbours rarely match.
  const hue = 18 + ((index * 47) % 210);
  const sat = 15 + hash(index, 2) * 18;
  const light = 34 + hash(index, 3) * 20;

  const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
  bg.addColorStop(0, `hsl(${hue}, ${sat}%, ${light + 12}%)`);
  bg.addColorStop(1, `hsl(${hue + 16}, ${sat}%, ${Math.max(8, light - 14)}%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Horizon band — the single cue that reads as "photograph of somewhere"
  // rather than "swatch", even at four pixels across on the far limb.
  const horizon = h * (0.52 + hash(index, 5) * 0.16);
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, `hsla(${hue + 30}, ${sat + 8}%, ${light - 10}%, 0.95)`);
  ground.addColorStop(1, `hsla(${hue + 30}, ${sat + 4}%, ${Math.max(5, light - 22)}%, 1)`);
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Figure: head and shoulders, sitting on the horizon.
  const cx = w * (0.34 + hash(index, 7) * 0.32);
  const headR = w * 0.085;
  const headY = horizon - h * 0.12;
  ctx.fillStyle = `hsla(${hue + 45}, ${sat + 10}%, ${Math.min(82, light + 34)}%, 0.85)`;
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - headR * 2.1, horizon + h * 0.03);
  ctx.quadraticCurveTo(cx, headY + headR * 0.6, cx + headR * 2.1, horizon + h * 0.03);
  ctx.closePath();
  ctx.fill();

  // Grain, then a vignette — in that order, so the corners darken the
  // noise too and the tile doesn't look like a sticker with speckle on top.
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = hash(index * 91 + i, 11) > 0.5 ? "#fff" : "#000";
    ctx.fillRect(hash(i, index + 1) * w, hash(i, index + 31) * h, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.78);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  ctx.font = "600 15px 'Courier New', monospace";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText(caption, 14, h - 16);

  // A hairline inset frame — reads as the white border of a print and, more
  // usefully, keeps adjacent tiles legible as separate photos once they
  // close up into a continuous crust.
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, w - 10, h - 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function About() {
  const sectionRef = useRef(null);
  const stackRef = useRef(null);
  const mountRef = useRef(null);
  const copyRef = useRef(null);
  const hintRef = useRef(null);
  const revealRef = useRef(null);
  const paraRefs = useRef([]);
  const counterRef = useRef(null);

  const { progressRef, entryRef } = useScrollProgressRef(sectionRef);

  const [ready, setReady] = useState(false);
  const [everActive, setEverActive] = useState(false);
  const activeRef = useRef(false);
  const rafIdRef = useRef(null);
  const tickRef = useRef(null);

  // Same deferral as Projects and Experience: no WebGL context, no textures
  // and no render loop until this section is actually within reach of the
  // viewport. It's the last section on the page, so without this it would
  // be building a scene nobody has scrolled to yet during first paint.
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

    // -------------------------------------------------------------
    // Scene — transparent clear colour so the shared .space-ground grid
    // shows through, exactly as the two sections before it do.
    // -------------------------------------------------------------
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(GROUND, 0.055);

    // near=1.5, not the reflexive 0.1. Depth precision is distributed
    // hyperbolically between near and far, so a needlessly close near plane
    // spends almost the entire depth buffer on empty space in front of the
    // subject — which is what was letting overlapping tiles z-fight into
    // speckled triangles. Nothing here is ever closer than ~4 units.
    const camera = new THREE.PerspectiveCamera(42, width / height, 1.5, 80);
    camera.position.set(0, 0, 7.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // -------------------------------------------------------------
    // Starfield — same shell of points as Experience, so this reads as the
    // next stop in one continuous flight rather than a new scene.
    // -------------------------------------------------------------
    const STAR_COUNT = 1100;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starCol = new Float32Array(STAR_COUNT * 3);
    const white = new THREE.Color(0xffffff);
    const gray = new THREE.Color(0x8a8a90);
    const red = new THREE.Color(ACCENT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 24 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const t = Math.random();
      const c = t < 0.05 ? red : t < 0.4 ? gray : white;
      starCol[i * 3] = c.r; starCol[i * 3 + 1] = c.g; starCol[i * 3 + 2] = c.b;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.085, vertexColors: true, transparent: true, opacity: 0.8,
      sizeAttenuation: true, depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // -------------------------------------------------------------
    // Lighting — one sun, almost no fill. Everything below is shaped by it.
    // -------------------------------------------------------------
    const SUN_DIR = new THREE.Vector3(-5.5, 2.2, 3.6);
    // Ambient is higher than Experience's planet wants, on purpose: that
    // one only has to read as rock, this one has to keep photographs
    // legible all the way round the terminator.
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.9);
    sun.position.copy(SUN_DIR);
    scene.add(sun);
    // A dim cool bounce from the opposite side so the night hemisphere is
    // dark rather than a black cut-out — the same trick earthrise photos
    // get for free from reflected light.
    const bounce = new THREE.DirectionalLight(0x4a6ea8, 0.5);
    bounce.position.set(5, -2, -4);
    scene.add(bounce);

    // -------------------------------------------------------------
    // The planet: a group holding the body, the atmosphere and every tile,
    // tilted on its axis and turned as one.
    // -------------------------------------------------------------
    const planet = new THREE.Group();
    planet.rotation.z = -0.28; // axial tilt, so the spin isn't a flat spin
    scene.add(planet);

    // -------------------------------------------------------------
    // Framing. A fixed camera distance only ever frames one aspect ratio:
    // tuned on a desktop it looks right there and buries a phone inside the
    // planet, because a portrait viewport's *horizontal* field of view is
    // far narrower than its vertical one. So solve for the distance that
    // fits the sphere instead of hard-coding one.
    // -------------------------------------------------------------
    let fit = 7;
    const frame = () => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      const wide = width > 900;
      // Wide: sit beside the copy in the lower left. Narrow: no room to
      // sidestep, so ride high and let the copy stack underneath.
      planet.position.x = wide ? 1.45 : 0;
      planet.position.y = wide ? 0 : 1.4;

      const extent = RADIUS * 1.085; // the atmosphere shell, not just the body
      const fill = wide ? 0.96 : 0.72;
      // min(1, aspect) is the load-bearing part: below 1:1 it's the width
      // that constrains the fit, not the height.
      fit = extent / (Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect) * fill);

      // Fog has to travel with the camera. It's tuned by distance, so the
      // same density that reads as a whisper at 6 units swallows the planet
      // whole at 18 — which is exactly where a phone puts the camera.
      scene.fog.density = 0.36 / fit;
    };

    // Opaque core. This is what makes the far tiles genuinely invisible
    // instead of showing through as mirrored clutter, and what the tiles
    // cast their gaps onto.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 64, 48),
      // transparent up-front, never toggled: flipping `transparent` at
      // runtime triggers a shader recompile on the frame it changes.
      new THREE.MeshStandardMaterial({
        color: 0x120d0a, roughness: 0.95, metalness: 0,
        transparent: true, opacity: 0,
      })
    );
    planet.add(core);

    // Atmosphere: inverted shell, fresnel-bright at the limb and weighted
    // toward the sun so the glow sits off-centre the way a real one does.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.085, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uSun: { value: SUN_DIR.clone().normalize() },
          uColor: { value: new THREE.Color(0xff8a5c) },
          uCool: { value: new THREE.Color(0x5f9dff) },
          uOpacity: { value: 0 },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vWorld = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uSun;
          uniform vec3 uColor;
          uniform vec3 uCool;
          uniform float uOpacity;
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            // Backside shell, so the rim is where the view normal turns away
            // from the camera axis — this is the classic cheap fresnel.
            float rim = pow(clamp(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.4);
            float lit = clamp(dot(vWorld, uSun), 0.0, 1.0);
            vec3 col = mix(uCool, uColor, lit);
            gl_FragColor = vec4(col, 1.0) * rim * uOpacity * (0.25 + lit * 1.5);
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    );
    planet.add(atmosphere);

    // -------------------------------------------------------------
    // Shards — the burst itself. Tiles coming apart reads as a structure
    // failing; what makes it read as a detonation is the spray of small
    // fast stuff thrown out with them, moving faster than the debris and
    // gone well before it. Points rather than meshes: there are thousands
    // of times more of them than tiles and none is ever more than a speck.
    // -------------------------------------------------------------
    const SHARD_COUNT = 900;
    const shardGeo = new THREE.BufferGeometry();
    const shardPos = new Float32Array(SHARD_COUNT * 3);
    const shardBase = new Float32Array(SHARD_COUNT * 3);
    const shardVel = new Float32Array(SHARD_COUNT * 3);
    const shardCol = new Float32Array(SHARD_COUNT * 3);
    const ember = new THREE.Color(0xffb066);
    const ash = new THREE.Color(0x8d6a52);
    const hot = new THREE.Color(0xfff3e0);
    for (let i = 0; i < SHARD_COUNT; i++) {
      // Born on the crust, not at the centre — the surface is what breaks up.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.cos(phi);
      const dz = Math.sin(phi) * Math.sin(theta);
      const r = RADIUS * (0.97 + Math.random() * 0.08);
      shardBase[i * 3] = dx * r; shardBase[i * 3 + 1] = dy * r; shardBase[i * 3 + 2] = dz * r;
      shardPos[i * 3] = dx * r; shardPos[i * 3 + 1] = dy * r; shardPos[i * 3 + 2] = dz * r;
      // Outrunning the tiles, by a wide and uneven margin.
      const speed = 1.5 + Math.random() * Math.random() * 6;
      shardVel[i * 3] = dx * speed + (Math.random() - 0.5) * 0.8;
      shardVel[i * 3 + 1] = dy * speed + (Math.random() - 0.5) * 0.8;
      shardVel[i * 3 + 2] = dz * speed + (Math.random() - 0.5) * 0.8;
      const t = Math.random();
      const c = t < 0.18 ? hot : t < 0.7 ? ember : ash;
      shardCol[i * 3] = c.r; shardCol[i * 3 + 1] = c.g; shardCol[i * 3 + 2] = c.b;
    }
    shardGeo.setAttribute("position", new THREE.BufferAttribute(shardPos, 3));
    shardGeo.setAttribute("color", new THREE.BufferAttribute(shardCol, 3));
    const shardMat = new THREE.PointsMaterial({
      size: 0.075, vertexColors: true, transparent: true, opacity: 0,
      sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const shards = new THREE.Points(shardGeo, shardMat);
    shards.visible = false;
    planet.add(shards);

    // -------------------------------------------------------------
    // Tiles
    // -------------------------------------------------------------
    const n = PHOTOS.length;
    // Size each tile to the patch of surface it owns, so density follows
    // from the photo count rather than being hand-tuned to it.
    //
    // The 1.28 is the part that isn't obvious. Sized to exactly its own
    // share of the surface area, a tile only tiles cleanly on a square
    // grid — and the Fibonacci lattice deliberately isn't one, so every
    // neighbour sits at a slight offset and the crust comes out full of
    // dark wedges. Oversizing past 1 makes the tiles shingle over each
    // other instead, which is what actually closes the surface (and reads
    // as a collage rather than a tiled floor).
    const cell = Math.sqrt((4 * Math.PI * RADIUS * RADIUS) / n) * 1.34;
    const tileW = cell * Math.sqrt(TILE_ASPECT);
    const tileH = cell / Math.sqrt(TILE_ASPECT);

    const tileGeo = makeTileGeometry(tileW, tileH, RADIUS * TILE_LIFT);
    const loader = new THREE.TextureLoader();
    const tiles = [];
    const ownedTextures = [];
    const materials = [];

    let pending = 0;
    let settled = false;
    const markReady = () => {
      if (!settled && pending === 0) {
        settled = true;
        setReady(true);
      }
    };

    const up = new THREE.Vector3(0, 1, 0);
    const altUp = new THREE.Vector3(1, 0, 0); // for the poles, where `up` is degenerate
    const forward = new THREE.Vector3(0, 0, 1);

    // One GPU texture per distinct image, shared by every tile that uses it.
    // There are deliberately more tiles than photos (see about.js), so loading
    // per-tile would upload the same twenty images four times over — four
    // times the texture memory for pixels that are byte-identical.
    const texCache = new Map();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textureFor = (src) => {
      const hit = texCache.get(src);
      if (hit) return hit;
      pending++;
      const t = loader.load(
        src,
        () => { pending--; markReady(); },
        undefined,
        () => { pending--; markReady(); }
      );
      t.colorSpace = THREE.SRGBColorSpace;
      // Most of the crust is seen at a glancing angle — that's what being on
      // a sphere means — and that's precisely the case trilinear filtering
      // blurs to mush. Cheap, and it's the difference between photographs
      // and smears everywhere except dead centre.
      t.anisotropy = maxAniso;
      texCache.set(src, t);
      ownedTextures.push(t);
      return t;
    };

    PHOTOS.forEach((photo, i) => {
      let tex;
      if (photo.src) {
        tex = textureFor(photo.src);
      } else {
        tex = makePlaceholderTexture(i, photo.caption ?? "");
        ownedTextures.push(tex);
      }

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        // A little self-illumination from the photo itself, so tiles on the
        // dark hemisphere stay pictures instead of silhouettes. Low enough
        // that the sun still carves a terminator across the globe — that
        // shading is what stops a sphere reading as a flat disc.
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.15,
        roughness: 0.82,
        metalness: 0.04,
        // Fully opaque, deliberately. Fading tiles in by opacity meant every
        // one of them went through the transparent queue, where overlapping
        // shingles blend into each other and the crust reads as frosted
        // glass instead of paper. They arrive by scale and distance instead,
        // which needs no blending at all.
        // FrontSide, not Double: culling the backs is half of what sells
        // the solidity — a tile on the far limb should vanish behind the
        // body, not show you its mirrored self through the gaps.
        side: THREE.FrontSide,
      });
      materials.push(mat);

      const mesh = new THREE.Mesh(tileGeo, mat);

      // Resting pose: sitting on its own patch, facing straight out.
      const dir = fibonacciDirection(i, n);
      // Each tile gets its own hairline radius. Shingled tiles all sitting
      // at one radius are coplanar where they overlap, and coplanar
      // overlapping geometry z-fights — it showed up as hard black wedges
      // punched out of the tile corners. Staggering by index gives the
      // depth buffer an unambiguous order; at 1e-4 of the radius the
      // curvature mismatch against the shared geometry is invisible.
      const restPos = dir.clone().multiplyScalar(RADIUS * TILE_LIFT * (1 + i * 0.0009));
      // Build the resting attitude from an explicit basis rather than
      // setFromUnitVectors: that picks an arbitrary roll per tile, so
      // neighbours end up with unrelated horizons and the crust looks
      // shuffled. Seating each tile's up-vector against the world axis
      // gives the whole sphere one consistent grain.
      const polar = Math.abs(dir.y) > 0.985; // no meaningful "up" on the axis
      const ref = polar ? altUp : up;
      const tangent = ref.clone().sub(dir.clone().multiplyScalar(ref.dot(dir))).normalize();
      const restQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3().crossVectors(tangent, dir).normalize(),
          tangent,
          dir
        )
      );
      // Then a little roll off that grain, so it reads as collaged by hand
      // rather than laid out by a machine.
      const roll = (hash(i, 13) - 0.5) * (polar ? 0.9 : 0.42);
      restQuat.multiply(new THREE.Quaternion().setFromAxisAngle(forward, roll));

      // Launch pose: scattered far out, at a random attitude. Biased to
      // start on roughly the same side of the sphere it will land on, so
      // tiles converge inward instead of crossing through the body.
      const spread = dir
        .clone()
        .multiplyScalar(6.5 + hash(i, 17) * 6)
        .add(
          new THREE.Vector3(
            (hash(i, 19) - 0.5) * 9,
            (hash(i, 23) - 0.5) * 9,
            (hash(i, 29) - 0.5) * 9
          )
        );
      const startQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(hash(i, 31) * 6.28, hash(i, 37) * 6.28, hash(i, 41) * 6.28)
      );

      mesh.position.copy(spread);
      mesh.quaternion.copy(startQuat);
      mesh.visible = false;
      mesh.scale.setScalar(0.001);
      // Blast vector: mostly straight out along the tile's own normal, with
      // lateral scatter and a tumble of its own. Purely radial debris just
      // expands like an inflating balloon — still legibly a sphere, only
      // bigger. The scatter is what actually breaks the silhouette.
      const blastDir = dir
        .clone()
        .multiplyScalar(1.6 + hash(i, 43) * 1.5)
        .add(
          new THREE.Vector3(hash(i, 47) - 0.5, hash(i, 53) - 0.5, hash(i, 59) - 0.5)
            .multiplyScalar(1.1)
        );
      const tumbleAxis = new THREE.Vector3(
        hash(i, 61) - 0.5,
        hash(i, 67) - 0.5,
        hash(i, 71) - 0.5
      ).normalize();

      mesh.userData = {
        restPos,
        restQuat,
        blastDir,
        tumbleAxis,
        tumbleRate: (hash(i, 73) - 0.4) * 7,
        startPos: spread,
        startQuat,
        // Stagger by index, not at random: the landings then sweep across
        // the sphere as one wave instead of popping in scattered order,
        // which is the difference between "assembling" and "loading".
        delay: (i / n) * (ASSEMBLY_END - TILE_FLIGHT),
        mat,
      };
      planet.add(mesh);
      tiles.push(mesh);
    });

    markReady(); // all-placeholder case never enters the loader callbacks

    // -------------------------------------------------------------
    // Pointer parallax — a small camera offset, never a rotation of the
    // planet itself. Turning the body on hover fights the scroll-driven
    // spin; moving the camera reads as leaning in to look.
    // -------------------------------------------------------------
    const state = { p: progressRef.current, px: 0, py: 0, camX: 0, camY: 0 };
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
      renderer.setSize(width, height);
      frame();
    };
    window.addEventListener("resize", onResize);
    frame();

    // -------------------------------------------------------------
    // Loop
    // -------------------------------------------------------------
    const clock = new THREE.Clock();
    const tmpQuat = new THREE.Quaternion();
    const tmpRot = new THREE.Quaternion();

    const tick = () => {
      if (!activeRef.current) { rafIdRef.current = null; return; }
      rafIdRef.current = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);

      // Ease toward the real scroll position — wheel steps and trackpad
      // flicks become one continuous glide, same as SunHero.
      const target = progressRef.current;
      state.p += (target - state.p) * Math.min(1, dt * SMOOTHING);
      if (Math.abs(target - state.p) < 0.0002) state.p = target;
      const p = state.p;

      // How far into the detonation we are — 0 until it starts.
      const blastRaw = clamp01((p - EXPLODE_START) / (1 - EXPLODE_START));
      const blast = easeBlast(blastRaw);
      // Debris shrinks away at the very end rather than fading out. The
      // tiles are opaque on purpose (see the material above) and switching
      // transparency back on just for the exit would drop all 76 back into
      // the blended queue for the one moment the text needs a clean screen.
      const dissipate = 1 - smoothstep(0.52, 0.92, blastRaw);

      let landed = 0;
      for (let i = 0; i < tiles.length; i++) {
        const mesh = tiles[i];
        const d = mesh.userData;
        const t = easeOut(clamp01((p - d.delay) / TILE_FLIGHT));

        mesh.position.lerpVectors(d.startPos, d.restPos, t);
        tmpQuat.copy(d.startQuat).slerp(d.restQuat, t);

        if (blast > 0) {
          // Thrown outward from where it sat, tumbling as it goes. Debris
          // stays parented to the planet, so the whole field keeps the
          // group's slow rotation and drifts as one system rather than
          // freezing into a static starburst.
          mesh.position.addScaledVector(d.blastDir, blast * 5);
          tmpQuat.multiply(tmpRot.setFromAxisAngle(d.tumbleAxis, blastRaw * d.tumbleRate));
        }
        mesh.quaternion.copy(tmpQuat);

        // Grows almost entirely in the last third of its flight, so tiles
        // read as arriving from depth rather than inflating in place.
        mesh.visible = t > 0.001 && dissipate > 0.001;
        mesh.scale.setScalar((0.08 + 0.92 * smoothstep(0.25, 1, t)) * dissipate);
        if (t > 0.995) landed++;
      }

      // The body fades up underneath the incoming tiles rather than sitting
      // there from the start — otherwise the first thing on screen is a
      // bare black ball, which gives the whole trick away before it begins.
      // Tracks the crust rather than leading it: fading the body up first
      // put a bare black ball on screen before the photos arrived, which
      // gives away the shape before the assembly has earned it.
      const bodyIn = smoothstep(0.1, 0.45, p);
      // The body goes first and fast. It has to be gone before the debris
      // has cleared, or the shell of tiles opens onto a black ball still
      // hanging there in the middle, which reads as the crust peeling off
      // rather than the planet coming apart.
      const coreGone = smoothstep(0, 0.09, blastRaw);
      core.material.opacity = bodyIn * (1 - coreGone);
      core.visible = core.material.opacity > 0.01;
      core.scale.setScalar(1 - coreGone * 0.4);

      // The atmosphere flares as the body lets go, then dies — the light of
      // the thing coming apart, and the only moment in the section with any
      // real brightness in it.
      // Shards ride a steeper curve than the tiles — thrown harder, gone
      // sooner, so the burst outruns the debris instead of moving with it.
      if (blastRaw > 0) {
        shards.visible = true;
        const reach = Math.pow(blastRaw, 0.6) * 6;
        for (let i = 0; i < SHARD_COUNT * 3; i++) {
          shardPos[i] = shardBase[i] + shardVel[i] * reach;
        }
        shardGeo.attributes.position.needsUpdate = true;
        shardMat.opacity = smoothstep(0, 0.05, blastRaw) * (1 - smoothstep(0.1, 0.5, blastRaw)) * 0.9;
      } else if (shards.visible) {
        shards.visible = false;
      }

      // Restrained deliberately. Scaling this shell up while the camera is
      // still close turns an additive fresnel into a screen-filling donut —
      // it stops reading as light coming off the planet and starts reading
      // as a gradient. A brief lift and a fast death does the job.
      const flare = (1 + 1.4 * smoothstep(0, 0.035, blastRaw)) * (1 - smoothstep(0.03, 0.18, blastRaw));
      atmosphere.material.uniforms.uOpacity.value = smoothstep(0.3, 0.75, p) * 0.9 * flare;
      atmosphere.scale.setScalar(1 + blast * 0.1);

      // Spin: a slow constant turn, plus a scroll-driven one so scrolling
      // always visibly moves the planet even after the last tile has landed.
      planet.rotation.y += dt * 0.055;
      planet.rotation.y = planet.rotation.y % (Math.PI * 2);
      planet.rotation.x = lerp(0.12, -0.05, smoothstep(0, 1, p));

      // Drift in from slightly further out as it assembles — the camera
      // settling as the planet finishes gathering itself.
      // Settles in as the planet gathers, then gives ground as it bursts —
      // holding the original framing through the blast just throws the
      // debris straight past the camera and out of frame.
      const dolly =
        lerp(fit * 1.4, fit, smoothstep(0.05, ASSEMBLY_END + 0.15, p)) * (1 + blast * 2.2);
      // Scaled by distance — a fixed offset that reads as a gentle lean at
      // 7 units is imperceptible at 18.
      state.camX += (state.px * 0.08 * fit - state.camX) * Math.min(1, dt * 3);
      state.camY += (-state.py * 0.055 * fit - state.camY) * Math.min(1, dt * 3);
      camera.position.set(state.camX + planet.position.x, state.camY + planet.position.y, dolly);
      camera.lookAt(planet.position.x, planet.position.y, 0);

      stars.rotation.y += dt * 0.004;

      // Copy holds off until the shape is unmistakably a planet.
      // The caption belongs to the intact planet: in once it's whole, out
      // the moment it isn't. Leaving it up through the blast would have two
      // blocks of text competing while the screen is at its busiest.
      if (copyRef.current) {
        const k =
          smoothstep(ASSEMBLY_END - 0.16, ASSEMBLY_END + 0.1, p) *
          (1 - smoothstep(EXPLODE_START - 0.04, EXPLODE_START + 0.06, p));
        copyRef.current.style.opacity = String(k);
        copyRef.current.style.transform = `translate3d(0, ${(1 - k) * 18}px, 0)`;
      }

      // The reveal waits for the debris to be well clear before it starts,
      // then resolves paragraph by paragraph.
      if (revealRef.current) {
        const k = smoothstep(0.3, 0.6, blastRaw);
        revealRef.current.style.opacity = String(k);
        revealRef.current.style.pointerEvents = k > 0.5 ? "auto" : "none";
        for (let i = 0; i < paraRefs.current.length; i++) {
          const el = paraRefs.current[i];
          if (!el) continue;
          const kp = smoothstep(0.32 + i * 0.08, 0.54 + i * 0.08, blastRaw);
          el.style.opacity = String(kp);
          el.style.transform = `translate3d(0, ${(1 - kp) * 14}px, 0)`;
        }
      }
      // The hint has nothing left to promise once the last tile has landed.
      if (hintRef.current) {
        hintRef.current.style.opacity = String(1 - smoothstep(ASSEMBLY_END - 0.1, ASSEMBLY_END + 0.1, p));
      }
      if (counterRef.current) {
        counterRef.current.textContent = `${String(landed).padStart(2, "0")} / ${n} FRAGMENTS`;
      }

      // Fades in over Experience, and deliberately never fades out — it's
      // the last section, and the page ends on it.
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
      // One geometry shared by every tile, so it's disposed once here.
      tileGeo.dispose();
      materials.forEach((m) => m.dispose());
      ownedTextures.forEach((t) => t.dispose());
      core.geometry.dispose(); core.material.dispose();
      atmosphere.geometry.dispose(); atmosphere.material.dispose();
      shardGeo.dispose(); shardMat.dispose();
      starGeo.dispose(); starMat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everActive]);

  return (
    // -100vh for the same reason as Projects and Experience: a pinned
    // section's progress completes one viewport before its box ends.
    <section
      ref={sectionRef}
      style={{ position: "relative", height: `${SCROLL_LENGTH_VH}vh`, marginTop: "-100vh" }}
    >
      <div ref={stackRef} className="space-ground" style={styles.stack}>
        <div ref={mountRef} style={styles.canvasMount} />

        <div style={styles.topBar}>
          <span style={styles.eyebrow}>{ABOUT.eyebrow}</span>
          <span ref={counterRef} style={styles.counter} />
        </div>

        <div ref={copyRef} style={styles.copy}>
          <h2 style={styles.heading}>
            {ABOUT.heading.split("\n").map((line, i) => (
              <span key={i} style={styles.headingLine}>{line}</span>
            ))}
          </h2>
          <div style={styles.metaRow}>
            {ABOUT.meta.map((m, i) => (
              <span key={m} style={styles.metaItem}>
                {i > 0 && <span style={styles.dot}>·</span>}
                {m}
              </span>
            ))}
          </div>
        </div>

        <div ref={revealRef} style={styles.reveal}>
          <div style={styles.revealInner}>
            {ABOUT.story.map((para, i) => (
              <p
                key={i}
                ref={(el) => { paraRefs.current[i] = el; }}
                style={{ ...styles.storyPara, ...(i === 0 ? styles.storyLead : null) }}
              >
                {para}
              </p>
            ))}
          </div>
        </div>

        <div ref={hintRef} style={styles.hint}>SCROLL TO BUILD THE WORLD</div>

        {!ready && <div style={styles.loading}>GATHERING PLACES…</div>}
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
  eyebrow: { color: ACCENT },
  counter: { color: "rgba(255,255,255,0.55)" },
  copy: {
    position: "absolute", left: 32, bottom: 64, maxWidth: 400,
    opacity: 0, willChange: "opacity, transform",
  },
  heading: {
    display: "flex", flexDirection: "column",
    fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 600,
    fontSize: "clamp(22px, 2.6vw, 34px)", lineHeight: 1.15, color: "#fff",
    // Text sits over a lit planet on some scroll positions — a soft shadow
    // keeps it readable without a panel behind it.
    textShadow: "0 2px 24px rgba(0,0,0,0.75)",
  },
  headingLine: { display: "block" },
  // Centred on the screen, not on the planet's offset — by the time this
  // is readable there is no planet left to sit beside.
  reveal: {
    position: "absolute", inset: 0, display: "flex",
    alignItems: "center", justifyContent: "center",
    padding: "0 28px", opacity: 0, willChange: "opacity",
  },
  revealInner: { maxWidth: 620, textAlign: "center" },
  storyPara: {
    margin: "0 0 20px", fontSize: 13.5, lineHeight: 1.85,
    color: "rgba(255,255,255,0.68)",
    textShadow: "0 1px 22px rgba(0,0,0,0.9)",
    willChange: "opacity, transform",
  },
  // The opening line carries the name, so it gets the weight.
  storyLead: {
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: "clamp(17px, 1.9vw, 23px)", lineHeight: 1.5,
    color: "#fff", marginBottom: 26,
  },
  metaRow: { marginTop: 18, display: "flex", gap: 10, fontSize: 10, letterSpacing: 1.6 },
  metaItem: { color: "rgba(255,255,255,0.45)", display: "flex", gap: 10 },
  dot: { opacity: 0.4 },
  hint: {
    position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
    fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.4)",
  },
  loading: {
    position: "absolute", inset: 0, display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 12, letterSpacing: 2,
    color: "rgba(255,255,255,0.4)", pointerEvents: "none",
  },
};
