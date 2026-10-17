import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import table from '../../content/campaign/mission-fit.json'
import chapters from '../../content/campaign/chapters.json'
import { loadAircraftSpec, loadSite } from '../../tools/content/load.js'
import { fitOf, problemsOf, type FilledRow } from '../../tools/sites/missionFit.js'

/**
 * The mission-fit gate (F8A Task 10, plan decision 4; extended by F8B, 2026-10-17). Every F3 mission must reach its first
 * action within 7 minutes at 1x over the real layout. F8A filled A6; F8B fills the rows that start at or reach Buri, Bayug
 * or San Pablo (J1, J3, J5, J6) and gives A6 its recovery leg; the rest stay pending for F8C. A row that fails is a finding
 * to report, NOT to tune (Mark, 2026-10-16): such a row carries `expectFail`, and this test asserts that it still fails the
 * stated check, so a content fix that makes it pass flips the test and forces the table to be updated.
 */
const sites = Object.fromEntries(readdirSync('content/sites').filter((f) => f.endsWith('.json')).map((f) => { const id = f.replace(/\.json$/, ''); return [id, loadSite(id)] }))
const rows = table.rows as unknown as (FilledRow | { id: string; status: 'pending'; closedBy: string; reason: string })[]
const filled = rows.filter((r): r is FilledRow => r.status === 'filled')
const passing = filled.filter((r) => r.expectFail === undefined)
const findings = filled.filter((r) => r.expectFail !== undefined)

describe('mission-fit table', () => {
  it('has one row per chapter, all twelve, in the campaign order', () => {
    expect(rows.map((r) => r.id)).toEqual(chapters.chapters.map((c) => c.id))
    expect(rows).toHaveLength(12)
  })

  it('F8A and F8B fill the rows that start at or reach their sites; every other row names the plan that closes it', () => {
    expect(filled.map((r) => r.id)).toEqual(['A6', 'J1', 'J3', 'J5', 'J6'])
    const pending = rows.filter((r) => r.status === 'pending') as { id: string; closedBy: string; reason: string }[]
    expect(pending.map((r) => r.id)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'J2', 'J4'])
    for (const r of pending) {
      expect(r.closedBy, r.id).toBe('F8C')
      expect(r.reason.length, r.id).toBeGreaterThan(20)
    }
  })

  it('every invented first-action or start point says so and why', () => {
    for (const r of filled) {
      expect(r.firstAction.basis, `${r.id} first action`).toBe('invented')
      expect(r.firstAction.note.length, `${r.id} first action note`).toBeGreaterThan(30)
      if (r.start.kind === 'airborne') { expect(r.start.basis, `${r.id} start`).toBe('invented'); expect(r.start.note.length).toBeGreaterThan(30) }
    }
  })

  it.each(passing.map((r) => [r.id, r] as const))('%s reaches its first action inside the ceiling and recovers inside its budget, on legal fields, over the real layout', (_id, row) => {
    expect(loadAircraftSpec(row.aircraft).id).toBe(row.aircraft)
    const fit = fitOf(row, sites)
    expect(fit.flightM).toBeGreaterThan(1000)
    if (row.start.kind === 'parked') expect(fit.taxiM).toBeGreaterThan(10)
    expect(problemsOf(row, fit, table.ceilingS), `${row.id}: ${fit.totalS.toFixed(0)} s to first action (taxi ${fit.taxiS.toFixed(0)}, roll ${fit.takeoffS}, flight ${fit.flightS.toFixed(0)}) against ${table.ceilingS}`).toEqual([])
    expect(fit.totalS).toBeLessThanOrEqual(table.ceilingS)
  })

  it.each(findings.map((r) => [r.id, r] as const))('%s is a reported finding: it still fails the stated check, and only that one', (_id, row) => {
    const fit = fitOf(row, sites)
    const problems = problemsOf(row, fit, table.ceilingS)
    expect(problems.length, `${row.id} no longer fails: remove its expectFail and update the F8B handoff`).toBeGreaterThan(0)
    expect(problems.every((p) => p.startsWith(row.expectFail!.check)), problems.join(' | ')).toBe(true)
    expect(row.expectFail!.why.length).toBeGreaterThan(40)
  })

  it('J1 starts at Buri and sees its attackers inside F3\'s 6 mi', () => {
    const j1 = filled.find((r) => r.id === 'J1')!
    expect(j1.start).toMatchObject({ kind: 'parked', site: 'buri', window: 'pre-invasion' })
    expect(j1.withinM).toBeLessThanOrEqual(6 * 1609.344 + 1)
  })

  it('can fail: the same row with the first action 100 km away is over the ceiling', () => {
    const a6 = filled.find((r) => r.id === 'A6')!
    const far = { ...a6, cruiseMps: 20 }
    expect(fitOf(far, sites).totalS).toBeGreaterThan(table.ceilingS)
    expect(problemsOf(far, fitOf(far, sites), table.ceilingS).some((p) => p.startsWith('ceiling'))).toBe(true)
  })

  it('can fail: a first action farther than F3\'s stated range fails the range check', () => {
    const j1 = filled.find((r) => r.id === 'J1')!
    const wide = { ...j1, firstAction: { ...j1.firstAction, z: -20000 } }
    expect(problemsOf(wide, fitOf(wide, sites), table.ceilingS).some((p) => p.startsWith('range'))).toBe(true)
  })

  it('can fail: a recovery field held by the other side, or not serviceable, is illegal; a recovery list with no legal field fails', () => {
    const j6 = filled.find((r) => r.id === 'J6')!
    const wrongSide = { ...j6, side: 'allied' as const }
    expect(problemsOf(wrongSide, fitOf(wrongSide, sites), table.ceilingS).some((p) => p.startsWith('legality'))).toBe(true)
    const a6 = filled.find((r) => r.id === 'A6')!
    // San Pablo is allied and serviceable in the endgame (ruling 3) but Dulag is not named by A6; name an unserviceable field instead
    const closed = { ...a6, recovery: { sites: ['tanauan'], budgetS: a6.recovery!.budgetS } }
    expect(problemsOf(closed, fitOf(closed, sites), table.ceilingS).some((p) => p.startsWith('legality'))).toBe(true)
  })

  it('can fail: a recovery budget shorter than the flight home is over budget', () => {
    const a6 = filled.find((r) => r.id === 'A6')!
    const tight = { ...a6, recovery: { sites: a6.recovery!.sites, budgetS: 20 } }
    expect(problemsOf(tight, fitOf(tight, sites), table.ceilingS).some((p) => p.startsWith('recovery'))).toBe(true)
  })

  it('a start spot that does not exist, or a window with no field, is an error rather than a pass', () => {
    const a6 = filled.find((r) => r.id === 'A6')!
    if (a6.start.kind !== 'parked') throw new Error('A6 starts parked')
    expect(() => fitOf({ ...a6, start: { ...a6.start, parked: 'nobody' } }, sites)).toThrow(/nobody/)
    expect(() => fitOf({ ...a6, start: { ...a6.start, site: 'tanauan', window: 'assault' } }, sites)).toThrow(/no field/)
  })
})
