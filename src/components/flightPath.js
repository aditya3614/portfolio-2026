// Shared geometry and motion for the hero flight. The camera has to aim at
// the visor and track the astronaut as it drifts, so the scene (which places
// and moves the astronaut) and the camera rig (which follows it) must agree
// on exactly the same numbers — hence one definition here rather than the
// same values written out in two files that can drift apart.

export const clamp01 = (v) => Math.min(1, Math.max(0, v))

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// --- Astronaut body ----------------------------------------------------------
// NASA's Advanced Crew Escape Suit model (public domain — see Astronaut.jsx).
// Measured by actually loading the glTF and reading real bounding boxes per
// material, not eyeballed — all three NATIVE_* numbers below are as-authored
// (Y-up, standing, 1.996 units feet-to-helmet-crown, before any scaling).
// The visor primitive (material "...aceshelme.008" — the one with almost no
// vertices, a single curved pane rather than the shell's dense mechanical
// detail) centres at 89% of body height and sits proud of the body's own
// Z-centre by ~0.12 native units. The model faces -Z as authored;
// Astronaut.jsx turns it 180° so it faces +Z instead, matching every formula
// below (and CameraRig) which assumes "the thing the camera dives into" sits
// on the +Z side.
//
// MODEL_SCALE brings it up to the same world-space size the rest of this
// file's constants (CLIMB_HEIGHT, DRIFT_X, the cloud layout in
// SceneContent.jsx) were tuned against when this was a 6.6-unit rocket —
// keeping one absolute scale means swapping the body again later only means
// re-measuring the NATIVE_* numbers, not re-tuning every motion constant.
const NATIVE_HEIGHT = 1.996
const NATIVE_VISOR_SURFACE_Z = 0.12
const NATIVE_VISOR_RADIUS = 0.16
const PREVIOUS_BODY_HEIGHT = 6.612 // what MODEL_LENGTH * MODEL_SCALE used to be, for the rocket
export const MODEL_LENGTH = NATIVE_HEIGHT
export const MODEL_SCALE = PREVIOUS_BODY_HEIGHT / NATIVE_HEIGHT
export const BODY_HEIGHT = MODEL_LENGTH * MODEL_SCALE

// Where the astronaut group sits, and where the visor sits inside it.
export const BODY_GROUP_Y = 0
export const VISOR_LOCAL_Y = BODY_HEIGHT * 0.89 // head height, near the top
export const VISOR_Z = NATIVE_VISOR_SURFACE_Z * MODEL_SCALE + 0.02 // +0.02 so it can't z-fight the helmet shell
export const VISOR_RADIUS = NATIVE_VISOR_RADIUS * MODEL_SCALE

// The visor's resting world position — what the camera aims at.
export const VISOR_REST_Y = BODY_GROUP_Y + VISOR_LOCAL_Y
export const BODY_MID_Y = BODY_GROUP_Y + BODY_HEIGHT * 0.5

// --- Motion ------------------------------------------------------------------
// How far the astronaut has drifted upward at a given scroll progress. Flat
// for the first stretch (the visor reveal plays out with the body held
// still), then it pulls away.
export const CLIMB_HEIGHT = 2.6
export const bodyClimb = (t) => smoothstep(0.4, 1, t) * CLIMB_HEIGHT

// Lateral travel. Rising straight up the middle of the frame reads as
// hovering in place; sliding sideways while it rises is what sells it as
// actually going somewhere. The camera only follows part of this (see
// CameraRig), so the body visibly crosses the frame instead of staying
// pinned to the centre.
export const DRIFT_X = 1.4
export const bodyDrift = (t) => smoothstep(0.35, 0.92, t) * DRIFT_X

// --- Framing -----------------------------------------------------------------
// Distance at which a circle of the given radius still covers every corner of
// the viewport, so the opening shot is the photo alone with no rim in frame.
// A circle has to span the frame's *diagonal* to leave no corners showing,
// and the diagonal depends on the aspect ratio — which is why this takes the
// live aspect rather than a fixed number: on a wider screen the camera has to
// sit closer or the rim creeps into the corners.
export const distanceToCover = (radius, fovDeg, aspect, margin = 1.12) =>
  radius / (margin * Math.hypot(1, aspect) * Math.tan((fovDeg * Math.PI) / 360))

// Distance at which a circle of the given radius overfills the viewport
// height by `overfill` — used for the looser shots where some rim is wanted.
export const distanceToFill = (radius, fovDeg, overfill = 1.9) =>
  radius / (overfill * Math.tan((fovDeg * Math.PI) / 360))

// Distance at which an object of the given height fits the viewport.
export const distanceToFit = (height, fovDeg, margin = 1.1) =>
  (height * margin) / (2 * Math.tan((fovDeg * Math.PI) / 360))
