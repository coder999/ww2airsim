import { ConeGeometry, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, Vector3, type Camera, type Object3D } from 'three'
import type { Vec3 } from '../../sim/math/vec3.js'

/**
 * The in-scene steering cue (B1, Mark 2026-10-09): a 3D arrow floating ahead
 * of the nose that turns to point at the steering destination, and, once the
 * destination is on screen, a diamond on the destination itself instead.
 * Geometry like the gun pipper (gunPipper.ts), so it reads the same in the
 * cockpit and chase views; drawn over everything, unlit and unfogged. Which
 * destination is `steeringCueFor`'s (mission/steeringCue.ts); the name and
 * range label is DOM, placed by the mission HUD at `screen`.
 */
export type SteeringMode = 'arrow' | 'marker'

/** Arrow placement in the body frame: ahead of the nose and a little above the pipper's line. */
const AHEAD_M = 60
const ABOVE_M = 6
const ARROW_LENGTH_M = 3.2
const ARROW_RADIUS_M = 1.0
/** The diamond's angular half-size, held constant at any range. */
const MARKER_DEG = 0.7
/** Hysteresis on the screen edge (NDC, 1 = edge): enter the marker inside 0.8, leave it past 0.9. */
export const MARKER_ENTER = 0.8
export const MARKER_EXIT = 0.9

/** Where the arrow floats and which way it points, in world coordinates. `q` is the airframe attitude (body +x nose, +y up). */
export function arrowPose(p: Vec3, q: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }, target: Vec3): { position: Vec3; direction: Vec3 } {
  const v = new Vector3(AHEAD_M, ABOVE_M, 0).applyQuaternion(q as never)
  const position = { x: p.x + v.x, y: p.y + v.y, z: p.z + v.z }
  const d = new Vector3(target.x - position.x, target.y - position.y, target.z - position.z)
  if (d.lengthSq() < 1e-9) d.set(1, 0, 0).applyQuaternion(q as never)
  d.normalize()
  return { position, direction: { x: d.x, y: d.y, z: d.z } }
}

/** Marker while the destination is in front and well inside the frame; the arrow otherwise. */
export function nextSteeringMode(prev: SteeringMode, ndc: { readonly x: number; readonly y: number } | null): SteeringMode {
  if (ndc === null) return 'arrow'
  const edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y))
  return edge < (prev === 'marker' ? MARKER_EXIT : MARKER_ENTER) ? 'marker' : 'arrow'
}

/** A world point (scene coordinates before `scene.position`'s shift) to NDC, or null behind the camera. */
function toNdc(camera: Camera, worldOffset: Vec3, p: Vec3): { x: number; y: number } | null {
  const v = new Vector3(p.x + worldOffset.x, p.y + worldOffset.y, p.z + worldOffset.z).applyMatrix4(camera.matrixWorldInverse)
  if (v.z >= 0) return null
  v.applyMatrix4(camera.projectionMatrix)
  return { x: v.x, y: v.y }
}

export type SteeringArrow = {
  readonly root: Group
  /** Poses arrow or marker for this frame; returns the mode and the label's anchor in NDC (null: hidden). */
  update(target: Vec3 | null, airframe: Object3D, camera: Camera, worldOffset: Vec3, visible: boolean): { mode: SteeringMode; anchor: { x: number; y: number } | null }
}

const UP = new Vector3(0, 1, 0)

export function createSteeringArrow(): SteeringArrow {
  const material = new MeshBasicMaterial({ color: 0xffdf7a, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9, fog: false })
  // The cone's tip is +y; shifted so the pose point is its middle.
  const cone = new ConeGeometry(ARROW_RADIUS_M, ARROW_LENGTH_M, 4)
  const arrow = new Mesh(cone, material)
  arrow.name = 'steeringArrow'
  arrow.renderOrder = 10
  const marker = new Mesh(new OctahedronGeometry(1, 0), material)
  marker.name = 'steeringMarker'
  marker.renderOrder = 10
  const root = new Group()
  root.name = 'steeringCue:root'
  root.add(arrow, marker)
  let mode: SteeringMode = 'arrow'
  const dir = new Vector3()
  return {
    root,
    update(target, airframe, camera, worldOffset, visible) {
      if (target === null || !visible) {
        root.visible = false
        mode = 'arrow'
        return { mode, anchor: null }
      }
      root.visible = true
      camera.updateMatrixWorld()
      mode = nextSteeringMode(mode, toNdc(camera, worldOffset, target))
      arrow.visible = mode === 'arrow'
      marker.visible = mode === 'marker'
      if (mode === 'marker') {
        marker.position.set(target.x, target.y, target.z)
        const range = Math.hypot(target.x + worldOffset.x, target.y + worldOffset.y, target.z + worldOffset.z)
        marker.scale.setScalar(range * Math.tan((MARKER_DEG * Math.PI) / 180))
        return { mode, anchor: toNdc(camera, worldOffset, target) }
      }
      const pose = arrowPose(airframe.position, airframe.quaternion, target)
      arrow.position.set(pose.position.x, pose.position.y, pose.position.z)
      arrow.quaternion.setFromUnitVectors(UP, dir.set(pose.direction.x, pose.direction.y, pose.direction.z))
      return { mode, anchor: toNdc(camera, worldOffset, pose.position) }
    },
  }
}
