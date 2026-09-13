import { type Vec3, v3 } from './math/vec3.js'
import { type Quat } from './math/quat.js'
import type { AircraftState } from './flight/state.js'

/** What the renderer needs to place an aeroplane. Not a simulation state: it
 *  belongs to no tick, because it is between two of them. */
export type RenderState = {
  readonly position: Vec3
  readonly attitude: Quat
}

/**
 * Shortest-arc spherical interpolation.
 *
 * Two corners that a naive implementation gets wrong, both of which produce
 * rare and ugly artefacts rather than obvious failures:
 *
 *  - Double cover: `q` and `-q` are the same rotation, so if the two inputs sit
 *    in opposite hemispheres the direct path is the LONG way round -- a visible
 *    full spin between two adjacent ticks. Negating one input fixes it.
 *  - Vanishing sine: as the inputs converge, `sin(theta)` goes to zero and the
 *    division blows up. Below the threshold, linear interpolation is both
 *    numerically safe and indistinguishable at this scale.
 */
export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
  let bx = b.x, by = b.y, bz = b.z, bw = b.w

  if (dot < 0) {
    dot = -dot
    bx = -bx; by = -by; bz = -bz; bw = -bw
  }

  if (dot > 0.9995) {
    const x = a.x + (bx - a.x) * t
    const y = a.y + (by - a.y) * t
    const z = a.z + (bz - a.z) * t
    const w = a.w + (bw - a.w) * t
    const inv = 1 / Math.hypot(x, y, z, w)
    return { x: x * inv, y: y * inv, z: z * inv, w: w * inv }
  }

  const theta = Math.acos(dot)
  const sin = Math.sin(theta)
  const sa = Math.sin((1 - t) * theta) / sin
  const sb = Math.sin(t * theta) / sin
  return {
    x: a.x * sa + bx * sb,
    y: a.y * sa + by * sb,
    z: a.z * sa + bz * sb,
    w: a.w * sa + bw * sb,
  }
}

/**
 * Places the aeroplane between two simulated ticks.
 *
 * Alpha is clamped, not extrapolated: a frame that overran must not invent a
 * future the simulation has not computed. Standing still for one frame is a
 * far smaller error than guessing.
 */
export function interpolateAircraft(
  prev: AircraftState,
  curr: AircraftState,
  alpha: number,
): RenderState {
  const t = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
  if (t === 0) return { position: prev.position, attitude: prev.attitude }
  if (t === 1) return { position: curr.position, attitude: curr.attitude }
  return {
    position: v3(
      prev.position.x + (curr.position.x - prev.position.x) * t,
      prev.position.y + (curr.position.y - prev.position.y) * t,
      prev.position.z + (curr.position.z - prev.position.z) * t,
    ),
    attitude: qSlerp(prev.attitude, curr.attitude, t),
  }
}
