import { describe, expect, it } from 'vitest'
import { INSIGNIA, RIBBONS, rankDeviceMarkup, ribbonStripes } from '../../src/render/insignia.js'
import { RANK_LADDER } from '../../src/render/roster.js'
import { SCENARIO_OPTIONS } from '../../src/render/titleScreen.js'

// Enrolled from the picker and the ladder, so a new mission or rank without
// art fails here rather than quietly drawing the plain fallback (2026-10-10).
const shipped = SCENARIO_OPTIONS.filter((o) => o.kind === 'mission' && !o.dev).map((o) => o.badge!.id)

describe('mission ribbons', () => {
  it('every shipped mission badge has its own design, no two alike', () => {
    expect(shipped.length).toBeGreaterThanOrEqual(9)
    for (const id of shipped) expect(RIBBONS[id], id).toBeDefined()
    const looks = shipped.map((id) => JSON.stringify(ribbonStripes(id)))
    expect(new Set(looks).size).toBe(shipped.length)
  })
  it('is symmetric and a real ribbon width (44/32 in)', () => {
    for (const id of shipped) {
      const s = ribbonStripes(id)
      expect(s, id).toEqual([...s].reverse())
      expect(s.reduce((sum, [, w]) => sum + w, 0), id).toBe(44)
    }
  })
})

describe('rank insignia', () => {
  it('every rank on the ladder has a collar device, no two alike', () => {
    for (const r of RANK_LADDER) expect(INSIGNIA[r.abbrev], r.abbrev).toBeDefined()
    expect(new Set(RANK_LADDER.map((r) => INSIGNIA[r.abbrev]![1])).size).toBe(RANK_LADDER.length)
  })
})

describe('rank devices by faction and tier (F5B Task 5)', () => {
  const tiers = [1, 2, 3, 4, 5, 6] as const
  it('twelve devices exist, and no two in one faction look alike', () => {
    for (const faction of ['us', 'ja'] as const) {
      const looks = tiers.map((t) => rankDeviceMarkup(faction, t))
      expect(looks.every((m) => m.length > 50), faction).toBe(true)
      expect(new Set(looks).size, faction).toBe(6)
    }
  })
  it('the Japanese side never shows a USN device, and the USN table is the one the old ladder used', () => {
    const usn = new Set(Object.values(INSIGNIA).map((a) => a[1]))
    for (const t of tiers) {
      expect(usn.has(rankDeviceMarkup('ja', t))).toBe(false)
      expect(usn.has(rankDeviceMarkup('us', t))).toBe(true)
    }
    expect(rankDeviceMarkup('us', 1)).toBe(INSIGNIA['ENS']![1])
    expect(rankDeviceMarkup('us', 6)).toBe(INSIGNIA['CAPT']![1])
  })
  it('the Japanese band and step follow the stated scheme: tiers 1-3 one stripe, 4-6 two, blossoms 1-3 within each band', () => {
    const stripes = (m: string): number => (m.match(/height="3" fill="#d9b44a"/g) ?? []).length
    const blossoms = (m: string): number => (m.match(/r="[0-9.]+" fill="#1b2a4e"/g) ?? []).length
    expect(tiers.map((t) => stripes(rankDeviceMarkup('ja', t)))).toEqual([1, 1, 1, 2, 2, 2])
    expect(tiers.map((t) => blossoms(rankDeviceMarkup('ja', t)))).toEqual([1, 2, 3, 1, 2, 3])
  })
})
