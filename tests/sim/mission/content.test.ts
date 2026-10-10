import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { loadScenario, loadScenarioBundle } from '../../../tools/content/load.js'

const IDS = readdirSync(new URL('../../../content/scenarios/', import.meta.url))
  .filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

/** Every scenario id that ships a mission (has `objectives`) and is not a
 *  `dev-` test fixture -- the three M3 missions (PF1) and M4's one. */
const MISSION_IDS = IDS.filter((id) => !id.startsWith('dev-'))
  .filter((id) => loadScenario(id).objectives !== undefined)

/** A citation is lookupable if it names a year or a URL (spec §6.3). */
const YEAR_OR_URL = /\b1[89]\d\d\b|\b20\d\d\b|https:\/\//

/** Spec 2026-09-25 §5: "Every scenario file parses; every tag and objective
 *  reference resolves." Resolution happens at world build (plan ruling R4),
 *  so this builds every shipped scenario, missions included once M3 adds
 *  them, on every run. */
describe('every shipped scenario', () => {
  it('is found (15: 11 scenarios at the P3 baseline, 3 M3 missions and M4\'s Combat Air Patrol)', () => {
    expect(IDS.length).toBeGreaterThanOrEqual(15)
    expect(IDS).toEqual(expect.arrayContaining(['deck-quals-mission', 'airfield-strike', 'convoy-strike', 'combat-air-patrol']))
  })

  it.each(IDS)('%s builds, and has a mission exactly when it declares objectives', (id) => {
    const bundle = loadScenarioBundle(id)
    const world = worldFromScenario(bundle, null)
    expect(world.mission === null).toBe(bundle.scenario.objectives === undefined)
  })
})

/** Spec §5 "Content checks" and §6.3 content honesty: every shipped mission
 *  (a non-`dev-` scenario with objectives) carries a badge, a briefing and a
 *  historical note that is honest about being inspired-by rather than a
 *  reconstruction, with sources a player can actually look up. `dev-mission-*`
 *  fixtures are excluded by their `dev-` prefix; they are not shipped content. */
describe('every mission is honest content', () => {
  it('found the seven shipped missions', () => {
    expect(MISSION_IDS).toEqual(['airfield-strike', 'combat-air-patrol', 'convoy-strike', 'deck-quals-mission', 'scramble', 'single-combat', 'tutorial'])
  })

  it.each(MISSION_IDS)('%s cites lookupable, non-empty sources', (id) => {
    const { history } = loadScenario(id)
    expect(history?.sources.length, `${id}: history.sources must be non-empty`).toBeGreaterThan(0)
    for (const source of history?.sources ?? []) {
      expect(source, `${id}: source "${source}" has no year and no https:// URL`).toMatch(YEAR_OR_URL)
    }
  })

  it.each(MISSION_IDS)('%s history is honest about being inspired-by, not a reconstruction', (id) => {
    const { history } = loadScenario(id)
    expect(history?.text, `${id}: history.text is missing`).toBeTruthy()
    expect(
      history?.text.includes('inspired by') || history?.text.includes('reconstruction'),
      `${id}: history.text must say "inspired by" or "reconstruction"`,
    ).toBe(true)
  })

  it.each(MISSION_IDS)('%s has a non-empty briefing situation', (id) => {
    const { briefing } = loadScenario(id)
    expect(briefing?.situation.length, `${id}: briefing.situation must be non-empty`).toBeGreaterThan(0)
  })

  it.each(MISSION_IDS)('%s has a badge', (id) => {
    const { badge } = loadScenario(id)
    expect(badge, `${id}: badge is missing`).toBeDefined()
  })

  it('every badge id is unique across all scenario files', () => {
    const badgeIds = IDS.map((id) => loadScenario(id).badge?.id).filter((id): id is string => id !== undefined)
    expect(new Set(badgeIds).size, 'duplicate badge ids across content/scenarios/').toBe(badgeIds.length)
  })
})
