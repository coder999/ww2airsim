import type { AircraftEntity } from '../loop.js'
import { cross, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'

export type PilotSkill = {
  /** Seconds between decision-layer rescores. Lower = reacts faster. This
   *  IS "reaction delay" (master spec §7) -- the decision layer's own
   *  rescore cadence gates how fast a pilot changes its mind; there is no
   *  separate buffered-observation mechanism. */
  readonly reactionS: number
  /** 0-1. Scales AI_GUN_CONE_RAD's half-angle; 1.0 leaves the cone
   *  unchanged. Does not change AI_GUN_RANGE_M. */
  readonly gunneryAccuracy: number
  /** 0-1. Scales how much relative-energy margin Pursue needs over Extend
   *  before Pursue still wins the score. Higher = holds the attack longer. */
  readonly energyDiscipline: number
  /** Relative-energy floor (same units as the decision layer's energy term)
   *  below which Extend is forced -- reserved for a future slice; this
   *  plan's forced override is range-based (MIN_ENGAGEMENT_RANGE_M) only. */
  readonly disengageThreshold: number
}

export const VETERAN_SKILL: PilotSkill = {
  reactionS: 0.3,
  gunneryAccuracy: 0.6,
  energyDiscipline: 0.7,
  disengageThreshold: -400,
}

export const GREEN_SKILL: PilotSkill = {
  reactionS: 1.0,
  gunneryAccuracy: 1.0,
  energyDiscipline: 0.3,
  disengageThreshold: -150,
}

export type PilotManeuver = 'pursue' | 'extend' | 'break'

export type PilotDecisionState = {
  readonly maneuver: PilotManeuver
  /** Sim time (tick * DT) at which the next rescore runs. */
  readonly nextRescoreS: number
}

/** Beyond this separation, Extend has done its job -- see this file's Task 3
 *  "Ruling": without a terminal state, the original always-away formula let
 *  a pursuer dive indefinitely and never return to the fight. A literal,
 *  not `2 * AI_GUN_RANGE_M` imported from `pursuit.ts`: `pursuit.ts` already
 *  imports types from this file (Task 1), and pilot.ts importing a VALUE
 *  back from pursuit.ts would be a real runtime circular dependency, not
 *  just a type-only one that erases at compile time. */
export const SAFE_SEPARATION_M = 1100 // 2x AI_GUN_RANGE_M (550m) as of this plan

/** Desired velocity for a pilot choosing to Extend: run away from the threat
 *  and trade altitude for airspeed rather than retreating level. Once
 *  safely clear (see SAFE_SEPARATION_M), rejoin the fight on a shallow
 *  climb instead of diving away forever. */
export function extendDesiredVelocity<M>(self: AircraftEntity<M>, threat: AircraftEntity<M>): Vec3 {
  const separation = sub(self.state.position, threat.state.position)
  if (length(separation) > SAFE_SEPARATION_M) {
    // Safely clear: rejoin on a shallow climb rather than diving away
    // forever. The decision layer's own per-rescore scoring (unchanged)
    // still decides what happens once back in range -- this only stops an
    // indefinite, physically nonsensical dive.
    const toward = normalize(sub(threat.state.position, self.state.position))
    const climb = v3(toward.x, Math.max(toward.y, 0.1), toward.z)
    return scale(normalize(climb), length(self.state.velocity))
  }
  const away = normalize(separation)
  // Nose down for airspeed: bias the desired vector toward the horizon-minus,
  // not level -- an Extend that stays level just retreats slowly.
  const dive = v3(away.x, Math.min(away.y, -0.15), away.z)
  const desiredSpeed = length(self.state.velocity) + 40 // accelerate, don't just match
  return scale(normalize(dive), desiredSpeed)
}

/** Desired velocity for a pilot choosing to Break: turn hard perpendicular to
 *  self's current velocity, into the plane containing the threat, at a speed
 *  the flight controller reads as a max-rate turn rather than a cruise. */
export function breakDesiredVelocity<M>(self: AircraftEntity<M>, threat: AircraftEntity<M>): Vec3 {
  // Turn into the threat's approach plane at max commanded rate: the
  // direction perpendicular to self's current velocity, on the side that
  // most reduces the threat's angle-off, at a speed the controller reads as
  // "turn hard," not "cruise there."
  const selfFwd = normalize(self.state.velocity)
  const towardThreat = normalize(sub(threat.state.position, self.state.position))
  const turnAxis = normalize(cross(selfFwd, towardThreat))
  const breakDir = normalize(cross(turnAxis, selfFwd))
  return scale(breakDir, Math.max(60, length(self.state.velocity)))
}
