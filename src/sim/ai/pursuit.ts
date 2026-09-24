import type { AircraftEntity } from '../loop.js'
import { qRotate } from '../math/quat.js'
import { add, dot, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import type { Controls } from '../flight/state.js'
import { controlsForDesiredVelocity } from './controller.js'
import type { PilotDecisionState, PilotSkill } from './pilot.js'

export type PilotAssignment = {
  /** Aircraft id read from the common start-of-tick snapshot. */
  readonly target: string
  readonly skill: PilotSkill
  readonly decision: PilotDecisionState
}

export const AI_GUN_RANGE_M = 550
export const AI_GUN_CONE_RAD = 3 * Math.PI / 180
const MAX_PURSUIT_LEAD_S = 3

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n))

/**
 * A bounded constant-velocity intercept used as the first maneuver in Plan 7.
 * The magnitude is as important as the direction: the flight controller uses
 * it as the requested speed and therefore adds closure while the target is far
 * away. This is maneuver lead, not the much shorter projectile lead below.
 */
export function leadPursuitVelocity<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): Vec3 {
  const relative = sub(target.state.position, self.state.position)
  const range = length(relative)
  const ownSpeed = Math.max(60, length(self.state.velocity))
  const leadS = clamp(range / ownSpeed, 0, MAX_PURSUIT_LEAD_S)
  const intercept = sub(add(target.state.position, scale(target.state.velocity, leadS)), self.state.position)
  const targetSpeed = length(target.state.velocity)
  const desiredSpeed = Math.max(80, targetSpeed + clamp(range / 50, 5, 35))
  return length(intercept) < 1e-6
    ? scale(qRotate(self.state.attitude, v3(1, 0, 0)), desiredSpeed)
    : scale(normalize(intercept), desiredSpeed)
}

/**
 * The normalized muzzle-velocity lead direction, or `null` with nothing to
 * shoot at: out of `AI_GUN_RANGE_M`, or the degenerate coincident-position
 * case. Shared by `hasGunSolution`'s cone gate and `pursuitDesiredVelocity`'s
 * close-range steering, so the nose the gate checks is the nose actually
 * being commanded -- reference-GPU review of Task 5 found the two previously
 * disagreed (the controller flew the much longer maneuver lead while the
 * gate checked this, shorter one), so the trigger opened only where the two
 * unrelated lead points happened to coincide, at the cone's ragged edge,
 * biased toward over-lead. Every acceptance shot before this fix scored zero
 * hits.
 */
function muzzleLeadDirection<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): Vec3 | null {
  const combat = self.spec.combat
  if (combat === undefined) return null
  const relative = sub(target.state.position, self.state.position)
  const range = length(relative)
  if (range < 1e-6 || range > AI_GUN_RANGE_M) return null
  const flightS = range / combat.muzzleVelocityMps
  const aim = sub(add(target.state.position, scale(target.state.velocity, flightS)), self.state.position)
  return length(aim) < 1e-6 ? null : normalize(aim)
}

/** A short-range muzzle-velocity lead gate; no random draw and no hidden aim. */
export function hasGunSolution<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): boolean {
  const aim = muzzleLeadDirection(self, target)
  if (aim === null) return false
  const forward = qRotate(self.state.attitude, v3(1, 0, 0))
  return dot(forward, aim) >= Math.cos(AI_GUN_CONE_RAD)
}

/**
 * The velocity `pursuitControls` asks the flight controller to fly: the
 * muzzle-lead point once in gun range, at the maneuver lead's speed (so
 * closure/throttle behavior is unchanged), and the longer maneuver lead
 * outside it, exactly as before.
 */
export function pursuitDesiredVelocity<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): Vec3 {
  const maneuver = leadPursuitVelocity(self, target)
  const aim = muzzleLeadDirection(self, target)
  return aim === null ? maneuver : scale(aim, length(maneuver))
}

/** The first complete pilot: lead pursuit plus a deliberately narrow gun gate. */
export function pursuitControls<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): Controls {
  const controls = controlsForDesiredVelocity(
    self.state,
    self.spec,
    pursuitDesiredVelocity(self, target),
  )
  return hasGunSolution(self, target) ? { ...controls, fire: true } : controls
}
