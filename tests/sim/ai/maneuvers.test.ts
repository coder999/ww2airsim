import { describe, expect, it } from 'vitest'
import {
  LATCH_CAP_S, interruptsLatch, isPhased, latchExpired, maneuverFacts, openLatch, selectManeuver,
} from '../../../src/sim/ai/maneuvers.js'
import { deriveFacts } from '../../../src/sim/ai/decision.js'
import { DEFAULT_MANEUVER, GREEN_SKILL, VETERAN_SKILL, initialDecision, type ManeuverLatch } from '../../../src/sim/ai/pilot.js'
import { pilotTick } from '../../../src/sim/ai/pilotTick.js'
import { createState } from '../../../src/sim/flight/state.js'
import { createWorldOf, type AircraftEntity } from '../../../src/sim/loop.js'
import { v3, ZERO } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const at = (id: string, position = v3(0, 3000, 0), velocity = v3(120, 0, 0)): AircraftEntity<undefined> => {
  const state = createState({ position, velocity })
  return { id, spec: f6f, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false }
}
const self = at('s')
const neutralTarget = at('t', v3(400, 3000, 0), v3(120, 0, 0))
const factsFor = (intent: 'pursue' | 'extend' | 'break') =>
  maneuverFacts(self, neutralTarget, deriveFacts(self, neutralTarget, 0, 1), intent, 3000)
const latch = (name: ManeuverLatch['name'], enteredAtS = 0): ManeuverLatch =>
  ({ name, phase: 0, enteredAtS, entryHeadingRad: 0, entryAltitudeM: 3000, loopCenter: ZERO, reversals: 0, lastSide: 0, lowestAltitudeM: 3000 })

describe('selectManeuver: 7b\'s intent in, a named maneuver out (7c spec §3.5)', () => {
  it('a plain picture gives each intent its default, which is 7b\'s regression floor', () => {
    for (const intent of ['pursue', 'extend', 'break'] as const) {
      expect(selectManeuver(factsFor(intent), VETERAN_SKILL.repertoire)).toBe(DEFAULT_MANEUVER[intent])
    }
  })

  it('an empty repertoire still flies the defaults', () => {
    expect(selectManeuver(factsFor('pursue'), [])).toBe('lead-pursuit')
  })
})

describe('the phase latch', () => {
  it('expires at LATCH_CAP_S', () => {
    expect(latchExpired(latch('extend', 5), 5 + LATCH_CAP_S - 1e-9)).toBe(false)
    expect(latchExpired(latch('extend', 5), 5 + LATCH_CAP_S)).toBe(true)
  })

  it('only a Break forced by a threat astern interrupts a non-Break latch', () => {
    const threat = { ...deriveFacts(self, neutralTarget, 0, 1), threatAstern: true }
    const calm = { ...threat, threatAstern: false }
    expect(interruptsLatch(latch('extend'), 'break', threat)).toBe(true)
    expect(interruptsLatch(latch('extend'), 'break', calm)).toBe(false)
    expect(interruptsLatch(latch('extend'), 'pursue', threat)).toBe(false)
    expect(interruptsLatch(latch('defensive-break'), 'break', threat)).toBe(false)
  })

  it('opens with the entry heading and altitude, phase 0, as plain data', () => {
    const l = openLatch('extend', at('s', v3(0, 2500, 0), v3(0, 0, 100)), 7)
    expect(l).toMatchObject({ name: 'extend', phase: 0, enteredAtS: 7, entryAltitudeM: 2500, reversals: 0, lastSide: 0 })
    expect(l.entryHeadingRad).toBeCloseTo(Math.PI / 2, 12)
    expect(structuredClone(l)).toEqual(l)
  })

  it('the three defaults are not phased', () => {
    for (const n of ['lead-pursuit', 'defensive-break', 'extend'] as const) expect(isPhased(n)).toBe(false)
  })

  it('a safety override clears any latch and names the intent\'s default (ruling R11)', () => {
    const low = { ...at('s', v3(0, 350, 0), v3(120, -10, 0)), pilot: { target: 't', skill: GREEN_SKILL, decision: { ...initialDecision(), nextRescoreS: 99, maneuver: 'extend' as const, named: 'extend' as const, latch: latch('extend') } } }
    const w = createWorldOf({ aircraft: [low, neutralTarget], player: 't' })
    const out = pilotTick(low, w.aircraft, { nowS: 1, terrain: null, decks: [], wind: null, combat: w.combat })
    expect(out.pilot!.decision.safety).toBe('recover')
    expect(out.pilot!.decision.latch).toBeNull()
    expect(out.pilot!.decision.named).toBe('extend')
    expect(out.pilot!.decision.maneuver).toBe('extend')
  })
})

describe('Pursue family selection (Task 8)', () => {
  const base = factsFor('pursue')
  const turning = { ...base, targetTurnRateRadPerS: 0.2 }
  const overshoot = { ...turning, closureMps: 60, facts: { ...base.facts, rangeM: 400 } }

  it('overshoot risk with an energy margin: high yo-yo if in the repertoire, else lag', () => {
    expect(selectManeuver({ ...overshoot, facts: { ...overshoot.facts, relativeEnergyJPerKg: 100 } }, VETERAN_SKILL.repertoire)).toBe('high-yo-yo')
    expect(selectManeuver({ ...overshoot, facts: { ...overshoot.facts, relativeEnergyJPerKg: 100 } }, GREEN_SKILL.repertoire)).toBe('lag-pursuit')
  })

  it('overshoot risk with no energy margin: lag', () => {
    expect(selectManeuver({ ...overshoot, facts: { ...overshoot.facts, relativeEnergyJPerKg: -100 } }, VETERAN_SKILL.repertoire)).toBe('lag-pursuit')
  })

  it('no overshoot unless the target is turning', () => {
    expect(selectManeuver({ ...overshoot, targetTurnRateRadPerS: 0 }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
  })

  it('falling behind a turning target, with height to spare: low yo-yo; without the height: lead', () => {
    const behind = { ...turning, closureMps: -10, facts: { ...base.facts, rangeM: 700 } }
    expect(selectManeuver({ ...behind, heightAboveGroundM: 3000 }, VETERAN_SKILL.repertoire)).toBe('low-yo-yo')
    expect(selectManeuver({ ...behind, heightAboveGroundM: 700 }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
    expect(selectManeuver({ ...behind, heightAboveGroundM: 3000 }, GREEN_SKILL.repertoire)).toBe('lead-pursuit')
  })

  it('all three are phased', () => {
    for (const n of ['lag-pursuit', 'high-yo-yo', 'low-yo-yo'] as const) expect(isPhased(n)).toBe(true)
  })
})

describe('attack run selection (Task 9)', () => {
  const base = factsFor('pursue')
  const high = { ...base, heightOverTargetM: 300 }

  it('boom-and-zoom or neutral, 300 m or more above the target: attack run', () => {
    expect(selectManeuver({ ...high, envelope: { ...base.envelope, pairing: 'boom-and-zoom' } }, VETERAN_SKILL.repertoire)).toBe('attack-run')
    expect(selectManeuver({ ...high, envelope: { ...base.envelope, pairing: 'neutral' } }, VETERAN_SKILL.repertoire)).toBe('attack-run')
  })

  it('never for a better turner, never below 300 m of height advantage, never for green, never with the target behind', () => {
    expect(selectManeuver({ ...high, envelope: { ...base.envelope, pairing: 'turnfight' } }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
    expect(selectManeuver({ ...base, heightOverTargetM: 299 }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
    expect(selectManeuver(high, GREEN_SKILL.repertoire)).toBe('lead-pursuit')
    expect(selectManeuver({ ...high, threatBehind: true }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
  })

  it('is phased', () => {
    expect(isPhased('attack-run')).toBe(true)
  })
})
