import { describe, expect, it } from 'vitest'
import chapters from '../../content/campaign/chapters.json'
import siteWindows from '../../content/campaign/site-windows.json'
import { CHAPTER_IDS } from '../../src/campaign/schema.js'
import { applyChapterSuccess, F8A_SITES, WINDOW_IDS, windowsForChapter } from '../../src/campaign/worldStates.js'
import { createCampaign } from '../../src/campaign/roster.js'

/**
 * F8A Task 2. The expected windows below are transcribed by hand from F3 (docs/superpowers/specs/2026-10-14-leyte-campaign-
 * definition.md) section 3 (chapter date and light) against section 5 (the window columns), NOT read from the module under
 * test. The one reading call: A1 launches at 0800, before H-hour, so Tacloban and Dulag are still Japanese in it, and its
 * section 4 "State transition" line is what moves them to captured.
 */
const EXPECT: Readonly<Record<string, string>> = {
  A1: 'pre-invasion', // 20 Oct 0800; the field transition is A1's own success
  A2: 'buildup', // 25 Oct
  A3: 'buildup', // 3 Nov
  A4: 'buildup', // 5 Nov
  A5: 'buildup', // 11 Nov
  A6: 'endgame', // 6-7 Dec
  J1: 'pre-invasion', // 18 Oct
  J2: 'assault', // 20 Oct 1515, after the landing
  J3: 'buildup', // 3 Nov
  J4: 'buildup', // 3 Dec: after the Nov window, before the 6-7 Dec column; Tanauan work has begun
  J5: 'endgame', // 6 Dec
  J6: 'j6-alternate',
}

describe('chapter-to-windows table (F8A Task 2)', () => {
  it('knows every chapter the campaign has, exactly', () => {
    expect([...CHAPTER_IDS].sort()).toEqual(Object.keys(EXPECT).sort())
    expect(chapters.chapters.map((c) => c.id).sort()).toEqual(Object.keys(EXPECT).sort())
    expect(Object.keys(EXPECT)).toHaveLength(12)
  })

  it('window ids are the one shared list', () => {
    expect(WINDOW_IDS).toEqual(siteWindows.windows.map((w) => w.id))
  })

  it.each(Object.entries(EXPECT))('%s plays every F8A site in %s', (chapter, window) => {
    const got = windowsForChapter(chapter)
    expect(Object.keys(got).sort()).toEqual([...F8A_SITES].sort())
    expect(Object.values(got)).toEqual(F8A_SITES.map(() => window))
  })

  it('an unknown chapter throws, in both calls', () => {
    expect(() => windowsForChapter('A7')).toThrow(/A7/)
    expect(() => applyChapterSuccess({}, 'Z9')).toThrow(/Z9/)
  })

  it('after A1 succeeds, Tacloban and Dulag are in assault and Tanauan has no field yet', () => {
    const after = applyChapterSuccess({}, 'A1')
    expect(after).toEqual({ tacloban: 'assault', dulag: 'assault' })
  })

  it('A6 victory keeps the field running into the endgame; J5 changes no field; J6 turns every F8A site to the alternate', () => {
    expect(applyChapterSuccess({ tacloban: 'assault' }, 'A6')).toEqual({ tacloban: 'endgame', dulag: 'endgame', tanauan: 'endgame' })
    expect(applyChapterSuccess({ tacloban: 'endgame' }, 'J5')).toEqual({ tacloban: 'endgame' })
    expect(applyChapterSuccess({}, 'J6')).toEqual({ tacloban: 'j6-alternate', dulag: 'j6-alternate', tanauan: 'j6-alternate' })
  })

  it('keeps keys it does not own (F8B and F8C sites) and never mutates its input', () => {
    const before = { buri: 'assault', tacloban: 'pre-invasion' }
    const frozen = Object.freeze({ ...before })
    const after = applyChapterSuccess(frozen, 'A1')
    expect(after.buri).toBe('assault')
    expect(frozen).toEqual(before)
  })

  it('what it returns is a valid Campaign.world', () => {
    const c = createCampaign({ id: 'c1', faction: 'us', playerName: 'Mark', seed: 1, now: '2026-10-16T00:00:00Z' })
    const world = applyChapterSuccess(c.world, 'A1')
    expect(Object.values(world).every((w) => WINDOW_IDS.includes(w))).toBe(true)
  })
})
