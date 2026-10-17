/**
 * F5C (2026-10-16): multi-leg sorties. A landing at a friendly base banks what was earned since the last bank
 * (`bankLeg`) and keeps the sortie open; `bankSortie` is the closing call. These tests pin the contract in
 * docs/campaign-data.md, "Legs": checkpoint banking (D4), banked stays banked (D5), interrupted sorties (D11), one
 * log entry per sortie with its legs (D10), and an exhaustive model check over end kind x legs x what is unbanked.
 */
import { describe, expect, it } from 'vitest'
import {
  bankLeg, bankSortie, resolveInterrupted, validateCampaign,
  type Campaign, type LegReport, type SortieEndKind, type SortieReport,
} from '../../src/campaign/index.js'
import { canonicalStringify } from '../../src/flightRecorder/canonical.js'
import { NOW, accept, counts, fresh, launch, mission, report } from './helpers.js'

const leg = (c: Campaign, n: number, over: Partial<SortieReport> = {}, place = 'Tacloban'): LegReport => ({ ...report(c, over), leg: n, place })
const bank = (c: Campaign, l: LegReport): Campaign => accept(bankLeg(c, l, NOW))

describe('bankLeg: checkpoint banking (D4)', () => {
  it('banks the points earned so far, keeps the sortie open and leaves the denominators alone', () => {
    const l0 = launch(fresh(), 0, mission())
    const pid = l0.roster.live[0]!
    const l1 = bank(l0, leg(l0, 1, { counts: counts({ destroyer: 1 }) }))
    expect(l1.pending).not.toBeNull()
    expect(l1.pending!.legs).toHaveLength(1)
    expect(l1.pending!.legs[0]).toMatchObject({ place: 'Tacloban', pilotPoints: 1000 })
    expect(l1.pilots[pid]).toMatchObject({ points: 1000, sorties: 1, banked: 0 })
    expect(l1.human.ledger).toMatchObject({ points: 1000, sorties: 1, banked: 0 })
    expect(l1.human.log).toHaveLength(0) // the log entry is written once, at the close (D10)
    expect(l1.revision).toBe(l0.revision + 1)
  })

  it('leg 1 +500 landed, leg 2 +200 then killed: the death still banks the 200 (Mark 2026-10-16), and the 500 stays', () => {
    // 200 points is not one target, so use a 500 fighter on leg 1 and 100 light vehicles x2 on leg 2.
    const l0 = launch(fresh(), 0, mission())
    const pid = l0.roster.live[0]!
    const l1 = bank(l0, leg(l0, 1, { counts: counts({ fighter: 1 }) }))
    const closed = accept(bankSortie(l1, report(l1, { end: 'killed', counts: counts({ fighter: 1, 'light-vehicle': 2 }) }), NOW))
    expect(closed.pilots[pid]).toMatchObject({ status: 'kia', points: 700 })
    expect(closed.human.ledger.points).toBe(700)
    expect(closed.human.ledger.counts.fighter).toBe(1)
    expect(closed.human.ledger.counts['light-vehicle']).toBe(2)
    expect(closed.human.stats.losses.kia).toBe(1)
  })

  it('a second bank adds only the delta since the first', () => {
    const l0 = launch(fresh(), 0, mission())
    const pid = l0.roster.live[0]!
    const l1 = bank(l0, leg(l0, 1, { counts: counts({ fighter: 1 }) }))
    const l2 = bank(l1, leg(l1, 2, { counts: counts({ fighter: 1, tank: 2 }) }, 'Dulag'))
    expect(l2.pilots[pid]!.points).toBe(500 + 600)
    expect(l2.pending!.legs.map((x) => [x.place, x.pilotPoints])).toEqual([['Tacloban', 500], ['Dulag', 600]])
    const done = accept(bankSortie(l2, report(l2, { counts: counts({ fighter: 1, tank: 2 }) }), NOW))
    expect(done.pilots[pid]).toMatchObject({ points: 1100, sorties: 1, banked: 1 })
    expect(done.human.ledger).toMatchObject({ points: 1100, sorties: 1, banked: 1 })
  })

  it('is refused, with the SAME reference, when repeated, out of order, wrong id, not a landing or after a friendly kill', () => {
    const l0 = launch(fresh(), 0, mission())
    const l1 = bank(l0, leg(l0, 1, { counts: counts({ fighter: 1 }) }))
    const again = bankLeg(l1, leg(l1, 1, { counts: counts({ fighter: 1 }) }), NOW)
    expect(!again.ok && again.error.code).toBe('leg-mismatch')
    expect(!again.ok && again.campaign).toBe(l1)
    const skipped = bankLeg(l1, leg(l1, 3), NOW)
    expect(!skipped.ok && skipped.error.code).toBe('leg-mismatch')
    const wrong = bankLeg(l1, { ...leg(l1, 2), sortieId: 'c1:s9' }, NOW)
    expect(!wrong.ok && wrong.error.code).toBe('sortie-mismatch')
    for (const end of ['killed', 'ditched', 'abandoned'] as const) {
      const r = bankLeg(l1, leg(l1, 2, { end }), NOW)
      expect(!r.ok && r.error.code, end).toBe('bad-report')
    }
    expect(bankLeg(l1, leg(l1, 2, { friendlyDestroyed: true }), NOW).ok).toBe(false)
    const down = bankLeg(l1, leg(l1, 2, { counts: counts({ fighter: 0 }) }), NOW)
    expect(!down.ok && down.error.code).toBe('bad-report')
    expect(bankLeg(fresh(), leg(l0, 1), NOW).ok).toBe(false) // nothing pending
  })

  it('the badge, the difficulty and completion bonuses, the roster bonus and the chapter apply ONCE, at the first qualifying landing (D4)', () => {
    const m = mission({ id: 'a1', kind: 'campaign', chapterId: 'A1', authoredBonus: 2500, badgeId: 'b' })
    const l0 = launch(fresh(), 0, m, 'hard')
    const pid = l0.roster.live[0]!
    const q = { success: true, authoredBonus: 2500, badgeId: 'b' } as const
    const l1 = bank(l0, leg(l0, 1, { ...q, counts: counts({ tank: 1 }) }))
    expect(l1.pilots[pid]!.points).toBe(300 + 1000 + 2500)
    expect(l1.pilots[pid]!.badges).toEqual(['b'])
    expect(l1.progress.completed).toEqual(['A1'])
    const humanAfter1 = l1.human.ledger.points
    expect(humanAfter1).toBe(3800 + 100) // tier 2 pilot: roster bonus 100
    // Leg 2 also reports success, and earns only its own destruction.
    const l2 = bank(l1, leg(l1, 2, { ...q, counts: counts({ tank: 2 }) }, 'Dulag'))
    expect(l2.pilots[pid]!.points).toBe(3800 + 300)
    expect(l2.pilots[pid]!.badges).toEqual(['b'])
    expect(l2.human.ledger.points).toBe(humanAfter1 + 300)
    expect(l2.progress.completed).toEqual(['A1'])
    const done = accept(bankSortie(l2, report(l2, { ...q, counts: counts({ tank: 2 }) }), NOW))
    expect(done.progress.completed).toEqual(['A1'])
    expect(done.progress.attempts.A1).toEqual({ launched: 1, failed: 0, abandoned: 0 }) // never a failure once qualified
    expect(done.human.ledger.badges).toEqual(['b'])
  })

  it('a chapter completed at a landing stays complete when the pilot is then killed (D4, D5)', () => {
    const m = mission({ id: 'a1', kind: 'campaign', chapterId: 'A1', badgeId: 'b' })
    const l0 = launch(fresh(), 0, m)
    const l1 = bank(l0, leg(l0, 1, { success: true, badgeId: 'b' }))
    const dead = accept(bankSortie(l1, report(l1, { end: 'killed' }), NOW))
    expect(dead.progress.completed).toEqual(['A1'])
    expect(dead.human.ledger.badges).toEqual(['b'])
    expect(dead.human.log.at(-1)).toMatchObject({ end: 'killed', success: true })
  })

  it('abandon after a bank keeps the bank and forfeits only the unbanked part (D5, D11)', () => {
    const l0 = launch(fresh(), 0, mission())
    const pid = l0.roster.live[0]!
    const l1 = bank(l0, leg(l0, 1, { counts: counts({ fighter: 1 }) }))
    const after = accept(bankSortie(l1, report(l1, { end: 'abandoned', counts: counts({ fighter: 3 }) }), NOW))
    expect(after.pilots[pid]).toMatchObject({ status: 'active', points: 500, sorties: 1, banked: 1 })
    expect(after.human.ledger.points).toBe(500)
    expect(after.human.stats.abandoned).toBe(1)
    expect(after.human.log.at(-1)).toMatchObject({ end: 'abandoned', points: 500, flags: ['forfeit-abandoned'] })
  })

  it('an interrupted sortie after a bank is an abandonment: the bank stays, the pilot returns to the roster (D11)', () => {
    const l0 = launch(fresh(), 0, mission())
    const pid = l0.roster.live[0]!
    const l1 = bank(l0, leg(l0, 1, { counts: counts({ fighter: 1 }) }))
    const resolved = resolveInterrupted(l1, NOW)
    expect(resolved.pending).toBeNull()
    expect(resolved.pilots[pid]).toMatchObject({ status: 'active', points: 500 })
    expect(resolved.roster.live).toEqual(l1.roster.live)
    expect(resolved.human.log.at(-1)!.legs).toEqual([{ place: 'Tacloban', points: 500 }])
  })

  it('a destroyed friendly after a bank discharges the pilot but the bank stays (D5)', () => {
    const l0 = launch(fresh(), 0, mission())
    const pid = l0.roster.live[0]!
    const l1 = bank(l0, leg(l0, 1, { counts: counts({ fighter: 1 }) }))
    const after = accept(bankSortie(l1, report(l1, { friendlyDestroyed: true, counts: counts({ fighter: 4 }) }), NOW))
    expect(after.pilots[pid]).toMatchObject({ status: 'discharged', points: 500 })
    expect(after.human.ledger.points).toBe(500)
  })

  it('one log entry per sortie, with its legs inside; the denominator counts sorties, not landings (D10)', () => {
    const l0 = launch(fresh(), 0, mission())
    const pid = l0.roster.live[0]!
    let c = bank(l0, leg(l0, 1, { counts: counts({ fighter: 1 }) }, 'Tacloban'))
    c = bank(c, leg(c, 2, { counts: counts({ fighter: 1, tank: 1 }) }, 'Essex'))
    const done = accept(bankSortie(c, report(c, { counts: counts({ fighter: 1, tank: 1 }), flight: { flightSeconds: 900, maxAltitudeM: 3000, maxTrueAirspeedMps: 150, landing: null } }), NOW))
    expect(done.human.log).toHaveLength(1)
    expect(done.pilots[pid]!.log).toHaveLength(1)
    const e = done.human.log[0]!
    expect(e.legs).toEqual([{ place: 'Tacloban', points: 500 }, { place: 'Essex', points: 300 }])
    expect(e.points).toBe(800)
    expect(e.destruction).toBe(800)
    expect(e.counts).toMatchObject({ fighter: 1, tank: 1 })
    expect(done.human.ledger.sorties).toBe(1)
    expect(done.pilots[pid]!.sorties).toBe(1)
    expect(done.pilots[pid]!.career.flightSeconds).toBe(900)
  })

  it('career: a landing counts when it is banked, flight seconds only once in total', () => {
    const l0 = launch(fresh(), 0, mission())
    const pid = l0.roster.live[0]!
    const f = (s: number, landing: 'field' | null) => ({ flightSeconds: s, maxAltitudeM: 100 * s, maxTrueAirspeedMps: 150, landing })
    const l1 = bank(l0, leg(l0, 1, { flight: f(600, 'field') }))
    expect(l1.pilots[pid]!.career).toMatchObject({ flightSeconds: 600, landings: { field: 1 } })
    const l2 = bank(l1, leg(l1, 2, { flight: f(1000, 'field') }))
    const done = accept(bankSortie(l2, report(l2, { flight: f(1000, null) }), NOW))
    expect(done.pilots[pid]!.career).toMatchObject({ flightSeconds: 1000, landings: { field: 2 }, maxAltitudeM: 100000 })
  })

  it('without any leg bankSortie is the whole sortie in one call, as before F5C (a ditching still banks)', () => {
    const c = launch(fresh(), 0, mission())
    const after = accept(bankSortie(c, report(c, { end: 'ditched', counts: counts({ destroyer: 1 }) }), NOW))
    expect(after.pilots[c.roster.live[0]!]!.points).toBe(1000)
    expect(after.human.log.at(-1)!.legs).toEqual([])
  })
})

// ---- the exhaustive model check -------------------------------------------------------------------------------------

describe('model check: end kind x landings banked x qualified x unbanked work', () => {
  const ENDS: SortieEndKind[] = ['landed', 'ditched', 'killed', 'rescued', 'captured', 'abandoned']
  const FORFEITS: SortieEndKind[] = ['abandoned'] // Mark 2026-10-16: a death or a capture still banks its delta
  const sumLog = (es: readonly { points: number }[]) => es.reduce((s, e) => s + e.points, 0)
  let states = 0

  for (const end of ENDS) for (const friendly of [false, true]) for (const legsBanked of [0, 1, 2]) for (const qualifyAt of [0, 1, 2]) for (const unbanked of [false, true]) {
    if (qualifyAt > legsBanked) continue
    const name = `${end}${friendly ? '+friendly' : ''} legs=${legsBanked} qualifyAt=${qualifyAt} unbanked=${unbanked}`
    it(name, () => {
      const m = mission({ id: 'a1', kind: 'campaign', chapterId: 'A1', authoredBonus: 100, badgeId: 'b' })
      let c = launch(fresh(), 0, m)
      const pid = c.roster.live[0]!
      const sortieId = c.pending!.sortieId
      let tanks = 0
      for (let n = 1; n <= legsBanked; n++) {
        tanks += 1
        c = bank(c, leg(c, n, { counts: counts({ tank: tanks }), success: qualifyAt === n || (qualifyAt > 0 && qualifyAt < n), authoredBonus: 100, badgeId: 'b' }))
      }
      const bankedPilot = c.pilots[pid]!.points
      const bankedHuman = c.human.ledger.points
      const qualifiedBefore = qualifyAt > 0
      const closeTanks = tanks + (unbanked ? 2 : 0)
      const success = end === 'landed' && !friendly && qualifiedBefore
      const r = report(c, { end, friendlyDestroyed: friendly, counts: counts({ tank: closeTanks }), success, authoredBonus: 100, badgeId: 'b' })
      const done = accept(bankSortie(c, r, NOW))
      states++

      const forfeits = friendly || FORFEITS.includes(end)
      const p = done.pilots[pid]!
      // Banked stays banked; the unbanked part is kept only by an end that survives and has no friendly kill.
      expect(p.points, 'pilot points').toBe(bankedPilot + (forfeits ? 0 : (closeTanks - tanks) * 300))
      expect(done.human.ledger.points, 'human points').toBe(bankedHuman + (forfeits ? 0 : (closeTanks - tanks) * 300))
      // Bookkeeping is closed and counted once.
      expect(done.pending).toBeNull()
      expect(done.human.ledger.sorties).toBe(1)
      expect(p.sorties).toBe(1)
      expect(p.banked).toBe(1)
      expect(done.human.ledger.banked).toBe(1)
      expect(done.human.log).toHaveLength(1)
      expect(done.human.log[0]!.sortieId).toBe(sortieId)
      expect(done.human.log[0]!.legs).toHaveLength(legsBanked)
      expect(done.human.log[0]!.points).toBe(sumLog([done.human.log[0]!]))
      // The entry reconciles with the ledger: the log is the whole record.
      expect(sumLog(done.human.log)).toBe(done.human.ledger.points)
      expect(sumLog(p.log)).toBe(p.points)
      // Chapter and badge: once, and only through a qualifying landing.
      expect(done.progress.completed).toEqual(qualifiedBefore || success ? ['A1'] : [])
      expect(p.badges).toEqual(qualifiedBefore || success ? ['b'] : [])
      if (qualifiedBefore) expect(done.progress.attempts.A1).toEqual({ launched: 1, failed: 0, abandoned: 0 })
      // The pilot is lost only by a loss end or a friendly kill, whatever was banked.
      const closed = end === 'killed' || end === 'captured' || friendly
      expect(done.roster.live).toHaveLength(5)
      expect(done.roster.live.includes(pid)).toBe(!closed)
      expect(validateCampaign(done).ok).toBe(true)
      // Determinism: the same inputs give the same bytes.
      expect(canonicalStringify(accept(bankSortie(c, r, NOW)))).toBe(canonicalStringify(done))
    })
  }

  it('covered every combination (a filter that matches nothing must fail)', () => {
    expect(states).toBe(6 * 2 * (1 + 2 + 3) * 2) // legs 0: qualifyAt 0; legs 1: 0..1; legs 2: 0..2
  })
})
