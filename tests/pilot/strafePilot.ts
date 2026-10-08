import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import type { AircraftState, Controls } from '../../src/sim/flight/state.js'
import { approachControls, type ApproachTarget } from '../../src/sim/ai/approach.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { add, length, normalize, sub, v3, type Vec3 } from '../../src/sim/math/vec3.js'
import { inBody, tupleVector } from '../../src/sim/weapons/geometry.js'
import { gunHarmonization } from '../../src/sim/weapons/harmonization.js'

/**
 * The Deterministic / E2E test pilot for a strafing pass that ends in a landing
 * straight ahead (plan 2026-09-29-gunnery-range-strafing-pass). Pure: the
 * same function flies `tests/sim/gunneryRangePass.test.ts` in Node and
 * `tests/e2e/pilot.ts` in the page, which imports this file from the dev
 * server, so the pass is tuned where it is cheap and flown where it ships.
 *
 * Three phases, chosen by comparing the state against thresholds rather than
 * a timed script (the same property `approachControls` documents):
 * - **cruise**, wings level at `cruiseHeightM` above the target, until it is
 *   `diveDeg` below the horizon. Tracking the sight from further out flies
 *   into the ground short of it: the flight path runs below the line of sight
 *   by the angle of attack plus the sight's depression (measured 2026-09-29,
 *   about 2.4 degrees at 80 m/s).
 * - **aim** until the target is `breakM` ahead: put the target on the
 *   harmonized sight line (`gunHarmonization`, the reticle the panel draws),
 *   wings level, and fire inside `fireM` when within `fireDeg` of it.
 * - **land**: `approachControls`, the game's own landing autopilot (Plan 7g's
 *   AI runway recovery), onto the runway beyond the target.
 */
export type StrafePass = {
  readonly target: Vec3
  /** Height above the target the cruise phase holds, m. */
  readonly cruiseHeightM: number
  /** The aim phase starts when the target is this far below the horizon. */
  readonly diveDeg: number
  readonly landing: ApproachTarget
  /** Airspeed the aim phase holds, m/s. */
  readonly aimSpeedMps: number
  readonly fireM: number
  readonly fireDeg: number
  readonly breakM: number
}

export type PilotPhase = 'cruise' | 'aim' | 'land'

export type PilotCommand = { readonly controls: Controls; readonly phase: PilotPhase; readonly offSightDeg: number; readonly rangeM: number }

const clamp = (n: number, lo = -1, hi = 1): number => Math.min(hi, Math.max(lo, n))

/** Horizontal distance still to fly to the target along the runway heading. */
const aheadM = (state: AircraftState, pass: StrafePass): number => {
  const h = pass.landing.runwayHeadingRad
  const dx = pass.target.x - state.position.x, dz = pass.target.z - state.position.z
  return dx * Math.sin(h) - dz * Math.cos(h)
}

export function strafePilot(spec: AircraftSpec, state: AircraftState, pass: StrafePass, phase: PilotPhase): PilotCommand {
  const ahead = aheadM(state, pass)
  const below = Math.atan2(state.position.y - pass.target.y, Math.max(1, ahead))
  const next: PilotPhase = phase === 'land' || ahead < pass.breakM ? 'land'
    : phase === 'aim' || below >= pass.diveDeg * Math.PI / 180 ? 'aim' : 'cruise'
  const eye = tupleVector(spec.view.eyePointM)
  const eyeWorld = add(state.position, qRotate(state.attitude, eye))
  const toTarget = sub(pass.target, eyeWorld)
  const rangeM = length(toTarget)
  const los = inBody(state.attitude, normalize(toTarget))
  const dep = gunHarmonization(spec.combat!, spec.view.eyePointM).depressionRad
  // The reticle sits `dep` below the nose: steer the line of sight onto it.
  const pitchErr = Math.atan2(los.y, los.x) + dep
  const yawErr = Math.atan2(los.z, los.x)
  const offSightDeg = Math.hypot(pitchErr, yawErr) * 180 / Math.PI
  if (next === 'land') {
    return { controls: approachControls(spec, state, pass.landing), phase: next, offSightDeg, rangeM }
  }
  const r = state.bodyRates
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const right = qRotate(state.attitude, v3(0, 0, 1))
  const bank = Math.atan2(-right.y, up.y) // positive = right wing down
  const speed = length(state.velocity)
  const wantedVs = clamp((pass.target.y + pass.cruiseHeightM - state.position.y) * 0.3, -5, 5)
  const controls: Controls = {
    pitch: next === 'cruise' ? clamp((wantedVs - state.velocity.y) * 0.15 - r.z * 0.8) : clamp(pitchErr * 6 - r.z * 0.8),
    roll: clamp(-bank * 2.5 - r.x * 0.4 + yawErr * 1.5),
    yaw: clamp(yawErr * 6 + r.y * 0.4),
    throttle: clamp(0.35 + (pass.aimSpeedMps - speed) * 0.05, 0, 1),
    fire: next === 'aim' && rangeM < pass.fireM && offSightDeg < pass.fireDeg,
  }
  return { controls, phase: next, offSightDeg, rangeM }
}
