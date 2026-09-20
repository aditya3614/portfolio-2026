import { useRef } from 'react'
import { useScrollProgress } from '../hooks/useScrollProgress'
import { Header } from '../components/Header'
import { Overlay } from '../components/Overlay'
import palaceUrl from '../assets/palace-hero.jpg'
import '../hero.css'
import '../palace.css'

/**
 * PALACE HERO — a single photo, scroll-zoomed toward its own vanishing
 * point (the temple at the end of the colonnade) so scrolling reads as
 * walking forward into the space, rather than a 3D scene. No WebGL here at
 * all — a plain scaled <img>, which is both simpler and considerably
 * cheaper to run than the rocket/astronaut scene it replaces.
 */

const SCROLL_LENGTH_VH = 300

// Where the colonnade's mosaic path converges on the distant temple —
// zooming toward this point (rather than the image's centre) is what sells
// "moving forward down the hall" instead of "the photo is getting bigger".
const VANISH_POINT = '47% 60%'

const MAX_SCALE = 2.2

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export default function PalaceHero() {
  const sectionRef = useRef(null)
  const { progress } = useScrollProgress(sectionRef)

  // Fixed-position layers never leave the viewport on their own — fade them
  // out right as the pin releases and stop them eating scroll/click input
  // once they're gone. Same convention as every other pinned section.
  const releaseOpacity = progress < 0.94 ? 1 : Math.max(0, 1 - (progress - 0.94) / 0.06)
  const released = progress >= 1

  const scale = 1 + smoothstep(0, 1, progress) * (MAX_SCALE - 1)
  // Ramps to fully black by the end — both a "passing into shadow" beat and
  // the smoothing layer for the hand-off into Projects' black space, so that
  // cut isn't a jarring bright-photo-to-black pop.
  const fadeOpacity = smoothstep(0.45, 1, progress)

  return (
    <section ref={sectionRef} style={{ position: 'relative', height: `${SCROLL_LENGTH_VH}vh` }}>
      <div style={{ opacity: releaseOpacity, pointerEvents: released ? 'none' : 'auto' }}>
        <div className="palace-image-wrap">
          <img
            className="palace-image"
            src={palaceUrl}
            alt=""
            style={{ transform: `scale(${scale})`, transformOrigin: VANISH_POINT }}
          />
        </div>

        <div className="palace-top-scrim" />
        <div className="palace-fade" style={{ opacity: fadeOpacity }} />

        <Header progress={progress} />
        <Overlay progress={progress} />
      </div>
    </section>
  )
}
