import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import table from '../../content/campaign/mission-fit.json'
import chapters from '../../content/campaign/chapters.json'
import { loadAircraftSpec, loadSite } from '../../tools/content/load.js'
import { fitOf, type FilledRow } from '../../tools/sites/missionFit.js'

/**
 * F8A Task 10 (2026-10-16): the mission-fit gate (plan decision 4). Every F3 mission must reach its first action within
 * 7 minutes at 1x over the real layout. F8A fills the rows that start at its sites (Tacloban); the rest are pending,
 * each naming F8B or F8C. A row that fails is a finding to report, NOT to tune (Mark, 2026-10-16): this test asserts
 * the gate and lists what failed, and the handoff reports it.
 */
const sites = Object.fromEntries(readdirSync('content/sites').filter((f) => f.endsWith('.json')).map((f) => { const id = f.replace(/\.json$/, ''); return [id, loadSite(id)] }))
const rows = table.rows as unknown as (FilledRow | { id: string; status: 'pending'; closedBy: string; reason: string })[]
const filled = rows.filter((r): r is FilledRow => r.status === 'filled')

describe('mission-fit table', () => {
  it('has one row per chapter, all twelve, in the campaign order', () => {
    expect(rows.map((r) => r.id)).toEqual(chapters.chapters.map((c) => c.id))
    expect(rows).toHaveLength(12)
  })

  it('F8A fills exactly the rows that start at its sites; every other row names the plan that closes it', () => {
    expect(filled.map((r) => r.id)).toEqual(['A6'])
    const pending = rows.filter((r) => r.status === 'pending') as { id: string; closedBy: string; reason: string }[]
    expect(pending).toHaveLength(11)
    for (const r of pending) {
      expect(['F8B', 'F8C'], r.id).toContain(r.closedBy)
      expect(r.reason.length, r.id).toBeGreaterThan(20)
    }
  })

  it.each(filled.map((r) => [r.id, r] as const))('%s reaches its first action inside the ceiling over the real layout', (_id, row) => {
    expect(loadAircraftSpec(row.aircraft).id).toBe(row.aircraft)
    const fit = fitOf(row, sites)
    // the numbers are real: a taxi, a roll and a flight, each positive
    expect(fit.taxiM).toBeGreaterThan(10)
    expect(fit.flightM).toBeGreaterThan(1000)
    expect(fit.taxiBlockedBy, 'a building stands between the start spot and the strip').toBeNull()
    expect(fit.totalS, `${row.id}: ${fit.totalS.toFixed(0)} s (taxi ${fit.taxiS.toFixed(0)}, roll ${fit.takeoffS}, flight ${fit.flightS.toFixed(0)}) against ${table.ceilingS}`).toBeLessThanOrEqual(table.ceilingS)
  })

  it('can fail: the same row with the first action 100 km away is over the ceiling', () => {
    const a6 = filled[0]!
    const far = { ...a6, cruiseMps: 20 }
    expect(fitOf(far, sites).totalS).toBeGreaterThan(table.ceilingS)
  })

  it('a start spot that does not exist, or a window with no field, is an error rather than a pass', () => {
    const a6 = filled[0]!
    expect(() => fitOf({ ...a6, start: { ...a6.start, parked: 'nobody' } }, sites)).toThrow(/nobody/)
    expect(() => fitOf({ ...a6, start: { ...a6.start, site: 'tanauan', window: 'assault' } }, sites)).toThrow(/no field/)
  })
})
