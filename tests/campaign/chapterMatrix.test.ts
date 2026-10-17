import { describe, expect, it } from 'vitest'
import {
  CHAPTER_IDS, CHAPTER_MISSIONS, PILOT_TIER_POINTS, bankSortie, chapterFaction, chapterMinTier, chaptersOf, describeChapter, isAuthored, launchSortie, missionLock,
  missionProblems, resolveInterrupted, type Campaign, type ChapterId, type ChapterMission, type MissionDescriptor,
} from '../../src/campaign/index.js'
import { applyChapterSuccess } from '../../src/campaign/worldStates.js'
import { loadScenario } from '../../tools/content/load.js'
import { NOW, accept, fresh, launch, report, withPoints } from './helpers.js'

/**
 * F10-0 T0.13, the generic nine-path matrix (Decision 8): success, normal failure, abandon, KIA, POW, bailout, discharge, restart and retry,
 * run for every chapter at the reducer level, once. A chapter is run twice when it exists: against a FIXTURE descriptor built from the F3
 * matrix (so the machinery is proved for all twelve now: the lock, the finale rule, the chapter's world transition) and against its REAL
 * descriptor, read from the chapter registry and its scenario file, as soon as a batch authors it. Headless play of the mission itself is
 * each chapter's own test; this proves what the campaign does with the result.
 */
const SPEC: Record<ChapterId, string[]> = {
  A1: ['f6f-hellcat'], A2: ['tbm-3-avenger'], A3: ['p-38-lightning'], A4: ['pby-5a-catalina'], A5: ['f6f-hellcat'], A6: ['p-38-lightning'],
  J1: ['a6m2-zero'], J2: ['b5n2-kate'], J3: ['ki-43-oscar'], J4: ['b5n2-kate'], J5: ['ki-57-ii-topsy'], J6: ['ki-43-oscar', 'a6m2-zero'],
}
const HOUR: Partial<Record<ChapterId, number>> = { A4: 21, J4: 21.5, J5: 18.5 }
const fixtureEntry = (c: ChapterId): ChapterMission => ({
  scenario: `fixture-${c}`, badge: { id: `fixture-${c}`, name: c }, start: 'airborne', aircraft: SPEC[c], recommendedLoadout: null,
  coordinated: c === 'A5', authoredBonus: c === 'A4' ? 2500 : 0,
})
const descriptorsOf = (c: ChapterId): readonly (readonly [string, MissionDescriptor])[] => {
  const out: [string, MissionDescriptor][] = [['fixture', describeChapter(c, fixtureEntry(c), { timeOfDay: HOUR[c] ?? 9 })!]]
  const real = CHAPTER_MISSIONS[c]
  if (isAuthored(real)) out.push(['real', describeChapter(c, real, { timeOfDay: loadScenario(real.scenario).weather?.timeOfDay ?? 12 })!])
  return out
}

/** A campaign standing at chapter `c`: every earlier chapter done, and a Captain in slot 0 who can fly anything. */
const standingAt = (c: ChapterId): Campaign => {
  const faction = chapterFaction(c)
  const base = withPoints(fresh(faction), 0, PILOT_TIER_POINTS[5])
  return { ...base, progress: { ...base.progress, completed: [...chaptersOf(faction).slice(0, chaptersOf(faction).indexOf(c))] } }
}

describe.each(CHAPTER_IDS)('the nine paths: chapter %s', (chapter) => {
  describe.each(descriptorsOf(chapter))('%s descriptor', (_kind, m) => {
    const index = chaptersOf(chapterFaction(chapter)).indexOf(chapter)
    const start = (): Campaign => standingAt(chapter)
    const flown = (c: Campaign) => launch(c, 0, m, 'easy', m.aircraftIds[0]!)
    const pilot0 = (c: Campaign) => c.roster.live[0]!

    it('is a well-formed descriptor, the chapter is open, and it is the pilot\'s to fly', () => {
      expect(missionProblems(m)).toEqual([])
      expect(m).toMatchObject({ kind: 'campaign', chapterId: chapter, minTier: chapterMinTier(chapter), scoreEligible: true })
      expect(missionLock(start(), m)).toEqual({ open: true })
      for (const a of m.aircraftIds) expect(() => launch(start(), 0, m, 'easy', a)).not.toThrow()
    })

    it('1 success: the chapter completes, its world transition is written, and a finale wins the campaign', () => {
      const l = flown(start())
      const done = accept(bankSortie(l, report(l, { success: true, badgeId: m.badgeId, authoredBonus: m.authoredBonus }), NOW))
      expect(done.progress.completed).toEqual(chaptersOf(done.faction).slice(0, index + 1))
      expect(done.world).toEqual(applyChapterSuccess(start().world, chapter))
      expect(done.progress.victory).toBe(chapter === 'A6' || chapter === 'J6')
      expect(done.pending).toBeNull()
      expect(done.pilots[pilot0(done)]!.status).toBe('active')
      // the authored award (A4: 2,500) is paid at this bank, once, and only on success
      const failed = accept(bankSortie(l, report(l, { success: false, authoredBonus: m.authoredBonus }), NOW))
      expect(done.human.ledger.points - failed.human.ledger.points).toBeGreaterThanOrEqual(m.authoredBonus)
    })

    it('2 normal failure: nothing completes and no transition is written', () => {
      const l = flown(start())
      const out = accept(bankSortie(l, report(l, { success: false }), NOW))
      expect(out.progress.completed).toEqual(start().progress.completed)
      expect(out.world).toEqual(start().world)
      expect(out.pilots[pilot0(out)]!.status).toBe('active')
    })

    it('3 abandon: the pilot lives, the chapter stays open, nothing banks', () => {
      const l = flown(start())
      const out = accept(bankSortie(l, report(l, { end: 'abandoned', success: false }), NOW))
      expect(out.progress.completed).toEqual(start().progress.completed)
      expect(out.pilots[pilot0(out)]!.status).toBe('active')
      expect(missionLock(out, m)).toEqual({ open: true })
    })

    it('4 KIA and 5 POW: the pilot leaves the roster for a replacement, and the chapter stays open', () => {
      for (const [end, status] of [['killed', 'kia'], ['captured', 'pow']] as const) {
        const l = flown(start())
        const out = accept(bankSortie(l, report(l, { end, success: false }), NOW))
        expect(out.pilots[pilot0(l)]!.status).toBe(status)
        expect(out.roster.live).toHaveLength(5)
        expect(out.roster.live).not.toContain(pilot0(l))
        expect(out.progress.completed).toEqual(start().progress.completed)
      }
    })

    it('6 bailout: rescued is never a success, and the pilot flies on', () => {
      const l = flown(start())
      const out = accept(bankSortie(l, report(l, { end: 'rescued', success: false }), NOW))
      expect(out.pilots[pilot0(out)]!.status).toBe('active')
      expect(out.progress.completed).toEqual(start().progress.completed)
      // NOT asserted here, on purpose: the reducer trusts `report.success` after a bailout (it rejects it only after a death, a capture or an
      // abandon). The lock is upstream: `missionOutcome` reads a bailout as 'Bailed out', no badge, and `bankScored` (campaignBank.ts) banks
      // `success: i.success && i.end === 'landed'`. Recorded as a Known gap in the F10-0 handoff.
    })

    it('7 discharge: a destroyed friendly ends the pilot\'s career and forfeits the chapter\'s completion', () => {
      const l = flown(start())
      const out = accept(bankSortie(l, report(l, { success: true, friendlyDestroyed: true, badgeId: m.badgeId }), NOW))
      expect(out.pilots[pilot0(l)]!.status).toBe('discharged')
      expect(out.progress.completed).toEqual(start().progress.completed)
    })

    it('8 restart: a sortie left pending resolves as abandoned when the campaign loads again', () => {
      const out = resolveInterrupted(flown(start()), NOW)
      expect(out.pending).toBeNull()
      expect(out.pilots[pilot0(out)]!.status).toBe('active')
      expect(out.progress.completed).toEqual(start().progress.completed)
    })

    it('9 retry: a failed chapter relaunches; a won one does not, and opens the next', () => {
      const l = flown(start())
      const failed = accept(bankSortie(l, report(l, { success: false }), NOW))
      expect(missionLock(failed, m)).toEqual({ open: true })
      expect(launchSortie(failed, { pilotId: pilot0(failed), mission: m, aircraft: { id: m.aircraftIds[0]!, advanced: false }, difficulty: 'easy', loadout: 'clean', now: NOW }).ok).toBe(true)
      const won = accept(bankSortie(l, report(l, { success: true, badgeId: m.badgeId, authoredBonus: m.authoredBonus }), NOW))
      expect(missionLock(won, m)).toMatchObject({ open: false, reason: 'completed' })
    })
  })
})

describe('the matrix can fail', () => {
  it('a descriptor with the wrong chapter or an aircraft the chapter does not offer is caught', () => {
    const m = descriptorsOf('A3')[0]![1]
    expect(missionLock(standingAt('A3'), { ...m, chapterId: 'A4' })).toMatchObject({ open: false, reason: 'previous-chapter' })
    expect(launchSortie(standingAt('A3'), { pilotId: standingAt('A3').roster.live[0]!, mission: m, aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'clean', now: NOW }).ok).toBe(false)
    expect(missionProblems({ ...m, chapterId: 'J3' })).toContain('campaign mission needs a chapter of its own faction')
  })
})
