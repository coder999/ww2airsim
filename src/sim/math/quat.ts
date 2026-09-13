import { type Vec3, v3 } from './vec3.js'

export type Quat = { readonly x: number; readonly y: number; readonly z: number; readonly w: number }

export const qIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 })

export const qNormalize = (q: Quat): Quat => {
  const n = Math.hypot(q.x, q.y, q.z, q.w)
  if (n === 0) return qIdentity()
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n }
}

export const qFromAxisAngle = (axis: Vec3, rad: number): Quat => {
  const n = Math.hypot(axis.x, axis.y, axis.z)
  if (n === 0) return qIdentity()
  const h = rad / 2
  const s = Math.sin(h) / n
  return qNormalize({ x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(h) })
}

export const qMul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
})

/** Rotate v by q. Uses the standard v + 2w(q x v) + 2(q x (q x v)) form. */
export const qRotate = (q: Quat, v: Vec3): Vec3 => {
  const qv = v3(q.x, q.y, q.z)
  const t = v3(
    2 * (qv.y * v.z - qv.z * v.y),
    2 * (qv.z * v.x - qv.x * v.z),
    2 * (qv.x * v.y - qv.y * v.x),
  )
  const c = v3(
    qv.y * t.z - qv.z * t.y,
    qv.z * t.x - qv.x * t.z,
    qv.x * t.y - qv.y * t.x,
  )
  return v3(v.x + q.w * t.x + c.x, v.y + q.w * t.y + c.y, v.z + q.w * t.z + c.z)
}

/**
 * Integrate body angular rates into the attitude quaternion.
 * rates: { x: roll, y: yaw, z: pitch } in rad/s, body frame.
 * Renormalizes every step, which is why attitude cannot drift off the unit
 * sphere over a long mission.
 */
export const qIntegrateBodyRates = (q: Quat, rates: Vec3, dt: number): Quat => {
  const half = dt / 2
  const dq: Quat = {
    w: -(q.x * rates.x + q.y * rates.y + q.z * rates.z) * half,
    x: (q.w * rates.x + q.y * rates.z - q.z * rates.y) * half,
    y: (q.w * rates.y + q.z * rates.x - q.x * rates.z) * half,
    z: (q.w * rates.z + q.x * rates.y - q.y * rates.x) * half,
  }
  return qNormalize({ x: q.x + dq.x, y: q.y + dq.y, z: q.z + dq.z, w: q.w + dq.w })
}
