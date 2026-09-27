import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../../tools/content/load.js'
import {
  DEV_SCENARIO_OPTIONS, PRODUCTION_MISSIONS, SCENARIO_OPTIONS, badgeName, isKnownScenarioId, scenarioOptions,
} from '../../../src/render/titleScreen.js'

const FILES = readdirSync(new URL('../../../content/scenarios/', import.meta.url))
  .filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

describe('scenario options agree with content (M2 R5, R6)', () => {
  it('every content/scenarios file is an option, in production or DEV', () =>
    expect(scenarioOptions(true).map((o) => o.value).sort()).toEqual(FILES))
  it('DEV fixtures are dev-prefixed and absent from production', () => {
    expect(DEV_SCENARIO_OPTIONS.every((o) => o.value.startsWith('dev-'))).toBe(true)
    expect(SCENARIO_OPTIONS.some((o) => o.value.startsWith('dev-'))).toBe(false)
    expect(isKnownScenarioId('dev-mission-ui')).toBe(false)
    expect(isKnownScenarioId('dev-mission-ui', true)).toBe(true)
  })
  it.each(scenarioOptions(true).map((o) => [o.value, o] as const))('%s: kind, badge, briefing and history match the file', (_id, o) => {
    const s = loadScenarioBundle(o.value).scenario
    expect(o.kind).toBe(s.objectives === undefined ? 'range' : 'mission')
    expect(o.badge).toEqual(s.badge)
    if (o.kind === 'mission') expect(s.briefing, 'a mission needs a briefing').toBeDefined()
    if (o.kind === 'mission' && !o.value.startsWith('dev-')) expect(s.history, 'a shipped mission needs a history').toBeDefined()
  })
})

describe('scenarioOptions, badgeName and the production default (M2 R4, PF15)', () => {
  it('production lists the ranges alone; DEV appends the fixtures after them', () => {
    expect(scenarioOptions(false)).toBe(SCENARIO_OPTIONS)
    expect(scenarioOptions(true)).toEqual([...SCENARIO_OPTIONS, ...DEV_SCENARIO_OPTIONS])
    expect(DEV_SCENARIO_OPTIONS.map((o) => [o.value, o.label, o.kind])).toEqual([
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
    expect(PRODUCTION_MISSIONS).toEqual({ options: SCENARIO_OPTIONS, loadScenario: null })
  })
})
