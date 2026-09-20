import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Cloud, Environment } from '@react-three/drei'
import { Astronaut } from './Astronaut'
import { CameraRig } from './CameraRig'
import { smoothstep, bodyClimb, bodyDrift, BODY_GROUP_Y, BODY_MID_Y } from './flightPath'

export function SceneContent({ progressRef }) {
  const bodyRef = useRef()
  const windowRef = useRef()
  const cloudsRef = useRef()

  useFrame(({ clock }) => {
    if (!bodyRef.current) return
    const t = progressRef.current

    // Hold the astronaut perfectly still while the camera pulls back out of
    // the visor (CameraRig's first beat) — otherwise the visor drifts off
    // the fixed look-at target before the reveal lands.
    const settle = smoothstep(0.3, 0.45, t)

    // One deliberate turn across the ascent, not an endless spin: a single
    // full revolution (a zero-g tumble) that lands the visor facing the
    // camera again by the end, ready for the dive back into it.
    const turn = smoothstep(0.35, 0.85, t) * Math.PI * 2
    bodyRef.current.rotation.y = turn

    // Actually travel: rise, and cross the frame at the same time, so it
    // reads as leaving rather than hovering in place.
    const bob = Math.sin(clock.elapsedTime * 0.6) * 0.05 * settle
    bodyRef.current.position.y = BODY_GROUP_Y + bodyClimb(t) + bob
    bodyRef.current.position.x = bodyDrift(t)

    // Lean into the direction of travel — a body that slides sideways while
    // staying bolt upright looks like it's being dragged.
    bodyRef.current.rotation.z =
      Math.sin(clock.elapsedTime * 0.4) * 0.03 * settle - smoothstep(0.35, 0.92, t) * 0.18


    // The view through the visor darkens as the astronaut leaves the
    // atmosphere, so that when the camera dives back into the glass at the
    // end it arrives in space — the same black the Projects section opens
    // on, which is what makes the hand-off read as going through the visor
    // rather than cutting to a different scene.
    if (windowRef.current) {
      const toSpace = smoothstep(0.55, 0.95, t)
      windowRef.current.material.color.setScalar(1 - toSpace)
    }

    // Thin the cloud deck out as the astronaut climbs through it. These are
    // dense and white, so while they're up they cover the whole frame and
    // the sky behind can't be seen changing at all — the climb out of the
    // atmosphere only reads once they clear.
    if (cloudsRef.current) {
      const thinning = 1 - smoothstep(0.35, 0.7, t)
      cloudsRef.current.traverse((obj) => {
        if (obj.material) {
          obj.material.transparent = true
          obj.material.opacity = (obj.userData.baseOpacity ??= obj.material.opacity) * thinning
        }
      })
      cloudsRef.current.visible = thinning > 0.01
    }
  })

  return (
    <>
      {/* Three-point-ish setup rather than flat fill. A high ambient washes
          out a PBR model's normal and roughness maps completely — all that
          authored surface detail only shows up under directional light with
          real speculars and shadowed falloff, which is most of what
          separates "3D asset" from "photographed object". */}
      <ambientLight intensity={0.14} />
      {/* key */}
      <directionalLight position={[5, 7, 4]} intensity={1.7} castShadow />
      {/* cool fill, so the shadow side isn't dead black */}
      <directionalLight position={[-5, 1, -2]} intensity={0.3} color={'#7fb2ff'} />
      {/* rim from behind — the edge highlight that makes it pop off the sky */}
      <directionalLight position={[-2, 3, -6]} intensity={1.0} color={'#ffd9b0'} />

      {/* Drives the metal's speculars. Neutral preset on purpose — a colourful
          one reflects off the hull as a second sky competing with the photo
          in the window. Enough to read as metal, not so much that the
          panel and grime detail washes out. */}
      <Environment preset="studio" environmentIntensity={0.45} />

      {/* Atmospheric clouds drifting around the astronaut for parallax + depth.
          Grouped so the climb can thin them out on the way up. */}
      <group ref={cloudsRef}>
        <Cloud position={[-3.5, BODY_MID_Y, -4]} speed={0.15} opacity={0.5} segments={20} bounds={[3, 1, 1]} />
        <Cloud position={[3.5, BODY_MID_Y - 1.6, -6]} speed={0.1} opacity={0.4} segments={20} bounds={[4, 1.5, 1]} />
        <Cloud position={[0, BODY_MID_Y + 1.8, -8]} speed={0.12} opacity={0.35} segments={20} bounds={[5, 1.5, 1]} />
      </group>

      <Astronaut groupRef={bodyRef} windowRef={windowRef} position={[0, BODY_GROUP_Y, 0]} />

      <CameraRig progressRef={progressRef} windowRef={windowRef} />
    </>
  )
}
