/**
 * The catalogs the campaign tests run against.
 * - `shippedCatalog()`: built from `SCENARIO_OPTIONS` and the scenario files, so a new scenario with a
 *   `pool` is enrolled with no new test (docs/testing.md, "enroll, don't clone").
 * - `plannedCatalog()`: the twelve chapters of GAMEPLAY.md's chapter table, parsed from it, on top of
 *   the shipped pool. F10 will author the real chapters; until then this is what lets the
 *   no-deadlock proof run against the F3 lock's rank gates (A4/J4/J5 night, the A6/J6 finales, ...).
 */
import { readFileSync } from 'node:fs'
import { loadAircraftSpec, loadScenario } from '../../tools/content/load.js'
import { SCENARIO_OPTIONS } from '../../src/render/titleScreen.js'
import { factsFromScenario } from '../../src/render/campaignSession.js'
import {
  buildCatalog, type ChapterId, type Faction, type MissionDescriptor, type ScenarioFacts, type Tier,
} from '../../src/campaign/index.js'

export function scenarioFacts(id: string): ScenarioFacts {
  // The one implementation the browser shell also uses (F5B Task 3); only the file reads differ.
  return factsFromScenario(loadScenario(id), (spec) => loadAircraftSpec(spec).side)
}

export const shippedCatalog = (): MissionDescriptor[] => buildCatalog(SCENARIO_OPTIONS, scenarioFacts)

const AIRCRAFT_ID: Readonly<Record<string, string[]>> = {
  'F6F Hellcat': ['f6f-hellcat'], 'TBM-3 Avenger': ['tbm-3-avenger'], 'P-38 Lightning': ['p-38-lightning'],
  'PBY-5A Catalina': ['pby-5a-catalina'], 'A6M2 Zero': ['a6m2-zero'], 'B5N2 Kate': ['b5n2-kate'], 'Ki-43 Oscar': ['ki-43-oscar'],
  'Mitsubishi Ki-57 “Topsy”': ['ki-57-ii-topsy'], 'Ki-43 Oscar or A6M2 Zero': ['ki-43-oscar', 'a6m2-zero'],
}
const RANK_TIER: Readonly<Record<string, Tier>> = {
  Ensign: 1, 'Lieutenant (junior grade)': 2, Lieutenant: 3, Commander: 5, Captain: 6,
  'Kaigun Shōi': 1, 'Kaigun Chūi': 2, 'Kaigun Taii': 3, 'Kaigun Taisa': 6,
}
const NIGHT_CHAPTERS: readonly string[] = ['A4', 'J4', 'J5']

/** GAMEPLAY.md's chapter table, parsed. Asserts it found all twelve. */
export function plannedChapters(): MissionDescriptor[] {
  const text = readFileSync(new URL('../../GAMEPLAY.md', import.meta.url), 'utf8')
  const rows = text.split('\n').filter((l) => /^\| [AJ][1-6] \|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
  if (rows.length !== 12) throw new Error(`GAMEPLAY.md chapter table: expected 12 chapters, found ${rows.length}`)
  return rows.map(([id, , name, aircraft, rank]) => {
    const chapterId = id as ChapterId
    const minTier = RANK_TIER[rank!]
    const aircraftIds = AIRCRAFT_ID[aircraft!]
    if (minTier === undefined || aircraftIds === undefined) throw new Error(`GAMEPLAY.md chapter ${id}: unknown rank "${rank}" or aircraft "${aircraft}"`)
    const faction: Faction = id!.startsWith('A') ? 'us' : 'ja'
    return {
      id: `chapter-${id!.toLowerCase()}`, faction, kind: 'campaign' as const, chapterId, minTier,
      night: NIGHT_CHAPTERS.includes(id!), coordinated: minTier >= 5, aircraftIds,
      scoreEligible: true as const, authoredBonus: id === 'A4' ? 2500 : 0, badgeId: name!.toLowerCase().replace(/\W+/g, '-'),
    }
  })
}

export const plannedCatalog = (): MissionDescriptor[] => [...shippedCatalog(), ...plannedChapters()]
