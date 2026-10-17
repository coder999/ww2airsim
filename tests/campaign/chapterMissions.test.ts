import { describe, expect, it } from 'vitest'
import {
  CHAPTER_IDS, CHAPTER_MISSIONS, authoredChapters, chapterAircraftOf, chapterMinTier, chapterOfScenario, createCampaign, describeChapter, isAuthored, missionProblems,
  type ChapterMission, type ChapterRegistry,
} from '../../src/campaign/index.js'
import { buildShellCatalog } from '../../src/render/campaignSession.js'
import { pickerRows } from '../../src/render/hq/model.js'
import { SCENARIO_OPTIONS, chapterOptions } from '../../src/render/titleScreen.js'
import { sortieIsDev } from '../../src/render/devRecord.js'
import { eligibleAircraft, sightsAllowed } from '../../src/sim/sortie.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

/**
 * F10-0 T0.1 and T0.10: the chapter registry (content/campaign/chapter-missions.json). The real file is all empty until the batches fill it, so the
 * enrollment rules are proved on fixture registries; the one assertion about the real file is that nothing in it is half-authored.
 */
const empty: ChapterMission = { scenario: null, badge: null, start: null, aircraft: [], recommendedLoadout: null, coordinated: false, authoredBonus: 0 }
const registry = (patch: Partial<Record<(typeof CHAPTER_IDS)[number], ChapterMission>>): ChapterRegistry =>
  Object.fromEntries(CHAPTER_IDS.map((c) => [c, patch[c] ?? empty])) as ChapterRegistry
const A3: ChapterMission = { scenario: 'a3-the-long-column', badge: { id: 'long-column', name: 'Long Column' }, start: 'airborne', aircraft: ['p-38-lightning'], recommendedLoadout: 'both', coordinated: false, authoredBonus: 0 }
const A4: ChapterMission = { ...A3, scenario: 'a4-dumbo-in-the-gulf', badge: { id: 'dumbo', name: 'Dumbo' }, start: 'water', aircraft: ['pby-5a-catalina'], authoredBonus: 2500 }
const J6: ChapterMission = { ...A3, scenario: 'j6-operation-te-go', badge: { id: 'te-go', name: 'Te-Go' }, aircraft: ['ki-43-oscar', 'a6m2-zero'] }
const scenarioAt = (hours: Record<string, number>) => async (id: string) => {
  if (hours[id] === undefined) throw new Error(`Failed to fetch content ${id}`)
  return { player: 'p', aircraft: [{ id: 'p', spec: 'p-38-lightning', side: 'allied' }], weather: { timeOfDay: hours[id] } }
}

describe('the real registry', () => {
  it('has all twelve chapters, each either empty or complete, and none authored yet', () => {
    expect(Object.keys(CHAPTER_MISSIONS)).toEqual([...CHAPTER_IDS])
    for (const c of CHAPTER_IDS) {
      const m = CHAPTER_MISSIONS[c]
      const started = m.scenario !== null || m.badge !== null || m.start !== null || m.aircraft.length > 0
      expect(started ? isAuthored(m) : true, `${c} is half filled in`).toBe(true)
    }
    expect(authoredChapters('us')).toEqual([])
    expect(SCENARIO_OPTIONS.filter((o) => o.pool === 'campaign')).toEqual(chapterOptions())
  })
  it('reads each chapter\'s minimum rank through the rank table (F3 section 3)', () => {
    expect(CHAPTER_IDS.map((c) => chapterMinTier(c))).toEqual([1, 1, 3, 2, 5, 6, 1, 1, 1, 2, 3, 6])
  })
})

describe('enrollment', () => {
  it('describes an authored chapter, and nothing for an empty one', () => {
    expect(describeChapter('A3', empty, { timeOfDay: 9.5 })).toBeNull()
    const d = describeChapter('A3', A3, { timeOfDay: 9.5 })!
    expect(d).toMatchObject({ id: 'a3-the-long-column', faction: 'us', kind: 'campaign', chapterId: 'A3', minTier: 3, night: false, coordinated: false, aircraftIds: ['p-38-lightning'], authoredBonus: 0, badgeId: 'long-column' })
    expect(missionProblems(d)).toEqual([])
    expect(describeChapter('A4', A4, { timeOfDay: 21 })).toMatchObject({ night: true, authoredBonus: 2500, minTier: 2 })
    expect(missionProblems(describeChapter('J6', J6, { timeOfDay: 6 })!)).toEqual([])
  })
  it('the catalog offers a chapter only when its scenario file loads', async () => {
    const reg = registry({ A3, A4, J6 })
    const load = scenarioAt({ 'a3-the-long-column': 9.5, 'a4-dumbo-in-the-gulf': 21 }) // J6's file is missing
    const catalog = await buildShellCatalog([], load, () => 'allied', reg)
    expect(catalog.map((m) => m.id)).toEqual(['a3-the-long-column', 'a4-dumbo-in-the-gulf'])
    expect(catalog.every((m) => m.kind === 'campaign' && missionProblems(m).length === 0)).toBe(true)
    expect(await buildShellCatalog([], load, () => 'allied', registry({}))).toEqual([])
  })
  it('every enrolled descriptor is a picker row, in the campaign section and nowhere else', async () => {
    const reg = registry({ A3 })
    const options = chapterOptions(reg)
    expect(options).toEqual([expect.objectContaining({ value: 'a3-the-long-column', pool: 'campaign', start: 'airborne', aircraft: 'p-38-lightning', aircraftList: ['p-38-lightning'], dev: false })])
    const catalog = await buildShellCatalog([], scenarioAt({ 'a3-the-long-column': 9.5 }), () => 'allied', reg)
    const c = createCampaign({ id: 'c1', faction: 'us', playerName: 'T', seed: 1, now: '2026-10-17T00:00:00Z' })
    // A3 is locked behind A1 and A2 on a fresh campaign; a campaign that has completed them sees it
    const open = { ...c, progress: { ...c.progress, completed: ['A1', 'A2'] as typeof c.progress.completed } }
    const rows = pickerRows(open, catalog, options, false)
    expect(rows.filter((r) => r.id === 'a3-the-long-column').map((r) => r.section)).toEqual(['campaign'])
    expect(pickerRows(open, catalog, options, true).filter((r) => r.id === 'a3-the-long-column').map((r) => r.section)).toEqual(['campaign'])
  })
  it('looks a scenario up by chapter, and a pooled mission has none', () => {
    const reg = registry({ J6 })
    expect(chapterOfScenario('j6-operation-te-go', reg)).toBe('J6')
    expect(chapterOfScenario('convoy-strike', reg)).toBeNull()
    expect(chapterAircraftOf('j6-operation-te-go', reg)).toEqual(['ki-43-oscar', 'a6m2-zero'])
    expect(chapterAircraftOf('convoy-strike', reg)).toBeNull()
  })
})

describe('a chapter carries its own aircraft list (Decision 11)', () => {
  const specs = ['p-38-lightning', 'ki-43-oscar', 'a6m2-zero', 'f6f-hellcat'].map((id) => loadAircraftSpec(id))
  it('every airplane in the list is flown as written; one outside it is still an enemy airplane', () => {
    const ids = (authored?: string | readonly string[]) => eligibleAircraft(specs, 'airfield', false, authored).map((s) => s.id).sort()
    expect(ids()).toEqual(['f6f-hellcat', 'p-38-lightning'])
    expect(ids('ki-43-oscar')).toEqual(['f6f-hellcat', 'ki-43-oscar', 'p-38-lightning'])
    expect(ids(['ki-43-oscar', 'a6m2-zero'])).toEqual(['a6m2-zero', 'f6f-hellcat', 'ki-43-oscar', 'p-38-lightning'])
  })
  it('a sortie in a listed airplane is not a Dev sortie; an unlisted enemy airplane is', () => {
    const option = chapterOptions(registry({ J6 }))[0]!
    expect(sortieIsDev(option, loadAircraftSpec('ki-43-oscar'), 'clean', false)).toBe(false)
    expect(sortieIsDev(option, loadAircraftSpec('a6m2-zero'), 'clean', false)).toBe(false)
    expect(sortieIsDev(option, loadAircraftSpec('ki-84-frank'), 'clean', false)).toBe(true)
  })
  it('a chapter sortie gets the bombsight and torpedosight by rank, like a single mission', () => {
    expect(sightsAllowed({ dev: false, pool: 'campaign', sights: true })).toBe(true)
    expect(sightsAllowed({ dev: false, pool: 'campaign', sights: false })).toBe(false)
  })
})
