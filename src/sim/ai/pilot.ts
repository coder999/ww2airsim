import type { AircraftEntity } from '../loop.js'
import { cross, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'

export type PilotSkill = {
  /** Seconds between decision-layer rescores. Lower = reacts faster. This IS
   *  "reaction delay" (master spec §7), and since Plan 7d it carries TWO
   *  meanings off the one number: how often this pilot reconsiders its
   *  maneuver, and how outdated its mental picture of the enemy is allowed to
   *  get. A rescore both chooses the maneuver (from live facts, at that
   *  instant) and captures the target's position/velocity into
   *  `PilotDecisionState.observedTarget*`; all steering until the NEXT
   *  rescore flies against that frozen snapshot (`decision.ts`'s
   *  `maneuverControls`). So raising `reactionS` does not just slow the
   *  pilot's mind down, it also lets it aim at where the target used to be --
   *  up to `reactionS` ago. */
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
  /** Standard deviation of noise added to each of roll/pitch/yaw, in the
   *  same [-1, 1] units `Controls` already uses. 0 = perfect (no jitter).
   *  HIGHER IS ALWAYS WORSE -- unlike `gunneryAccuracy`, chosen
   *  specifically so a future reader cannot get the direction backwards by
   *  pattern-matching on this file's other, inverted field (Plan 7b's own
   *  gunneryAccuracy bug, spec §3). */
  readonly controlNoise: number
}

export const VETERAN_SKILL: PilotSkill = {
  reactionS: 0.3,
  gunneryAccuracy: 0.6,
  energyDiscipline: 0.7,
  disengageThreshold: -400,
  // Measured 2026-09-24 on the reference GPU (pursuit-range, tail-chase
  // geometry): sampling pursuer-1's headingRad every 500ms over ~9s (523
  // ticks) of live Pursue steering, 0.02 produces a clean, MONOTONIC turn
  // onto the intercept -- every sample-to-sample heading delta had the same
  // sign (mean 0.185 deg/500ms, max 0.365 deg/500ms, steadily shrinking as
  // it settles) -- imperceptible as jitter distinct from the turn itself.
  // Kept unchanged from Task 1's starting value.
  controlNoise: 0.02,
}

export const GREEN_SKILL: PilotSkill = {
  reactionS: 1.0,
  gunneryAccuracy: 1.0,
  energyDiscipline: 0.3,
  disengageThreshold: -150,
  // Measured 2026-09-24 on the reference GPU (pursuit-range, same tail-chase
  // flight as VETERAN_SKILL's comment, skill swapped to 'green' via a
  // temporary scenario edit and reverted after): the same headingRad
  // sampling shows a visibly wobbly path, not a clean turn -- sample-to-
  // sample deltas repeatedly reversed sign against the overall turn-in
  // trend (e.g. +0.248, +0.176 deg/500ms mixed into an otherwise negative
  // series), roughly 1.4x veteran's mean magnitude (0.258 vs. 0.185
  // deg/500ms) and 1.6x its max (0.589 vs. 0.365 deg/500ms). No stall or
  // spin: altitude/speed stayed on a normal pursuit-dive profile throughout
  // (no shipped camera follows an AI entity, so this was read from
  // telemetry, not a screenshot of the airframe itself -- see task-4-report.md).
  // Kept unchanged from Task 1's starting value; already >=2x
  // VETERAN_SKILL.controlNoise, as tests/sim/ai/noise.test.ts requires.
  controlNoise: 0.15,
}

export type PilotManeuver = 'pursue' | 'extend' | 'break'

export type PilotDecisionState = {
  readonly maneuver: PilotManeuver
  /** Sim time (tick * DT) at which the next rescore runs. */
  readonly nextRescoreS: number
  /** The target's position/velocity as of the last rescore -- what the
   *  pilot is actually flying (and aiming) against between rescores.
   *  Captured alongside `decideManeuver`'s own facts-derivation in
   *  `loop.ts`, so there is one observation per rescore. */
  readonly observedTargetPosition: Vec3
  readonly observedTargetVelocity: Vec3
  /** mulberry32 cursor for this pilot's control-noise draws (Task 3),
   *  independent of `weapons/combat.ts`'s own `rngState` cursor. Advances
   *  every tick, not just at rescore, since noise is applied to
   *  `maneuverControls`'s output every tick regardless of maneuver. */
  readonly noiseCursor: number
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

/** Below this cross-product magnitude, selfFwd and towardThreat are close
 *  enough to collinear that `cross` is numerically degenerate -- see this
 *  file's finding-1 fix below. */
const HEAD_ON_EPSILON = 1e-6

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
  const rawAxis = cross(selfFwd, towardThreat)
  // Finding 1 (final whole-branch review): in a head-on merge -- selfFwd and
  // towardThreat nearly antiparallel, exactly the geometry the Break-angle
  // fix now correctly triggers Break in -- `rawAxis` approaches the zero
  // vector, and `normalize(ZERO)` is ZERO (src/sim/math/vec3.ts). A 1mm
  // vertical perturbation then flips the commanded break direction between
  // full-up and full-down, and exact collinearity commands nothing at all.
  // Fall back to a stable, arbitrary perpendicular axis: world-up crossed
  // with selfFwd. (If selfFwd itself is nearly vertical this could also
  // degenerate, but that is not the geometry in question here -- a known,
  // accepted edge case, not this fix's job.)
  const turnAxis = normalize(
    length(rawAxis) < HEAD_ON_EPSILON ? cross(v3(0, 1, 0), selfFwd) : rawAxis,
  )
  const breakDir = normalize(cross(turnAxis, selfFwd))
  return scale(breakDir, Math.max(60, length(self.state.velocity)))
}
