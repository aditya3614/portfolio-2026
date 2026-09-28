// The hero title, re-drawn in the sun's own block language.
//
// The real <h1> text is laid out by the browser as usual; this rasterises
// those same lines onto an offscreen canvas once, then box-filters that
// raster down to a grid of `size`-pixel cells and paints every cell that's
// mostly ink as one square block with a hairline gap — the same blocks the
// sun is made of. Stepping `size` down from chunky to fine is what reads as
// the title *resolving*; stepping it up again is it breaking apart.
//
// Grids are cached per block size, so animating through a fixed ladder of
// sizes costs one box-filter pass per size, ever — per-frame work is just
// the rect fills.

// Cold rim through white-hot: the sun's palette reversed, running on past
// its yellow core into cream and white, so the title can be "forged" — start
// ember-dark and heat until it's the plain white of the finished type.
const FORGE = ['#6b1d00', '#b33100', '#ff4d0d', '#ff8a00', '#ffc400', '#ffe800', '#fff3cf', '#ffffff']

const INK_THRESHOLD = 0.34 // a cell counts as ink once it's about a third covered
const MARGIN = 48 // canvas bleed past the h1 box, CSS px — blocks overhang the glyphs

function hash(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return n - Math.floor(n)
}

export const TITLE_MARGIN = MARGIN

export function createPixelTitle(canvas, h1) {
  const ctx = canvas.getContext('2d')
  const buckets = FORGE.map(() => [])
  let src = null // { data, w, h } — alpha of the rasterised lines, 1 CSS px per px
  let grids = new Map()
  let dpr = 1
  let W = 0
  let H = 0
  let blank = true

  // Lays the text out exactly where the DOM put it. Each line is its own
  // block-level span carrying its text (minus the red full stop, which stays
  // a DOM element) in data-text; the canvas sits MARGIN px outside the h1 on
  // every side, so positions are offset by that.
  function measure() {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = h1.offsetWidth + MARGIN * 2
    H = h1.offsetHeight + MARGIN * 2
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)

    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const o = off.getContext('2d', { willReadFrequently: true })

    for (const line of h1.querySelectorAll('[data-text]')) {
      const cs = getComputedStyle(line)
      o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      // Tracking has to match or the finished blocks won't line up with the
      // type they cross-fade into. Where the canvas can't track text, the
      // mismatch only shows mid-animation.
      if ('letterSpacing' in o) o.letterSpacing = cs.letterSpacing
      o.fillStyle = '#fff'
      o.textBaseline = 'alphabetic'
      const m = o.measureText('H')
      const asc = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8
      const desc = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2
      // CSS centres the font's content box (ascent + descent) inside the
      // line box; the baseline falls out of that.
      const lineH = line.offsetHeight
      const baseline = line.offsetTop + (lineH - (asc + desc)) / 2 + asc
      o.fillText(line.dataset.text, MARGIN + line.offsetLeft, MARGIN + baseline)
    }

    const img = o.getImageData(0, 0, W, H).data
    const alpha = new Uint8Array(W * H)
    for (let i = 0; i < alpha.length; i++) alpha[i] = img[i * 4 + 3]
    src = { data: alpha, w: W, h: H }
    grids = new Map()
    blank = false
    clear()
  }

  // Coverage per cell: the fraction of the cell's pixels that are ink.
  function grid(size) {
    let g = grids.get(size)
    if (g) return g
    const gw = Math.ceil(src.w / size)
    const gh = Math.ceil(src.h / size)
    const sum = new Float32Array(gw * gh)
    const count = new Float32Array(gw * gh)
    for (let y = 0; y < src.h; y++) {
      const row = Math.floor(y / size) * gw
      for (let x = 0; x < src.w; x++) {
        const c = row + Math.floor(x / size)
        sum[c] += src.data[y * src.w + x]
        count[c] += 255
      }
    }
    const cells = []
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        const c = cy * gw + cx
        const cover = sum[c] / count[c]
        if (cover < INK_THRESHOLD) continue
        // `rank` decides when a cell shows up during a reveal (and when it
        // winks out again): mostly a left-to-right sweep, the second line a
        // beat behind the first, broken up with noise so it isn't a wipe.
        const rank = 0.5 * (cx / gw) + 0.15 * (cy / gh) + 0.35 * hash(cx, cy, 4)
        cells.push(cx * size, cy * size, cover, rank, hash(cx, cy, 8))
      }
    }
    g = { cells, size }
    grids.set(size, g)
    return g
  }

  function clear() {
    if (blank) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    blank = true
  }

  // size   block edge in CSS px
  // reveal 0..1 — cells with a rank under this are drawn
  // glow   0..1 — cold ember through to white
  function draw(size, reveal, glow) {
    if (!src) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    blank = false
    const { cells } = grid(size)
    const gap = Math.max(1 / dpr, size * 0.1)
    const top = FORGE.length - 1
    for (const b of buckets) b.length = 0

    for (let k = 0; k < cells.length; k += 5) {
      if (cells[k + 3] > reveal) continue
      // Denser cells run a little hotter; the per-cell noise is the dither
      // that keeps the ramp from banding into flat stripes.
      const heat = glow * top + (cells[k + 2] - 0.65) * 1.2 + (cells[k + 4] - 0.5) * 1.8
      const idx = Math.min(top, Math.max(0, Math.round(heat)))
      const x0 = Math.round(cells[k] * dpr)
      const y0 = Math.round(cells[k + 1] * dpr)
      const x1 = Math.round((cells[k] + size - gap) * dpr)
      const y1 = Math.round((cells[k + 1] + size - gap) * dpr)
      if (x1 <= x0 || y1 <= y0) continue
      buckets[idx].push(x0, y0, x1 - x0, y1 - y0)
    }

    for (let c = 0; c < FORGE.length; c++) {
      const rects = buckets[c]
      if (!rects.length) continue
      ctx.fillStyle = FORGE[c]
      ctx.beginPath()
      for (let r = 0; r < rects.length; r += 4) ctx.rect(rects[r], rects[r + 1], rects[r + 2], rects[r + 3])
      ctx.fill()
    }
  }

  return { measure, draw, clear, ready: () => src != null }
}
