import { useEffect, useRef } from 'react'
import { useScrollProgressRef } from '../hooks/useScrollProgress'
import '../sun-hero.css'

/**
 * SUN HERO — one dithered sun, drawn as real pixel blocks on a canvas.
 *
 * Scrolling flies the camera straight into its core: the sun drifts to the
 * centre of the screen while an exponential zoom pulls it past the edges,
 * then the blocks fall away one by one until only the grid ground is left —
 * the exact backdrop Projects opens on, so arriving there has no seam.
 */

const SCROLL_LENGTH_VH = 300

// Blocks across the sun's radius. Tied to the sun rather than to screen
// pixels, so it has the same chunky resolution on a phone as on a monitor.
const BLOCKS_PER_RADIUS = 30
const GAP_RATIO = 0.1 // hairline between blocks, as a fraction of block size

// Hot core through to the cold rim — sampled off the reference.
const PALETTE = ['#ffe800', '#ffc400', '#ff8a00', '#ff4d0d', '#b33100', '#6b1d00']

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
// zoom to it was flying the camera into empty space every time.
const TARGET_U = 0.62
const TARGET_V = -0.12

const DITHER = 0.3 // per-block noise — this is what breaks smooth rings into speckle
const HOLE_CHANCE = 0.05
const SHIMMER = 0.055
const SHIMMER_FPS = 12 // chunky on purpose: a 60fps shimmer reads as noise, not pixels

const MAX_ZOOM = 260
const SMOOTHING = 7 // higher = snappier follow of the real scroll position

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
const lerp = (a, b, t) => a + (b - a) * t

// Deterministic per-block noise: a block keeps its value while zooming, so
// the pattern grows instead of re-rolling every frame.
function hash(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return n - Math.floor(n)
}

const buckets = PALETTE.map(() => [])

function drawSun(ctx, dpr, w, h, p, time) {
  ctx.clearRect(0, 0, w * dpr, h * dpr)

  const wide = w > 900
  // Sized to sit fully on screen with room to spare vertically, but wide —
  // stretches most of the way across so it reads as large without being
  // cropped by the top/bottom edges.
  const baseR = wide ? Math.min(h * 0.46, w * 0.44) : Math.min(h * 0.36, w * 0.46)
  const restX = wide ? w * 0.64 : w * 0.5
  const restY = wide ? h * 0.5 : h * 0.62

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

  // Held off until late and pushed right to the end: with MAX_ZOOM this
  // large, most of the scroll is spent watching a handful of blocks grow
  // until they're bigger than the screen — the gaps between them (scaled up
  // right along with the blocks) are what read as flying *through* the
  // pixels rather than just toward them. Only right at the end do blocks
  // start winking out, clearing the way to the ground underneath.
  const dissolve = smoothstep(0.7, 1.0, p)

  const iMin = Math.max(-N, Math.floor(-sx / block))
  const iMax = Math.min(N - 1, Math.ceil((w - sx) / block))
  const jMin = Math.max(-N, Math.floor(-sy / block))
  const jMax = Math.min(N - 1, Math.ceil((h - sy) / block))

  for (const b of buckets) b.length = 0

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

      let heat = 0.95 - Math.pow(d1, 1.8) * 0.9
      // A lit rim along the bitten edge, like the inner edge of the reference crescents.
      heat += clamp01(1 - (d2 - CUT_R) / 0.35) * 0.28
      heat += (hash(i, j, 1) - 0.5) * DITHER
      heat += Math.sin(time * 1.4 + hash(i, j, 2) * Math.PI * 2) * SHIMMER

      if (heat < 0.12) continue

      const idx = Math.min(PALETTE.length - 1, Math.max(0, Math.floor((1 - heat) * PALETTE.length)))
      const x0 = Math.round((sx + i * block) * dpr)
      const y0 = Math.round((sy + j * block) * dpr)
      const x1 = Math.round((sx + (i + 1) * block - gap) * dpr)
      const y1 = Math.round((sy + (j + 1) * block - gap) * dpr)
      if (x1 <= x0 || y1 <= y0) continue
      buckets[idx].push(x0, y0, x1 - x0, y1 - y0)
    }
  }

  // One fill per colour instead of a fillStyle switch per block.
  for (let k = 0; k < PALETTE.length; k++) {
    const rects = buckets[k]
    if (!rects.length) continue
    ctx.fillStyle = PALETTE[k]
    ctx.beginPath()
    for (let r = 0; r < rects.length; r += 4) ctx.rect(rects[r], rects[r + 1], rects[r + 2], rects[r + 3])
    ctx.fill()
  }
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

export default function SunHero() {
  const sectionRef = useRef(null)
  const stackRef = useRef(null)
  const canvasRef = useRef(null)
  const cometCanvasRef = useRef(null)
  const titleRef = useRef(null)
  const { progressRef } = useScrollProgressRef(sectionRef)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const cometCanvas = cometCanvasRef.current
    const cometCtx = cometCanvas.getContext('2d')
    const state = { p: progressRef.current, drawnP: -1, tick: -1, hidden: false }

    let w = 0
    let h = 0
    let dpr = 1
    let comets = []
    let stars = []
    let raf = null
    let active = true
    let lastNow = performance.now()

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      cometCanvas.width = canvas.width
      cometCanvas.height = canvas.height
      state.drawnP = -1 // force a redraw at the new size
      comets = makeComets(w, h, 7)
      stars = makeStars(w, h, 13)
    }

    const frame = (now) => {
      if (!active) {
        raf = null
        return
      }
      raf = requestAnimationFrame(frame)

      const dt = Math.min((now - lastNow) / 1000, 0.05)
      lastNow = now

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

      // Runs every frame regardless of the sun's own throttle below — the
      // whole point is that this drifts smoothly while the sun updates in
      // deliberately chunky steps.
      drawComets(cometCtx, dpr, w, h, comets, stars, dt, now / 1000)

      const tick = Math.floor(now / (1000 / SHIMMER_FPS))
      if (tick === state.tick && Math.abs(state.p - state.drawnP) < 0.00005) return
      state.tick = tick
      state.drawnP = state.p

      drawSun(ctx, dpr, w, h, state.p, tick / SHIMMER_FPS)

      // The title rushes past the camera as the flight begins.
      const k = smoothstep(0, 0.28, state.p)
      titleRef.current.style.opacity = String(1 - k)
      titleRef.current.style.transform = `translate3d(${-k * 90}px, 0, 0) scale(${1 + k * 0.35})`
    }

    const start = () => {
      if (raf == null && active) {
        lastNow = performance.now()
        raf = requestAnimationFrame(frame)
      }
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
    start()

    return () => {
      active = false
      if (raf != null) cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [progressRef])

  return (
    <section ref={sectionRef} style={{ position: 'relative', height: `${SCROLL_LENGTH_VH}vh` }}>
      <div ref={stackRef} className="sun-hero-stack space-ground">
        <canvas ref={cometCanvasRef} className="comet-canvas" aria-hidden />
        <canvas ref={canvasRef} className="sun-canvas" aria-hidden />
        <div className="sun-title-wrap">
          <h1 ref={titleRef} className="sun-title">FRONTEND THAT INSPIRES 
           
          </h1>
        </div>
      </div>
    </section>
  )
}
