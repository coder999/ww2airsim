import { describe, expect, it } from 'vitest'
import {
  INVARIANTS, LIVE_ROSTER_SIZE, SCHEMA_VERSION, noBanked, validateCampaign, zeroCounts, type Campaign, type Faction,
} from '../../src/campaign/index.js'
import { createCampaign } from '../../src/campaign/roster.js'

const make = (faction: Faction = 'us', seed = 7): Campaign => createCampaign({ id: 'c1', faction, playerName: 'Mark', seed, now: '2026-10-14T00:00:00Z' })
const clone = (c: Campaign): Campaign => JSON.parse(JSON.stringify(c)) as Campaign
const issuesOf = (c: unknown) => {
  const r = validateCampaign(c)
  return r.ok ? [] : r.issues
}

describe('createCampaign', () => {
  it.each(['us', 'ja'] as const)('makes a valid %s campaign: five live Ensign-equivalents, nothing earned', (f) => {
    const c = make(f)
    expect(validateCampaign(c)).toEqual({ ok: true, campaign: c })
    expect(c.roster.live).toHaveLength(LIVE_ROSTER_SIZE)
    expect(c.faction).toBe(f)
    expect(c.revision).toBe(0)
    for (const id of c.roster.live) {
      const p = c.pilots[id]!
      expect(p.status).toBe('active')
      expect(p.points + p.sorties + p.banked).toBe(0)
    }
    expect(c.human.ledger.points).toBe(0)
    expect(c.pending).toBeNull()
  })

  it('is deterministic for equal inputs and differs with the seed', () => {
    expect(make('us', 7)).toEqual(make('us', 7))
    expect(make('us', 7).pilots).not.toEqual(make('us', 8).pilots)
  })

  it('rejects an empty id, an id with ":" and a blank player name', () => {
    const base = { faction: 'us' as const, playerName: 'Mark', seed: 1, now: 'x' }
    expect(() => createCampaign({ ...base, id: '' })).toThrow()
    expect(() => createCampaign({ ...base, id: 'a:b' })).toThrow()
    expect(() => createCampaign({ ...base, id: 'a', playerName: '   ' })).toThrow()
  })

  it('stores no ethnicity or other attribute on a pilot: the key set is pinned', () => {
    const p = Object.values(make().pilots)[0]!
    expect(Object.keys(p).sort()).toEqual(['badges', 'banked', 'career', 'closure', 'counts', 'id', 'log', 'name', 'points', 'serial', 'sorties', 'status'])
    expect(Object.keys(p.name).every((k) => ['given', 'family', 'suffix', 'kanji'].includes(k))).toBe(true)
  })
})

describe('validators: each invariant is named and has a negative test', () => {
  const closeOne = (c: Campaign) => {
    const id = c.roster.live[0]!
    c.pilots[id]!.status = 'kia'
    c.pilots[id]!.closure = { sortieId: 'c1:s1', at: 'x', reason: 'kia', missionId: null }
  }
  const negatives: Record<string, (c: Campaign) => void> = {
    'live-unique': (c) => { c.roster.live[1] = c.roster.live[0]! },
    'live-exist': (c) => { c.roster.live[0] = 'c1:p99' },
    'live-active': closeOne,
    'archive-closed': (c) => { c.pilots['c1:p9'] = { ...c.pilots[c.roster.live[0]!]!, id: 'c1:p9', serial: 9 }; c.serials.pilot = 9 },
    'pilot-key-matches-id': (c) => { c.pilots['stray'] = c.pilots[c.roster.live[0]!]! },
    'pilot-owned': (c) => {
      const p = c.pilots[c.roster.live[0]!]!
      delete c.pilots[p.id]
      p.id = 'other:p1'
      c.pilots[p.id] = p
      c.roster.live[0] = p.id
    },
    'pilot-serial': (c) => { c.serials.pilot = 2 },
    'faction-names': (c) => { c.pilots[c.roster.live[0]!]!.name.suffix = 'Jr.' },
    'log-caps': (c) => {
      const p = c.pilots[c.roster.live[0]!]!
      p.log = new Array(201).fill(0).map(() => ({
        sortieId: 's', at: 'x', missionId: 'm', chapterId: null, aircraft: 'a', loadout: 'l', difficulty: 'normal' as const, end: 'landed' as const,
        success: false, counts: { ...p.counts }, destruction: 0, bonuses: { difficulty: 0, completion: 0, roster: 0 }, points: 0, flightSeconds: 0, flags: [], legs: [],
      }))
    },
    'pending-valid': (c) => {
      c.pending = { sortieId: 'c1:s1', pilotId: 'c1:p77', missionId: 'm', chapterId: null, difficulty: 'normal', scoreEligible: true, launchedAt: 'x', facts: {}, legs: [], banked: noBanked() }
      c.serials.sortie = 1
    },
    'pending-legs': (c) => {
      c.pending = { sortieId: 'c1:s1', pilotId: c.roster.live[0]!, missionId: 'm', chapterId: null, difficulty: 'normal', scoreEligible: true, launchedAt: 'x', facts: {}, legs: [{ place: 'Tacloban', at: 'x', counts: zeroCounts(), pilotPoints: 500, humanPoints: 500 }], banked: noBanked() }
      c.serials.sortie = 1
    },
    'progress-sequence': (c) => { c.progress.completed = ['A2'] },
  }

  it('every invariant has a negative test (the table below is exhaustive)', () => {
    expect(Object.keys(negatives).sort()).toEqual(INVARIANTS.map((i) => i.name).sort())
  })

  it.each(Object.keys(negatives))('%s fails when violated', (name) => {
    const c = clone(make(name === 'faction-names' ? 'ja' : 'us'))
    negatives[name]!(c)
    expect(issuesOf(c).map((i) => i.name)).toContain(name)
  })

  it('a clean campaign trips no invariant', () => {
    expect(issuesOf(make('us'))).toEqual([])
    expect(issuesOf(make('ja'))).toEqual([])
  })

  it('shape: a fractional, negative or unsafe number anywhere fails (integers only)', () => {
    for (const bad of [1.5, -1, Number.MAX_SAFE_INTEGER + 2, NaN]) {
      const c = clone(make())
      c.human.ledger.points = bad
      expect(issuesOf(c)[0]?.name, String(bad)).toBe('shape')
    }
    const c = clone(make())
    c.pilots[c.roster.live[0]!]!.career.maxAltitudeM = 100.5
    expect(issuesOf(c)[0]?.name).toBe('shape')
  })

  it('shape: four live pilots, an unknown field, a wrong faction and a future schemaVersion all fail', () => {
    const four = clone(make()) as unknown as { roster: { live: string[] } }
    four.roster.live.pop()
    expect(issuesOf(four)[0]?.name).toBe('shape')
    expect(issuesOf({ ...clone(make()), extra: 1 })[0]?.name).toBe('shape')
    expect(issuesOf({ ...clone(make()), faction: 'de' })[0]?.name).toBe('shape')
    expect(issuesOf({ ...clone(make()), schemaVersion: SCHEMA_VERSION + 1 })[0]?.name).toBe('shape')
  })

  it('F5C: the campaign schema is version 2, and a pending sortie round-trips its legs and banked totals', () => {
    expect(SCHEMA_VERSION).toBe(2)
    const c = clone(make())
    c.pending = {
      sortieId: 'c1:s1', pilotId: c.roster.live[0]!, missionId: 'm', chapterId: null, difficulty: 'normal', scoreEligible: true, launchedAt: 'x', facts: {},
      legs: [{ place: 'Tacloban', at: 'x', counts: zeroCounts(), pilotPoints: 500, humanPoints: 500 }],
      banked: { ...noBanked(), destruction: 500, pilotPoints: 500, humanPoints: 500 },
    }
    c.serials.sortie = 1
    expect(issuesOf(c)).toEqual([])
    expect(validateCampaign(JSON.parse(JSON.stringify(c)))).toEqual({ ok: true, campaign: c })
  })

  it('faction is fixed: a Japanese campaign rejects American chapters in its progress', () => {
    const c = clone(make('ja'))
    c.progress.completed = ['A1']
    expect(issuesOf(c).map((i) => i.name)).toContain('progress-sequence')
  })
})
