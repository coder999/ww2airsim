import type { AircraftEntity } from '../loop.js'
import { qRotate } from '../math/quat.js'
import { add, cross, dot, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import type { Controls } from '../flight/state.js'
import { controlsForDesiredVelocity } from './controller.js'
import { STANDARD_GRAVITY_MPS2 } from '../damage/overload.js'
import { commandedBodyRates } from '../flight/model.js'
import type { AimError, FormationOrders, IngressOrders, PilotDecisionState, PilotSkill, RecoveryHome } from './pilot.js'

export type PilotAssignment = {
  /** A static target: an aircraft id read from the common start-of-tick
   *  snapshot, on the opposite side (7e). `null`: the pilot chooses its own
   *  target at every rescore (7e spec §4.2, `targeting.ts`). */
  readonly target: string | null
  /** 7e spec §4.5: an ingress pilot's orders. Excludes `target`. */
  readonly ingress?: IngressOrders
  /** 7f spec §1: a wingman's leader and slot. Excludes `target` and `ingress`. */
  readonly formation?: FormationOrders
  /** 7g spec §7: where this pilot recovers, resolved at build. May accompany
   *  `target`, `ingress` or `formation` -- a wingman or a raider has a home. */
  readonly home?: RecoveryHome
  /** A sitting duck: never picks a target (so it never fires or evades) and
   *  circles at this radius, to the left of its starting heading. Excludes
   *  every other order. Absent for every pilot before the Range Test. */
  readonly passive?: { readonly orbitRadiusM: number }
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
 * The normalized aim direction for the primary guns, or `null` with nothing
 * to shoot at: out of `AI_GUN_RANGE_M`, or the degenerate coincident-position
 * case. Shared by `hasGunSolution`'s cone gate and `pursuitDesiredVelocity`'s
 * close-range steering, so the nose the gate checks is the nose actually
 * being commanded (Task 5 of 7a found the two once disagreed, and every
 * acceptance shot scored zero hits).
 *
 * E1, gunnery honesty (2026-10-09). Rounds inherit the shooter's velocity
 * (`stepCombat`), so the lead is on the relative velocity (with drag on the
 * inherited part); and they fall, so the aim rises by the drop over the time
 * of flight. Before E1 this led by the target's own velocity and ignored the drop:
 * an abeam wingman at the same velocity was led 7.7 deg (7c spec), and a
 * perfect aim streamed 2.2 m under a straight-flying target (pilot.ts).
 * Then the pilot's own aim error (`aimErrorFor`) tilts the result.
 */
export function muzzleLeadDirection<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): Vec3 | null {
  const combat = self.spec.combat
  // No fixed guns (a bomber, damage stages round 2; the B5N2, D1): nothing to lead, as with no combat block.
  if (combat === undefined || combat.guns.length === 0) return null
  const relative = sub(target.state.position, self.state.position)
  const range = length(relative)
  if (range < 1e-6 || range > AI_GUN_RANGE_M) return null
  // A round leaves at V = own velocity + muzzle velocity along the aim, and
  // flyProjectile's quadratic drag slows the whole vector, the inherited part
  // included: after t its travel is V * tau, tau = ln(1 + k|V|t) / (k|V|).
  // So the muzzle part must cover the target's travel, less the inherited
  // part's tau-shortened travel, plus the drop: solved by fixed point on t.
  const k = combat.dragPerM, mv = combat.muzzleVelocityMps
  const own = self.state.velocity
  let aim = relative
  for (let i = 0; i < 6; i++) {
    const v0 = length(add(own, scale(aim, mv / length(aim))))
    const tau = length(aim) / mv
    const t = k === 0 ? tau : Math.expm1(k * v0 * tau) / (k * v0)
    if (!Number.isFinite(t) || t > combat.lifetimeS) return null
    aim = add(sub(add(relative, scale(target.state.velocity, t)), scale(own, tau)), v3(0, 0.5 * STANDARD_GRAVITY_MPS2 * t * t, 0))
  }
  return length(aim) < 1e-6 ? null : aimWithError(normalize(aim), self.pilot?.decision.aimError)
}

/** `direction` tilted by a pilot's aim error: `right` radians to the
 *  direction's right (in the horizontal) and `up` radians above it. */
export function aimWithError(direction: Vec3, error: AimError | undefined): Vec3 {
  if (error === undefined || (error.right === 0 && error.up === 0)) return direction
  const side = cross(direction, v3(0, 1, 0))
  const right = length(side) < 1e-6 ? v3(0, 0, 1) : normalize(side)
  const up = cross(right, direction)
  return normalize(add(direction, add(scale(right, Math.tan(error.right)), scale(up, Math.tan(error.up)))))
}

/** A short-range muzzle-velocity lead gate; no random draw and no hidden aim. */
export function hasGunSolution<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): boolean {
  const aim = muzzleLeadDirection(self, target)
  if (aim === null) return false
  const forward = qRotate(self.state.attitude, v3(1, 0, 0))
  const gunneryAccuracy = self.pilot?.skill.gunneryAccuracy ?? 1.0
  return dot(forward, aim) >= Math.cos(AI_GUN_CONE_RAD * gunneryAccuracy)
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

/** Within this angle of the nose, a pursuer in gun range flies `gunTrackingControls`. */
export const GUN_TRACKING_RAD = 12 * Math.PI / 180
/** The tracking law's correction, per second of nose error. */
const TRACKING_GAIN_PER_S = 3

/**
 * E1: fine aim. The velocity controller's pitch and yaw are proportional with
 * rate damping, so tracking a line of sight that rotates leaves a standing
 * error of the rate it needs over its gain: about 4.5 deg in a 2 g turn
 * (measured 2026-10-09, tools/ai/duel.ts's tail chase: the veteran tracked
 * 3.4-5 deg off the solution for 5 s and fired 6 rounds). Within
 * GUN_TRACKING_RAD of a solution this commands the body rates instead: the
 * solution's own rotation rate (fed forward) plus TRACKING_GAIN_PER_S times
 * the nose error, each converted through the airframe's rate authority
 * (`commandedBodyRates` is linear in the stick). Roll stays the velocity
 * controller's, which banks the lift toward the target. `null` out of gun
 * range or outside the tracking angle.
 */
export function gunTrackingControls<M>(self: AircraftEntity<M>, target: AircraftEntity<M>): Controls | null {
  const lead = self.pilot?.skill.gunTracking ?? 1
  if (lead <= 0) return null
  const aim = muzzleLeadDirection(self, target)
  if (aim === null) return null
  const forward = qRotate(self.state.attitude, v3(1, 0, 0))
  if (dot(forward, aim) < Math.cos(GUN_TRACKING_RAD)) return null
  // The solution's rotation rate: re-solved one step on, both aircraft flown straight.
  const dtS = 0.05
  const later = muzzleLeadDirection(fly(self, dtS), fly(target, dtS))
  const swing = later === null ? v3(0, 0, 0) : scale(cross(aim, later), lead / dtS)
  const up = qRotate(self.state.attitude, v3(0, 1, 0))
  const right = qRotate(self.state.attitude, v3(0, 0, 1))
  const ahead = dot(aim, forward)
  const pitchError = Math.atan2(dot(aim, up), ahead)
  const yawError = Math.atan2(dot(aim, right), ahead)
  // Body rates: z pitch-up about body +Z (right), y about body +Y (negative is nose right).
  const wantPitch = dot(swing, right) + lead * TRACKING_GAIN_PER_S * pitchError
  const wantYaw = dot(swing, up) - lead * TRACKING_GAIN_PER_S * yawError
  const unit = commandedBodyRates(self.spec, self.state, { roll: 0, pitch: 1, yaw: 1, throttle: 0, gearDown: false, flapDown: false, brake: 0 })
  const base = controlsForDesiredVelocity(self.state, self.spec, pursuitDesiredVelocity(self, target))
  const clamp1 = (n: number): number => Math.min(1, Math.max(-1, n))
  return {
    ...base,
    pitch: Math.abs(unit.z) < 1e-6 ? base.pitch : clamp1(wantPitch / unit.z),
    yaw: Math.abs(unit.y) < 1e-6 ? base.yaw : clamp1(wantYaw / unit.y),
  }
}

const fly = <M>(a: AircraftEntity<M>, dtS: number): AircraftEntity<M> =>
  ({ ...a, state: { ...a.state, position: add(a.state.position, scale(a.state.velocity, dtS)) } })

/** The first complete pilot: lead pursuit plus a deliberately narrow gun gate. */
export function pursuitControls<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
): Controls {
  const controls = gunTrackingControls(self, target) ?? controlsForDesiredVelocity(
    self.state,
    self.spec,
    pursuitDesiredVelocity(self, target),
  )
  return hasGunSolution(self, target) ? { ...controls, fire: true } : controls
}

/** The 7c spec §3.5 closure: how fast the range between `self` and `other`
 *  is shrinking (m/s, positive while closing), from both velocities. 7b's
 *  `DecisionFacts.closingRate` is only `self`'s velocity along the line of
 *  sight, which stays near our own airspeed whenever the nose is on the
 *  target, however fast the target is flying away. Measured 2026-09-26 on the
 *  `pursuit-tail-chase` fixture against the scripted 7d evasion (green, clean
 *  loadout, the aiLethality.test.ts item 3 world): at t = 1 s 7b's rate read 124 m/s
 *  while the range was shrinking at 10 m/s, so 7b's rate called every
 *  tail chase an overshoot. */
export function closureRateMps<M>(self: AircraftEntity<M>, other: AircraftEntity<M>): number {
  const to = sub(other.state.position, self.state.position)
  const r = length(to)
  return r < 1e-6 ? 0 : dot(to, sub(self.state.velocity, other.state.velocity)) / r
}
