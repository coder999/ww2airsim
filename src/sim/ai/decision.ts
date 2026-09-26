import type { AircraftEntity } from '../loop.js'
import { dot, length, sub, type Vec3 } from '../math/vec3.js'
import type { Controls } from '../flight/state.js'
import { AI_GUN_RANGE_M, hasGunSolution } from './pursuit.js'
import { intentControls } from './maneuverFlight.js'
import { finishControls } from './safety.js'
import type { PilotDecisionState, PilotManeuver, PilotSkill } from './pilot.js'

const G_MPS2 = 9.80665

export const MIN_ENGAGEMENT_RANGE_M = 120

const PURSUE_ENERGY_WEIGHT = 1.0
const PURSUE_ANGLE_PENALTY = 0.5
const PURSUE_RANGE_PENALTY = 0.002
const PURSUE_THREAT_PENALTY = 800
/** A disciplined pilot's confidence in its own energy read, in the same
 *  J/kg units as relativeEnergyJPerKg -- see the "Ruling" callout at this
 *  file's Task 2 for why this term exists. Without SOME skill-dependent
 *  term on the Pursue side, no scaling of the Extend side alone can ever
 *  make two skill presets choose differently at a fixed energy deficit:
 *  Pursue's own score has no skill dependence, so for any negative energy
 *  deficit Extend's contribution is non-negative and Pursue's is negative,
 *  regardless of skill -- the ordering can never flip. This additive term
 *  is what makes master spec §9's own acceptance requirement ("identical
 *  facts, different presets choose differently") satisfiable at all. */
const PURSUE_ENERGY_DISCIPLINE_BONUS = 1000

const EXTEND_ENERGY_WEIGHT_BASE = -1.0
const EXTEND_THREAT_BONUS = 800
const EXTEND_DAMAGE_WEIGHT = 400
const EXTEND_FUEL_WEIGHT = 300

const BREAK_ANGLE_WEIGHT = 600
const BREAK_RANGE_PENALTY = 0.003

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** `degenerateValue` is what this returns for a near-zero-length input (e.g.
 *  coincident positions, or a stationary target) -- there is no "the" right
 *  default: finding 2 (final whole-branch review) is that `angleOffSelfRad`
 *  wants the NEUTRAL value (0, no angle-off penalty) while `angleOffTargetRad`
 *  wants the SAFE value (Math.PI, "no information = no threat", matching the
 *  angleBetween convention this fact already uses: 0 is the target's nose ON
 *  self -- danger -- and Math.PI is pointed fully away -- safe). A single
 *  hardcoded `0` read as MAXIMUM threat for angleOffTargetRad once that
 *  convention landed, and could force an incorrect 'break' purely from two
 *  entities coinciding or a target with zero velocity. */
function angleBetween(a: Vec3, b: Vec3, degenerateValue: number): number {
  const denom = length(a) * length(b)
  if (denom < 1e-6) return degenerateValue
  return Math.acos(clamp(dot(a, b) / denom, -1, 1))
}

export type DecisionFacts = {
  readonly relativeEnergyJPerKg: number
  readonly angleOffSelfRad: number
  readonly angleOffTargetRad: number
  readonly rangeM: number
  readonly closingRate: number
  readonly threatAstern: boolean
  readonly damageTakenFraction: number
  readonly fuelFraction: number
}

/** Facts read straight from two live entities, per master spec §7's list
 *  minus ammunition (it already only gates the existing gun check, not
 *  maneuver choice). `damageTakenFraction`/`fuelFraction` are passed in
 *  rather than read from `self` here, because they come from `combat`/
 *  `state` fields `loop.ts` already has in hand at the call site. */
export function deriveFacts<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
  damageTakenFraction: number,
  fuelFraction: number,
): DecisionFacts {
  const toTarget = sub(target.state.position, self.state.position)
  const toSelf = sub(self.state.position, target.state.position)
  const rangeM = length(toTarget)
  const energyOf = (v: Vec3, altitudeM: number) => 0.5 * length(v) ** 2 + G_MPS2 * altitudeM
  return {
    relativeEnergyJPerKg:
      energyOf(self.state.velocity, self.state.position.y) -
      energyOf(target.state.velocity, target.state.position.y),
    angleOffSelfRad: angleBetween(self.state.velocity, toTarget, 0),
    angleOffTargetRad: angleBetween(target.state.velocity, toSelf, Math.PI),
    rangeM,
    closingRate: rangeM < 1e-6 ? 0 : dot(toTarget, self.state.velocity) / rangeM,
    // Is self inside the TARGET's own gun cone right now -- the exact
    // geometry `hasGunSolution` already gates the target's own trigger on,
    // read symmetrically. `target.pilot`'s own gunneryAccuracy (if any)
    // governs this automatically, since `hasGunSolution`'s first argument is
    // the shooter.
    threatAstern: hasGunSolution(target, self),
    damageTakenFraction,
    fuelFraction,
  }
}

export type ManeuverScores = { readonly pursue: number; readonly extend: number; readonly breakOff: number }

export function scoreManeuvers(facts: DecisionFacts, skill: PilotSkill): ManeuverScores {
  const rangeBeyondGun = Math.max(0, facts.rangeM - AI_GUN_RANGE_M)
  const pursue =
    PURSUE_ENERGY_WEIGHT * facts.relativeEnergyJPerKg +
    PURSUE_ENERGY_DISCIPLINE_BONUS * skill.energyDiscipline -
    PURSUE_ANGLE_PENALTY * facts.angleOffSelfRad -
    PURSUE_RANGE_PENALTY * rangeBeyondGun -
    (facts.threatAstern ? PURSUE_THREAT_PENALTY : 0)

  const extend =
    EXTEND_ENERGY_WEIGHT_BASE * (1 - skill.energyDiscipline) * facts.relativeEnergyJPerKg +
    (facts.threatAstern ? EXTEND_THREAT_BONUS : 0) +
    EXTEND_DAMAGE_WEIGHT * facts.damageTakenFraction +
    EXTEND_FUEL_WEIGHT * (1 - facts.fuelFraction)

  const breakOff =
    BREAK_ANGLE_WEIGHT * (Math.PI - facts.angleOffTargetRad) - BREAK_RANGE_PENALTY * rangeBeyondGun

  return { pursue, extend, breakOff }
}

/** MIN_ENGAGEMENT_RANGE_M is a forced override, not an extra score term:
 *  "about to collide" is a hard constraint a linear score could still lose
 *  to a large threat-astern penalty, and safety-critical logic should not be
 *  tunable away by weight changes elsewhere (design §6). */
export function decideManeuver(facts: DecisionFacts, skill: PilotSkill): PilotManeuver {
  if (facts.rangeM < MIN_ENGAGEMENT_RANGE_M && facts.closingRate > 0) return 'extend'
  const { pursue, extend, breakOff } = scoreManeuvers(facts, skill)
  if (pursue >= extend && pursue >= breakOff) return 'pursue' // Pursue wins ties
  return extend >= breakOff ? 'extend' : 'break'
}

/** The single dispatch point `loop.ts` calls once a maneuver has been chosen:
 *  Pursue keeps the existing gun-gated pursuit controller unchanged; Extend
 *  and Break fly their own desired-velocity producers (Task 3) through the
 *  shared flight controller, and therefore never set `fire` -- only
 *  `pursuitControls`'s own gun gate ever does that. Lives here rather than in
 *  `pilot.ts` per this file's header note: it needs `pursuitControls` from
 *  `pursuit.ts`, and `pilot.ts` must not import back from `pursuit.ts`.
 *
 *  Steers against `decision`'s OBSERVED target snapshot, not `target`'s live
 *  state (Task 2, master spec's perception-staleness requirement): a
 *  "perceived" entity is built once here, with the live target's id/spec but
 *  the last-rescore position/velocity substituted in, and that same
 *  perceived entity is threaded into whichever of `pursuitControls`/
 *  `extendDesiredVelocity`/`breakDesiredVelocity` the chosen maneuver calls --
 *  uniformly, including Pursue's firing gate (`hasGunSolution`, reached
 *  through `pursuitControls`). This was a deliberate architecture-section
 *  ruling, not an oversight: the gate is not special-cased back to live data.
 *  `decision.maneuver` itself was chosen from LIVE facts at the rescore
 *  instant (`loop.ts`'s `deriveFacts` call) -- only the steering in between
 *  rescores goes stale.
 *
 *  The clean steering above is then run through `applyControlNoise` (Task
 *  3), a deterministic, skill-scaled jitter on the final roll/pitch/yaw --
 *  the AI's second weakness alongside perception staleness. This is why the
 *  return shape grew from a bare `Controls`: the noise draw advances
 *  `decision.noiseCursor`, and that updated cursor has to travel back out to
 *  the caller (`loop.ts`) so the next tick's draw doesn't repeat.
 *
 *  7c: the clean steering comes from maneuverFlight.ts, then finishControls
 *  applies the load-factor limiter and the overspeed throttle cut before the
 *  noise (safety.ts). */
export function maneuverControls<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
  decision: PilotDecisionState,
  skill: PilotSkill,
  wind: Vec3 | null = null,
): { readonly controls: Controls; readonly decision: PilotDecisionState } {
  const perceived: AircraftEntity<M> = {
    ...target,
    state: { ...target.state, position: decision.observedTargetPosition, velocity: decision.observedTargetVelocity },
  }
  const { controls, cursor } = finishControls(
    self, intentControls(self, perceived, decision.maneuver), skill.controlNoise, decision.noiseCursor, wind,
  )
  return { controls, decision: { ...decision, noiseCursor: cursor } }
}
