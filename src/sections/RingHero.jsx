import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { useScrollProgressRef } from '../hooks/useScrollProgress'
import '../ring-hero.css'

/**
 * RING HERO — one thick glass ring hanging in a pitch-black void.
 *
 * The glass is real transmission (MeshPhysicalMaterial), kept subtle: a
 * gentle bend, a faint blue with thickness, barely any dispersion. Its
 * highlights come from a small studio of big, soft-edged light panels baked
 * into an environment map — broad cool softboxes for the body, a few small
 * hot orange sources for the sparks — held at one chosen angle and swaying
 * slowly around it, so the light moves without the ring ever going dark.
 *
 * Inside the ring there's a warm glow and a drift of dust orbiting its
 * centre: the one nod to a black hole. Both are drawn as *opaque* additive
 * geometry, which puts them in the pass the glass refracts — so you see
 * them bent through the band, not just through the hole.
 *
 * Scroll turns the ring to face the camera and flies into its hole until
 * the dark centre fills the frame; that dark is where Projects fades in.
 */

const SCROLL_LENGTH_VH = 350

// Ring profile: an accretion disc rather than a band — wide and flat, fat
// at the inner lip where it falls into the hole and thinning out toward a
// fine outer edge. Both edges stay rounded: hard corners reflect as thin
// creases, which reads as outline, not glass.
const RING_IN = 0.8 // inner lip — the edge of the hole
const RING_OUT = 1.45 // outer edge
const RING_HALF_H = 0.3 // thickness scale; the disc peaks at ~0.18 either side
const RING_TAPER = 0.85 // how much thinner the outer edge is than the inner
const RING_R = RING_IN + (RING_OUT - RING_IN) * 0.22 // the disc's thickest ring, where the filament runs

// Half the disc's thickness at u (0 = inner lip, 1 = outer edge): an
// ellipse's rounded ends, leaning its bulk toward the hole.
const bandHalfHeight = (u) => RING_HALF_H * 2 * Math.sqrt(u * (1 - u)) * Math.pow(1 - RING_TAPER * u, 1.6)

// At rest the ring is tipped back and turned, like the reference.
const REST_X = 0.88
const REST_Z = -0.62
const FACE_X = Math.PI / 2 // axis pointing straight down the camera

const FOV = 35
const DUST_COUNT = 1600
const GLITTER_COUNT = 2600 // specks suspended inside the glass disc itself — it has a lot more volume than the old band
const INTRO = 2.6 // seconds for the lights to come up
const SMOOTHING = 6
const EXPOSURE = 1.7

// Two drifting glints, one cool white and one warm orange: small lights on
// slow, out-of-step orbits in front of the ring, so a soft highlight creeps
// across the glass now and then. Kept dim on purpose — a glint, not a shine.
// [colour, intensity, speed (rad/s), phase, orbit radius x/y, depth]
const GLINTS = [
  [0xffffff, 0.3, 0.19, 0.4, 2.4, 1.7, 2.2],
  [0xff9a4a, 0.45, -0.13, 2.6, 2.1, 1.9, 1.8],
]

// The studio's resting angle around the ring. Picked by sweeping the full
// turn: this is where the form reads best — soft shading across the body,
// a clean line along the inner lip, the warm light inside the lower band
// and a few orange sparks. It only sways a little either side — turning all the way
// round passes through angles where half the ring falls into shadow.
const ENV_ANGLE = 2.75
const ENV_SWAY = 0.22
const ENV_INTRO_SWEEP = 1.1 // starts on the warm, orange-flared side

// Where the warm heart sits, in the ring's own frame: low on the inner
// wall nearest the viewer — the reference's hot spot.
const HEART_ANGLE = Math.PI / 2
const HEART_R = 0.7
const FILAMENT_ARC = Math.PI * 0.9 // how much of the band the inner light runs along

// The title — two lines, each word its own mask so it can rise into place.
// "light" is the one warm word: it's what the ring is doing.
const TITLE = [
  [{ text: 'Bending' }, { text: 'light', accent: true }],
  [{ text: 'into' }, { text: 'interfaces.' }],
]

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const lerp = (a, b, t) => a + (b - a) * t
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3)

function ringGeometry() {
  const pts = []
  const n = 200
  // Counter-clockwise in (r, y): up from the outer edge, over the top to the
  // inner lip, back underneath. LatheGeometry derives its normals from the
  // profile's direction, and this way round they point out of the glass.
  // Stepping by angle packs the samples into the tight rounded edges.
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2
    const u = (1 + Math.cos(t)) / 2
    pts.push(new THREE.Vector2(lerp(RING_IN, RING_OUT, u), Math.sign(Math.sin(t)) * bandHalfHeight(u)))
  }
  return new THREE.LatheGeometry(pts, 240)
}

// A soft-edged light: bright plateau falling off to nothing. Hard-edged
// panels reflect as crisp shards; soft ones as the smooth, broad streaks
// the reference is made of.
function softTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(64, 64)
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const r = Math.hypot((x + 0.5) / 32 - 1, (y + 0.5) / 32 - 1)
      const v = Math.round(255 * Math.pow(clamp01((1 - r) / 0.8), 1.4))
      const i = (y * 64 + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// The studio the glass reflects. Never seen directly — only in the ring —
// so it can be as bright and as oddly placed as it needs to be.
function buildStudio() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  const soft = softTexture()
  const panel = (w, h, color, strength, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(strength),
        map: soft,
        side: THREE.DoubleSide,
      })
    )
    m.position.set(...pos)
    m.lookAt(0, 0, 0)
    scene.add(m)
  }
  panel(18, 12, 0xd8e6ff, 1.2, [-5, 5, 4]) // big cool softbox, up-left and in front — kept low: the disc's broad top face catches all of it and goes milky
  panel(7, 15, 0xa9c4ff, 3.2, [-7, -1, -2]) // tall icy blue from behind-left — the luminous left shoulder
  // Mirrored across the studio on purpose: at the resting angle (about half
  // a turn) this one lands behind the ring's left shoulder and lights it.
  panel(7, 15, 0xb4ccff, 2.6, [7, -1, 2]) // tall icy blue — the bright left shoulder at rest
  panel(22, 22, 0x8fa6cc, 0.3, [0, 10, -1]) // dim dome overhead — thin light along every grazing edge
  panel(18, 10, 0x5d7bb0, 0.5, [0, -3, -9]) // dim wall behind — the rim on the far side
  panel(10, 5, 0x9cc0ff, 0.4, [3, -6, 5]) // a whisper of cool bounce from below
  panel(2.2, 2.2, 0xff8a3a, 16, [3.5, -4.5, 3]) // hot orange, low right — the bottom flare
  panel(1.6, 1.6, 0xffa050, 14, [6, 2.5, 0.5]) // hot orange, right — the side flare
  panel(1.3, 1.3, 0xffb070, 12, [-1.5, 6, -1.5]) // warm, overhead — the flare on the top rim
  panel(24, 24, 0x0a1224, 0.8, [0, 0, 12]) // faint fill behind the camera, so no face is dead black
  return scene
}

// The warm heart: a soft glow, billboarded to the camera.
const heartVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const heartFragment = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float core = pow(max(0.0, 1.0 - d), 3.0);
    float halo = pow(max(0.0, 1.0 - d), 2.0) * 0.12;
    vec3 col = uColor * core * 2.4 + uColor * vec3(1.0, 0.75, 0.55) * halo;
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`

// Brightest mid-arc, fading to nothing at both ends, with a slow travelling
// swell so the light inside the glass never sits perfectly still.
const filamentVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const filamentFragment = /* glsl */ `
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    // max(): at the arc's ends sin() lands a hair below zero, and pow() of a
    // negative is NaN on some GPUs (Metal) — one NaN pixel, spread by the
    // bloom blur, blacks out the whole frame.
    float along = pow(max(sin(vUv.x * 3.14159), 0.0), 2.5);
    float swell = 0.75 + 0.25 * sin(vUv.x * 9.0 - uTime * 0.8);
    vec3 col = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.85, 0.6), along * along);
    gl_FragColor = vec4(col * along * swell * 4.0 * uIntensity, 1.0);
  }
`

const dustVertex = /* glsl */ `
  uniform float uSpin;
  uniform float uReveal;
  uniform float uIntensity;
  uniform float uPix;
  uniform float uHeart;
  attribute float aR;
  attribute float aA;
  attribute float aY;
  attribute float aS;
  varying vec3 vC;
  varying float vA;
  void main() {
    // Keplerian-ish: inner dust laps the outer dust. uSpin is a phase the
    // render loop accumulates (so speeding it up never makes it jump), and
    // it winds up hard as the camera dives in.
    float ang = aA + uSpin * 0.14 / pow(aR, 1.5);
    // Drawn inward a little as it speeds up — the vortex tightens.
    float r = aR * (1.0 - 0.12 * uReveal);
    vec3 p = vec3(cos(ang) * r, aY * (1.0 - 0.5 * uReveal), sin(ang) * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uPix * (0.5 + aS) * (0.3 + 0.15 * uReveal) / -mv.z, 10.0);
    // Only the half of the orbit nearest the heart is lit — dust appears as
    // it swings in toward the glow and fades as it swings away, so a half
    // ring hangs there while the particles stream through it. Hottest right
    // at the heart, cooling toward the ends of the arc.
    float facing = max(0.5 + 0.5 * cos(ang - uHeart), 0.0);
    float lit = pow(facing, 2.0);
    float warm = pow(facing, 6.0);
    vC = mix(vec3(0.45, 0.6, 1.0), vec3(1.0, 0.55, 0.2), warm);
    vA = uIntensity * (0.01 + 0.85 * lit) * (1.0 + 0.5 * uReveal)
       * smoothstep(0.2, 0.5, aR) * (0.3 + 0.7 * aS);
  }
`
const dustFragment = /* glsl */ `
  varying vec3 vC;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vC * smoothstep(0.5, 0.0, d) * vA, 1.0);
  }
`

// Glitter sealed inside the band: the same orbit idea, but slow, each speck
// twinkling on its own clock. Only ever seen through the glass, so it
// arrives bent and softened — flecks in the material, not on it.
const glitterVertex = /* glsl */ `
  uniform float uSpin;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uPix;
  uniform float uHeart;
  attribute float aR;
  attribute float aA;
  attribute float aY;
  attribute float aS;
  varying vec3 vC;
  varying float vA;
  void main() {
    float ang = aA + uSpin * (0.6 + aS * 0.8);
    vec3 p = vec3(cos(ang) * aR, aY + sin(uTime * 0.7 + aS * 20.0) * 0.015, sin(ang) * aR);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uPix * (0.4 + aS) * 0.24 / -mv.z, 7.0);
    float tw = 0.5 + 0.5 * sin(uTime * (1.5 + aS * 3.0) + aS * 50.0);
    float warm = pow(max(0.5 + 0.5 * cos(ang - uHeart), 0.0), 3.0);
    vC = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.62, 0.28), warm);
    vA = uIntensity * (0.2 + 0.8 * tw * tw) * (0.45 + 0.9 * warm);
  }
`

// Grain that only lives in the light: scaled by brightness, so the glow
// gets the reference's fine speckle while the void stays pure black.
const GrainShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb *= 1.0 + (hash(gl_FragCoord.xy) - 0.5) * 0.45 * smoothstep(0.0, 0.5, l);
      gl_FragColor = c;
    }
  `,
}

// Orbiting particles, positioned in the shader from (radius, angle,
// height, seed); `place(i)` returns [radius, height] for particle i.
function buildOrbiters(count, place) {
  const g = new THREE.BufferGeometry()
  const r = new Float32Array(count)
  const a = new Float32Array(count)
  const y = new Float32Array(count)
  const s = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    ;[r[i], y[i]] = place()
    a[i] = Math.random() * Math.PI * 2
    s[i] = Math.random()
  }
  // Positions are computed in the shader; this only sizes the draw.
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  g.setAttribute('aR', new THREE.BufferAttribute(r, 1))
  g.setAttribute('aA', new THREE.BufferAttribute(a, 1))
  g.setAttribute('aY', new THREE.BufferAttribute(y, 1))
  g.setAttribute('aS', new THREE.BufferAttribute(s, 1))
  return g
}

// The disc inside the hole: denser toward the inner wall.
const placeDust = () => {
  const r = 0.2 + Math.pow(Math.random(), 0.5) * 0.58
  return [r, (Math.random() - 0.5) * 0.14 * r]
}

// Inside the band's cross-section, kept clear of the surface so no speck
// ever pokes through.
const placeGlitter = () => {
  const u = 0.06 + Math.random() * 0.86
  return [lerp(RING_IN, RING_OUT, u), (Math.random() * 2 - 1) * 0.72 * bandHalfHeight(u)]
}

export default function RingHero() {
  const sectionRef = useRef(null)
  const stackRef = useRef(null)
  const canvasRef = useRef(null)
  const nameRef = useRef(null)
  const titleRef = useRef(null)
  const { progressRef } = useScrollProgressRef(sectionRef)

  useEffect(() => {
    const canvas = canvasRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    renderer.setClearColor(0x000000, 1)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(buildStudio(), 0.015).texture
    pmrem.dispose()

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.16,
      transmission: 1,
      thickness: 0.8,
      ior: 1.42,
      dispersion: 0.2,
      attenuationColor: new THREE.Color(0x8fb0ff),
      attenuationDistance: 3,
      specularIntensity: 1,
      clearcoat: 0.35,
      clearcoatRoughness: 0.12,
      envMap: envTex,
      envMapIntensity: 0.8, // lower than the old band needed: the flat disc shows far more reflecting surface
      side: THREE.DoubleSide,
    })

    // Opaque-but-additive (transparent: false keeps them in the opaque
    // list, which is what the transmission pass renders) — so the glass
    // refracts the glow and the dust instead of ignoring them.
    const heartMat = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.62, 0.3) } },
      vertexShader: heartVertex,
      fragmentShader: heartFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const filamentMat = new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: filamentVertex,
      fragmentShader: filamentFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uSpin: { value: 0 },
        uReveal: { value: 0 },
        uIntensity: { value: 0 },
        uPix: { value: 1 },
        uHeart: { value: HEART_ANGLE },
      },
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const glitterMat = new THREE.ShaderMaterial({
      uniforms: {
        uSpin: { value: 0 },
        uTime: { value: 0 },
        uIntensity: { value: 1.5 }, // brighter than the dust: it has to read through the glass
        uPix: { value: 1 },
        uHeart: { value: HEART_ANGLE },
      },
      vertexShader: glitterVertex,
      fragmentShader: dustFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    // pivot carries scroll + pointer tilt; everything lives in its frame,
    // with the ring's own axis along local y.
    const pivot = new THREE.Group()
    const ringGeo = ringGeometry()
    const dustGeo = buildOrbiters(DUST_COUNT, placeDust)
    const glitterGeo = buildOrbiters(GLITTER_COUNT, placeGlitter)
    const heartGeo = new THREE.PlaneGeometry(0.9, 0.9)
    const ring = new THREE.Mesh(ringGeo, glassMat)
    pivot.add(ring)
    const heart = new THREE.Mesh(heartGeo, heartMat)
    heart.position.set(Math.cos(HEART_ANGLE) * HEART_R, 0, Math.sin(HEART_ANGLE) * HEART_R)
    heart.renderOrder = -1
    pivot.add(heart)
    // …and a cool shaft beside it: a long, faint streak of blue-white light
    // lying across the hole, like the key light caught on the far wall.
    const shaftMat = heartMat.clone()
    shaftMat.uniforms.uColor.value = new THREE.Color(0.45, 0.6, 1.0)
    const shaft = new THREE.Mesh(heartGeo, shaftMat)
    shaft.scale.set(2.2, 0.55, 1)
    shaft.renderOrder = -1
    scene.add(shaft)
    // The warm light inside the glass: a thin glowing arc buried in the
    // band's lower side. Seen only through the glass, so it arrives bent
    // and softened — light *in* the material rather than on it.
    const filamentGeo = new THREE.TorusGeometry(RING_R, 0.04, 12, 160, FILAMENT_ARC)
    const filament = new THREE.Mesh(filamentGeo, filamentMat)
    filament.rotation.set(Math.PI / 2, 0, HEART_ANGLE - FILAMENT_ARC / 2)
    filament.renderOrder = -1
    pivot.add(filament)
    const dust = new THREE.Points(dustGeo, dustMat)
    dust.frustumCulled = false
    pivot.add(dust)
    const glitter = new THREE.Points(glitterGeo, glitterMat)
    glitter.frustumCulled = false
    pivot.add(glitter)
    scene.add(pivot)

    // The glass is the only lit material (the glow, dust and glitter are
    // shaders that ignore lights), so these touch nothing else.
    const glints = GLINTS.map(([color, intensity]) => {
      const light = new THREE.PointLight(color, intensity, 0, 2)
      scene.add(light)
      return light
    })

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.4, 0.8)
    composer.addPass(bloom)
    const grain = new ShaderPass(GrainShader)
    composer.addPass(grain)
    composer.addPass(new OutputPass())

    let w = 0
    let h = 0
    let baseDist = 6
    // Where the ring rests on screen, in world units at its own depth: pushed
    // right on wide screens to leave the left for the title, pushed down on
    // tall ones where the title sits above it.
    let restX = 0
    let restY = 0
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
      renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      composer.setPixelRatio(dpr)
      composer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      // Sized like the reference — the ring about 70% of the frame's height
      // — but always fitting the narrower side, so phones step back.
      const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
      baseDist = Math.max(5.9, 1.6 / (halfTan * Math.min(1, camera.aspect)))
      const halfH = baseDist * halfTan
      const wide = camera.aspect > 0.9
      restX = wide ? halfH * camera.aspect * 0.3 : 0
      restY = wide ? 0 : -halfH * 0.2
      dustMat.uniforms.uPix.value = h * dpr * 0.05
      glitterMat.uniforms.uPix.value = h * dpr * 0.05
    }

    const state = { spin: 0, glint: 0, p: progressRef.current, hidden: false, mx: 0, my: 0, tx: 0, ty: 0 }
    const onMove = (e) => {
      if (e.pointerType === 'touch') return
      state.tx = e.clientX / w - 0.5
      state.ty = e.clientY / h - 0.5
    }

    const t0 = performance.now()
    let last = t0
    let raf = null
    let active = true

    const frame = (now) => {
      if (!active) {
        raf = null
        return
      }
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = reduced ? 100 : (now - t0) / 1000

      const target = progressRef.current
      state.p += (target - state.p) * Math.min(1, dt * SMOOTHING)
      if (Math.abs(target - state.p) < 0.0002) state.p = target
      const p = state.p

      const hide = p >= 0.999
      if (hide !== state.hidden) {
        state.hidden = hide
        stackRef.current.style.visibility = hide ? 'hidden' : 'visible'
      }
      if (hide) return

      state.mx += (state.tx - state.mx) * Math.min(1, dt * 2)
      state.my += (state.ty - state.my) * Math.min(1, dt * 2)

      // Scroll: first the ring squares up to the camera, then the camera
      // accelerates into the hole, stopping just short of it — by then the
      // dark centre fills the whole frame, with the walls sliding off every
      // edge, and that dark is what Projects fades in over.
      const align = smoothstep(0.02, 0.55, p)
      const fly = Math.pow(smoothstep(0.06, 1, p), 1.7)
      const out = 1 - smoothstep(0.92, 1, p)
      const calm = 1 - align

      // Lights come up on load (exposure is the dimmer switch for the whole
      // frame) while the studio sweeps round from the warm side into its
      // resting angle, so the flares slide into place and the lit rim lands.
      const wobEnv = reduced ? 0 : 1
      const intro = easeOut(t / INTRO)
      renderer.toneMappingExposure = EXPOSURE * intro * out
      heartMat.uniforms.uIntensity.value = 0.42 + 0.06 * Math.sin(t * 0.9)
      dustMat.uniforms.uIntensity.value = 1 + fly * 0.6
      filamentMat.uniforms.uIntensity.value = 1
      filamentMat.uniforms.uTime.value = t
      // Spin phases accumulate, so winding them up never jumps. The dust
      // goes from a lazy drift to a hard spin (~10x) as the camera dives; the
      // glitter in the glass picks up pace alongside it.
      state.spin += dt * (1.5 + Math.pow(fly, 1.3) * 16)
      state.glint += dt * (0.12 + fly * 1.2)
      dustMat.uniforms.uSpin.value = state.spin
      dustMat.uniforms.uReveal.value = smoothstep(0.1, 0.8, p)
      glitterMat.uniforms.uSpin.value = state.glint
      glitterMat.uniforms.uTime.value = t
      grain.uniforms.uTime.value = t % 10
      glassMat.envMapRotation.y =
        ENV_ANGLE + Math.sin(t * 0.13) * ENV_SWAY * wobEnv - (1 - intro) * ENV_INTRO_SWEEP

      // Idle: a slow wobble of the axis (spinning a round ring about its
      // own axis would be invisible) plus a lean toward the pointer.
      const wob = reduced ? 0 : 1
      pivot.rotation.x =
        lerp(REST_X, FACE_X, align) + (Math.sin(t * 0.33) * 0.07 * wob + state.my * 0.25) * calm
      pivot.rotation.y = (Math.sin(t * 0.21) * 0.1 * wob + state.mx * 0.3) * calm
      pivot.rotation.z = lerp(REST_Z, 0, align) + Math.sin(t * 0.27 + 1) * 0.05 * wob * calm
      pivot.scale.setScalar(lerp(0.94, 1, intro))
      // Slides back to centre as it squares up, so the dive is dead ahead.
      pivot.position.set(lerp(restX, 0, align), lerp(restY, 0, align), 0)

      // Each glint circles the ring's centre just in front of it, breathing
      // in and out on its own clock so they never both flare at once.
      GLINTS.forEach(([, intensity, speed, phase, rx, ry, z], i) => {
        const a = t * speed + phase
        glints[i].position.set(pivot.position.x + Math.cos(a) * rx, pivot.position.y + Math.sin(a) * ry, z)
        glints[i].intensity = intensity * (0.55 + 0.45 * Math.sin(t * 0.37 + phase * 2))
      })

      camera.position.set(0, 0, lerp(baseDist, 0.95, fly))
      camera.lookAt(0, 0, camera.position.z - 1)
      heart.lookAt(camera.position)
      // The shaft sits in the hole's middle, a touch behind the ring's plane,
      // turned to lie along the ring's long diagonal.
      shaft.position.set(0, 0, -0.1).applyMatrix4(pivot.matrixWorld)
      shaft.rotation.set(0, 0, pivot.rotation.z - 0.35)
      shaftMat.uniforms.uIntensity.value = 0.22 * calm

      nameRef.current.style.opacity = String(1 - smoothstep(0, 0.08, p))
      // The title drifts off to the left and softens out of focus as the
      // ring comes round — the camera is leaving it behind.
      const k = smoothstep(0, 0.14, p)
      titleRef.current.style.opacity = String(1 - k)
      titleRef.current.style.transform = `translate3d(${-k * 60}px, 0, 0)`
      titleRef.current.style.filter = k > 0.001 ? `blur(${k * 10}px)` : 'none'

      composer.render(dt)
    }

    const start = () => {
      if (raf == null && active) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting
        if (active) start()
      },
      { rootMargin: '50% 0px' }
    )
    io.observe(sectionRef.current)

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    start()

    return () => {
      active = false
      if (raf != null) cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      ringGeo.dispose()
      dustGeo.dispose()
      glitterGeo.dispose()
      heartGeo.dispose()
      filamentGeo.dispose()
      filamentMat.dispose()
      glassMat.dispose()
      heartMat.dispose()
      shaftMat.dispose()
      dustMat.dispose()
      glitterMat.dispose()
      envTex.dispose()
      composer.dispose()
      renderer.dispose()
    }
  }, [progressRef])

  return (
    <section ref={sectionRef} style={{ position: 'relative', height: `${SCROLL_LENGTH_VH}vh` }}>
      <div ref={stackRef} className="ring-hero-stack">
        <canvas ref={canvasRef} className="ring-canvas" aria-hidden />
        <div ref={nameRef} className="ring-name" aria-label="Aditya Dave">
          {[...'ADITYA DAVE'].map((ch, i) => (
            <span key={i} aria-hidden style={{ animationDelay: `${0.9 + i * 0.045}s` }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </div>
        <div className="ring-title-wrap">
          <h1 ref={titleRef} className="ring-title">
            {TITLE.map((line, li) => (
              <span key={li} className="ring-title-line">
                {line.map((word, wi) => (
                  <span key={wi} className="ring-word">
                    <span
                      className={word.accent ? 'ring-word-in ring-word-accent' : 'ring-word-in'}
                      style={{ animationDelay: `${1.1 + (li * 2 + wi) * 0.12}s` }}
                    >
                      {word.text}
                    </span>
                  </span>
                ))}
              </span>
            ))}
          </h1>
        </div>
      </div>
    </section>
  )
}
