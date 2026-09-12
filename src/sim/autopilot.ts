import { v3, dot } from './math/vec3.js'
import { qRotate } from './math/quat.js'
import { densityAt } from './atmosphere.js'
import type { AircraftSpec } from './flight/schema.js'
import { airspeed, clampFinite, type AircraftState, type Controls } from './flight/model.js'

const G = 9.80665

/** Pitch command per radian of pitch-attitude error, and roll command per
 *  radian of bank. Both saturate the control well before the error is large:
 *  at gain 4 the pitch channel is hard over past 14 degrees of error. These
 *  are deliberately stiff -- the autopilot exists so a measurement harness can
 *  fly the aeroplane repeatably, not so it flies comfortably. */
const PITCH_GAIN = 4
const ROLL_GAIN = 3

/**
 * Proportional autopilot holding a wings-level BODY PITCH ATTITUDE.
 *
 * Ruling R6: this drives pitch attitude, not flight-path angle. The two differ
 * by the angle of attack, which for this aeroplane in a best-rate climb is
 * around 8 degrees -- so commanding 15 degrees here does NOT give a 15-degree
 * climb. `holdLevelFlight` is the one that regulates the flight path.
 *
 * Deliberately simple: its job is to make automated measurement possible, not
 * to fly well. There is no integral term, so it holds an attitude with a small
 * steady-state error whenever a steady moment is needed to keep it there.
 */
export function holdPitchAngle(
  _spec: AircraftSpec,
  state: AircraftState,
  throttle: number,
  targetPitchRad = 0,
): Controls {
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const fwd = qRotate(state.attitude, v3(1, 0, 0))

  // Pitch: drive the nose toward the target pitch attitude.
  const pitchNow = Math.asin(clampFinite(fwd.y, -1, 1))
  const pitch = clampFinite((targetPitchRad - pitchNow) * PITCH_GAIN, -1, 1)

  // Roll: drive the body up axis back toward world up. A positive rotation
  // about body +X tips `up` toward body +Z (right), so a positive `bank` here
  // is a right bank and needs left (negative) aileron.
  const bank = Math.atan2(dot(up, v3(0, 0, 1)), up.y)
  const roll = clampFinite(-bank * ROLL_GAIN, -1, 1)

  return { pitch, roll, yaw: 0, throttle }
}

/** The zero-angle wrapper: hold the body pitch attitude on the horizon. Note
 *  this is not the same as level flight -- see `holdLevelFlight`. */
export const holdLevelHeading = (
  spec: AircraftSpec,
  state: AircraftState,
  throttle: number,
): Controls => holdPitchAngle(spec, state, throttle, 0)

/** Pitch-attitude authority is bounded, so bound the command too: past about
 *  30 degrees this aeroplane is not holding any flight path for long. */
const MAX_PITCH_CMD_RAD = 0.55
/** Vertical-speed error to extra pitch attitude, rad per (m/s). Small because
 *  the trim feed-forward below already does nearly all the work. */
const VS_GAIN = 0.003
/** Altitude error to commanded vertical speed, (m/s) per metre, capped. */
const ALT_GAIN = 0.2
const MAX_ALT_CORRECTION_MPS = 10

/**
 * Hold a target altitude and a target rate of climb -- that is, regulate the
 * FLIGHT PATH rather than the attitude.
 *
 * Feed-forward plus a small proportional trim: the pitch attitude needed for a
 * given flight-path angle is that angle plus the angle of attack that trims
 * lift against weight at the current dynamic pressure, and that angle of attack
 * is available in closed form from the same linear lift curve `aero.ts`
 * integrates. Inverting it here means the loop is already at the right attitude
 * before the error term does anything, which is what makes it stable from
 * 50 m/s to 180 m/s and from sea level to 8 km without per-altitude gains.
 *
 * Once the commanded angle of attack exceeds what the wing can deliver -- below
 * the stall speed, or at idle throttle on the way there -- the command
 * saturates and the aeroplane sinks. That is correct behaviour, and it is how
 * `measureStallSpeed` arrives at a 1-g stall.
 */
export function holdLevelFlight(
  spec: AircraftSpec,
  state: AircraftState,
  throttle: number,
  targetAltitudeM: number,
  targetClimbMps = 0,
): Controls {
  const v = airspeed(state)
  // Below 1 m/s the trim inversion divides by a vanishing dynamic pressure and
  // the flight-path angle is not defined; hold the attitude level instead.
  if (v < 1) return holdLevelHeading(spec, state, throttle)

  const mass = spec.mass.emptyKg + state.fuelKg
  const q = 0.5 * densityAt(state.position.y) * v * v
  const clTrim = (mass * G) / (q * spec.geometry.wingAreaM2)
  const alphaTrim = (clTrim - spec.aero.clAtZeroAlpha) / spec.aero.clSlopePerRad

  const vsTarget = clampFinite(
    targetClimbMps + (targetAltitudeM - state.position.y) * ALT_GAIN,
    -MAX_ALT_CORRECTION_MPS,
    MAX_ALT_CORRECTION_MPS,
  )
  const gamma = Math.asin(clampFinite(vsTarget / v, -1, 1))
  const command = alphaTrim + gamma + VS_GAIN * (vsTarget - state.velocity.y)

  return holdPitchAngle(
    spec,
    state,
    throttle,
    clampFinite(command, -MAX_PITCH_CMD_RAD, MAX_PITCH_CMD_RAD),
  )
}
