import { describe, expect, it } from 'vitest'
import {
  MIN_ENGAGEMENT_RANGE_M,
  decideManeuver,
  scoreManeuvers,
  type DecisionFacts,
} from '../../../src/sim/ai/decision.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'

const HEALTHY: DecisionFacts = {
  relativeEnergyJPerKg: 0,
  angleOffSelfRad: 0,
  // Math.PI, not 0: this fact is 0 when the target's nose IS on self (real
  // danger) and Math.PI when it is pointed fully away (no threat) --
  // angleBetween's own geometric convention (deriveFacts). A neutral,
  // nothing-happening baseline needs the SAFE value here, not the
  // "coincidentally zero" one -- see the Task 2 "Ruling" below.
  angleOffTargetRad: Math.PI,
  rangeM: 400,
  closingRate: 0,
  threatAstern: false,
  damageTakenFraction: 0,
  fuelFraction: 1,
}

describe('scoreManeuvers / decideManeuver', () => {
  it('all-zero facts reproduce Pursue -- the Plan 7a regression floor', () => {
    expect(decideManeuver(HEALTHY, GREEN_SKILL)).toBe('pursue')
  })

  it('a fresh, healthy, favorably-positioned pilot presses the attack', () => {
    const facts: DecisionFacts = { ...HEALTHY, relativeEnergyJPerKg: 5000, angleOffSelfRad: 0.1 }
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('pursue')
  })

  it('a damaged pilot with a threat astern extends', () => {
    const facts: DecisionFacts = { ...HEALTHY, threatAstern: true, damageTakenFraction: 0.6 }
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('extend')
  })

  it('low fuel alone is enough to tip a green pilot to Extend', () => {
    const facts: DecisionFacts = { ...HEALTHY, fuelFraction: 0.05, relativeEnergyJPerKg: -2000 }
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('extend')
  })

  it('a pilot with the target\'s nose tracking it at close range breaks', () => {
    const facts: DecisionFacts = { ...HEALTHY, angleOffTargetRad: 0, rangeM: 300 }
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('break')
  })

  it('energyDiscipline moves the Pursue/Extend crossover: identical facts, different presets choose differently', () => {
    const facts: DecisionFacts = { ...HEALTHY, relativeEnergyJPerKg: -400 }
    expect(decideManeuver(facts, VETERAN_SKILL)).toBe('pursue')
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('extend')
  })

  it('MIN_ENGAGEMENT_RANGE_M forces Extend on a closing pass-through, overriding a Pursue-favoring score', () => {
    const facts: DecisionFacts = {
      ...HEALTHY,
      rangeM: MIN_ENGAGEMENT_RANGE_M - 1,
      closingRate: 50,
      relativeEnergyJPerKg: 5000,
      angleOffSelfRad: 0,
    }
    expect(decideManeuver(facts, VETERAN_SKILL)).toBe('extend')
  })

  it('the override does not fire on a close parallel pass with no closing rate', () => {
    const facts: DecisionFacts = {
      ...HEALTHY,
      rangeM: MIN_ENGAGEMENT_RANGE_M - 1,
      closingRate: -10,
      relativeEnergyJPerKg: 5000,
    }
    expect(decideManeuver(facts, VETERAN_SKILL)).toBe('pursue')
  })

  it('zero range does not produce NaN scores', () => {
    const facts: DecisionFacts = { ...HEALTHY, rangeM: 0, closingRate: 0 }
    const scores = scoreManeuvers(facts, GREEN_SKILL)
    expect(Number.isFinite(scores.pursue)).toBe(true)
    expect(Number.isFinite(scores.extend)).toBe(true)
    expect(Number.isFinite(scores.breakOff)).toBe(true)
  })
})
