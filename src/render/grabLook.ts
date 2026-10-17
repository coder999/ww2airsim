/**
 * Grab-and-drag look for the director's free camera (Mark, 2026-10-17): the point of the world under the pointer when the
 * drag starts stays under the pointer as it moves, 1:1, like dragging a map. Pure; no roll, yaw about +Y then pitch, the
 * same construction as `headingPitch` (forward = (cos p cos y, sin p, -cos p sin y), right = +z at yaw 0).
 */

export type Viewport = { readonly width: number; readonly height: number }
type V3 = readonly [number, number, number]

/** A pixel's ray in camera space (x forward, y up, z right), square pixels, `vfovRad` spanning the viewport height. */
function cameraRay(px: number, py: number, v: Viewport, vfovRad: number): V3 {
  const t = Math.tan(vfovRad / 2)
  const half = v.height / 2
  return [1, -((py - half) / half) * t, ((px - v.width / 2) / half) * t]
}

const normalize = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l] }

/** The world direction a camera at `yawRad`, `pitchRad` sees through pixel (px, py). */
export function worldRayAt(yawRad: number, pitchRad: number, px: number, py: number, v: Viewport, vfovRad: number): V3 {
  const [cx, cy, cz] = normalize(cameraRay(px, py, v, vfovRad))
  // Rz(pitch): x' = cx cos p - cy sin p, y' = cx sin p + cy cos p; then Ry(yaw): x'' = x' cos y + z sin y, z'' = -x' sin y + z cos y.
  const x1 = cx * Math.cos(pitchRad) - cy * Math.sin(pitchRad)
  const y1 = cx * Math.sin(pitchRad) + cy * Math.cos(pitchRad)
  return [x1 * Math.cos(yawRad) + cz * Math.sin(yawRad), y1, -x1 * Math.sin(yawRad) + cz * Math.cos(yawRad)]
}

const PITCH_LIMIT_RAD = (85 * Math.PI) / 180
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * The yaw and pitch that put world direction `grabbed` under pixel (px, py). `currentPitchRad` picks the pitch branch nearest
 * where the camera already points. When the pixel's ray cannot reach `grabbed` (its elevation is out of reach of any pitch) the
 * pitch saturates at the limit rather than failing.
 */
export function lookToHold(grabbed: V3, px: number, py: number, v: Viewport, vfovRad: number, currentPitchRad: number): { yawRad: number; pitchRad: number } {
  const [cx, cy, cz] = normalize(cameraRay(px, py, v, vfovRad))
  const g = normalize(grabbed)
  const r = Math.hypot(cx, cy)
  const phi = Math.atan2(cy, cx)
  // cx sin p + cy cos p = r sin(p + phi) = g.y
  const s = Math.asin(Math.max(-1, Math.min(1, g[1] / r)))
  const candidates = [s - phi, Math.PI - s - phi].map(wrap)
  const inRange = candidates.filter((p) => Math.abs(p) <= PITCH_LIMIT_RAD)
  const pool = inRange.length > 0 ? inRange : candidates
  const best = pool.reduce((a, b) => (Math.abs(a - currentPitchRad) <= Math.abs(b - currentPitchRad) ? a : b))
  const pitchRad = Math.max(-PITCH_LIMIT_RAD, Math.min(PITCH_LIMIT_RAD, best))
  const x1 = cx * Math.cos(pitchRad) - cy * Math.sin(pitchRad)
  // heading of (x, z) is atan2(-z, x); Ry(yaw) adds yaw to it.
  const yawRad = wrap(Math.atan2(-g[2], g[0]) - Math.atan2(-cz, x1))
  return { yawRad, pitchRad }
}
