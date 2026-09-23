import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import { qRotate } from '../math/quat.js'
import { dot, length, normalize, v3, type Vec3 } from '../math/vec3.js'

const WORLD_UP = v3(0, 1, 0)
const MAX_BANK_RAD = 70 * Math.PI / 180

const clamp = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0

const wrapPi = (rad: number): number => Math.atan2(Math.sin(rad), Math.cos(rad))

/**
 * The reusable Plan 7 flight controller: desired world velocity in, the same
 * normalized controls a human pilot supplies out. It changes no aircraft state
 * directly and retains no hidden state, so a World remains the whole flight.
 *
 * Heading error becomes a desired bank. Comparing that bank with the actual
 * horizon-relative bank gives roll P control; body roll rate supplies D
 * damping. Pitch and yaw use the desired direction expressed in body axes and
 * their matching body rates. The yaw-rate sign is intentionally additive:
 * body `y` is negative while yawing right, whereas `Controls.yaw` is positive
 * for a right command (see flight/state.ts).
 */
export function controlsForDesiredVelocity(
  state: AircraftState,
  _spec: AircraftSpec,
  desiredVelocity: Vec3,
): Controls {
  const desiredSpeed = length(desiredVelocity)
  const desired = desiredSpeed > 1e-6
    ? normalize(desiredVelocity)
    : qRotate(state.attitude, v3(1, 0, 0))

  const forward = qRotate(state.attitude, v3(1, 0, 0))
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const right = qRotate(state.attitude, v3(0, 0, 1))
  const ahead = Math.max(1e-6, dot(desired, forward))
  const headingError = Math.atan2(dot(desired, right), ahead)
  const pitchError = Math.atan2(dot(desired, up), ahead)

  // Positive bank is right-wing-down, matching positive Controls.roll.
  const bank = Math.atan2(-dot(right, WORLD_UP), dot(up, WORLD_UP))
  const desiredBank = clamp(headingError * 1.6, -MAX_BANK_RAD, MAX_BANK_RAD)
  const bankError = wrapPi(desiredBank - bank)

  const currentSpeed = length(state.velocity)
  return {
    roll: clamp(bankError * 1.8 - state.bodyRates.x * 0.35, -1, 1),
    pitch: clamp(pitchError * 2.4 - state.bodyRates.z * 0.30, -1, 1),
    yaw: clamp(headingError * 0.75 + state.bodyRates.y * 0.25, -1, 1),
    throttle: clamp(0.65 + (desiredSpeed - currentSpeed) * 0.012, 0.2, 1),
    gearDown: false,
    flapDown: false,
    brake: 0,
  }
}
