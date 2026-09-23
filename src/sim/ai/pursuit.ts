import type { AircraftEntity } from '../loop.js'
import { qRotate } from '../math/quat.js'
import { add, dot, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import type { Controls } from '../flight/state.js'
import { controlsForDesiredVelocity } from './controller.js'

export type PilotAssignment = {
  /** Aircraft id read from the common start-of-tick snapshot. */
  readonly target: string
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

/** A short-range muzzle-velocity lead gate; no random draw and no hidden aim. */
export function hasGunSolution<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): boolean {
  const combat = self.spec.combat
  if (combat === undefined) return false
  const relative = sub(target.state.position, self.state.position)
  const range = length(relative)
  if (range < 1e-6 || range > AI_GUN_RANGE_M) return false
  const flightS = range / combat.muzzleVelocityMps
  const aim = sub(add(target.state.position, scale(target.state.velocity, flightS)), self.state.position)
  if (length(aim) < 1e-6) return false
  const forward = qRotate(self.state.attitude, v3(1, 0, 0))
  return dot(forward, normalize(aim)) >= Math.cos(AI_GUN_CONE_RAD)
}

/** The first complete pilot: lead pursuit plus a deliberately narrow gun gate. */
export function pursuitControls<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): Controls {
  const controls = controlsForDesiredVelocity(
    self.state,
    self.spec,
    leadPursuitVelocity(self, target),
  )
  return hasGunSolution(self, target) ? { ...controls, fire: true } : controls
}
