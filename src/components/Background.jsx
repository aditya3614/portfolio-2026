const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * The climb out of the atmosphere, told in three cross-faded layers:
 *  1) daylight sky   — where the rocket starts
 *  2) high altitude  — thinner, deeper blue
 *  3) space          — ends on Projects' own background colour, so the
 *                      hand-off into that section is a continuation of the
 *                      same journey rather than a cut to a new backdrop.
 */
export function Background({ progress }) {
  const highIn = smoothstep(0.25, 0.55, progress) // day sky -> high altitude
  const spaceIn = smoothstep(0.6, 0.95, progress) // high altitude -> space

  return (
    <div className="bg-stack" aria-hidden>
      <div className="bg-layer bg-day" style={{ opacity: 1 - highIn }} />
      <div className="bg-layer bg-high" style={{ opacity: highIn * (1 - spaceIn) }} />
      <div className="bg-layer bg-space" style={{ opacity: spaceIn }} />
    </div>
  )
}
