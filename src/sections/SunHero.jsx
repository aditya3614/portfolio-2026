import { useEffect, useRef } from 'react'
import { useScrollProgressRef } from '../hooks/useScrollProgress'
import { createPixelTitle } from '../components/pixelTitle'
import '../sun-hero.css'

/**
 * SUN HERO — one dithered sun, drawn as real pixel blocks on a canvas.
 *
 * The whole hero is about *resolution*. On load the sun ignites block by
 * block, outward from its hottest point, and the title is forged out of the
 * same blocks — chunky and ember-red at first, sharpening and heating to
 * white until it resolves into real type. Scroll then runs that backwards:
 * the title breaks back into blocks and the camera flies straight into the
 * sun's core, an exponential zoom pulling it past the edges until the blocks
 * fall away and only the grid ground is left — the exact backdrop Projects
 * opens on, so arriving there has no seam.
 *
 * In between, the sun answers the cursor: blocks near it run hotter and
 * lean away, and a fast pass across the lit ribbon throws off a few sparks.
 */

const SCROLL_LENGTH_VH = 300

// Blocks across the sun's radius. Tied to the sun rather than to screen
// pixels, so it has the same chunky resolution on a phone as on a monitor.
const BLOCKS_PER_RADIUS = 30
const GAP_RATIO = 0.1 // hairline between blocks, as a fraction of block size

// Hot core through to the cold rim — sampled off the reference.
const PALETTE = ['#ffe800', '#ffc400', '#ff8a00', '#ff4d0d', '#b33100', '#6b1d00']
// A block's first frames when it ignites: hotter than anything in the
// palette, so each one visibly flashes on and then cools into its colour.
const FLASH = '#fff6dc'

// The bite: a same-size disc (CUT_R ~= 1 sun-radius) offset by CUT_DIST
// removes a "full moon minus a sliver" shape rather than lopping off a
// chunk — tapering to true horn-points at top and bottom instead of leaving
// a fat half-disc. This combination measured (by sampling) to ~40% of the
// disc staying lit, which is the empty-enough interior the title sits in.
// Angled toward the title (left-of-centre) so the hollow, not the ribbon,
// is what the text sits over.
const CUT_R = 1.0
const CUT_DIST = 0.65
const CUT_ANGLE = Math.PI + 0.2
const CUT_X = Math.cos(CUT_ANGLE) * CUT_DIST
const CUT_Y = Math.sin(CUT_ANGLE) * CUT_DIST

// Where the camera actually flies into — a point inside the *lit* ribbon
// (well clear of the cut circle, on the thick far side away from it), not
// the disc's own centre. The disc centre is u=0,v=0, which sits inside the
// hollow by construction (that's the whole point of the cut) — pinning the
// zoom to it was flying the camera into empty space every time. It's also
// where the ignition starts, so the first block to light is the one the
// camera will eventually fly through.
const TARGET_U = 0.62
const TARGET_V = -0.12

const DITHER = 0.3 // per-block noise — this is what breaks smooth rings into speckle
const HOLE_CHANCE = 0.05
const SHIMMER = 0.055
const SHIMMER_FPS = 12 // chunky on purpose: a 60fps shimmer reads as noise, not pixels

const MAX_ZOOM = 260
const SMOOTHING = 7 // higher = snappier follow of the real scroll position

// --- Intro timeline (seconds from mount) ----------------------------------
// Ignition spreads outward from the target point: each block's start time
// is its distance from there plus a little noise, so the fire front is
// ragged rather than a clean expanding circle.
const IGNITE_DELAY = 0.15
const IGNITE_SPREAD = 0.55 // seconds per sun-radius of distance
const IGNITE_JITTER = 0.3
const IGNITE_POP = 0.28 // how long one block takes to swell into place
const IGNITE_FLASH = 0.14 // how long it stays white-hot before cooling
const INTRO_END = 1.8 // every block has settled by here

// The title's forge, in its own clock (starts once the sun is half lit and
// the webfont has loaded). One coarse size while the blocks sweep in, then a
// descending ladder — discrete steps, not a smooth scale, so it reads as
// resolution clicking up rather than a blur coming into focus.
const FORGE_AT = 0.6
const FORGE_COARSE = 26
const FORGE_COARSE_FOR = 0.4
const FORGE_LADDER = [18, 13, 9, 6, 4, 3, 2]
const FORGE_STEP = 0.085
const FORGE_HANDOFF = 0.28 // cross-fade from the finest blocks into live type
const FORGE_END = FORGE_COARSE_FOR + FORGE_LADDER.length * FORGE_STEP + FORGE_HANDOFF

// And back the other way as the camera takes off.
const BREAK_LADDER = [2, 3, 4, 6, 9, 13, 18, 26, 36]

// --- Cursor --------------------------------------------------------------
const HEAT_RADIUS = 0.42 // of the sun's radius
const HEAT_BOOST = 0.5
const HEAT_PUSH = 0.9 // how far (in blocks) a block right under the cursor leans away
const PARALLAX = 14 // px the sun drifts against the pointer at rest

// One sun-earth distance, for the HUD's countdown.
const AU_KM = 149597871

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
const lerp = (a, b, t) => a + (b - a) * t
// A small overshoot, so an igniting block swells just past full size and
// settles — it lands rather than just appearing.
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)

// Deterministic per-block noise: a block keeps its value while zooming, so
// the pattern grows instead of re-rolling every frame.
function hash(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return n - Math.floor(n)
}

const buckets = PALETTE.map(() => [])
const flashBucket = []

// Where the disc landed on the last draw — the pointer handler needs it to
// tell whether the cursor is over lit blocks (sparks) without re-deriving
// the camera maths.
const geom = { sx: 0, sy: 0, r: 1 }

// Inside the disc, outside the bite.
const isLit = (u, v) => Math.hypot(u, v) <= 1 && Math.hypot(u - CUT_X, v - CUT_Y) >= CUT_R

// fx carries everything that isn't scroll:
//   intro   seconds since mount (Infinity once settled / reduced motion)
//   mx, my  smoothed pointer, CSS px;  heat 0..1 how present it is
//   ox, oy  parallax offset, CSS px
function drawSun(ctx, dpr, w, h, p, time, fx) {
  ctx.clearRect(0, 0, w * dpr, h * dpr)

  const wide = w > 900
  // Sized to sit fully on screen with room to spare vertically, but wide —
  // stretches most of the way across so it reads as large without being
  // cropped by the top/bottom edges.
  const baseR = wide ? Math.min(h * 0.46, w * 0.44) : Math.min(h * 0.36, w * 0.46)
  const restX = (wide ? w * 0.64 : w * 0.5) + fx.ox
  const restY = (wide ? h * 0.5 : h * 0.62) + fx.oy

  // Exponential in scroll, so the flight feels like a constant speed rather
  // than crawling at first and then lurching.
  const zoom = Math.exp(Math.log(MAX_ZOOM) * Math.pow(p, 1.4))
  const N = BLOCKS_PER_RADIUS
  const block = (baseR / N) * zoom
  const gap = Math.max(1 / dpr, block * GAP_RATIO)

  // Glide the *target point* from its resting position to screen centre —
  // then back-solve the disc centre (sx, sy) so that, at the current zoom,
  // the target point actually lands there. Placing the disc centre in the
  // interpolation directly (as if it were the thing the camera aims at)
  // only holds a fixed point steady under zoom when that point is the disc
  // centre itself — anywhere else on the disc needs this correction.
  const centerT = smoothstep(0, 0.4, p)
  const camX = lerp(restX + TARGET_U * baseR, w * 0.5, centerT)
  const camY = lerp(restY + TARGET_V * baseR, h * 0.5, centerT)
  const sx = camX - TARGET_U * baseR * zoom
  const sy = camY - TARGET_V * baseR * zoom
  geom.sx = sx
  geom.sy = sy
  geom.r = baseR * zoom

  // Held off until late and pushed right to the end: with MAX_ZOOM this
  // large, most of the scroll is spent watching a handful of blocks grow
  // until they're bigger than the screen — the gaps between them (scaled up
  // right along with the blocks) are what read as flying *through* the
  // pixels rather than just toward them. Only right at the end do blocks
  // start winking out, clearing the way to the ground underneath.
  const dissolve = smoothstep(0.7, 1.0, p)

  // The cursor's pull only makes sense while the sun is a thing you're
  // looking *at* — it's gone before the camera commits to the dive.
  const heat = fx.heat * (1 - smoothstep(0, 0.12, p))
  const heatR = baseR * HEAT_RADIUS * zoom
  const intro = fx.intro

  // A slow glint that sweeps the ribbon every few seconds — the one bit of
  // life on screens with no cursor. Driven by the chunky shimmer clock, so
  // it steps across the blocks rather than gliding.
  const glintT = (time % 7) / 2.2
  const glintAt = glintT < 1 ? lerp(-1.4, 1.4, glintT) : 9

  // Pad the visible range by a couple of blocks: pushed blocks can lean in
  // from just off screen.
  const iMin = Math.max(-N, Math.floor(-sx / block) - 2)
  const iMax = Math.min(N - 1, Math.ceil((w - sx) / block) + 2)
  const jMin = Math.max(-N, Math.floor(-sy / block) - 2)
  const jMax = Math.min(N - 1, Math.ceil((h - sy) / block) + 2)

  for (const b of buckets) b.length = 0
  flashBucket.length = 0

  for (let j = jMin; j <= jMax; j++) {
    const v = (j + 0.5) / N
    for (let i = iMin; i <= iMax; i++) {
      const u = (i + 0.5) / N

      const d1 = Math.hypot(u, v)
      if (d1 > 1) continue

      const d2 = Math.hypot(u - CUT_X, v - CUT_Y)
      if (d2 < CUT_R) continue

      if (hash(i, j, 3) < HOLE_CHANCE) continue
      if (hash(i, j, 5) < dissolve) continue

      // Ignition: not lit yet, swelling into place, or (briefly) white-hot.
      let scale = 1
      let flash = false
      if (intro < INTRO_END) {
        const at =
          IGNITE_DELAY +
          Math.hypot(u - TARGET_U, v - TARGET_V) * IGNITE_SPREAD +
          hash(i, j, 9) * IGNITE_JITTER
        const since = intro - at
        if (since <= 0) continue
        scale = since < IGNITE_POP ? easeOutBack(since / IGNITE_POP) : 1
        flash = since < IGNITE_FLASH
      }

      let bx = sx + (i + 0.5) * block
      let by = sy + (j + 0.5) * block

      let t = 0.95 - Math.pow(d1, 1.8) * 0.9
      // A lit rim along the bitten edge, like the inner edge of the reference crescents.
      t += clamp01(1 - (d2 - CUT_R) / 0.35) * 0.28
      t += (hash(i, j, 1) - 0.5) * DITHER
      t += Math.sin(time * 1.4 + hash(i, j, 2) * Math.PI * 2) * SHIMMER
      const g = (u * 0.8 - v * 0.6 - glintAt) / 0.13
      t += Math.exp(-g * g) * 0.2

      // The cursor: a soft falloff that both heats a block and pushes it
      // outward along the line from the pointer — the grid bulges around
      // the cursor like a lens, then relaxes back into place.
      if (heat > 0.001) {
        const dx = bx - fx.mx
        const dy = by - fx.my
        const d = Math.hypot(dx, dy)
        if (d < heatR) {
          const f = (1 - d / heatR) ** 2 * heat
          t += f * HEAT_BOOST
          if (d > 0.001) {
            const push = (f * HEAT_PUSH * block) / d
            bx += dx * push
            by += dy * push
          }
        }
      }

      if (t < 0.12) continue

      const half = ((block - gap) * scale) / 2
      const x0 = Math.round((bx - half - gap / 2) * dpr)
      const y0 = Math.round((by - half - gap / 2) * dpr)
      const x1 = Math.round((bx + half - gap / 2) * dpr)
      const y1 = Math.round((by + half - gap / 2) * dpr)
      if (x1 <= x0 || y1 <= y0) continue
      if (flash) {
        flashBucket.push(x0, y0, x1 - x0, y1 - y0)
        continue
      }
      const idx = Math.min(PALETTE.length - 1, Math.max(0, Math.floor((1 - t) * PALETTE.length)))
      buckets[idx].push(x0, y0, x1 - x0, y1 - y0)
    }
  }

  // One fill per colour instead of a fillStyle switch per block.
  const fill = (rects, color) => {
    if (!rects.length) return
    ctx.fillStyle = color
    ctx.beginPath()
    for (let r = 0; r < rects.length; r += 4) ctx.rect(rects[r], rects[r + 1], rects[r + 2], rects[r + 3])
    ctx.fill()
  }
  for (let k = 0; k < PALETTE.length; k++) fill(buckets[k], PALETTE[k])
  fill(flashBucket, FLASH)
}

// --- Sparks --------------------------------------------------------------
// Thrown off when the cursor drags fast across the lit ribbon: a few single
// blocks that fly out, drift up like embers and cool down the palette as
// they die. Capped low — a handful is delight, a fountain is a gimmick.
const SPARK_MAX = 70

function spawnSparks(sparks, x, y, vx, vy, speed) {
  const n = Math.min(3, Math.floor(speed / 500) + (Math.random() < 0.5 ? 1 : 0))
  for (let k = 0; k < n && sparks.length < SPARK_MAX; k++) {
    const a = Math.random() * Math.PI * 2
    const s = 40 + Math.random() * 110
    const life = 0.5 + Math.random() * 0.7
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * s + vx * 0.12,
      vy: Math.sin(a) * s + vy * 0.12,
      life,
      max: life,
      size: 2 + Math.round(Math.random() * 3),
    })
  }
}

function drawSparks(ctx, dpr, w, h, sparks, dt) {
  ctx.clearRect(0, 0, w * dpr, h * dpr)
  for (let k = sparks.length - 1; k >= 0; k--) {
    const s = sparks[k]
    s.life -= dt
    if (s.life <= 0) {
      sparks.splice(k, 1)
      continue
    }
    const drag = Math.pow(0.08, dt) // loses ~90% of its speed a second
    s.vx *= drag
    s.vy = s.vy * drag - 60 * dt // embers rise
    s.x += s.vx * dt
    s.y += s.vy * dt
    const age = 1 - s.life / s.max
    ctx.globalAlpha = Math.min(1, (s.life / s.max) * 1.6)
    ctx.fillStyle = PALETTE[Math.min(PALETTE.length - 1, Math.floor(age * PALETTE.length))]
    const size = Math.max(1, Math.round(s.size * (1 - age * 0.5) * dpr))
    // Snapped to a 2px lattice so they stay crisp squares, not smeared dots.
    const px = Math.round((s.x * dpr) / 2) * 2
    const py = Math.round((s.y * dpr) / 2) * 2
    ctx.fillRect(px, py, size, size)
  }
  ctx.globalAlpha = 1
}

// --- Comets ------------------------------------------------------------
// A handful of small pixel-block comets drifting diagonally — a quiet bit
// of life in the background, in the same square-block language as the sun.
// Deliberately sparse and dim: this is texture, not a second focal point,
// so it runs on its own canvas at full frame rate while the (much heavier,
// deliberately chunky) sun redraws on its own throttled clock.
const COMET_COUNT = 7
const COMET_BLOCK = 8
const COMET_TRAIL = 9
const COMET_ANGLE = (35 * Math.PI) / 180 // down-right, top-left to bottom-right
const DIR_X = Math.cos(COMET_ANGLE)
const DIR_Y = Math.sin(COMET_ANGLE)
const PERP_X = -DIR_Y
const PERP_Y = DIR_X
const COMET_SPEED_MIN = 90
const COMET_SPEED_RANGE = 170 // each comet's own speed is min + rand()*range — deliberately wide

// Bright/dark pairs a comet's head-to-tail gradient runs between. Several
// palettes rather than one, cycled per comet, so the field reads as mixed
// (warm gold, hot white, cool blue) instead of a single recolored repeat.
const COMET_PALETTES = [
  ['#fff7dd', '#ffe066'], // warm white -> gold, paired with a warm dark tail below
  ['#eaf6ff', '#6fb3ff'], // ice white -> blue
  ['#d7e9ff', '#2f6fdb'], // pale blue -> deep blue
]
const COMET_DARK = [
  ['#b33100', '#6b1d00'],
  ['#123a63', '#081c33'],
  ['#0d2c52', '#061424'],
]

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const BRIGHT_RGB = COMET_PALETTES.map((pair) => pair.map(hexToRgb))
const DARK_RGB = COMET_DARK.map((pair) => pair.map(hexToRgb))
const lerpRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

// Every comet travels the same diagonal, but where it enters from varies
// along *two* independent axes: how far back along that diagonal it starts
// (its head start / stagger) and how far to either side of the centre
// diagonal it sits (spread across a wide perpendicular band — top edge,
// left edge, and everywhere between). Without that second axis every comet
// launches from the same point and just looks like one repeated streak.
function spawnPoint(alongT, perpT, w, h) {
  const diag = Math.hypot(w, h)
  const along = -diag * (0.05 + alongT * 0.6)
  const perp = (perpT - 0.5) * diag * 1.4
  return { x: along * DIR_X + perp * PERP_X, y: along * DIR_Y + perp * PERP_Y }
}

function makeComets(w, h, seed) {
  const comets = []
  for (let i = 0; i < COMET_COUNT; i++) {
    const rand = (n) => hash(i, n, seed)
    const palette = i % COMET_PALETTES.length
    const p = spawnPoint(rand(1), rand(2), w, h)
    comets.push({
      x: p.x,
      y: p.y,
      speed: COMET_SPEED_MIN + rand(5) * COMET_SPEED_RANGE,
      scale: 0.7 + rand(6) * 0.75,
      bright: BRIGHT_RGB[palette][i % 2],
      dark: DARK_RGB[palette][i % 2],
      wobble: rand(7) * Math.PI * 2,
    })
  }
  return comets
}

function respawnComet(c, w, h) {
  const p = spawnPoint(Math.random() * 0.5, Math.random(), w, h)
  c.x = p.x
  c.y = p.y
  c.speed = COMET_SPEED_MIN + Math.random() * COMET_SPEED_RANGE
}

function drawComets(ctx, dpr, w, h, comets, stars, dt, time) {
  ctx.clearRect(0, 0, w * dpr, h * dpr)
  drawStars(ctx, dpr, stars, time)
  const diag = Math.hypot(w, h)

  for (const c of comets) {
    c.x += DIR_X * c.speed * dt
    c.y += DIR_Y * c.speed * dt
    if (c.x - diag * 0.1 > w || c.y - diag * 0.1 > h) respawnComet(c, w, h)

    const block = COMET_BLOCK * c.scale
    // A little perpendicular sinusoidal drift — a real comet doesn't travel
    // in a perfectly rigid line — and the trail tapers and thins toward the
    // tail rather than staying a uniform row of squares.
    for (let t = 0; t < COMET_TRAIL; t++) {
      const tf = t / (COMET_TRAIL - 1)
      const wobble = Math.sin(time * 1.6 + c.wobble + t * 0.5) * block * 0.35 * tf
      const bx = c.x - t * block * 1.15 * DIR_X + PERP_X * wobble
      const by = c.y - t * block * 1.15 * DIR_Y + PERP_Y * wobble
      if (bx < -block || bx > w + block || by < -block || by > h + block) continue

      const size = block * (1.35 - tf * 0.95) // head is chunkiest, tail tapers away
      const alpha = (1 - Math.pow(tf, 1.4)) * 0.65
      if (alpha < 0.02 || size < 1) continue

      const [r, g, b] = lerpRgb(c.bright, c.dark, Math.min(1, tf * 1.3))
      ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha.toFixed(3)})`
      ctx.fillRect(
        Math.round((bx - size / 2) * dpr),
        Math.round((by - size / 2) * dpr),
        Math.max(1, Math.round(size * dpr)),
        Math.max(1, Math.round(size * dpr))
      )
    }
  }
}

// --- Stars ---------------------------------------------------------------
// A very small number of single-point blocks, scattered once and left in
// place, each quietly flickering its own opacity — background texture, not
// motion. Kept in the same square-pixel language as the sun and comets
// rather than soft round dots. Sizes are deliberately uneven — mostly tiny
// with a handful of bigger ones — real starfields read as one size of dot
// otherwise, which is what makes them look artificial.
const STAR_COUNT = 14
const STAR_COLOR = '255, 245, 225'
const STAR_BIG_CHANCE = 0.22 // roughly 1 in 5 gets the larger, shinier treatment

function makeStars(w, h, seed) {
  const stars = []
  for (let i = 0; i < STAR_COUNT; i++) {
    const rand = (n) => hash(i, n, seed)
    const big = rand(3) < STAR_BIG_CHANCE
    stars.push({
      x: rand(1) * w,
      y: rand(2) * h,
      size: big ? 4 + Math.round(rand(3) * 3) : 1 + Math.round(rand(3) * 2), // mostly 1-3px, occasional 4-6px
      big,
      phase: rand(4) * Math.PI * 2,
      speed: 0.35 + rand(5) * 0.7, // gentle — a slow pulse, not a strobe
      base: (big ? 0.35 : 0.15) + rand(6) * 0.25,
    })
  }
  return stars
}

function drawStars(ctx, dpr, stars, time) {
  for (const s of stars) {
    const flicker = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase)
    const alpha = s.base * (0.55 + flicker * 0.45)
    const px = Math.round(s.x * dpr)
    const py = Math.round(s.y * dpr)
    const size = Math.round(s.size * dpr)

    ctx.fillStyle = `rgba(${STAR_COLOR}, ${alpha.toFixed(3)})`
    ctx.fillRect(px, py, size, size)

    // The "shine": a big star also gets a dim one-block halo plus a thin
    // cross-glint through its centre, brightening with the same flicker —
    // cheap to draw and it's what reads as glinting rather than just larger.
    if (s.big) {
      ctx.fillStyle = `rgba(${STAR_COLOR}, ${(alpha * 0.28).toFixed(3)})`
      ctx.fillRect(px - size, py - size, size * 3, size * 3)

      const armAlpha = alpha * (0.4 + flicker * 0.4)
      ctx.fillStyle = `rgba(${STAR_COLOR}, ${armAlpha.toFixed(3)})`
      const cx = px + size / 2
      const cy = py + size / 2
      const arm = size * 2.4
      ctx.fillRect(Math.round(cx - arm / 2), Math.round(cy - dpr / 2), Math.round(arm), Math.max(1, Math.round(dpr)))
      ctx.fillRect(Math.round(cx - dpr / 2), Math.round(cy - arm / 2), Math.max(1, Math.round(dpr)), Math.round(arm))
    }
  }
}

const IST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const formatKm = (km) => `${Math.round(km).toLocaleString('en-US')} KM`

export default function SunHero() {
  const sectionRef = useRef(null)
  const stackRef = useRef(null)
  const canvasRef = useRef(null)
  const cometCanvasRef = useRef(null)
  const sparkCanvasRef = useRef(null)
  const copyRef = useRef(null)
  const titleRef = useRef(null)
  const titleCanvasRef = useRef(null)
  const hudRef = useRef(null)
  const distWrapRef = useRef(null)
  const distRef = useRef(null)
  const clockRef = useRef(null)
  const { progressRef } = useScrollProgressRef(sectionRef)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const cometCanvas = cometCanvasRef.current
    const cometCtx = cometCanvas.getContext('2d')
    const sparkCanvas = sparkCanvasRef.current
    const sparkCtx = sparkCanvas.getContext('2d')
    const copy = copyRef.current
    const h1 = titleRef.current
    const title = createPixelTitle(titleCanvasRef.current, h1)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()

    const state = {
      p: progressRef.current,
      drawnP: -1,
      tick: -1,
      hidden: false,
      // Pointer: raw target, smoothed position, how present it is (fades in
      // and out rather than switching), and a slower copy for parallax.
      tx: 0,
      ty: 0,
      mx: 0,
      my: 0,
      nx: 0.5,
      ny: 0.5,
      inside: false,
      heat: 0,
      // Seconds (on the intro clock) the forge began; null until the
      // webfont is in, so the blocks are cut from the real letterforms.
      forgeAt: null,
      forged: false,
      titleKey: '',
      typeOpacity: -1,
      canvasOpacity: -1,
      sparksDrawn: false,
      second: '',
      dist: '',
    }
    const sparks = []

    let w = 0
    let h = 0
    let dpr = 1
    let comets = []
    let stars = []
    let raf = null
    let active = true
    let lastNow = t0
    let disposed = false

    const measureTitle = () => {
      title.measure()
      state.titleKey = ''
    }

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      cometCanvas.width = canvas.width
      cometCanvas.height = canvas.height
      sparkCanvas.width = canvas.width
      sparkCanvas.height = canvas.height
      state.drawnP = -1 // force a redraw at the new size
      comets = makeComets(w, h, 7)
      stars = makeStars(w, h, 13)
      if (title.ready()) measureTitle()
    }

    // The title is only worth forging from the real face; give the webfont
    // a moment, then go with whatever's there rather than hold the intro.
    const fontReady = Promise.race([
      document.fonts?.load("500 64px 'Geist'") ?? Promise.resolve(),
      new Promise((r) => setTimeout(r, 1200)),
    ])
    fontReady.then(() => {
      if (disposed) return
      measureTitle()
      const now = (performance.now() - t0) / 1000
      state.forgeAt = reduced ? -FORGE_END : Math.max(FORGE_AT, now)
      copy.classList.add('is-forging')
      start()
    })

    const setCanvasOpacity = (v) => {
      if (v === state.canvasOpacity) return
      state.canvasOpacity = v
      titleCanvasRef.current.style.opacity = String(v)
    }

    const setType = (v) => {
      if (v === state.typeOpacity) return
      state.typeOpacity = v
      h1.style.setProperty('--type', String(v))
    }

    const drawTitle = (size, reveal, glow) => {
      const key = `${size}|${reveal.toFixed(3)}|${glow.toFixed(2)}`
      if (key === state.titleKey) return
      state.titleKey = key
      title.draw(size, reveal, glow)
    }
    const clearTitle = () => {
      if (state.titleKey === 'clear') return
      state.titleKey = 'clear'
      title.clear()
    }

    // k: how far the title has broken apart on the way into the sun.
    const updateTitle = (intro, k) => {
      if (state.forgeAt == null || !title.ready()) {
        setType(0)
        return
      }
      if (k > 0.002) {
        setType(0)
        setCanvasOpacity(1)
        const i = Math.min(BREAK_LADDER.length - 1, Math.floor(k * BREAK_LADDER.length))
        drawTitle(BREAK_LADDER[i], 1.01 - k * 1.1, 1 - k * 0.85)
        return
      }
      const ft = intro - state.forgeAt
      if (ft >= FORGE_END) {
        setType(1)
        clearTitle()
        if (!state.forged) {
          state.forged = true
          copy.classList.add('is-forged')
        }
        return
      }
      if (ft < 0) {
        setType(0)
        clearTitle()
        return
      }
      const size =
        ft < FORGE_COARSE_FOR
          ? FORGE_COARSE
          : FORGE_LADDER[Math.min(FORGE_LADDER.length - 1, Math.floor((ft - FORGE_COARSE_FOR) / FORGE_STEP))]
      const reveal = smoothstep(0, FORGE_COARSE_FOR + 0.12, ft) * 1.01
      const glow = smoothstep(0.05, FORGE_COARSE_FOR + FORGE_LADDER.length * FORGE_STEP, ft)
      // The finest blocks cross-fade into the live type underneath, so the
      // last step is from pixels to real, selectable, crisp text.
      const handoff = clamp01((ft - (FORGE_END - FORGE_HANDOFF)) / FORGE_HANDOFF)
      const fade = Math.round(handoff * 100) / 100
      setCanvasOpacity(1 - fade)
      setType(fade)
      drawTitle(size, reveal, glow)
    }

    const frame = (now) => {
      if (!active) {
        raf = null
        return
      }
      raf = requestAnimationFrame(frame)

      const dt = Math.min((now - lastNow) / 1000, 0.05)
      lastNow = now
      const intro = reduced ? Infinity : (now - t0) / 1000

      // Ease toward the real scroll position rather than snapping to it —
      // wheel steps and trackpad flicks become one continuous glide.
      const target = progressRef.current
      state.p += (target - state.p) * Math.min(1, dt * SMOOTHING)
      if (Math.abs(target - state.p) < 0.0002) state.p = target

      // Fully dissolved and scrolled past: nothing left but ground, which
      // Projects draws identically on top — hide instead of painting it.
      const hide = state.p >= 0.999
      if (hide !== state.hidden) {
        state.hidden = hide
        stackRef.current.style.visibility = hide ? 'hidden' : 'visible'
      }
      if (hide) return

      // Pointer, smoothed: position follows quickly, presence and parallax
      // lazily, so entering or leaving the window never snaps anything.
      state.heat += ((state.inside ? 1 : 0) - state.heat) * Math.min(1, dt * 3)
      if (state.heat < 0.001) state.heat = 0
      state.mx += (state.tx - state.mx) * Math.min(1, dt * 14)
      state.my += (state.ty - state.my) * Math.min(1, dt * 14)
      state.nx += ((state.inside ? state.tx / w : 0.5) - state.nx) * Math.min(1, dt * 2.5)
      state.ny += ((state.inside ? state.ty / h : 0.5) - state.ny) * Math.min(1, dt * 2.5)
      const px = state.nx - 0.5
      const py = state.ny - 0.5

      // Runs every frame regardless of the sun's own throttle below — the
      // whole point is that this drifts smoothly while the sun updates in
      // deliberately chunky steps.
      drawComets(cometCtx, dpr, w, h, comets, stars, dt, now / 1000)
      if (sparks.length || state.sparksDrawn) {
        drawSparks(sparkCtx, dpr, w, h, sparks, dt)
        state.sparksDrawn = sparks.length > 0
      }

      // Title, copy and HUD — the title rushes past the camera as the flight
      // begins; the chrome just gets out of the way. The distance readout
      // stays to count the approach down, and only goes as you arrive.
      const k = smoothstep(0, 0.28, state.p)
      updateTitle(intro, k)
      h1.style.transform = `translate3d(${-k * 90 + px * 10}px, ${py * 8}px, 0) scale(${1 + k * 0.35})`
      const chrome = String(1 - smoothstep(0, 0.1, state.p))
      copy.style.setProperty('--chrome', chrome)
      hudRef.current.style.opacity = chrome
      distWrapRef.current.style.opacity = String(1 - smoothstep(0.8, 0.95, state.p))

      const zoom = Math.exp(Math.log(MAX_ZOOM) * Math.pow(state.p, 1.4))
      const dist = formatKm((AU_KM * (1 / zoom - 1 / MAX_ZOOM)) / (1 - 1 / MAX_ZOOM))
      if (dist !== state.dist) {
        state.dist = dist
        distRef.current.textContent = dist
      }
      const second = IST.format(new Date())
      if (second !== state.second) {
        state.second = second
        clockRef.current.textContent = second
      }

      // The sun redraws on its chunky shimmer clock — except while it's
      // igniting or the cursor is on it, which both need every frame.
      const live = intro < INTRO_END || state.heat > 0
      const tick = Math.floor(now / (1000 / SHIMMER_FPS))
      if (!live && tick === state.tick && Math.abs(state.p - state.drawnP) < 0.00005) return
      state.tick = tick
      state.drawnP = state.p

      drawSun(ctx, dpr, w, h, state.p, reduced ? 0 : tick / SHIMMER_FPS, {
        intro,
        mx: state.mx,
        my: state.my,
        heat: reduced ? 0 : state.heat,
        ox: -px * PARALLAX * 2,
        oy: -py * PARALLAX * 2,
      })
    }

    function start() {
      if (raf == null && active) {
        lastNow = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    // Mouse and pen only — on touch, a finger on the glass is a scroll, not
    // a cursor, and the sun lighting up under every swipe would be noise.
    let last = null
    const onMove = (e) => {
      if (e.pointerType === 'touch') return
      state.tx = e.clientX
      state.ty = e.clientY
      if (!state.inside) {
        state.inside = true
        state.mx = e.clientX
        state.my = e.clientY
      }
      if (reduced || state.p > 0.1) return
      const t = e.timeStamp
      if (last && t > last.t) {
        const vx = ((e.clientX - last.x) / (t - last.t)) * 1000
        const vy = ((e.clientY - last.y) / (t - last.t)) * 1000
        const speed = Math.hypot(vx, vy)
        const u = (e.clientX - geom.sx) / geom.r
        const v = (e.clientY - geom.sy) / geom.r
        if (speed > 350 && isLit(u, v)) spawnSparks(sparks, e.clientX, e.clientY, vx, vy, speed)
      }
      last = { x: e.clientX, y: e.clientY, t }
    }
    const onLeave = (e) => {
      if (e.relatedTarget) return
      state.inside = false
      last = null
    }

    // Stop the loop entirely once the section is well off screen.
    const io = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting
        if (active) start()
      },
      { rootMargin: '20% 0px' }
    )
    io.observe(sectionRef.current)

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerout', onLeave)
    start()

    return () => {
      disposed = true
      active = false
      if (raf != null) cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onLeave)
    }
  }, [progressRef])

  return (
    <section ref={sectionRef} style={{ position: 'relative', height: `${SCROLL_LENGTH_VH}vh` }}>
      <div ref={stackRef} className="sun-hero-stack space-ground">
        <canvas ref={cometCanvasRef} className="comet-canvas" aria-hidden />
        <canvas ref={canvasRef} className="sun-canvas" aria-hidden />
        <canvas ref={sparkCanvasRef} className="spark-canvas" aria-hidden />

        <div className="sun-title-wrap">
          <div ref={copyRef} className="sun-copy">
            <p className="sun-eyebrow">
              <span>Hi, I’m Aditya Dave</span>
            </p>
            <h1 ref={titleRef} className="sun-title" aria-label="Every pixel, on purpose.">
              <canvas ref={titleCanvasRef} className="sun-title-canvas" aria-hidden />
              <span className="sun-title-line" data-text="EVERY PIXEL," aria-hidden>
                EVERY PIXEL,
              </span>
              <span className="sun-title-line" data-text="ON PURPOSE" aria-hidden>
                ON PURPOSE<span className="sun-title-dot" />
              </span>
            </h1>
            <p className="sun-sub">
              <span>
                A frontend engineer between design and code — obsessing over the details until an
                interface feels&nbsp;right.
              </span>
            </p>
          </div>
        </div>

        {/* Viewfinder chrome: four corner ticks and a readout in each corner,
            in the same small mono voice as the Projects HUD. */}
        <div ref={hudRef} className="sun-hud" aria-hidden>
          <span className="sun-hud-tick tl" />
          <span className="sun-hud-tick tr" />
          <span className="sun-hud-tick bl" />
          <span className="sun-hud-tick br" />
          <div className="sun-hud-cell tl">
            <b>Aditya Dave</b>
            <span>Portfolio — 2026</span>
          </div>
          <div className="sun-hud-cell tr">
            <span>BLR 12.97°N 77.59°E</span>
            <span>
              IST <b ref={clockRef}>--:--:--</b>
            </span>
          </div>
          <div className="sun-hud-cell bl">
            <span className="sun-scroll-cue">
              <i />
              <i />
              <i />
            </span>
            <span>Scroll to fly in</span>
          </div>
        </div>
        <div ref={distWrapRef} className="sun-hud-cell br" aria-hidden>
          <span>Dist. to sun</span>
          <b ref={distRef}>{formatKm(AU_KM)}</b>
        </div>
      </div>
    </section>
  )
}
