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
})
