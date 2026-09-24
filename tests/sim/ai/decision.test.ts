import { describe, expect, it } from 'vitest'
import {
  MIN_ENGAGEMENT_RANGE_M,
  decideManeuver,
  deriveFacts,
  maneuverControls,
  scoreManeuvers,
  type DecisionFacts,
} from '../../../src/sim/ai/decision.js'
import { pursuitControls } from '../../../src/sim/ai/pursuit.js'
import { GREEN_SKILL, VETERAN_SKILL, type PilotDecisionState } from '../../../src/sim/ai/pilot.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../../src/sim/loop.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

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
  // Renamed (finding 8, final whole-branch review): HEALTHY's fixture sets
  // angleOffTargetRad: Math.PI, not 0, per the Task 2 ruling -- so this is
  // not actually "all-zero facts" (a genuinely all-zero DecisionFacts now
  // returns 'break'). What this proves is unchanged: a neutral, non-
  // threatening picture still reproduces Pursue, the Plan 7a regression
  // floor, because Pursue wins ties and the tie-break logic itself is
  // correct and unchanged.
  it('a neutral, non-threatening picture reproduces Pursue -- the Plan 7a regression floor', () => {
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

describe('deriveFacts at coincident positions (finding 2)', () => {
  // angleBetween's own degenerate-case return of 0 (for a near-zero-length
  // input vector -- e.g. coincident positions, or a stationary target) now
  // reads as MAXIMUM threat for angleOffTargetRad, since the Break-angle fix
  // made 0 the DANGEROUS end of that scale and Math.PI the safe one. A
  // self/target collision or a same-position test fixture must not force
  // 'break' purely from this degenerate case -- it should behave like the
  // existing all-zero-equivalent (HEALTHY) baseline, not like a real threat.
  const f6f = loadAircraftSpec('f6f-hellcat')
  const entityAt = (position: ReturnType<typeof v3>, velocity: ReturnType<typeof v3>): AircraftEntity<undefined> => {
    const state = createState({ position, velocity })
    return {
      id: 'e', spec: f6f, state, previous: state,
      controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 },
      assistMemory: undefined, impact: null, parked: false,
    }
  }

  // Same velocity for self and target as well as coincident positions, so
  // relativeEnergyJPerKg is also 0 and the ONLY thing under test is the
  // angle-degeneracy fallback, not an incidental energy advantage.
  it('angleOffTargetRad is the SAFE degenerate value (Math.PI), not the dangerous one (0)', () => {
    const self = entityAt(v3(0, 3000, 0), v3(100, 0, 0))
    const target = entityAt(v3(0, 3000, 0), v3(100, 0, 0))
    const facts = deriveFacts(self, target, 0, 1)
    expect(facts.angleOffTargetRad).toBe(Math.PI)
  })

  it('angleOffSelfRad is the NEUTRAL degenerate value (0)', () => {
    const self = entityAt(v3(0, 3000, 0), v3(100, 0, 0))
    const target = entityAt(v3(0, 3000, 0), v3(100, 0, 0))
    const facts = deriveFacts(self, target, 0, 1)
    expect(facts.angleOffSelfRad).toBe(0)
  })

  it('decideManeuver does NOT force break purely from coincident-position degenerate facts, with all other facts neutral', () => {
    const self = entityAt(v3(0, 3000, 0), v3(100, 0, 0))
    const target = entityAt(v3(0, 3000, 0), v3(100, 0, 0))
    const facts = deriveFacts(self, target, 0, 1)
    expect(decideManeuver(facts, GREEN_SKILL)).toBe('pursue')
  })
})

describe('maneuverControls steers against the observed snapshot, not live target state', () => {
  const f6f = loadAircraftSpec('f6f-hellcat')
  // This file's own existing `entityAt` helper (used by the "coincident
  // positions" describe block above) hardcodes id 'e' for both arguments,
  // which is wrong for a test needing two distinct, independently-named
  // entities -- a local helper here instead of forcing a shared one into a
  // shape it wasn't built for.
  const entity = (id: string, position: ReturnType<typeof v3>, velocity: ReturnType<typeof v3>): AircraftEntity<undefined> => {
    const state = createState({ position, velocity })
    return {
      id, spec: f6f, state, previous: state,
      controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 },
      assistMemory: undefined, impact: null, parked: false,
    }
  }

  const self = entity('self', v3(0, 3000, 0), v3(100, 0, 0))

  it('ignores a sharp live-velocity change until the next rescore', () => {
    const snapshotVelocity = v3(0, 0, 100) // observed heading 90 degrees from live
    const decision: PilotDecisionState = {
      maneuver: 'pursue', nextRescoreS: 999,
      observedTargetPosition: v3(500, 3000, 0), observedTargetVelocity: snapshotVelocity,
      noiseCursor: 0,
    }
    // Live target now flies a completely different heading than the snapshot.
    const liveTarget = entity('target', v3(500, 3000, 0), v3(100, 0, 0))
    const staleControls = maneuverControls(self, liveTarget, decision)

    // Compare against what steering the LIVE state would have produced, by
    // building a second decision whose snapshot matches the live state
    // exactly -- if staleness works, these two differ.
    const liveDecision: PilotDecisionState = { ...decision, observedTargetVelocity: v3(100, 0, 0) }
    const freshControls = maneuverControls(self, liveTarget, liveDecision)
    expect(staleControls).not.toEqual(freshControls)
  })

  it('reproduces today\'s exact steering when the snapshot equals live state', () => {
    const target = entity('target', v3(500, 3000, 0), v3(100, 0, 0))
    const decision: PilotDecisionState = {
      maneuver: 'pursue', nextRescoreS: 999,
      observedTargetPosition: target.state.position, observedTargetVelocity: target.state.velocity,
      noiseCursor: 0,
    }
    expect(maneuverControls(self, target, decision)).toEqual(pursuitControls(self, target))
  })
})
