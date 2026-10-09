import { DoubleSide, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, Quaternion, Shape, ShapeGeometry, Vector3, type Camera, type Object3D } from 'three'
import type { Vec3 } from '../../sim/math/vec3.js'

/**
 * The in-scene steering cue (B1, Mark 2026-10-09): an arrow floating ahead
 * of the nose, turned to point the way to the steering destination, and, once the
 * destination is on screen, a diamond on the destination itself instead.
 * Placed in the scene like the gun pipper (gunPipper.ts), so it rides with the
 * airplane in the cockpit and chase views; drawn over everything, unlit and
 * unfogged. The arrow is flat and faces the camera: a cone pointed at a
 * destination ahead is seen end-on and read as a blob (first try, 2026-10-09). Which
 * destination is `steeringCueFor`'s (mission/steeringCue.ts); the name and
 * range label is DOM, placed by the mission HUD at `screen`.
 */
export type SteeringMode = 'arrow' | 'marker'

/** Arrow placement in the body frame: ahead of the nose and a little above the pipper's line. */
const AHEAD_M = 60
const ABOVE_M = 6
const ARROW_LENGTH_M = 3.6
/** The diamond's angular half-size, held constant at any range. */
const MARKER_DEG = 0.7
/** Hysteresis on the screen edge (NDC, 1 = edge): enter the marker inside 0.8, leave it past 0.9. */
export const MARKER_ENTER = 0.8
export const MARKER_EXIT = 0.9

/** Where the arrow floats, in world coordinates. `q` is the airframe attitude (body +x nose, +y up). */
export function arrowPosition(p: Vec3, q: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }): Vec3 {
  const v = new Vector3(AHEAD_M, ABOVE_M, 0).applyQuaternion(q as never)
  return { x: p.x + v.x, y: p.y + v.y, z: p.z + v.z }
}

/** The arrow's roll in the screen plane (radians from straight up, counterclockwise), from the
 *  arrow-to-destination vector in camera space: the way to turn, even when the destination is behind. */
export function arrowScreenAngle(d: { readonly x: number; readonly y: number }): number {
  return Math.hypot(d.x, d.y) < 1e-9 ? Math.PI : Math.atan2(-d.x, d.y)
}

/** Marker while the destination is in front and well inside the frame; the arrow otherwise. */
export function nextSteeringMode(prev: SteeringMode, ndc: { readonly x: number; readonly y: number } | null): SteeringMode {
  if (ndc === null) return 'arrow'
  const edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y))
  return edge < (prev === 'marker' ? MARKER_EXIT : MARKER_ENTER) ? 'marker' : 'arrow'
}

const toView = (camera: Camera, worldOffset: Vec3, p: Vec3): Vector3 =>
  new Vector3(p.x + worldOffset.x, p.y + worldOffset.y, p.z + worldOffset.z).applyMatrix4(camera.matrixWorldInverse)

/** A world point (scene coordinates before `scene.position`'s shift) to NDC, or null behind the camera. */
function toNdc(camera: Camera, worldOffset: Vec3, p: Vec3): { x: number; y: number } | null {
  const v = toView(camera, worldOffset, p)
  if (v.z >= 0) return null
  v.applyMatrix4(camera.projectionMatrix)
  return { x: v.x, y: v.y }
}

export type SteeringArrow = {
  readonly root: Group
  /** Poses arrow or marker for this frame; returns the mode and the label's anchor in NDC (null: hidden). */
  update(target: Vec3 | null, airframe: Object3D, camera: Camera, worldOffset: Vec3, visible: boolean): { mode: SteeringMode; anchor: { x: number; y: number } | null }
}

const Z = new Vector3(0, 0, 1)

/** A flat arrow in its XY plane, tip at +y, centered on the origin. */
function arrowShape(): Shape {
  const l = ARROW_LENGTH_M, w = 0.42 * l, stem = 0.16 * l, head = 0.45 * l
  const s = new Shape()
  s.moveTo(0, l / 2)
  s.lineTo(w / 2, l / 2 - head)
  s.lineTo(stem / 2, l / 2 - head)
  s.lineTo(stem / 2, -l / 2)
  s.lineTo(-stem / 2, -l / 2)
  s.lineTo(-stem / 2, l / 2 - head)
  s.lineTo(-w / 2, l / 2 - head)
  s.closePath()
  return s
}

export function createSteeringArrow(): SteeringArrow {
  const material = new MeshBasicMaterial({ color: 0xffdf7a, side: DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9, fog: false })
  const arrow = new Mesh(new ShapeGeometry(arrowShape()), material)
  arrow.name = 'steeringArrow'
  arrow.renderOrder = 10
  const marker = new Mesh(new OctahedronGeometry(1, 0), material)
  marker.name = 'steeringMarker'
  marker.renderOrder = 10
  const root = new Group()
  root.name = 'steeringCue:root'
  root.add(arrow, marker)
  let mode: SteeringMode = 'arrow'
  const roll = new Quaternion()
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
      const at = arrowPosition(airframe.position, airframe.quaternion)
      arrow.position.set(at.x, at.y, at.z)
      // Face the camera (the scene shift is a translation, so the camera's world rotation is its own), rolled toward the destination.
      const d = toView(camera, worldOffset, target).sub(toView(camera, worldOffset, at))
      arrow.quaternion.copy(camera.quaternion).multiply(roll.setFromAxisAngle(Z, arrowScreenAngle(d)))
      return { mode, anchor: toNdc(camera, worldOffset, at) }
    },
  }
}
