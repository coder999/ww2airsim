import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PILOT_TIER_POINTS, chaptersOf, type Campaign, type MissionDescriptor, type Tier } from '../../../src/campaign/index.js'
import { CHAPTER_INFO } from '../../../src/render/hq/chapters.js'
import { formatAdjusted, formatFeet, formatKnots } from '../../../src/render/hq/format.js'
import {
  HQ_DEPARTMENTS, archiveModel, chaptersModel, clearedFor, commanderDossierModel, commanderModel, hqModel, importConflictModel,
  pilotChoices, pilotDossierModel, pickerRows, pointsToNextTier, type PickerOption,
} from '../../../src/render/hq/model.js'
import { SCENARIO_OPTIONS } from '../../../src/render/titleScreen.js'
import { makeCampaign, tierMultisets, flyThrough } from '../../fixtures/campaign.js'
import { plannedCatalog, shippedCatalog } from '../../fixtures/catalog.js'

const label = (id: string): string => SCENARIO_OPTIONS.find((o) => o.value === id)?.label ?? id
const badge = (id: string): string => id
const options = SCENARIO_OPTIONS as readonly PickerOption[]

describe('formatting is imperial and one-decimal', () => {
  it('feet, knots and the adjusted score', () => {
    expect(formatFeet(3048)).toBe('10,000 ft')
    expect(formatKnots(100)).toBe('194 kt')
    expect(formatAdjusted(596.666)).toBe('596.7')
    expect(formatAdjusted(0)).toBe('0.0')
  })
})

describe('hqModel: the first view', () => {
  it('shows exactly five living pilots with rank, points, sorties, clearances and status, for both factions', () => {
    for (const faction of ['us', 'ja'] as const) {
      const c = makeCampaign({ faction, tiers: [1, 2, 3, 4, 5] })
      const m = hqModel(c, shippedCatalog())
      expect(m.pilots).toHaveLength(5)
      expect(m.pilots.map((p) => p.tier)).toEqual([1, 2, 3, 4, 5])
      expect(m.pilots.every((p) => p.status === 'ACTIVE')).toBe(true)
      expect(m.service).toBe(faction === 'us' ? 'U.S. Navy' : 'Imperial Japanese Navy')
    }
  })

  it('names Americans given-name first and Japanese family-name first, and shows the USN abbreviation but the Kaigun name', () => {
    const us = hqModel(makeCampaign({ faction: 'us' }), shippedCatalog()).pilots[0]!
    const ja = hqModel(makeCampaign({ faction: 'ja' }), shippedCatalog()).pilots[0]!
    expect(us.rankShort).toBe('ENS')
    expect(ja.rankShort).toBe('Kaigun Shōi')
    expect(ja.kanji).not.toBeNull()
  })

  it('"to next" is the exact gap to the next tier and the top tier has none', () => {
    const c = makeCampaign({ faction: 'us', tiers: [1, 2, 3, 4, 6] })
    const rows = hqModel(c, shippedCatalog()).pilots
    expect(rows[1]!.toNextText).toBe(`${(PILOT_TIER_POINTS[2]! - PILOT_TIER_POINTS[1]!).toLocaleString('en-US')} to next`)
    expect(rows[4]!.toNextText).toBe('Highest rank')
    expect(pointsToNextTier(0)).toMatchObject({ next: 2, need: 2500, fraction: 0 })
    expect(pointsToNextTier(1250)!.fraction).toBe(0.5)
  })

  it('cleared-for chips follow abilities(tier) and the later ones appear only once reached', () => {
    expect(clearedFor(1).map((c) => [c.label, c.on])).toEqual([['DAY', true], ['NIGHT', false], ['ADV.', false]])
    expect(clearedFor(3).map((c) => c.on)).toEqual([true, true, true])
    expect(clearedFor(5).map((c) => c.label)).toEqual(['DAY', 'NIGHT', 'ADV.', 'SIGHTS', 'COORD.'])
    expect(clearedFor(6).map((c) => c.label).at(-1)).toBe('FINALE')
  })

  it('the department list is data: the seven buttons, one primary, with a subtitle each', () => {
    const m = hqModel(makeCampaign({ faction: 'us' }), shippedCatalog())
    expect(m.departments.map((d) => d.id)).toEqual(HQ_DEPARTMENTS.map((d) => d.id))
    expect(m.departments.filter((d) => d.primary).map((d) => d.id)).toEqual(['choose'])
    expect(m.departments.every((d) => d.sub.length > 0)).toBe(true)
    expect(m.departments.find((d) => d.id === 'archive')!.sub).toBe('No pilots lost')
  })

  it('the Commander panel: rating, adjusted score, losses and chapters come from the ledger', () => {
    let c = makeCampaign({ faction: 'us', points: 21_000 })
    const m = commanderModel(c, shippedCatalog())
    expect(m.title).toBe('Air Group Commander')
    expect(m.nextTitle?.name).toBe('Wing Commander')
    expect(m.adjustedText).toBe(formatAdjusted(c.human.ledger.points / c.human.ledger.sorties))
    expect(m.chaptersText).toBe('0 of 6 complete')
    c = flyThrough(c, 1, shippedCatalog()[1]!, { end: 'killed' })
    expect(commanderModel(c, shippedCatalog()).lossesText).toContain('1 K.I.A.')
    expect(commanderModel(makeCampaign({ faction: 'us' }), shippedCatalog()).adjustedText).toBe('0.0')
  })
})

describe('the pilot archive', () => {
  const catalog = shippedCatalog()
  const lose = (c: Campaign, slot: number, end: 'killed' | 'captured', mission: MissionDescriptor): Campaign => flyThrough(c, slot, mission, { end })

  it('is empty for a new campaign, with the sentence the screen shows', () => {
    const a = archiveModel(makeCampaign({ faction: 'us' }), 'all', label)
    expect(a.rows).toEqual([])
    expect(a.empty).toBe('No pilots have left the squadron.')
  })

  it('lists losses newest first with fate, rank held, points and the mission, and filters by fate', () => {
    let c = makeCampaign({ faction: 'us', tiers: [1, 2, 3, 1, 1] })
    c = lose(c, 0, 'killed', catalog.find((m) => m.id === 'convoy-strike')!)
    c = lose(c, 1, 'captured', catalog.find((m) => m.id === 'tank-buster')!)
    const all = archiveModel(c, 'all', label)
    expect(all.counts).toEqual({ all: 2, kia: 1, pow: 1, discharged: 0 })
    expect(all.rows.map((r) => r.fate).sort()).toEqual(['kia', 'pow'])
    expect(archiveModel(c, 'kia', label).rows).toHaveLength(1)
    expect(archiveModel(c, 'discharged', label).empty).toBe('No files under this heading.')
    const pow = archiveModel(c, 'pow', label).rows[0]!
    expect(pow).toMatchObject({ fateText: 'P.O.W.', mission: 'Tank Buster' })
    expect(pow.rankShort).toBe('LTJG')
    // the live five never appear
    expect(all.rows.map((r) => r.id)).not.toContain(c.roster.live[0])
  })
})

describe('the mission-first picker', () => {
  it('lists open missions with sections, and a mission no pilot can fly is shown dimmed with the rank it wants', () => {
    const c = makeCampaign({ faction: 'us' })
    const rows = pickerRows(c, shippedCatalog(), options, false)
    const non = rows.filter((r) => r.section === 'noncampaign')
    expect(non.map((r) => r.id)).toEqual(expect.arrayContaining(['airfield-strike', 'convoy-strike', 'surigao-strait', 'flattop-hunt', 'escort', 'water-quals']))
    expect(non.find((r) => r.id === 'airfield-strike')).toMatchObject({ nobody: false, pilotsAble: 5, needText: null })
    expect(non.find((r) => r.id === 'flattop-hunt')).toMatchObject({ nobody: true, needText: 'CDR+' })
    expect(non.find((r) => r.id === 'water-quals')).toMatchObject({ nobody: true, needText: 'LTJG+' })
    expect(non.filter((r) => !r.nobody)).toHaveLength(7)
  })

  it('a Japanese campaign sees only its own mission, never the American rows', () => {
    const rows = pickerRows(makeCampaign({ faction: 'ja' }), shippedCatalog(), options, false)
    expect(rows.filter((r) => r.section === 'noncampaign').map((r) => r.id)).toEqual(['field-patrol'])
    expect(rows.filter((r) => r.section === 'single').map((r) => r.id)).toEqual(['field-patrol'])
  })

  it('Training Grounds and Single Missions are unscored; dev rows appear only with Dev', () => {
    const c = makeCampaign({ faction: 'us' })
    const plain = pickerRows(c, shippedCatalog(), options, false)
    expect(plain.filter((r) => r.section === 'training').map((r) => r.id)).toEqual(expect.arrayContaining(['free-flight', 'tutorial', 'deck-quals-mission']))
    expect(plain.some((r) => r.dev)).toBe(false)
    expect(plain.filter((r) => !r.scored).every((r) => r.section === 'training' || r.section === 'single')).toBe(true)
    const dev = pickerRows(c, shippedCatalog(), options, true)
    expect(dev.some((r) => r.dev && r.id === 'night-range')).toBe(true)
    expect(dev.some((r) => r.dev && r.section === 'single')).toBe(true)
  })

  it('a campaign chapter appears first once a descriptor exists, and a completed chapter is gone', () => {
    const catalog = plannedCatalog()
    const fresh = pickerRows(makeCampaign({ faction: 'us' }), catalog, options, false)
    expect(fresh[0]).toMatchObject({ section: 'campaign', label: 'A1 · Over the Beaches', scored: true })
    const done = pickerRows(makeCampaign({ faction: 'us', chapter: 1 }), catalog, options, false)
    expect(done.filter((r) => r.section === 'campaign').map((r) => r.label)).toEqual(['A2 · Taffy 3'])
  })

  it('step 2 gives the exact gap for an ineligible pilot, and does not preselect anybody', () => {
    const c = makeCampaign({ faction: 'us', tiers: [1, 2, 3, 1, 1] })
    const choices = pilotChoices(c, shippedCatalog(), 'water-quals')
    expect(choices.map((p) => p.eligible)).toEqual([false, true, true, false, false])
    expect(choices[0]!.needText).toBe('NEEDS LTJG (2,500 MORE POINTS)')
    expect(choices[1]!.needText).toBeNull()
    expect('selected' in choices[0]!).toBe(false)
  })

  it('UI half of the no-deadlock proof: in all 3,528 states the picker has an enabled assignable pilot for a lifeline mission', () => {
    const catalog = shippedCatalog()
    let states = 0
    const failures: string[] = []
    for (const faction of ['us', 'ja'] as const) for (let chapter = 0; chapter <= 6; chapter++) for (const tiers of tierMultisets()) {
      states++
      const c = makeCampaign({ faction, tiers, chapter })
      const rows = pickerRows(c, catalog, options, false)
      const flyable = rows.filter((r) => r.section === 'noncampaign' && !r.nobody)
      const assignable = flyable.some((r) => pilotChoices(c, catalog, r.id).some((p) => p.eligible))
      if (!assignable) failures.push(`${faction} chapter ${chapter} tiers [${tiers}]`)
      if (!hqModel(c, catalog).lifeline) failures.push(`${faction} chapter ${chapter} tiers [${tiers}]: HQ shows no lifeline`)
    }
    expect(states).toBe(3528)
    expect(failures.slice(0, 5)).toEqual([])
  })

  it('and that proof can fail: without the entry-rank missions a fresh squadron has nothing assignable', () => {
    const none = shippedCatalog().filter((m) => m.minTier > 1 || m.coordinated || m.night)
    const c = makeCampaign({ faction: 'us' })
    const rows = pickerRows(c, none, options, false)
    expect(rows.filter((r) => r.section === 'noncampaign' && !r.nobody)).toEqual([])
    expect(hqModel(c, none).lifeline).toBe(false)
  })
})

describe('chapters, dossiers and import', () => {
  it('chapters.json is checked against GAMEPLAY.md: twelve rows, same ids, titles, dates, aircraft and ranks', () => {
    const rows = readFileSync(new URL('../../../GAMEPLAY.md', import.meta.url), 'utf8').split('\n')
      .filter((l) => /^\| [AJ][1-6] \|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    expect(rows).toHaveLength(12)
    expect(CHAPTER_INFO).toHaveLength(12)
    for (const [id, date, title, aircraft, rank, action] of rows) {
      const info = CHAPTER_INFO.find((c) => c.id === id)!
      expect(info, id).toBeDefined()
      expect(`${info.date} / ${info.label}`).toBe(date)
      expect([info.title, info.aircraft, info.minRank, info.action]).toEqual([title, aircraft, rank, action])
    }
    for (const f of ['us', 'ja'] as const) expect(CHAPTER_INFO.filter((c) => c.faction === f).map((c) => c.id)).toEqual(chaptersOf(f))
  })

  it('the chapter table marks complete, current and locked from progress', () => {
    const c = makeCampaign({ faction: 'ja', chapter: 2 })
    expect(chaptersModel(c).map((r) => r.state)).toEqual(['complete', 'complete', 'current', 'locked', 'locked', 'locked'])
  })

  it('the pilot dossier reads the campaign pilot: rank, imperial peaks, kills in 13 classes, log newest first', () => {
    let c = makeCampaign({ faction: 'us', tiers: [2, 1, 1, 1, 1] })
    const m = shippedCatalog().find((x) => x.id === 'airfield-strike')!
    c = flyThrough(c, 0, m, { success: true, counts: { ...Object.fromEntries(Object.keys(c.pilots[c.roster.live[0]!]!.counts).map((k) => [k, 0])), fighter: 2 } as never, badgeId: 'airfield-strike', flight: { flightSeconds: 3700, maxAltitudeM: 3048, maxTrueAirspeedMps: 100, landing: 'field' } })
    const d = pilotDossierModel(c, c.pilots[c.roster.live[0]!]!, label, badge)
    expect(d.header.rankLine).toBe('LTJG, Lieutenant (junior grade)')
    expect(d.kills).toHaveLength(13)
    expect(d.kills.find(([k]) => k === 'Fighter')![1]).toBe(2)
    expect(d.record.find(([k]) => k === 'Highest altitude')![1]).toBe('10,000 ft')
    expect(d.log[0]).toMatchObject({ mission: 'Airfield Strike', time: '1:01' })
    expect(d.badges).toEqual(['airfield-strike'])
    expect(d.closure).toBeNull()
  })

  it('an archived pilot dossier carries the closure sentence', () => {
    let c = makeCampaign({ faction: 'us' })
    const dead = c.roster.live[0]!
    c = flyThrough(c, 0, shippedCatalog().find((x) => x.id === 'convoy-strike')!, { end: 'killed' })
    expect(pilotDossierModel(c, c.pilots[dead]!, label, badge).closure).toContain('K.I.A. on Convoy Strike')
  })

  it('the Commander dossier includes the roster bonus and the human log', () => {
    const c = makeCampaign({ faction: 'us', tiers: [6, 6, 6, 6, 6] })
    const d = commanderDossierModel(c, shippedCatalog(), label, badge)
    expect(d.record.find(([k]) => k.startsWith('Roster bonus'))![1]).toBe('+2,500')
    expect(d.kills).toHaveLength(13)
  })

  it('the import conflict says which side is older', () => {
    const c = makeCampaign({ faction: 'us' })
    expect(importConflictModel({ revision: c.revision + 5, points: 10 }, c).warning).toContain('OLDER')
    expect(importConflictModel({ revision: c.revision, points: 0 }, c).warning).toContain('same revision')
  })
})

describe('tiers', () => {
  it('every faction x tier has a rank line (so a screen can never show blank)', () => {
    const t: Tier[] = [1, 2, 3, 4, 5, 6]
    for (const faction of ['us', 'ja'] as const) {
      const c = makeCampaign({ faction, tiers: [1, 1, 1, 1, 1] })
      for (const tier of t) expect(pointsToNextTier(PILOT_TIER_POINTS[tier - 1]!)?.next ?? 7).toBeGreaterThan(tier)
      expect(hqModel(c, shippedCatalog()).pilots[0]!.rankName.length).toBeGreaterThan(3)
    }
  })
})
