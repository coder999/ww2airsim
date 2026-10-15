import { describe, expect, it } from 'vitest'
import {
  abilities, chaptersOf, eligibility, isNightHour, launchSortie, lifeline, missionLock, missionProblems, offers,
  describeAircraft, tierOf, type AircraftDescriptor, type Campaign, type Faction, type MissionDescriptor, type Pilot, type Tier,
} from '../../src/campaign/index.js'
import { plannedCatalog, plannedChapters, shippedCatalog } from '../fixtures/catalog.js'
import { NOW, fly, fresh, mission, withPoints } from './helpers.js'

const pilotAt = (tier: Tier, status: Pilot['status'] = 'active'): Pilot => {
  const c = fresh()
  const base = c.pilots[c.roster.live[0]!]!
  return { ...base, status, closure: status === 'active' ? null : { sortieId: 's', at: 'x', reason: status, missionId: null }, points: [0, 2500, 7500, 15000, 25000, 40000][tier - 1]! }
}
const TIERS: Tier[] = [1, 2, 3, 4, 5, 6]

describe('eligibility truth table: tier x minTier x night x advanced x coordinated x finale x faction', () => {
  const cases: { tier: Tier; minTier: Tier; night: boolean; advanced: boolean; coordinated: boolean; finale: boolean; sameFaction: boolean }[] = []
  for (const tier of TIERS) for (const minTier of TIERS) for (const night of [false, true]) for (const advanced of [false, true])
    for (const coordinated of [false, true]) for (const finale of [false, true]) for (const sameFaction of [true, false])
      cases.push({ tier, minTier, night, advanced, coordinated, finale, sameFaction })

  it(`enumerates all ${6 * 6 * 2 * 2 * 2 * 2 * 2} combinations against an independent oracle built from abilities()`, () => {
    expect(cases).toHaveLength(1152)
    for (const c of cases) {
      const m = mission({ minTier: c.minTier, night: c.night, coordinated: c.coordinated, chapterId: c.finale ? 'A6' : null, kind: c.finale ? 'campaign' : 'noncampaign', faction: c.sameFaction ? 'us' : 'ja' })
      const aircraft: AircraftDescriptor = { id: 'x', advanced: c.advanced }
      const got = eligibility(pilotAt(c.tier), m, aircraft, 'us')
      const ok = (t: Tier) => {
        const a = abilities(t)
        return t >= c.minTier && (!c.night || a.night) && (!c.advanced || a.advanced) && (!c.coordinated || a.coordinated) && (!c.finale || a.finale)
      }
      const label = JSON.stringify(c)
      if (!c.sameFaction) { expect(got, label).toMatchObject({ ok: false, reason: 'faction' }); continue }
      if (ok(c.tier)) { expect(got, label).toEqual({ ok: true }); continue }
      const need = TIERS.find(ok)!
      expect(got, label).toMatchObject({ ok: false, needTier: need })
      // the named reason is a requirement that is really unmet at that tier
      const reason = (got as { reason: string }).reason
      expect({ rank: c.tier < c.minTier, night: c.night && !abilities(c.tier).night, advanced: c.advanced && !abilities(c.tier).advanced, coordinated: c.coordinated && !abilities(c.tier).coordinated, finale: c.finale && !abilities(c.tier).finale }[reason as 'rank'], label).toBe(true)
    }
  })

  it('a closed pilot is never eligible, at any tier', () => {
    for (const status of ['kia', 'pow', 'discharged'] as const) for (const tier of TIERS) {
      expect(eligibility(pilotAt(tier, status), mission(), { id: 'x', advanced: false }, 'us')).toMatchObject({ ok: false, reason: 'pilot-closed' })
    }
  })

  it('the advanced aircraft are exactly the GAMEPLAY.md lists', () => {
    for (const id of ['p-38-lightning', 'b-17-flying-fortress', 'b-29-superfortress', 'g4m-betty', 'ki-21-sally', 'ki-57-ii-topsy']) expect(describeAircraft(id).advanced, id).toBe(true)
    for (const id of ['f6f-hellcat', 'a6m2-zero', 'tbm-3-avenger', 'b5n2-kate', 'ki-43-oscar', 'pby-5a-catalina', 'f4u-corsair']) expect(describeAircraft(id).advanced, id).toBe(false)
  })
})

describe('mission locks over the planned chapter table (GAMEPLAY.md, parsed)', () => {
  const planned = plannedChapters()
  const byChapter = (id: string) => planned.find((m) => m.chapterId === id)!
  const nonCampaign = mission({ id: 'nc' })

  it('parses twelve chapters with the documented ranks, aircraft and night missions', () => {
    expect(planned.map((m) => m.chapterId)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'])
    expect(planned.map((m) => m.minTier)).toEqual([1, 1, 3, 2, 5, 6, 1, 1, 1, 2, 3, 6])
    expect(planned.filter((m) => m.night).map((m) => m.chapterId)).toEqual(['A4', 'J4', 'J5'])
    expect(byChapter('A4').aircraftIds).toEqual(['pby-5a-catalina'])
    expect(byChapter('J6').aircraftIds).toEqual(['ki-43-oscar', 'a6m2-zero'])
    for (const m of planned) expect(missionProblems(m), m.id).toEqual([])
  })

  for (const faction of ['us', 'ja'] as const) {
    it(`${faction}: chapters open strictly in sequence, a completed chapter is closed, failure keeps it open, other faction locked`, () => {
      let c = fresh(faction)
      for (let s = 0; s < 5; s++) c = withPoints(c, s, 40000)
      const mine = chaptersOf(faction).map(byChapter)
      for (let done = 0; done < mine.length; done++) {
        expect(c.progress.completed).toHaveLength(done)
        mine.forEach((m, i) => {
          const lock = missionLock(c, m)
          if (i < done) expect(lock, m.id).toEqual({ open: false, reason: 'completed', needs: null })
          else if (i === done) expect(lock, m.id).toEqual({ open: true })
          else expect(lock, m.id).toEqual({ open: false, reason: 'previous-chapter', needs: mine[done]!.chapterId })
        })
        for (const m of planned.filter((x) => x.faction !== faction)) expect(missionLock(c, m), m.id).toEqual({ open: false, reason: 'faction', needs: null })
        expect(missionLock(c, { ...nonCampaign, faction })).toEqual({ open: true })
        // a failed attempt leaves the chapter open to retry (GAMEPLAY.md)
        c = fly(c, 0, mine[done]!, { success: false, end: 'landed' })
        expect(missionLock(c, mine[done]!)).toEqual({ open: true })
        c = fly(c, 0, mine[done]!, { success: true })
      }
      expect(c.progress.victory).toBe(true)
      for (const m of mine) expect(missionLock(c, m)).toMatchObject({ open: false, reason: 'completed' })
      expect(missionLock(c, { ...nonCampaign, faction })).toEqual({ open: true }) // non-campaign stays replayable after victory
    })
  }

  it('launchSortie enforces the lock and the rank gate with the right reason', () => {
    const c = fresh('us')
    const tryLaunch = (m: MissionDescriptor, camp: Campaign = c) => launchSortie(camp, { pilotId: camp.roster.live[0]!, mission: m, aircraft: { id: m.aircraftIds[0]!, advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    const locked = tryLaunch(byChapter('A2'))
    expect(!locked.ok && locked.error).toMatchObject({ code: 'locked', detail: 'previous-chapter' })
    const rank = tryLaunch(byChapter('A1'), withPoints(c, 0, 0))
    expect(rank.ok).toBe(true)
    // A1 is Ensign; a P-38 is advanced so an Ensign cannot fly even an Ensign mission in it
    const advanced = tryLaunch({ ...byChapter('A1'), aircraftIds: ['p-38-lightning'] })
    expect(!advanced.ok && advanced.error).toMatchObject({ code: 'ineligible', detail: 'advanced' })
  })
})

describe('offers', () => {
  it('lists every live pilot for every open mission with the exact missing tier', () => {
    let c = withPoints(withPoints(fresh(), 0, 2500), 1, 7500)
    const night = mission({ id: 'night', night: true })
    const adv = mission({ id: 'adv', aircraftIds: ['p-38-lightning'] })
    const locked = mission({ id: 'locked', kind: 'campaign', chapterId: 'A3', minTier: 3 })
    const out = offers(c, [night, adv, locked])
    expect(out.map((o) => o.mission.id)).toEqual(['night', 'adv']) // the A3 chapter is not open
    const tierOfSlot = (i: number) => tierOf(c.pilots[c.roster.live[i]!]!.points)
    expect([0, 1, 2, 3, 4].map(tierOfSlot)).toEqual([2, 3, 1, 1, 1])
    expect(out[0]!.pilots.map((p) => [p.eligible, p.reason, p.needTier])).toEqual([
      [true, undefined, undefined], [true, undefined, undefined], [false, 'night', 2], [false, 'night', 2], [false, 'night', 2],
    ])
    expect(out[1]!.pilots.map((p) => [p.eligible, p.reason, p.needTier])).toEqual([
      [false, 'advanced', 3], [true, undefined, undefined], [false, 'advanced', 3], [false, 'advanced', 3], [false, 'advanced', 3],
    ])
    c = fresh()
    expect(offers(c, [night])[0]!.pilots.every((p) => !p.eligible)).toBe(true)
  })

  it('a mission with two aircraft is flyable by anyone who can fly either (J6: Oscar or Zero)', () => {
    const j6 = plannedChapters().find((m) => m.chapterId === 'J6')!
    let c = fresh('ja')
    for (let s = 0; s < 4; s++) c = withPoints(c, s, 40000)
    for (let s = 0; s < 5; s++) c = fly(c, 0, plannedChapters().find((m) => m.chapterId === ['J1', 'J2', 'J3', 'J4', 'J5'][s])!, { success: true })
    const o = offers(c, [j6])[0]!
    expect(o.pilots.map((p) => p.eligible)).toEqual([true, true, true, true, false])
  })
})

describe('the shipped non-campaign catalog (built from SCENARIO_OPTIONS and the scenario files)', () => {
  const catalog = shippedCatalog()

  it('is exactly the pooled, non-dev rows, enrolled without a hand-kept list of descriptors', () => {
    expect(catalog.map((m) => m.id).sort()).toEqual([
      'airfield-strike', 'combat-air-patrol', 'convoy-strike', 'escort', 'field-patrol', 'flattop-hunt', 'scramble', 'single-combat',
      'surigao-strait', 'tank-buster', 'water-quals',
    ])
    for (const m of catalog) expect(missionProblems(m), m.id).toEqual([])
    expect(catalog.every((m) => m.kind === 'noncampaign' && m.chapterId === null && m.scoreEligible)).toBe(true)
  })

  it('the Training Grounds missions and every range and dev row are not in it (D2)', () => {
    const ids = new Set(catalog.map((m) => m.id))
    for (const id of ['tutorial', 'torpedo-qualification', 'deck-quals-mission', 'free-flight', 'gunnery-range', 'dev-mission-ui']) expect(ids.has(id), id).toBe(false)
  })

  it('the PBY mission needs a Lieutenant (junior grade) (D5); Field Patrol is Japanese, day, entry rank', () => {
    expect(catalog.find((m) => m.id === 'water-quals')).toMatchObject({ faction: 'us', minTier: 2, aircraftIds: ['pby-5a-catalina'] })
    expect(catalog.find((m) => m.id === 'field-patrol')).toMatchObject({ faction: 'ja', minTier: 1, night: false, coordinated: false, aircraftIds: ['a6m2-zero'], badgeId: 'field-patrol' })
  })

  it('no shipped mission is a night mission (the first night chapters are A4, J4, J5)', () => {
    expect(catalog.filter((m) => m.night)).toEqual([])
  })

  it('the lifeline of a fresh campaign is an entry-rank day mission of its own faction', () => {
    for (const f of ['us', 'ja'] as Faction[]) {
      const l = lifeline(fresh(f), catalog)
      expect(l, f).not.toBeNull()
      expect(l!.mission.faction).toBe(f)
      expect(l!.mission.minTier).toBe(1)
    }
  })

  it('isNightHour: dusk and dawn boundaries', () => {
    expect([5.4, 5.5, 12, 18.4, 18.5, 23].map(isNightHour)).toEqual([true, false, false, false, true, true])
  })
})

describe('missionProblems names what is wrong', () => {
  it('flags an empty id, no aircraft, a bad tier, a fractional bonus, a chapter on the wrong faction, and a non-campaign chapter', () => {
    expect(missionProblems(mission({ id: '' }))).toContain('empty id')
    expect(missionProblems(mission({ aircraftIds: [] }))).toContain('no aircraft')
    expect(missionProblems(mission({ minTier: 7 as Tier }))).toContain('minTier outside 1..6')
    expect(missionProblems(mission({ authoredBonus: 1.5 }))[0]).toMatch(/authoredBonus/)
    expect(missionProblems(mission({ kind: 'campaign', faction: 'ja', chapterId: 'A1' }))[0]).toMatch(/own faction/)
    expect(missionProblems(mission({ kind: 'campaign', chapterId: null }))[0]).toMatch(/own faction/)
    expect(missionProblems(mission({ kind: 'noncampaign', chapterId: 'A1' }))[0]).toMatch(/no chapter/)
    expect(plannedCatalog().length).toBe(11 + 12)
  })
})
