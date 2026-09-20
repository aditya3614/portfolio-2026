import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  bodyClimb,
  bodyDrift,
  smoothstep,
  distanceToCover,
  distanceToFill,
  distanceToFit,
  VISOR_REST_Y,
  VISOR_Z,
  VISOR_RADIUS,
  BODY_HEIGHT,
  BODY_MID_Y,
} from './flightPath'

// Derived rather than hard-coded, so the shots stay correctly framed if the
// visor size or the body model ever changes.
const REVEAL_Z = VISOR_Z + distanceToFill(VISOR_RADIUS, 22, 0.55) // visor + surrounding helmet
const WIDE_Z = distanceToFit(BODY_HEIGHT, 40) // the whole astronaut in frame
const OPEN_FOV = 12

// Each keyframe: t (0-1 scroll progress), camera position, look-at target,
// fov. Positions and targets are given relative to the astronaut's resting
// height; the climb is added on afterwards so the camera tracks the body as
// it ascends instead of watching it leave the frame.
//
// The story, in order:
//   0.00 - 0.28  locked on the glass, dollying back — the visor reveal
//   0.28 - 0.50  the whole astronaut comes into view
//   0.50 - 0.80  it climbs away, camera swinging round to follow
//   0.80 - 1.00  back to the visor, and straight into it
const VISOR = [0, VISOR_REST_Y, VISOR_Z]

// `aimWindow` frames point at the visor's *live* world position rather than
// this fallback. The body climbs, drifts and leans, and re-deriving where
// the visor ended up from those three transforms — in a second file — is
// exactly how the aim drifted off it before. Reading the real position can't
// disagree with itself.
//
// openZ depends on the viewport's aspect ratio (a circle has to span the
// diagonal to leave no corners showing), so the first two keyframes are built
// per-frame rather than baked in.
const keyframesFor = (openZ) => [
  { t: 0.0, pos: [0, VISOR_REST_Y, openZ], look: VISOR, aimWindow: true, fov: OPEN_FOV },
  { t: 0.12, pos: [0, VISOR_REST_Y, openZ + 0.65], look: VISOR, aimWindow: true, fov: 16 },
  { t: 0.28, pos: [0, VISOR_REST_Y, REVEAL_Z], look: VISOR, aimWindow: true, fov: 22 },
  { t: 0.45, pos: [0, BODY_MID_Y, WIDE_Z], look: [0, BODY_MID_Y, 0], fov: 40 },
  { t: 0.65, pos: [WIDE_Z * 0.3, BODY_MID_Y + 0.4, WIDE_Z], look: [0, BODY_MID_Y, 0], fov: 42 },
  { t: 0.8, pos: [REVEAL_Z * 0.4, VISOR_REST_Y, REVEAL_Z * 1.3], look: VISOR, aimWindow: true, fov: 34 },
  // Ends essentially at the glass: the visor fills the frame and the camera
  // passes into it, handing straight over to the Projects section.
  { t: 1.0, pos: [0, VISOR_REST_Y, VISOR_Z + 0.28], look: VISOR, aimWindow: true, fov: 20 },
]

// Which keyframes ride along with the climbing astronaut. The opening beats
// play out before the body has moved, so they stay put.
const CLIMB_FROM = 0.28

function easeInOut(x) {
  return x * x * (3 - 2 * x) // smoothstep
}

function sampleKeyframes(t, aspect) {
  const clamped = Math.min(1, Math.max(0, t))
  const openZ = VISOR_Z + distanceToCover(VISOR_RADIUS, OPEN_FOV, aspect)
  const frames = keyframesFor(openZ)

  let a = frames[0]
  let b = frames[frames.length - 1]
  for (let i = 0; i < frames.length - 1; i++) {
    if (clamped >= frames[i].t && clamped <= frames[i + 1].t) {
      a = frames[i]
      b = frames[i + 1]
      break
    }
  }
  const span = b.t - a.t || 1
  const alpha = easeInOut((clamped - a.t) / span)

  const pos = a.pos.map((v, i) => THREE.MathUtils.lerp(v, b.pos[i], alpha))
  const look = a.look.map((v, i) => THREE.MathUtils.lerp(v, b.look[i], alpha))
  const fov = THREE.MathUtils.lerp(a.fov, b.fov, alpha)

  // Track the astronaut's ascent once it starts moving.
  const follow = bodyClimb(clamped) * smoothstep(CLIMB_FROM, CLIMB_FROM + 0.1, clamped)
  pos[1] += follow
  look[1] += follow

  // Follow its sideways travel only partly, so it visibly crosses the frame
  // rather than staying pinned to the centre.
  const drift = bodyDrift(clamped)
  const driftFollow = THREE.MathUtils.lerp(0.62, 1, smoothstep(0.75, 0.92, clamped))
  pos[0] += drift * driftFollow
  look[0] += drift * driftFollow

  // How much this moment is aiming at the visor vs. the body.
  const aim = THREE.MathUtils.lerp(a.aimWindow ? 1 : 0, b.aimWindow ? 1 : 0, alpha)

  return { pos, look, fov, aim, drift }
}

const tmpLook = new THREE.Vector3()
const tmpPos = new THREE.Vector3()
const tmpWindow = new THREE.Vector3()

export function CameraRig({ progressRef, windowRef }) {
  useFrame(({ camera }) => {
    const { pos, look, fov, aim, drift } = sampleKeyframes(progressRef.current, camera.aspect)

    tmpLook.set(...look)

    // Aim at where the visor actually is. The body's lean swings it sideways
    // by nearly a world unit, which at dive range is the difference between
    // the visor filling the frame and sitting off the edge.
    if (aim > 0 && windowRef?.current) {
      // Some meshes (the astronaut's visor) carry an identity transform of
      // their own — their real position lives in geometry, not in the
      // Object3D — so an aimAnchor child stands in for "where this actually
      // is" when the mesh's own getWorldPosition would just return its
      // parent's origin. Plain meshes (nothing sets this) read themselves.
      const aimTarget = windowRef.current.userData.aimAnchor || windowRef.current
      aimTarget.getWorldPosition(tmpWindow)
      tmpLook.lerp(tmpWindow, aim)
      // Slide the camera across by the same amount, so the dive comes in
      // square to the glass rather than at an angle.
      pos[0] += (tmpWindow.x - drift) * aim
    }

    tmpPos.set(...pos)
    camera.position.lerp(tmpPos, 0.12)
    camera.lookAt(tmpLook)

    if (camera.fov !== fov) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, fov, 0.12)
      camera.updateProjectionMatrix()
    }
  })

  return null
}
