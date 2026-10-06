import { useEffect, useRef } from 'react'

/**
 * Tracks scroll progress through a pinned section as a 0 -> 1 value, scoped
 * to that section's own scroll range (its height minus one viewport) rather
 * than the whole document — so the animation timing doesn't shift when
 * sections are added/resized, and reaches exactly 1 right as the section
 * releases into whatever comes next.
 *
 * Everything lives in refs: the sections render imperatively (three.js,
 * canvas, CSS transforms written per frame), so React state here would only
 * force a needless re-render on every scroll tick.
 *
 * Also exposes `entryRef`: a 0 -> 1 fade-in that completes exactly as this
 * section's top edge reaches the top of the viewport. `progressRef` alone
 * can't distinguish "haven't scrolled here yet" from "just arrived" — both
 * clamp to 0 — which matters for a pinned section deciding whether it
 * should be visible at all (it must stay hidden before it's reached, or it
 * covers whatever comes before it). Ramping rather than switching lets it
 * cover the previous section while that one is still fading, so the page
 * background never shows through the seam.
 */
const ENTRY_FADE = 0.2 // fraction of a viewport the fade-in spans

// `entryFade` overrides how much of a viewport the fade-in spans — About
// stretches it so its globe can come up out of the dark while Experience is
// still flying toward it.
export function useScrollProgressRef(sectionRef, entryFade = ENTRY_FADE) {
  const progressRef = useRef(0)
  const entryRef = useRef(0)

  useEffect(() => {
    const measure = () => {
      const el = sectionRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      const value = total > 0 ? -rect.top / total : 0
      progressRef.current = Math.min(1, Math.max(0, value))

      const fadeDistance = window.innerHeight * entryFade
      const entry = (fadeDistance - rect.top) / fadeDistance
      entryRef.current = Math.min(1, Math.max(0, entry))
    }

    measure()
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [sectionRef, entryFade])

  return { progressRef, entryRef }
}
