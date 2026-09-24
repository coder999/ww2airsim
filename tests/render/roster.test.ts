import { describe, expect, it, beforeEach } from 'vitest'
import {
  RANK_LADDER, applyMissionResult, createPilot, exportRoster, importRoster,
  loadRoster, rankFor, saveRoster, startSortie, type PilotRecord,
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
