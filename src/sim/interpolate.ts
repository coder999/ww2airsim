import { type Vec3, v3 } from './math/vec3.js'
import { type Quat } from './math/quat.js'
import type { AircraftState } from './flight/state.js'
import { wrapPi, type ShipState } from './world/ships.js'

/** What the renderer needs to place an airplane. Not a simulation state: it
 *  belongs to no tick, because it is between two of them. */
export type RenderState = {
  readonly position: Vec3
  readonly attitude: Quat
}

/**
 * Below this |dot|, the two inputs are close enough that the arc between them
 * is indistinguishable from its chord at this scale, so the near-singular
 * spherical formula is swapped for a plain, numerically-safe lerp. A standard
 * slerp threshold (not measured here; it needs no date, only a name).
 */
const NEARLY_PARALLEL_DOT = 0.9995

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
 *
 * Endpoint exactness (`qSlerp(a, b, 0) === a`, `qSlerp(a, b, 1) === b`,
 * component-wise) holds only in the arc branch below, where the sine ratios
 * reduce to exactly 1 and 0. In the lerp branch the `t=0`/`t=1` result is
 * renormalized by a `hypot` that is not always exactly 1, so it can differ
 * from the literal input at ULP level -- sampled 2026-09-12 over 5,000 random
 * same-hemisphere pairs restricted to the lerp branch: 10.66% differed from
 * `a` at `t=0`, 57.26% differed from `b` at `t=1`, largest observed deviation
 * 5.55e-16 absolute. `interpolateAircraft` below never observes this, because
 * it short-circuits to the literal endpoint objects before calling `qSlerp`
 * at all; a future caller of `qSlerp` directly at `t=0`/`t=1` would.
 */
export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
  let bx = b.x, by = b.y, bz = b.z, bw = b.w

  if (dot < 0) {
    dot = -dot
    bx = -bx; by = -by; bz = -bz; bw = -bw
  }

  if (dot > NEARLY_PARALLEL_DOT) {
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
 * Places the airplane between two simulated ticks.
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

/** Where the renderer puts a hull between two ticks. A ship has no attitude
 *  in this plan -- no roll, no pitch, no waves -- so a heading is the whole
 *  of it. */
export type ShipPose = { readonly position: Vec3; readonly headingRad: number }

/** Between two ship ticks: linear in position, shortest-arc in heading. The
 *  same alpha clamp as `interpolateAircraft`, for the same reason. */
export function interpolateShip(prev: ShipState, curr: ShipState, alpha: number): ShipPose {
  const t = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
  if (t === 0) return { position: prev.position, headingRad: prev.headingRad }
  if (t === 1) return { position: curr.position, headingRad: curr.headingRad }
  return {
    position: v3(
      prev.position.x + (curr.position.x - prev.position.x) * t,
      prev.position.y + (curr.position.y - prev.position.y) * t,
      prev.position.z + (curr.position.z - prev.position.z) * t,
    ),
    headingRad: wrapPi(prev.headingRad + wrapPi(curr.headingRad - prev.headingRad) * t),
  }
}
