import { Canvas } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { useScrollProgress } from '../hooks/useScrollProgress'
import { SceneContent } from '../components/SceneContent'
import { Background } from '../components/Background'
import { Header } from '../components/Header'
import { Overlay } from '../components/Overlay'
import '../hero.css'

// How many viewport-heights the whole experience plays out over.
// Bigger = slower / more scroll needed to get through the animation.
const SCROLL_LENGTH_VH = 400

export default function Hero() {
  // sectionRef both gives this element its scroll height (400vh) and lets
  // useScrollProgress measure progress relative to *this* section only, so
  // whatever comes after Hero doesn't skew the animation timing.
  const sectionRef = useRef(null)
  const { progressRef, progress } = useScrollProgress(sectionRef)

  // Fixed-position layers never leave the viewport on their own — without
  // this they'd sit on top of every section that follows for the rest of
  // the page. Fade them out right as the pin releases and stop them from
  // eating scroll/click input once they're gone.
  const releaseOpacity = progress < 0.94 ? 1 : Math.max(0, 1 - (progress - 0.94) / 0.06)
  // releaseOpacity reaches exactly 0 at progress 1 — use the same threshold
  // for unmounting so the canvas never pops while still faintly visible.
  const released = progress >= 1

  return (
    <section ref={sectionRef} style={{ position: 'relative', height: `${SCROLL_LENGTH_VH}vh` }}>
      <div
        className="hero-stack"
        style={{ opacity: releaseOpacity, pointerEvents: released ? 'none' : 'auto' }}
      >
        <Background progress={progress} />

        {/* Opens tight on the astronaut's helmet visor — the photo is the
            visor's own texture (Astronaut.jsx), so there's exactly one
            image, not a flat layer standing in for it. Only the rim's edges
            are visible at first; scrolling pulls the camera back out of it. */}
        <div className="canvas-fixed">
          {/* R3F's render loop never stops on its own — an invisible Canvas
              still renders every frame forever, which is exactly what fights
              Projects' own render loop for the main thread once the user has
              scrolled well past Hero. Unmount it once it's fully released
              (already invisible by then, so there's nothing to pop). */}
          {!released && (
            <Canvas
              gl={{
                alpha: true,
                antialias: true,
                // Filmic response with a touch of exposure — linear output
                // clips the metal's speculars flat and is a large part of
                // why an untouched PBR import looks like plastic.
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.15,
              }}
              camera={{ position: [0, 0.45, 1.75], fov: 12 }}
              shadows
            >
              <Suspense fallback={null}>
                <SceneContent progressRef={progressRef} />
              </Suspense>
            </Canvas>
          )}
        </div>

        <Header progress={progress} />
        <Overlay progress={progress} />
      </div>
    </section>
  )
}
