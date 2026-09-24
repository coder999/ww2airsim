import type { AircraftEntity } from '../loop.js'
import { dot, length, sub, type Vec3 } from '../math/vec3.js'
import { AI_GUN_RANGE_M, hasGunSolution } from './pursuit.js'
import type { PilotManeuver, PilotSkill } from './pilot.js'

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

function angleBetween(a: Vec3, b: Vec3): number {
  const denom = length(a) * length(b)
  if (denom < 1e-6) return 0
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
    angleOffSelfRad: angleBetween(self.state.velocity, toTarget),
    angleOffTargetRad: angleBetween(target.state.velocity, toSelf),
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
    BREAK_ANGLE_WEIGHT * facts.angleOffTargetRad - BREAK_RANGE_PENALTY * rangeBeyondGun

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
