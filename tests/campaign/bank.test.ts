import { describe, expect, it } from 'vitest'
import {
  bankSortie, chaptersOf, launchSortie, missionLock, PILOT_TIER_POINTS, resolveInterrupted, rosterBonusOf, tierOf, validateCampaign, zeroCounts,
  type Campaign, type ChapterId,
} from '../../src/campaign/index.js'
import { canonicalStringify } from '../../src/flightRecorder/canonical.js'
import { CHAPTER_MISSIONS, describeChapter } from '../../src/campaign/chapterMissions.js'
import { NOW, accept, counts, fly, fresh, launch, mission, report, withPoints } from './helpers.js'

const snapshot = (c: Campaign): string => canonicalStringify(c)
const liveNames = (c: Campaign) => c.roster.live.map((id) => c.pilots[id]!.name)

describe('launch', () => {
  it('sets pending, ticks both denominators at launch, bumps revision by one', () => {
    const c = fresh()
    const l = launch(c, 0, mission())
    expect(l.revision).toBe(c.revision + 1)
    expect(l.pending).toMatchObject({ sortieId: 'c1:s1', pilotId: c.roster.live[0], missionId: 'm1', difficulty: 'easy', scoreEligible: true })
    expect(l.pending!.facts).toMatchObject({ aircraft: 'f6f-hellcat', loadout: 'clean' })
    expect(l.human.ledger.sorties).toBe(1)
    expect(l.pilots[c.roster.live[0]!]!.sorties).toBe(1)
    expect(c.pending).toBeNull() // input untouched
  })

  it('rejects with the SAME reference: a second launch, a foreign pilot, a closed pilot, wrong aircraft', () => {
    const c = fresh()
    const l = launch(c, 0, mission())
    const again = launchSortie(l, { pilotId: l.roster.live[1]!, mission: mission(), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(again.ok).toBe(false)
    if (!again.ok) { expect(again.error.code).toBe('sortie-pending'); expect(again.campaign).toBe(l) }
    const foreign = launchSortie(c, { pilotId: 'other:p1', mission: mission(), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(!foreign.ok && foreign.error.code).toBe('pilot-closed')
    const wrongPlane = launchSortie(c, { pilotId: c.roster.live[0]!, mission: mission(), aircraft: { id: 'p-38-lightning', advanced: true }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(!wrongPlane.ok && wrongPlane.error.code).toBe('aircraft-not-offered')
    const wrongSide = launchSortie(c, { pilotId: c.roster.live[0]!, mission: mission({ faction: 'ja' }), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(!wrongSide.ok && wrongSide.error.code).toBe('faction')
  })

  it('rejects a rank-ineligible pilot with the reason', () => {
    const r = launchSortie(fresh(), { pilotId: fresh().roster.live[0]!, mission: mission({ night: true }), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ code: 'ineligible', detail: 'night' })
  })
})

describe('bankSortie acceptance matrix (GAMEPLAY.md, MASTER_PLAN F5 gate)', () => {
  it('rejects without a pending sortie and on a mismatched id, returning the same reference', () => {
    const c = fresh()
    const none = bankSortie(c, { ...report(launch(c, 0, mission())), sortieId: 'c1:s1' }, NOW)
    expect(none.ok).toBe(false)
    const l = launch(c, 0, mission())
    const wrong = bankSortie(l, { ...report(l), sortieId: 'c1:s9' }, NOW)
    expect(!wrong.ok && wrong.error.code).toBe('sortie-mismatch')
    expect(!wrong.ok && wrong.campaign).toBe(l)
    const nothing = bankSortie(c, { ...report(l) }, NOW)
    expect(!nothing.ok && nothing.error.code).toBe('no-pending')
  })

  it('rejects an impossible report (success after death, a fractional count)', () => {
    const l = launch(fresh(), 0, mission())
    expect(bankSortie(l, report(l, { end: 'killed', success: true }), NOW).ok).toBe(false)
    expect(bankSortie(l, report(l, { counts: counts({ fighter: 1.5 }) }), NOW).ok).toBe(false)
  })

  it('loss: KIA keeps the points earned since the last landing (Mark 2026-10-16), closes the dossier and the pilot leaves the roster', () => {
    const c = fresh()
    const id = c.roster.live[2]!
    const after = fly(c, 2, mission(), { end: 'killed', counts: counts({ fighter: 2, building: 1 }) })
    const p = after.pilots[id]!
    expect(p.status).toBe('kia')
    expect(p.points).toBe(1150)
    expect(p.closure).toMatchObject({ reason: 'kia', sortieId: 'c1:s1' })
    expect(after.roster.live).not.toContain(id)
    expect(after.human.stats.losses.kia).toBe(1)
    expect(after.human.ledger.points).toBe(1150) // no roster bonus without success
  })

  it('POW: archived as pow, points kept (Mark 2026-10-16)', () => {
    const after = fly(fresh(), 0, mission(), { end: 'captured', counts: counts({ tank: 1 }) })
    const p = Object.values(after.pilots).find((x) => x.status === 'pow')!
    expect(p.points).toBe(300)
    expect(after.human.stats.losses.pow).toBe(1)
  })

  it('F10B: A4 Dumbo in the Gulf pays its one authored award, exactly 2,500, to the pilot and to the human ledger, at the qualifying bank only', () => {
    const a4 = describeChapter('A4', CHAPTER_MISSIONS.A4, { timeOfDay: 21 })!
    expect(a4.authoredBonus).toBe(2500)
    const base = withPoints(fresh(), 0, PILOT_TIER_POINTS[2]) // a Lieutenant (junior grade): tier 2 opens A4
    const standing = { ...base, progress: { ...base.progress, completed: chaptersOf('us').slice(0, 3) } }
    const id = standing.roster.live[0]!
    const win = fly(standing, 0, a4, { success: true, authoredBonus: a4.authoredBonus, badgeId: a4.badgeId }, 'easy')
    const loss = fly(standing, 0, a4, { success: false, authoredBonus: a4.authoredBonus }, 'easy')
    const entry = win.human.log.at(-1)!
    expect(entry.bonuses.completion).toBe(2500)
    expect(loss.human.log.at(-1)!.bonuses.completion).toBe(0)
    // both ledgers got it: the pilot's points and the human ledger each moved by the same 2,500 over the failed sortie, plus the roster bonus on the human side only
    const earned = (c: Campaign, pilot: string) => [c.pilots[pilot]!.points - standing.pilots[pilot]!.points, c.human.ledger.points - standing.human.ledger.points]
    const [pw, hw] = earned(win, id)
    const [pl, hl] = earned(loss, id)
    expect(pw! - pl!).toBe(2500)
    expect(hw! - hl!).toBe(2500 + entry.bonuses.roster)
    // and it is paid once: the chapter is then done and locked, so a second A4 sortie cannot launch to be paid again
    expect(missionLock(win, a4)).toMatchObject({ open: false })
  })

  it('discharge: friendly destroyed scores zero everywhere, no badge, no bonuses, pilot discharged', () => {
    const m = mission({ authoredBonus: 2500, badgeId: 'b' })
    const c = fresh()
    const after = fly(c, 0, m, { success: true, friendlyDestroyed: true, authoredBonus: 2500, badgeId: 'b', counts: counts({ carrier: 1 }) }, 'hard')
    const p = after.pilots[c.roster.live[0]!]!
    expect(p.status).toBe('discharged')
    expect(p.points).toBe(0)
    expect(p.badges).toEqual([])
    expect(after.human.ledger).toMatchObject({ points: 0, badges: [] })
    expect(after.human.log.at(-1)).toMatchObject({ points: 0, success: false, bonuses: { difficulty: 0, completion: 0, roster: 0 }, flags: ['forfeit-friendly-destroyed'] })
    expect(after.human.stats.losses.discharged).toBe(1)
  })

  it('replacement: every closure refills its slot with a new Ensign, nothing inherited, serial +1, a name drawn', () => {
    const c = withPoints(fresh(), 3, 9000)
    const before = c.nameDraws.next
    for (const end of ['killed', 'captured'] as const) {
      const id = c.roster.live[3]!
      const after = fly(c, 3, mission(), { end, counts: counts({ bomber: 1 }) })
      const newId = after.roster.live[3]!
      expect(newId).not.toBe(id)
      expect(newId).toBe(`c1:p${c.serials.pilot + 1}`)
      expect(after.roster.live).toHaveLength(5)
      const n = after.pilots[newId]!
      expect([n.points, n.sorties, n.banked, n.badges.length, n.log.length]).toEqual([0, 0, 0, 0, 0])
      expect(tierOf(n.points)).toBe(1)
      expect(n.status).toBe('active')
      expect(after.nameDraws.next).toBe(before + 1)
      expect(Object.values(after.pilots).filter((p) => p.status !== 'active')).toHaveLength(1)
      expect(after.roster.live.slice(0, 3)).toEqual(c.roster.live.slice(0, 3)) // stable slot order
    }
  })

  it('one pilot per sortie: a sortie closes at most one pilot (no double closure)', () => {
    const after = fly(fresh(), 0, mission(), { end: 'killed', friendlyDestroyed: true, warnings: 3 })
    expect(Object.values(after.pilots).filter((p) => p.status !== 'active')).toHaveLength(1)
    expect(after.roster.live).toHaveLength(5)
  })

  it('D6: killed in the same sortie as a friendly destruction is KIA (both facts logged, zero score)', () => {
    const c = fresh()
    const after = fly(c, 0, mission(), { end: 'killed', friendlyDestroyed: true, counts: counts({ fighter: 3 }) })
    const p = after.pilots[c.roster.live[0]!]!
    expect(p.status).toBe('kia')
    expect(p.points).toBe(0)
    expect(p.log.at(-1)!.flags).toEqual(['forfeit-friendly-destroyed'])
  })

  it('D6: abandon plus friendly destruction is a discharge, flagged both ways', () => {
    const c = fresh()
    const after = fly(c, 0, mission(), { end: 'abandoned', friendlyDestroyed: true })
    expect(after.pilots[c.roster.live[0]!]!.status).toBe('discharged')
    expect(after.pilots[c.roster.live[0]!]!.log.at(-1)!.flags).toEqual(['forfeit-abandoned', 'forfeit-friendly-destroyed'])
  })

  it('abandon: zero points, pilot survives, denominator +1 (and counts abandoned)', () => {
    const c = fresh()
    const l = launch(c, 1, mission())
    expect(l.human.ledger.sorties).toBe(1)
    const after = accept(bankSortie(l, report(l, { end: 'abandoned', counts: counts({ carrier: 1 }) }), NOW))
    expect(after.human.ledger.sorties).toBe(1)
    expect(after.human.ledger.points).toBe(0)
    expect(after.human.stats.abandoned).toBe(1)
    expect(after.pilots[c.roster.live[1]!]).toMatchObject({ status: 'active', points: 0, sorties: 1, banked: 1 })
    expect(after.roster.live).toEqual(c.roster.live)
  })

  it('interrupted load == abandon: resolveInterrupted banks exactly what an abandon report banks', () => {
    const l = launch(fresh(), 0, mission())
    const viaReport = accept(bankSortie(l, report(l, { end: 'abandoned', flight: { flightSeconds: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: null } }), NOW))
    expect(snapshot(resolveInterrupted(l, NOW))).toBe(snapshot(viaReport))
    expect(resolveInterrupted(viaReport, NOW)).toBe(viaReport) // nothing pending: no-op, same reference
  })

  it('rescue: alive, points kept, rescue counted, no badge without mission success', () => {
    const c = fresh()
    const after = fly(c, 0, mission({ badgeId: 'b' }), { end: 'rescued', success: false, counts: counts({ destroyer: 1 }), badgeId: 'b' })
    const p = after.pilots[c.roster.live[0]!]!
    expect(p).toMatchObject({ status: 'active', points: 1000, badges: [] })
    expect(p.career.rescues).toBe(1)
    expect(after.human.stats.rescues).toBe(1)
  })

  it('a landed but failed sortie banks destruction and nothing else (GAMEPLAY.md)', () => {
    const c = fresh()
    const after = fly(c, 0, mission({ authoredBonus: 2500, badgeId: 'b' }), { success: false, authoredBonus: 2500, badgeId: 'b', counts: counts({ fighter: 1 }) }, 'hard')
    expect(after.pilots[c.roster.live[0]!]).toMatchObject({ points: 500, badges: [] })
    expect(after.human.ledger).toMatchObject({ points: 500, badges: [] })
    expect(after.human.log.at(-1)!.bonuses).toEqual({ difficulty: 0, completion: 0, roster: 0 })
  })

  it('success banks difficulty, completion and badge to both ledgers, plus the roster bonus to the human only', () => {
    const c = fresh()
    const m = mission({ authoredBonus: 2500, badgeId: 'b' })
    const after = fly(c, 0, m, { success: true, authoredBonus: 2500, badgeId: 'b', counts: counts({ tank: 1 }) }, 'hard')
    const p = after.pilots[c.roster.live[0]!]!
    expect(p.points).toBe(300 + 1000 + 2500)
    expect(p.badges).toEqual(['b'])
    // pilot 0 now has 3,800 points = tier 2, the other four are tier 1: roster bonus 100
    expect(tierOf(p.points)).toBe(2)
    expect(after.human.ledger.points).toBe(3800 + 100)
    expect(after.human.log.at(-1)!.bonuses.roster).toBe(100)
    expect(p.log.at(-1)!.bonuses.roster).toBe(0)
  })

  it('D8: a pilot promoted by this sortie counts at the NEW tier for the roster bonus', () => {
    const c = fresh()
    const after = fly(c, 0, mission({ authoredBonus: 7500 }), { success: true, authoredBonus: 7500 })
    expect(tierOf(after.pilots[c.roster.live[0]!]!.points)).toBe(3)
    expect(after.human.ledger.points).toBe(7500 + rosterBonusOf([3, 1, 1, 1, 1]))
    expect(rosterBonusOf([3, 1, 1, 1, 1])).toBe(200)
  })

  it('a veteran lost earlier no longer counts toward a later roster bonus', () => {
    let c = withPoints(fresh(), 0, 40000)
    expect(rosterBonusOf(c.roster.live.map((id) => tierOf(c.pilots[id]!.points)))).toBe(500)
    c = fly(c, 0, mission(), { end: 'killed' })
    c = fly(c, 1, mission({ authoredBonus: 100 }), { success: true, authoredBonus: 100 })
    const last = c.human.log.at(-1)!
    expect(last.bonuses.roster).toBe(0)
  })

  it('progress: success on the current chapter completes it; success on any other mission or a non-current chapter does nothing', () => {
    let c = withPoints(withPoints(fresh(), 0, 40000), 1, 40000)
    const ch = (id: ChapterId, over = {}) => mission({ id: id.toLowerCase(), kind: 'campaign', chapterId: id, ...over })
    // non-campaign success: no progress
    c = fly(c, 0, mission(), { success: true })
    expect(c.progress.completed).toEqual([])
    // A2 is locked until A1 is done
    const locked = launchSortie(c, { pilotId: c.roster.live[0]!, mission: ch('A2'), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(!locked.ok && locked.error).toMatchObject({ code: 'locked', detail: 'previous-chapter' })
    // fail A1: still not complete; attempts counted
    c = fly(c, 0, ch('A1'), { success: false })
    expect(c.progress.completed).toEqual([])
    expect(c.progress.attempts.A1).toEqual({ launched: 1, failed: 1, abandoned: 0 })
    // tamper: success banked against a chapter that is not the current one changes nothing
    const l = launch(c, 0, ch('A1'))
    const tampered: Campaign = { ...l, pending: { ...l.pending!, chapterId: 'A3' } }
    const t = accept(bankSortie(tampered, report(tampered, { success: true }), NOW))
    expect(t.progress.completed).toEqual([])
    // win A1
    c = fly(c, 0, ch('A1'), { success: true })
    expect(c.progress.completed).toEqual(['A1'])
    // completed chapters are not replayable (D11)
    const replay = launchSortie(c, { pilotId: c.roster.live[0]!, mission: ch('A1'), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(!replay.ok && replay.error).toMatchObject({ code: 'locked', detail: 'completed' })
  })

  it.each([['us', 'A6'], ['ja', 'J6']] as const)('victory is set by %s final chapter %s only', (faction, last) => {
    let c = fresh(faction)
    for (let s = 0; s < 5; s++) c = withPoints(c, s, 40000)
    const chapters = chaptersOf(faction)
    for (const id of chapters) {
      expect(c.progress.victory).toBe(false)
      c = fly(c, 0, mission({ id: id.toLowerCase(), faction, kind: 'campaign', chapterId: id, minTier: 1 }), { success: true })
    }
    expect(c.progress.completed).toEqual([...chapters])
    expect(c.progress.completed.at(-1)).toBe(last)
    expect(c.progress.victory).toBe(true)
  })

  it('log and ledger reconcile: ledger.points equals the sum of log points while the log is uncapped', () => {
    let c = fresh()
    for (let i = 0; i < 12; i++) {
      c = fly(c, i % 5, mission({ authoredBonus: 500 }), { success: i % 3 !== 0, authoredBonus: 500, counts: counts({ fighter: i % 4 }), end: i % 7 === 6 ? 'killed' : 'landed' })
    }
    expect(c.human.log.reduce((s, e) => s + e.points, 0)).toBe(c.human.ledger.points)
    const pilots = Object.values(c.pilots)
    expect(pilots.reduce((s, p) => s + p.log.reduce((t, e) => t + e.points, 0), 0)).toBe(pilots.reduce((s, p) => s + p.points, 0))
    // humans never score less than the sum of their pilots (the roster bonus is human-only)
    expect(c.human.ledger.points).toBeGreaterThanOrEqual(pilots.reduce((s, p) => s + p.points, 0))
  })

  it('caps: a live pilot keeps 200 entries, a closed dossier 50, the human 500', () => {
    let c = fresh()
    for (let i = 0; i < 210; i++) c = fly(c, 0, mission(), {})
    expect(c.pilots[c.roster.live[0]!]!.log).toHaveLength(200)
    expect(c.human.log).toHaveLength(210)
    const id = c.roster.live[0]!
    c = fly(c, 0, mission(), { end: 'killed' })
    expect(c.pilots[id]!.log).toHaveLength(50)
  })

  it('is immutable and bumps revision by exactly one per call; the input is never touched', () => {
    const c = fresh()
    const s0 = snapshot(c)
    const l = launch(c, 0, mission())
    expect(snapshot(c)).toBe(s0)
    const s1 = snapshot(l)
    const b = accept(bankSortie(l, report(l, { end: 'killed', counts: counts({ fighter: 1 }) }), NOW))
    expect(snapshot(l)).toBe(s1)
    expect([c.revision, l.revision, b.revision]).toEqual([0, 1, 2])
  })
})

describe('cross-faction isolation', () => {
  it('any reducer sequence on one campaign leaves the other byte-identical', () => {
    const us = fresh('us', 'us1', 5)
    const ja = fresh('ja', 'ja1', 5)
    const before = [snapshot(us), snapshot(ja)]
    let a = us
    a = fly(a, 0, mission({ authoredBonus: 9000 }), { success: true, authoredBonus: 9000, counts: counts({ carrier: 2 }) }, 'hard')
    a = fly(a, 1, mission(), { end: 'killed' })
    a = fly(a, 2, mission(), { end: 'abandoned' })
    expect(snapshot(a)).not.toBe(before[0])
    expect(snapshot(us)).toBe(before[0])
    expect(snapshot(ja)).toBe(before[1])
  })

  it('a ja pilot id can never be assigned to a us campaign (launch rejects it, and the validator names the foreign pilot)', () => {
    const us = fresh('us', 'us1')
    const ja = fresh('ja', 'ja1')
    const foreignId = ja.roster.live[0]!
    const r = launchSortie(us, { pilotId: foreignId, mission: mission(), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(r.ok).toBe(false)
    const mixed = JSON.parse(JSON.stringify(us)) as Campaign
    mixed.pilots[foreignId] = ja.pilots[foreignId]!
    mixed.roster.live[0] = foreignId
    const v = validateCampaign(mixed)
    expect(!v.ok && v.issues.map((i) => i.name)).toContain('pilot-owned')
  })

  it('a Japanese campaign refuses an American mission and chapter', () => {
    const r = launchSortie(fresh('ja', 'ja1'), { pilotId: 'ja1:p1', mission: mission({ faction: 'us' }), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW })
    expect(!r.ok && r.error.code).toBe('faction')
  })
})

describe('name draws inside the transaction', () => {
  it('replacement names are drawn from the seeded cursor, never repeating a live or archived name', () => {
    let c = fresh('ja', 'j', 3)
    const seen = new Set(Object.values(c.pilots).map((p) => `${p.name.given}|${p.name.family}`))
    for (let i = 0; i < 40; i++) {
      c = fly(c, i % 5, mission({ faction: 'ja', aircraftIds: ['a6m2-zero'] }), { end: i % 2 ? 'killed' : 'captured' })
    }
    const names = Object.values(c.pilots).map((p) => `${p.name.given}|${p.name.family}`)
    expect(names).toHaveLength(45)
    expect(new Set(names).size).toBe(45)
    expect(seen.size).toBe(5)
    expect(liveNames(c)).toHaveLength(5)
    expect(zeroCounts()).toBeDefined()
  })
})
