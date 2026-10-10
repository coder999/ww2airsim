import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenario, loadScenarioBundle } from '../../../tools/content/load.js'
import {
  PRODUCTION_MISSIONS, SCENARIO_OPTIONS, badgeName, isKnownScenarioId, scenarioOptions,
} from '../../../src/render/titleScreen.js'
import { eligibleAircraft, startKindOf } from '../../../src/sim/sortie.js'

const FILES = readdirSync(new URL('../../../content/scenarios/', import.meta.url))
  .filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

describe('scenario options agree with content (M2 R5, R6)', () => {
  it('every content/scenarios file is an option, Dev-only ones included (A1)', () =>
    expect(SCENARIO_OPTIONS.map((o) => o.value).sort()).toEqual(FILES))
  it('A2: ?scenario= reaches every known scenario, Dev-only ones included, and nothing else', () => {
    expect(isKnownScenarioId('dev-mission-ui')).toBe(true)
    expect(isKnownScenarioId('furball-range')).toBe(true)
    expect(scenarioOptions(false).some((o) => o.value === 'furball-range')).toBe(false)
    expect(isKnownScenarioId('no-such-scenario')).toBe(false)
  })
  it('start, aircraft and recommendedLoadout restate the file (SF-R7)', () => {
    for (const o of SCENARIO_OPTIONS) {
      const s = loadScenario(o.value)
      expect(o.start, o.value).toBe(startKindOf(s))
      expect(o.aircraft, o.value).toBe(s.aircraft.find((a) => a.id === s.player)!.spec)
      expect(o.recommendedLoadout, o.value).toBe(s.briefing?.loadout)
    }
  })
  it('A1: exactly the test beds are Dev-only, and every range has a description', () => {
    expect(SCENARIO_OPTIONS.filter((o) => o.dev).map((o) => o.value).sort())
      .toEqual(['damage-range', 'dev-mission-circuit', 'dev-mission-ui', 'friendly-fire-field', 'friendly-fire-range', 'furball-range', 'recovery-range', 'takeoff-range'])
    for (const o of SCENARIO_OPTIONS.filter((r) => r.kind === 'range')) expect(o.description, o.value).toMatch(/\S/)
  })
  it("every non-Dev scenario's own aircraft is eligible with Dev off", () => {
    const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.slice(0, -5)))
    for (const o of scenarioOptions(false)) expect(eligibleAircraft(specs, o.start, false).map((s) => s.id), o.value).toContain(o.aircraft)
  })
  it.each(SCENARIO_OPTIONS.map((o) => [o.value, o] as const))('%s: kind, badge, briefing and history match the file', (_id, o) => {
    const s = loadScenarioBundle(o.value).scenario
    expect(o.kind).toBe(s.objectives === undefined ? 'range' : 'mission')
    expect(o.badge).toEqual(s.badge)
    if (o.kind === 'mission') expect(s.briefing, 'a mission needs a briefing').toBeDefined()
    if (o.kind === 'mission' && !o.value.startsWith('dev-')) expect(s.history, 'a shipped mission needs a history').toBeDefined()
  })
})

describe('scenarioOptions, badgeName and the production default (M2 R4, PF15)', () => {
  it('Dev off hides the test beds; Dev on lists every row, the fixtures last (A1)', () => {
    expect(scenarioOptions(true)).toBe(SCENARIO_OPTIONS)
    expect(scenarioOptions(false)).toEqual(SCENARIO_OPTIONS.filter((o) => !o.dev))
    expect(SCENARIO_OPTIONS.slice(-2).map((o) => [o.value, o.label, o.kind])).toEqual([
      ['dev-mission-ui', 'UI Fixture (dev)', 'mission'],
      ['dev-mission-circuit', 'Circuit Fixture (dev)', 'mission'],
    ])
  })
  it('names a badge from the option list, and shows an unknown id raw', () => {
    expect(badgeName('dev-ui-wings')).toBe('UI Fixture Wings (dev)')
    expect(badgeName('dev-circuit-wings')).toBe('Circuit Fixture Wings (dev)')
    expect(badgeName('retired-badge')).toBe('retired-badge')
  })
  it('the title with no missions argument offers the production ranges and fetches no briefing', () => {
    expect(PRODUCTION_MISSIONS).toEqual({ options: SCENARIO_OPTIONS, flyable: [], ordnanceNames: {}, loadScenario: null })
  })
})
