import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import { commandedBodyRates } from '../flight/model.js'
import { qRotate } from '../math/quat.js'
import { dot, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import { controlsForDesiredVelocity } from './controller.js'

const G_MPS2 = 9.80665
const clamp = (n: number, lo: number, hi: number): number => Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0

/** Beyond this angle between the nose and the desired velocity,
 *  `steerToward` flies the lift vector instead of the velocity controller.
 *  Measured 2026-09-25 (plan "Measured", ablation table): without it, the G
 *  limiter left the velocity controller pushing into a near-vertical dive it
 *  could not recover from in 12 of 16 head-on runs. */
export const LIFT_VECTOR_HANDOFF_RAD = 60 * Math.PI / 180
const ROLL_P = 1.8
const ROLL_D = 0.35
const YAW_D = 0.25
/** Pull only once the lift line is within this of the wanted one; until
 *  then, a light positive pull. A roll-then-pull, never a push. */
const PULL_WINDOW_RAD = Math.PI / 4
const ROLLING_PULL_FRACTION = 0.3

/** Pitch rate, rad/s, that pitch = 1 commands right now: the model's rate
 *  authority times Z2's control fade (`commandedBodyRates`). */
export function pitchPerUnitCommand(state: AircraftState, spec: AircraftSpec): number {
  return commandedBodyRates(spec, state, { roll: 0, pitch: 1, yaw: 0, throttle: 0 }).z
}

/**
 * The pitch command whose steady pitch rate gives `loadFactorG`, from
 * n = V x omega / g + (body-up . world-up): the gravity term is what makes 1 g
 * wings level a zero-rate command. Unclamped, so the limiter can compare
 * against it. Null below 1 m/s or with no pitch authority.
 */
export function pitchCommandForLoadFactor(state: AircraftState, spec: AircraftSpec, loadFactorG: number): number | null {
  const speed = length(state.velocity)
  const perUnit = pitchPerUnitCommand(state, spec)
  if (speed < 1 || perUnit < 1e-6) return null
  const upY = qRotate(state.attitude, v3(0, 1, 0)).y
  return ((loadFactorG - upY) * G_MPS2 / speed) / perUnit
}

/**
 * Fly a lift vector (7c spec §3.4): roll, at any bank including inverted,
 * until body-up lies along the part of `liftDirection` perpendicular to the
 * velocity, then pull `loadFactorG`. This is how a pilot flies vertical
 * maneuvers, and the only way to fly them here: the velocity controller
 * pushes negative g for anything below the nose (spec §1.4).
 *
 * A lift direction along the velocity has no perpendicular part; the current
 * lift line is held. Roll error comes from `atan2` with the cosine term free
 * to go negative, so a lift demand straight below commands a full roll
 * rather than none (the 7a controller lesson).
 */
export function controlsForLiftVector(
  state: AircraftState, spec: AircraftSpec, liftDirection: Vec3, loadFactorG: number, throttle: number,
): Controls {
  const speed = length(state.velocity)
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const right = qRotate(state.attitude, v3(0, 0, 1))
  const along = speed > 1e-6 ? scale(state.velocity, 1 / speed) : qRotate(state.attitude, v3(1, 0, 0))
  const lift = [liftDirection.x, liftDirection.y, liftDirection.z].every(Number.isFinite) ? liftDirection : up
  const perp = sub(lift, scale(along, dot(lift, along)))
  const wanted = length(perp) > 1e-9 ? normalize(perp) : up
  const rollError = Math.atan2(dot(wanted, right), dot(wanted, up))
  const pull = pitchCommandForLoadFactor(state, spec, loadFactorG) ?? 0
  const pitch = Math.abs(rollError) < PULL_WINDOW_RAD
    ? clamp(pull, -1, 1)
    : clamp(pull * ROLLING_PULL_FRACTION, 0, 1)
  return {
    roll: clamp(rollError * ROLL_P - state.bodyRates.x * ROLL_D, -1, 1),
    pitch,
    // Body y is negative while yawing right and Controls.yaw is positive for
    // a right command, so adding the rate opposes it (controller.ts).
    yaw: clamp(state.bodyRates.y * YAW_D, -1, 1),
    throttle: clamp(throttle, 0, 1),
    gearDown: false,
    flapDown: false,
    brake: 0,
  }
}

/**
 * Steer toward a desired velocity (7c ruling R3). Within
 * LIFT_VECTOR_HANDOFF_RAD of the nose this returns
 * `controlsForDesiredVelocity`'s result unchanged, so 7a/7b behavior and
 * tests stand. Beyond it, it rolls the lift vector toward the desired
 * direction and pulls `loadFactorG`, with the velocity controller's
 * throttle.
 */
export function steerToward(state: AircraftState, spec: AircraftSpec, desiredVelocity: Vec3, loadFactorG: number): Controls {
  const velocityControls = controlsForDesiredVelocity(state, spec, desiredVelocity)
  const speed = length(desiredVelocity)
  if (speed < 1e-6) return velocityControls
  const forward = qRotate(state.attitude, v3(1, 0, 0))
  const offNose = Math.acos(clamp(dot(scale(desiredVelocity, 1 / speed), forward), -1, 1))
  if (offNose < LIFT_VECTOR_HANDOFF_RAD) return velocityControls
  return controlsForLiftVector(state, spec, desiredVelocity, loadFactorG, velocityControls.throttle)
}
