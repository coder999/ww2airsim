import { describe, expect, it } from 'vitest'
import { INSIGNIA, RIBBONS, ribbonStripes } from '../../src/render/insignia.js'
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
