import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import table from '../../content/campaign/mission-fit.json'
import chapters from '../../content/campaign/chapters.json'
import { loadAircraftSpec, loadSite } from '../../tools/content/load.js'
import { fitOf, linkProblem, problemsOf, startWorldOf, type FilledRow } from '../../tools/sites/missionFit.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { playerAircraft } from '../../src/sim/loop.js'

/**
 * The mission-fit gate (F8A Task 10, plan decision 4; extended by F8B, 2026-10-17, and closed by F8C, 2026-10-17). Every F3
 * mission must reach its first action within 7 minutes at 1x over the real layout. F8A filled A6; F8B filled the rows that
 * start at or reach Buri, Bayug or San Pablo (J1, J3, J5, J6) and gave A6 its recovery leg; F8C fills the last seven (A1-A5,
 * J2, J4), which start on a carrier deck, afloat, over the ridge or over the sea. A row that fails is a finding
 * to report, NOT to tune (Mark, 2026-10-16): such a row carries `expectFail`, and this test asserts that it still fails the
 * stated check, so a content fix that makes it pass flips the test and forces the table to be updated.
 */
const sites = Object.fromEntries(readdirSync('content/sites').filter((f) => f.endsWith('.json')).map((f) => { const id = f.replace(/\.json$/, ''); return [id, loadSite(id)] }))
const rows = table.rows as unknown as (FilledRow | { id: string; status: 'pending'; closedBy: string; reason: string })[]
const rowOf = (id: string): FilledRow => filled.find((r) => r.id === id)!
const filled = rows.filter((r): r is FilledRow => r.status === 'filled')
const passing = filled.filter((r) => r.expectFail === undefined)
const findings = filled.filter((r) => r.expectFail !== undefined)

describe('mission-fit table', () => {
  it('has one row per chapter, all twelve, in the campaign order', () => {
    expect(rows.map((r) => r.id)).toEqual(chapters.chapters.map((c) => c.id))
    expect(rows).toHaveLength(12)
  })

  it('all twelve rows are filled: none is left pending (F8C closed the last seven)', () => {
    expect(filled.map((r) => r.id)).toEqual(chapters.chapters.map((c) => c.id))
    expect(rows.filter((r) => r.status === 'pending')).toEqual([])
  })

  it('every invented first-action or start point says so and why', () => {
    for (const r of filled) {
      expect(r.firstAction.basis, `${r.id} first action`).toBe('invented')
      expect(r.firstAction.note.length, `${r.id} first action note`).toBeGreaterThan(30)
      if (r.start.kind !== 'parked') { expect(r.start.basis, `${r.id} start`).toBe('invented'); expect(r.start.note.length).toBeGreaterThan(30) }
      for (const p of r.recovery?.points ?? []) { expect(p.basis, `${r.id} recovery point ${p.label}`).toBe('invented'); expect(p.note.length).toBeGreaterThan(30) }
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

  it('F8C start kinds: A1 and A5 launch/fly from the Essex or the ridge, A4 starts afloat at the Jinamoc anchorage, A3 and A4 recover on real legal sites', () => {
    expect(rowOf('A1').start.kind).toBe('deck')
    expect(rowOf('A4').start).toMatchObject({ kind: 'afloat', site: 'jinamoc' })
    expect(rowOf('A4').recovery!.sites).toEqual(['jinamoc'])
    expect(rowOf('A3').recovery!.sites).toEqual(['tacloban'])
    expect(rowOf('A5').start.kind).toBe('airborne')
    for (const id of ['A1', 'A2', 'A5']) expect(rowOf(id).recovery!.points!.length, id).toBeGreaterThan(0)
    // A5 recovers at any legal friendly field (F5C D3), the Essex only the suggested carrier: the nearest legal one is Bayug and it is still over budget
    const a5 = fitOf(rowOf('A5'), sites)
    expect(rowOf('A5').recovery!.sites).toEqual(['tacloban', 'dulag', 'buri', 'bayug'])
    expect(a5.illegal).toEqual([])
    expect(a5.recovery!.site).toBe('bayug')
    expect(a5.recovery!.totalS).toBeGreaterThan(420)
  })

  it('A4 and J4 are night missions: the anchorage has its lamps in the window A4 is played in, and Ormoc has no light at all (F3 section 8)', () => {
    expect(rowOf('A4').lights).toMatchObject({ site: 'jinamoc', min: 4 })
    expect(rowOf('J4').lights).toMatchObject({ site: 'ormoc', max: 0 })
    for (const id of ['A4', 'J4']) expect(problemsOf(rowOf(id), fitOf(rowOf(id), sites), table.ceilingS).filter((p) => p.startsWith('lights')), id).toEqual([])
  })

  it('can fail: a deck or water start pays for its run (a 400 s water run is over the ceiling); a lamp count above the site\'s fails the lights check', () => {
    const a4 = rowOf('A4')
    const slow = { ...a4, takeoffS: 400 }
    expect(problemsOf(slow, fitOf(slow, sites), table.ceilingS).some((p) => p.startsWith('ceiling'))).toBe(true)
    const a1 = rowOf('A1')
    expect(fitOf({ ...a1, takeoffS: 100 }, sites).totalS).toBeGreaterThan(fitOf(a1, sites).totalS + 59)
    const dark = { ...a4, lights: { site: 'jinamoc', min: 99 } }
    expect(problemsOf(dark, fitOf(dark, sites), table.ceilingS).some((p) => p.startsWith('lights'))).toBe(true)
    const lit = { ...rowOf('J4'), lights: { site: 'jinamoc', max: 0 } }
    expect(problemsOf(lit, fitOf(lit, sites), table.ceilingS).some((p) => p.startsWith('lights'))).toBe(true)
  })

  it('can fail: a recovery point (the Essex) farther than the budget allows fails the recovery check, and a point is always a legal place to land', () => {
    const a1 = rowOf('A1')
    const far = { ...a1, recovery: { ...a1.recovery!, points: [{ ...a1.recovery!.points![0]!, x: 200000 }] } }
    expect(problemsOf(far, fitOf(far, sites), table.ceilingS).some((p) => p.startsWith('recovery'))).toBe(true)
    expect(fitOf(a1, sites).illegal).toEqual([])
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
    const start = a6.start
    if (start.kind !== 'parked') throw new Error('A6 starts parked')
    expect(() => fitOf({ ...a6, start: { ...start, parked: 'nobody' } }, sites)).toThrow(/nobody/)
    expect(() => fitOf({ ...a6, start: { ...start, site: 'tanauan', window: 'assault' } }, sites)).toThrow(/no field/)
  })
})

describe('a row linked to a scenario (F10-0)', () => {
  const realStart = (scenario: string) => { const p = playerAircraft(worldFromScenario(loadScenarioBundle(scenario), null)).state.position; return { x: p.x, z: p.z } }
  it('every row that names a scenario starts where that scenario starts', () => {
    for (const r of filled.filter((x) => x.scenario !== undefined)) expect(linkProblem(r, sites, realStart(r.scenario!)), r.id).toBeNull()
  })
  it('the check can fail: a start that moved, or a row with no link, is told apart', () => {
    const row = { ...rowOf('A6'), scenario: 'escort' } // a real scenario, nowhere near Tacloban's parked start
    const at = startWorldOf(row, sites)
    expect(linkProblem(row, sites, at)).toBeNull()
    expect(linkProblem(row, sites, { x: at.x + 100, z: at.z })).toBeNull() // inside the tolerance
    expect(linkProblem(row, sites, { x: at.x + 1000, z: at.z })).toMatch(/^link: A6 starts 1000 m from where scenario "escort" starts/)
    expect(linkProblem(rowOf('A6'), sites, { x: 0, z: 0 })).toBeNull() // not linked: nothing to compare
    expect(realStart('escort').x).toBeCloseTo(-16536, -2) // the reader finds a real scenario's start (escort.json: airborneAt -16536, 3500, -34186)
  })
})
