import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF, useTexture } from '@react-three/drei'
import astronautUrl from '../assets/astronaut.glb'
import sunsetUrl from '../assets/hero-window-sunset.jpg'
import { MODEL_SCALE } from './flightPath'

// How far the model's albedo is knocked back. NASA's export ships flat,
// fully-lit Maya lambert/blinn colours baked as glTF baseColorFactors with no
// texture maps at all — untouched, every surface reads as flat matte plastic
// under real lighting, which is what actually makes a model look cheap
// (compare Rocket.jsx's HULL_TINT, same fix for the same underlying problem).
const SUIT_TINT = 0.82

/**
 * NASA's Advanced Crew Escape Suit (ACES) — the orange launch/entry suit.
 * Public domain (US government work): nasa/NASA-3D-Resources on GitHub,
 * "3D Models/Advanced Crew Escape Suit". Picked over the classic white EMU
 * spacewalk suit for two reasons: a third the file size (858KB vs 3.3MB —
 * this page already had a scroll-jank problem once), and its helmet visor is
 * its own named material ("...aceshelme.008"), so the "camera dives into the
 * visor" beat can target the model's real geometry instead of a hand-built
 * stand-in the way Rocket.jsx had to build its own porthole.
 *
 * The visor mesh is found by material name at load time rather than by a
 * hard-coded child index — glTF export order isn't a contract, and a
 * material name surviving a re-export is far more likely than a primitive
 * staying 6th in the array.
 */
export function Astronaut({ windowRef, groupRef, ...props }) {
  const { scene } = useGLTF(astronautUrl)
  const sunset = useTexture(sunsetUrl)
  sunset.colorSpace = THREE.SRGBColorSpace

  const bodyRef = useRef()

  // Crop the sunset photo to the visor like CSS object-fit: cover — see
  // hero.css's fix for the same non-square-photo-on-round-window problem.
  useLayoutEffect(() => {
    const { width, height } = sunset.image
    const imageAspect = width / height
    if (imageAspect > 1) {
      sunset.repeat.set(1 / imageAspect, 1)
      sunset.offset.set((1 - 1 / imageAspect) / 2, 0)
    } else {
      sunset.repeat.set(1, imageAspect)
      sunset.offset.set(0, (1 - imageAspect) / 2)
    }
    sunset.needsUpdate = true
  }, [sunset])

  // Clone so this never mutates the cached glTF — useGLTF hands out a shared
  // scene, and mutating it would corrupt the model for any later mount.
  const body = useMemo(() => scene.clone(true), [scene])

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return

    // Idempotency guard: this destructively replaces the visor's material
    // (see below), which erases the "aceshelme" name the second pass would
    // need to find it again — and StrictMode's mount/cleanup/mount in dev
    // runs this effect twice against the same memoized clone. Without this
    // guard the second pass can't relocate the visor and silently renders
    // nothing.
    if (el.userData.astronautConfigured) {
      if (windowRef) windowRef.current = el.userData.visorMesh
      return
    }

    // Already authored standing, Y-up — unlike the rocket this needs no
    // lie-down correction, just turned to face +Z (it's authored facing -Z)
    // so it matches every other convention in flightPath.js/CameraRig.
    el.rotation.set(0, Math.PI, 0)
    el.scale.setScalar(MODEL_SCALE)
    el.position.set(0, 0, 0)
    el.updateWorldMatrix(true, true)

    const box = new THREE.Box3().setFromObject(el)
    const center = box.getCenter(new THREE.Vector3())
    el.position.set(-center.x, -box.min.y, -center.z)
    el.updateWorldMatrix(true, true)

    let visorMesh = null
    let visorVertCount = Infinity

    el.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true

      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => {
        if (!m || m.userData.graded) return
        const name = m.name || ''

        if (name.includes('aceshelme')) {
          // Three materials share this helmet region — the shell (dense,
          // structural detail) and the neck-ring assembly are the two with
          // the most vertices; the visor pane itself is the simple curved
          // sheet with almost none. Whichever mesh using an "aceshelme"
          // material has the fewest vertices in the whole model is it.
          const vertCount = o.geometry.attributes.position.count
          if (vertCount < visorVertCount) {
            visorVertCount = vertCount
            visorMesh = o
          }
          // Gold-ish reflective visor coating rather than the flat black it
          // ships as — real ACES/EVA visors are a metallized coating, and a
          // matte black pane read as a hole cut in the helmet, not glass.
          m.color.set('#3a2a10')
          m.metalness = 0.75
          m.roughness = 0.18
        } else {
          // Fabric/shell/hardware: knock the flat, overbright Maya colours
          // back and put some roughness variation in so it doesn't read as
          // one uniform plastic surface.
          m.color.multiplyScalar(SUIT_TINT)
          if (m.metalness !== undefined) m.metalness = Math.min(1, m.metalness + 0.08)
          if (m.roughness !== undefined) m.roughness = Math.max(0.35, m.roughness - 0.35)
        }
        m.userData.graded = true // cloned materials are shared per-clone; only grade once
      })
    })

    // The visor is the camera's actual dive-through target — swap its
    // material for the same unlit "photo behind glass" treatment Rocket.jsx
    // used, so CameraRig's aimWindow logic (which reads a live world
    // position every frame) has a real, correctly-curved surface to aim at
    // instead of a flat stand-in floating in front of the face.
    let anchor = null
    if (visorMesh) {
      visorMesh.material = new THREE.MeshBasicMaterial({ map: sunset, toneMapped: false })

      // getWorldPosition() on the mesh itself doesn't work here: this glTF
      // exports all 14 suit parts as primitives of one shared node, so every
      // primitive-mesh has an *identity* local transform — the visor's
      // actual location lives entirely in its geometry's vertex data, not in
      // any Object3D transform. Reading a plain empty parented at the
      // geometry's own bounding-box centre gives CameraRig a real point to
      // track that still follows every future rotation/position change up
      // the chain (the climb, the drift, the lean).
      visorMesh.geometry.computeBoundingBox()
      const localCenter = visorMesh.geometry.boundingBox.getCenter(new THREE.Vector3())
      anchor = new THREE.Object3D()
      anchor.position.copy(localCenter)
      visorMesh.add(anchor)
      // CameraRig still needs windowRef.current *to be the mesh* (it reads
      // .material for the darken-to-space fade); userData.aimAnchor is where
      // it looks for the correct point to aim at instead of trusting the
      // mesh's own (identity, unhelpful) transform.
      visorMesh.userData.aimAnchor = anchor

      if (windowRef) windowRef.current = visorMesh
    }

    el.userData.astronautConfigured = true
    el.userData.visorMesh = visorMesh
  }, [body, sunset, windowRef])

  return (
    <group ref={groupRef} {...props}>
      <primitive ref={bodyRef} object={body} />
    </group>
  )
}

useGLTF.preload(astronautUrl)
