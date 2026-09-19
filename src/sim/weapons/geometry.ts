import { qRotate, type Quat } from '../math/quat.js'
import { sub, v3, type Vec3 } from '../math/vec3.js'

export const inBody = (q: Quat, point: Vec3): Vec3 =>
  qRotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, point)

/** Earliest segment/box intersection, including an origin already inside. */
export function segmentBox(from: Vec3, to: Vec3, center: Vec3, half: Vec3): number | null {
  const a = sub(from, center), d = sub(to, from)
  let enter = 0, leave = 1
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[axis]) < 1e-12) {
      if (Math.abs(a[axis]) > half[axis]) return null
      continue
    }
    const t1 = (-half[axis] - a[axis]) / d[axis]
    const t2 = (half[axis] - a[axis]) / d[axis]
    enter = Math.max(enter, Math.min(t1, t2))
    leave = Math.min(leave, Math.max(t1, t2))
    if (enter > leave) return null
  }
  return enter
}
export const tupleVector = (a: readonly [number, number, number]): Vec3 => v3(a[0], a[1], a[2])
