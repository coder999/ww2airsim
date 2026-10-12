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

/**
 * Cheap broad phase for a swept point against a sphere whose centre may move
 * during the same tick. The relative motion is another segment, so its closest
 * point to the origin is exact. A true result only admits the exact narrow
 * phase; a false result guarantees that no shape enclosed by the sphere can be
 * touched. Kept allocation-free because projectile contact calls it O(rounds ×
 * entities) times in a busy fight.
 */
export function segmentMovingSphere(
  from: Vec3, to: Vec3, centerFrom: Vec3, centerTo: Vec3, radius: number,
): boolean {
  const ax = from.x - centerFrom.x, ay = from.y - centerFrom.y, az = from.z - centerFrom.z
  const dx = (to.x - centerTo.x) - ax, dy = (to.y - centerTo.y) - ay, dz = (to.z - centerTo.z) - az
  const length2 = dx * dx + dy * dy + dz * dz
  const t = length2 <= 1e-24 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / length2))
  const x = ax + dx * t, y = ay + dy * t, z = az + dz * t
  return x * x + y * y + z * z <= radius * radius
}

export const tupleVector = (a: readonly [number, number, number]): Vec3 => v3(a[0], a[1], a[2])
