import { describe, expect, it, beforeEach } from 'vitest'
import {
  RANK_LADDER, ZERO_CAREER, MISSION_LOG_CAP,
  applyMissionResult, applyMissionResultToRoster, createPilot, exportRoster, importRoster,
  loadRoster, rankFor, saveRoster, startSortie, type PilotRecord, type SortieFacts,
} from '../../src/render/roster.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'

describe('rankFor', () => {
  it('matches master spec §8\'s ladder at every threshold', () => {
    for (const { threshold, abbrev } of RANK_LADDER) {
      expect(rankFor(threshold).abbrev).toBe(abbrev)
      if (threshold > 0) expect(rankFor(threshold - 1).abbrev).not.toBe(abbrev)
    }
  })
})

describe('roster persistence — whole-branch review I-1', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        clear: () => store.clear(),
      },
    }
  })

  it('loadRoster tolerates malformed JSON, returning an empty roster instead of throwing', () => {
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(
      'ww2airsim.roster.v1',
      'not json',
    )
    expect(loadRoster()).toEqual([])
  })

  it('loadRoster tolerates a pilot missing a required field, returning an empty roster instead of throwing', () => {
    const pilot = createPilot('Boyington') as unknown as Record<string, unknown>
    delete pilot.id
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(
      'ww2airsim.roster.v1',
      JSON.stringify([pilot]),
    )
    expect(loadRoster()).toEqual([])
  })

  it('loadRoster accepts a saved pilot whose rank threshold no longer matches the current ladder (a retuned threshold), matching by abbrev alone', () => {
    const pilot = { ...createPilot('Boyington'), rank: { abbrev: 'LTJG', name: 'Lieutenant, junior grade', threshold: 999_999 } }
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem(
      'ww2airsim.roster.v1',
      JSON.stringify([pilot]),
    )
    expect(loadRoster()).toEqual([pilot])
  })

  it('importRoster still throws on a rank abbrev not in the ladder at all (a genuinely unrecognized rank)', () => {
    const pilot = { ...createPilot('Boyington'), rank: { abbrev: 'XYZ', name: 'Not A Rank', threshold: 0 } }
    expect(() => importRoster(JSON.stringify([pilot]))).toThrow()
  })

  it('saveRoster does not throw when localStorage.setItem throws (e.g. a storage-disabled browser)', () => {
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem = () => {
      throw new Error('storage disabled')
    }
    expect(() => saveRoster([createPilot('Boyington')])).not.toThrow()
  })
})

describe('roster persistence', () => {
  // This repo's vitest config (`environment: 'node'`) provides no DOM and
  // no `window` global at all -- confirmed against this checkout's own
  // Node (v22): `globalThis.window`/`globalThis.localStorage` are both
  // `undefined` by default. `loadRoster`/`saveRoster` correctly use
  // `window.localStorage` (design §2 says persistence is a browser
  // concern), so the test file supplies a minimal in-memory fake `window`
  // here rather than changing production code to a different global --
  // `titleScreen.test.ts`/`debrief.test.ts`'s "test the pure pieces only"
  // convention is about not driving DOM construction, not about avoiding
  // every browser global a pure-looking function happens to call.
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        clear: () => store.clear(),
      },
    }
  })

  it('save/load round-trips exactly', () => {
    const pilot = createPilot('Boyington')
    saveRoster([pilot])
    expect(loadRoster()).toEqual([pilot])
  })

  it('export/import round-trips exactly', () => {
    const pilot = createPilot('Boyington')
    expect(importRoster(exportRoster([pilot]))).toEqual([pilot])
  })

  it('importRoster throws on malformed JSON', () => {
    expect(() => importRoster('not json')).toThrow()
  })

  it('importRoster throws on a missing required field', () => {
    const pilot = createPilot('Boyington') as unknown as Record<string, unknown>
    delete pilot.id
    expect(() => importRoster(JSON.stringify([pilot]))).toThrow()
  })

  it('importRoster throws on a rank not in the ladder', () => {
    const pilot = { ...createPilot('Boyington'), rank: { abbrev: 'XYZ', name: 'Not A Rank', threshold: 0 } }
    expect(() => importRoster(JSON.stringify([pilot]))).toThrow()
  })
})

describe('pilot lifecycle', () => {
  it('startSortie increments sorties and, for a kia pilot, resurrects without erasing history', () => {
    const fresh = createPilot('Boyington')
    const flown = startSortie(fresh)
    expect(flown.sorties).toBe(1)
    expect(flown.status).toBe('active')

    const kia: PilotRecord = { ...fresh, status: 'kia', missionsFlown: 3, killsByType: { ...zeroKillsByType(), fighter: 2 } }
    const revived = startSortie(kia)
    expect(revived.status).toBe('active')
    expect(revived.resurrections).toBe(1)
    expect(revived.missionsFlown).toBe(3) // history not erased
    expect(revived.killsByType.fighter).toBe(2) // history not erased
  })

  it('applyMissionResult banks score, promotes, and marks kia only on a kill', () => {
    const pilot = createPilot('Boyington')
    const landed = applyMissionResult(pilot, 3000, 'landed')
    expect(landed.cumulativeScore).toBe(3000)
    expect(landed.missionsFlown).toBe(1)
    expect(landed.status).toBe('active')
    expect(landed.rank.abbrev).toBe('LTJG') // 2,500 threshold crossed

    const killed = applyMissionResult(pilot, 100, 'killed')
    expect(killed.status).toBe('kia')
  })

  it('whole-branch review I-2: applyMissionResult accumulates killsByType from the per-mission delta, additively across missions', () => {
    const pilot = createPilot('Boyington')
    const afterFirst = applyMissionResult(pilot, 500, 'landed', { ...zeroKillsByType(), fighter: 1 })
    expect(afterFirst.killsByType.fighter).toBe(1)
    expect(afterFirst.killsByType.bomber).toBe(0)

    const afterSecond = applyMissionResult(afterFirst, 750, 'landed', { ...zeroKillsByType(), fighter: 1, bomber: 1 })
    expect(afterSecond.killsByType.fighter).toBe(2) // accumulated, not overwritten
    expect(afterSecond.killsByType.bomber).toBe(1)
  })

  it('whole-branch review I-2: applyMissionResult with no kills argument leaves killsByType unchanged (existing callers keep compiling)', () => {
    const pilot = { ...createPilot('Boyington'), killsByType: { ...zeroKillsByType(), fighter: 3 } }
    const landed = applyMissionResult(pilot, 500, 'landed')
    expect(landed.killsByType.fighter).toBe(3)
  })

  it('whole-branch review I-4: a kia pilot who is Restarted (not New-Gamed, so startSortie never runs) and lands successfully is active again', () => {
    // The Restart path: the pilot enters `applyMissionResult` already `kia`
    // (from a previous death this same call sequence would have banked) and
    // `startSortie` is never called again -- this plan's own "Ruling" that
    // Restart redoes the same sortie rather than starting a new one.
    const kia: PilotRecord = { ...createPilot('Boyington'), status: 'kia', resurrections: 0 }
    const survivedRestart = applyMissionResult(kia, 500, 'landed')
    expect(survivedRestart.status).toBe('active')
    // `resurrections` stays exclusively `startSortie`'s to increment --
    // Restart reviving a pilot via a successful landing must not double-count
    // a resurrection `startSortie` was never asked to grant.
    expect(survivedRestart.resurrections).toBe(0)
  })

  it('whole-branch review I-4: a ditch also clears kia back to active, the same as a landing', () => {
    const kia: PilotRecord = { ...createPilot('Boyington'), status: 'kia' }
    expect(applyMissionResult(kia, 0, 'ditched').status).toBe('active')
  })

  it('whole-branch review I-4: dying again while already kia (e.g. Restart into another death) stays kia', () => {
    const kia: PilotRecord = { ...createPilot('Boyington'), status: 'kia' }
    expect(applyMissionResult(kia, 0, 'killed').status).toBe('kia')
  })
})

const facts = (over: Partial<SortieFacts> = {}): SortieFacts => ({
  at: '2026-09-25T20:00:00.000Z', scenarioId: 'leyte-cap', aircraft: 'F6F-5 Hellcat', loadout: 'clean',
  outcome: 'field', segment: { flightSeconds: 600, maxAltitudeM: 3000, maxTrueAirspeedMps: 150 }, ...over,
})

describe('career and mission log (dossier spec §B.1)', () => {
  it('a new pilot starts with a zero career and an empty log', () => {
    const p = createPilot('Ace')
    expect(p.career).toEqual(ZERO_CAREER)
    expect(p.log).toEqual([])
  })

  it('appends one log entry and folds the segment into career totals', () => {
    const p = applyMissionResult(createPilot('Ace'), 500, 'landed', zeroKillsByType(), facts({ outcome: 'trap' }))
    expect(p.log).toHaveLength(1)
    expect(p.log[0]).toMatchObject({ outcome: 'trap', points: 500, flightSeconds: 600, aircraft: 'F6F-5 Hellcat' })
    expect(p.career.flightSeconds).toBe(600)
    expect(p.career.landings).toEqual({ trap: 1, field: 0, ditched: 0 })
    expect(p.career.maxAltitudeM).toBe(3000)
  })

  it('a killed sortie logs but counts no landing; peaks keep the career maximum', () => {
    let p = applyMissionResult(createPilot('Ace'), 0, 'landed', zeroKillsByType(), facts())
    p = applyMissionResult(p, 0, 'killed', zeroKillsByType(), facts({ outcome: 'killed', segment: { flightSeconds: 10, maxAltitudeM: 100, maxTrueAirspeedMps: 200 } }))
    expect(p.career.landings).toEqual({ trap: 0, field: 1, ditched: 0 })
    expect(p.career.maxAltitudeM).toBe(3000)
    expect(p.career.maxTrueAirspeedMps).toBe(200)
    expect(p.career.flightSeconds).toBe(610)
  })

  it('without sortie facts nothing is logged (existing callers unchanged)', () => {
    const p = applyMissionResult(createPilot('Ace'), 100, 'landed')
    expect(p.log).toEqual([])
    expect(p.career).toEqual(ZERO_CAREER)
  })

  it('caps the log at 200, dropping the oldest, and keeps career totals past the cap', () => {
    let p = createPilot('Ace')
    for (let i = 0; i < MISSION_LOG_CAP + 5; i++) {
      p = applyMissionResult(p, 1, 'landed', zeroKillsByType(), facts({ at: `2026-09-25T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z` }))
    }
    expect(p.log).toHaveLength(MISSION_LOG_CAP)
    expect(p.log[0]!.at).toContain('.005Z')
    expect(p.career.landings.field).toBe(MISSION_LOG_CAP + 5)
    expect(p.career.flightSeconds).toBe(600 * (MISSION_LOG_CAP + 5))
  })

  it('land -> continue -> crash banks two separate log lines (review focus 2)', () => {
    const p0 = createPilot('Ace')
    let roster: readonly PilotRecord[] = [p0]
    roster = applyMissionResultToRoster(roster, p0.id, 100, 'landed', zeroKillsByType(), facts({ segment: { flightSeconds: 300, maxAltitudeM: 1000, maxTrueAirspeedMps: 90 } }))
    roster = applyMissionResultToRoster(roster, p0.id, 0, 'killed', zeroKillsByType(), facts({ outcome: 'killed', segment: { flightSeconds: 40, maxAltitudeM: 400, maxTrueAirspeedMps: 120 } }))
    const p = roster[0]!
    expect(p.log.map((e) => [e.outcome, e.flightSeconds])).toEqual([['field', 300], ['killed', 40]])
    expect(p.career.flightSeconds).toBe(340)
  })
})

describe('migrate on read (dossier spec §B.3)', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        clear: () => store.clear(),
      },
    }
  })

  const legacy = (): Record<string, unknown> => {
    const rest = createPilot('Old Timer') as unknown as Record<string, unknown>
    delete rest.career
    delete rest.log
    return { ...rest, cumulativeScore: 9000, sorties: 7 }
  }

  it('a pre-dossier record loads with a zero career and an empty log, keeping its score', () => {
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem('ww2airsim.roster.v1', JSON.stringify([legacy()]))
    const [p] = loadRoster()
    expect(p!.career).toEqual(ZERO_CAREER)
    expect(p!.log).toEqual([])
    expect(p!.cumulativeScore).toBe(9000)
  })

  it('a partial career (landings missing a key) is zero-filled, not a thrown roster (review focus 4)', () => {
    const rec = { ...legacy(), career: { flightSeconds: 12, landings: { trap: 2 }, maxAltitudeM: 5 }, log: [] }
    ;(globalThis as { window: { localStorage: Storage } }).window.localStorage.setItem('ww2airsim.roster.v1', JSON.stringify([rec]))
    const [p] = loadRoster()
    expect(p!.career).toEqual({ flightSeconds: 12, landings: { trap: 2, field: 0, ditched: 0 }, maxAltitudeM: 5, maxTrueAirspeedMps: 0 })
  })

  it('a pre-dossier export still imports; a populated log round-trips', () => {
    expect(importRoster(JSON.stringify([legacy()]))[0]!.log).toEqual([])
    const flown = applyMissionResult(createPilot('Ace'), 5, 'landed', zeroKillsByType(), facts())
    expect(importRoster(exportRoster([flown]))).toEqual([flown])
  })
})
