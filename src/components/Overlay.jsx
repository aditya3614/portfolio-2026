const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// Visible fully between [inStart, inEnd] .. [outStart, outEnd], fading at the edges
function bandOpacity(p, inStart, inEnd, outStart, outEnd) {
  const fadeIn = smoothstep(inStart, inEnd, p)
  const fadeOut = 1 - smoothstep(outStart, outEnd, p)
  return Math.min(fadeIn, fadeOut)
}

export function Overlay({ progress }) {
  // Visible immediately on load (sitting on the glass, which fills the whole
  // viewport), then easing down and out as the camera dollies back off it.
  // Only a gentle shrink — it should read as riding the surface, not as a
  // separate layer being scaled away.
  const heroOpacity = 1 - smoothstep(0.24, 0.34, progress)
  const midOpacity = bandOpacity(progress, 0.42, 0.5, 0.62, 0.7)
  // Fades in and simply holds — no fade-out band here (outStart===outEnd
  // would divide by zero in smoothstep exactly at progress===1, which is
  // exactly the scroll position where Hero hands off to whatever follows).
  // The wrapping hero-stack's own releaseOpacity already fades this out.
  const endOpacity = smoothstep(0.8, 0.9, progress)

  const heroScale = 1 - smoothstep(0, 0.3, progress) * 0.2

  return (
    <div className="overlay">
      <div className="overlay-block" style={{ opacity: heroOpacity, transform: `scale(${heroScale})` }}>
        <h1>Say hello to tinyRocket.</h1>
        <button className="watch">Watch ›</button>
      </div>

      <div className="overlay-block split" style={{ opacity: midOpacity }}>
        <h2>
          Reinventing the launch pad&hellip; <em>A tiny bit.</em>
        </h2>
      </div>

      <div className="overlay-block" style={{ opacity: endOpacity }}>
        <h2 className="dark">Everything you need.</h2>
      </div>
    </div>
  )
}
