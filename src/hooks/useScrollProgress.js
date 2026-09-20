import { useEffect, useRef, useState } from 'react'

/**
 * Tracks scroll progress through a pinned section as a 0 -> 1 value, scoped
 * to that section's own scroll range (its height minus one viewport) rather
 * than the whole document — so the animation timing doesn't shift when
 * sections are added/resized after Hero, and reaches exactly 1 right as the
 * section releases into whatever comes next.
 *
 * - `progressRef.current` updates every scroll/animation frame with no React
 *   re-render, so it's safe to read inside useFrame() for buttery camera moves.
 * - `progress` (state) updates ~30x/sec, enough for DOM things like the
 *   header color or text fades, without re-rendering on every pixel of scroll.
 */
export function useScrollProgress(sectionRef) {
  const progressRef = useRef(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let raf = null

    const measure = () => {
      const el = sectionRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      const value = total > 0 ? -rect.top / total : 0
      progressRef.current = Math.min(1, Math.max(0, value))
    }

    const onScroll = () => {
      measure()
      if (raf) return
      raf = requestAnimationFrame(() => {
        setProgress(progressRef.current)
        raf = null
      })
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [sectionRef])

  return { progressRef, progress }
}

/**
 * Same idea, but for pinned sections driven entirely by imperative/ref-based
 * rendering (raw three.js, canvas, etc.) that never read `progress` as React
 * state — every scroll tick would otherwise force a needless re-render for
 * no visual benefit. Zero useState here, so scrolling never re-renders the
 * component at all.
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

export function useScrollProgressRef(sectionRef) {
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

      const fadeDistance = window.innerHeight * ENTRY_FADE
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
  }, [sectionRef])

  return { progressRef, entryRef }
}
