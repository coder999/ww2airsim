/**
 * F8C C8 (2026-10-17): the `Campaign.world` round trip. Mark's ruling (2026-10-16): A LAUNCH READS THE STORED `Campaign.world`, not the
 * chapter's own window; the chapter's table window is only the fallback for a key that is absent (a new campaign). `applyChapterSuccess`
 * is written by `credit()` at the first qualifying bank and at no other time: a loss, a retry, an abandon, a failed sortie and a
 * non-campaign sortie leave `world` exactly as it was. Save, load, export and import carry it, and a sortie left pending at load
 * (resolved as an abandon) does not touch it.
 */
import { describe, expect, it } from 'vitest'
import {
  bankLeg, bankSortie, exportCampaign, importCampaign, launchSortie, launchWindows, loadCampaign, saveCampaign, resolveInterrupted, chaptersOf,
  type Campaign, type ChapterId, type LegReport, type StoragePort,
} from '../../src/campaign/index.js'
import { NOW, accept, fly, fresh, launch, mission, report, withPoints } from './helpers.js'

class MapPort implements StoragePort {
  readonly map = new Map<string, string>()
  getItem(k: string): string | null { return this.map.get(k) ?? null }
  setItem(k: string, v: string): void { this.map.set(k, v) }
  removeItem(k: string): void { this.map.delete(k) }
}
const ch = (id: ChapterId, faction: 'us' | 'ja' = 'us') => mission({ id: id.toLowerCase(), faction, kind: 'campaign', chapterId: id, minTier: 1, aircraftIds: [faction === 'us' ? 'f6f-hellcat' : 'a6m2-zero'] })
const A1_WORLD = { tacloban: 'assault', dulag: 'assault', 'landing-beaches': 'buildup' }

describe('launchWindows: a launch reads the stored world', () => {
  it('a stored key beats the chapter\'s own window; an absent key falls back to it', () => {
    // A4 is played in buildup, so a new campaign draws buildup; a campaign that has taken the fields draws what it holds.
    expect(launchWindows({}, 'A4')).toMatchObject({ tacloban: 'buildup', dulag: 'buildup', 'landing-beaches': 'buildup', ormoc: 'buildup', jinamoc: 'buildup' })
    const stored = launchWindows({ tacloban: 'assault', ormoc: 'endgame' }, 'A4')
    expect(stored.tacloban).toBe('assault')
    expect(stored.ormoc).toBe('endgame')
    expect(stored.dulag).toBe('buildup') // absent: the chapter's window
    expect(Object.keys(launchWindows({}, 'A4'))).toHaveLength(9)
  })
  it('a stored value that is not the chapter\'s window really wins, in every chapter', () => {
    for (const c of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6']) {
      const got = launchWindows({ buri: 'j6-alternate', ormoc: 'pre-invasion' }, c)
      expect([got.buri, got.ormoc], c).toEqual(['j6-alternate', 'pre-invasion'])
    }
  })
  it('keeps stored keys the table does not own, never mutates its input, and gives no windows to a flight with no chapter', () => {
    const w = Object.freeze({ 'made-up-site': 'assault' })
    expect(launchWindows(w, 'A1')['made-up-site']).toBe('assault')
    expect(launchWindows({ tacloban: 'endgame' }, null)).toEqual({})
    expect(() => launchWindows({}, 'Z9')).toThrow(/Z9/)
  })
})

describe('the world moves with the chapter and only then', () => {
  it('the first qualifying bank of A1 writes the A1 world; the revision still moves once', () => {
    const c0 = fresh()
    const c1 = fly(c0, 0, ch('A1'), { success: true })
    expect(c1.world).toEqual(A1_WORLD)
    expect(c1.progress.completed).toEqual(['A1'])
    expect(c1.revision).toBe(c0.revision + 2) // launch and bank, as before F8C
  })

  it('a failed sortie, a loss, an abandon, a ditching and a non-campaign success leave world untouched (same object)', () => {
    const c0 = fresh()
    for (const over of [{ success: false }, { success: false, end: 'killed' as const }, { success: false, end: 'abandoned' as const }, { success: false, end: 'ditched' as const }]) {
      const c = fly(c0, 0, ch('A1'), over)
      expect(c.world, JSON.stringify(over)).toBe(c0.world)
    }
    // a non-campaign mission that succeeds is not a chapter
    expect(fly(c0, 0, mission(), { success: true }).world).toBe(c0.world)
    // a success forced to false by a destroyed friendly (the forfeit) is no chapter either
    expect(fly(c0, 0, ch('A1'), { success: true, friendlyDestroyed: true }).world).toBe(c0.world)
  })

  it('retry: fail A1, then win it; the world moves only on the win, and a later retry of nothing changes nothing', () => {
    let c = fresh()
    c = fly(c, 0, ch('A1'), { success: false })
    expect(c.world).toEqual({})
    c = fly(c, 0, ch('A1'), { success: true })
    expect(c.world).toEqual(A1_WORLD)
    const again = fly(c, 1, mission(), { success: true }) // anything else afterwards
    expect(again.world).toBe(c.world)
  })

  it('F10A (Decision 10): A1 then A2 moves Tacloban and Dulag from assault to buildup, and a failed A2 leaves them in assault', () => {
    const afterA1 = fly(fresh(), 0, ch('A1'), { success: true })
    expect(afterA1.world).toEqual(A1_WORLD)
    const failed = fly(withPoints(afterA1, 0, 40000), 0, ch('A2'), { success: false })
    expect(failed.world).toEqual(A1_WORLD)
    const afterA2 = fly(withPoints(afterA1, 0, 40000), 0, ch('A2'), { success: true })
    expect(afterA2.world).toEqual({ tacloban: 'buildup', dulag: 'buildup', 'landing-beaches': 'buildup' })
    // the next launch draws what is stored: A3 flies a serviceable Tacloban
    expect(launchWindows(afterA2.world, 'A3')).toMatchObject({ tacloban: 'buildup', dulag: 'buildup' })
    expect(launchWindows(afterA1.world, 'A3')).toMatchObject({ tacloban: 'assault' }) // without A2 the field would still be down
  })

  it('abandon after a failed attempt, and an interrupted sortie resolved at load, leave world as it was', () => {
    const c = fly(fresh(), 0, ch('A1'), { success: true }) // world = A1 world
    const pending = launch(withPoints(c, 0, 40000), 0, ch('A2'))
    const resolved = resolveInterrupted(pending, NOW)
    expect(resolved.pending).toBeNull()
    expect(resolved.world).toEqual(A1_WORLD)
    const abandoned = accept(bankSortie(pending, report(pending, { end: 'abandoned' }), NOW))
    expect(abandoned.world).toEqual(A1_WORLD)
  })

  it('a landing that qualifies writes the world at the leg; later legs, the close and a death after it do not write it again', () => {
    const l0 = launch(fresh(), 0, ch('A1'))
    const leg1: LegReport = { ...report(l0, { success: true }), leg: 1, place: 'Tacloban' }
    const l1 = accept(bankLeg(l0, leg1, NOW))
    expect(l1.world).toEqual(A1_WORLD)
    expect(l1.progress.completed).toEqual(['A1'])
    const l2 = accept(bankLeg(l1, { ...report(l1, { success: true }), leg: 2, place: 'Dulag' }, NOW))
    expect(l2.world).toBe(l1.world)
    const closed = accept(bankSortie(l2, report(l2, { success: false, end: 'killed' }), NOW))
    expect(closed.world).toBe(l1.world)
  })

  it('a leg that does not qualify writes nothing', () => {
    const l0 = launch(fresh(), 0, ch('A1'))
    const l1 = accept(bankLeg(l0, { ...report(l0, { success: false }), leg: 1, place: 'Tacloban' }, NOW))
    expect(l1.world).toBe(l0.world)
  })

  it('the full chains: A6 leaves every site in the endgame, J6 in the alternate (all nine sites)', () => {
    const win = (faction: 'us' | 'ja'): Campaign => {
      let c = fresh(faction)
      for (let s = 0; s < 5; s++) c = withPoints(c, s, 40000)
      for (const id of chaptersOf(faction)) c = fly(c, 0, ch(id, faction), { success: true })
      return c
    }
    const us = win('us'), ja = win('ja')
    expect(Object.keys(us.world).sort()).toEqual(['bayug', 'buri', 'dulag', 'jinamoc', 'landing-beaches', 'ormoc', 'san-pablo', 'tacloban', 'tanauan'])
    expect(new Set(Object.values(us.world))).toEqual(new Set(['endgame']))
    expect(new Set(Object.values(ja.world))).toEqual(new Set(['j6-alternate']))
  })

  it('a chapter banked out of order (a tampered pending) does not move the world', () => {
    const l = launch(fresh(), 0, ch('A1'))
    const tampered: Campaign = { ...l, pending: { ...l.pending!, chapterId: 'A3' } }
    expect(accept(bankSortie(tampered, report(tampered, { success: true }), NOW)).world).toBe(l.world)
  })
})

describe('save, load, export and import carry the world', () => {
  const advanced = (): Campaign => fly(fresh(), 0, ch('A1'), { success: true })

  it('save then load returns it equal; export then import then export is byte for byte', () => {
    const c = advanced()
    const port = new MapPort()
    expect(saveCampaign(port, c)).toEqual({ ok: true })
    expect(loadCampaign(port, c.id, NOW)).toEqual({ ok: true, campaign: c })
    const text = exportCampaign(c)
    const back = importCampaign(text)
    expect(back.ok).toBe(true)
    if (back.ok) {
      expect(back.campaign.world).toEqual(A1_WORLD)
      expect(exportCampaign(back.campaign)).toBe(text)
    }
  })

  it('a campaign saved mid-sortie and loaded again keeps the world and drops only the sortie', () => {
    const pending = launch(withPoints(advanced(), 0, 40000), 0, ch('A2'))
    const port = new MapPort()
    saveCampaign(port, pending)
    const loaded = loadCampaign(port, pending.id, NOW)
    expect(loaded.ok && loaded.campaign.pending).toBeNull()
    expect(loaded.ok && loaded.campaign.world).toEqual(A1_WORLD)
  })

  it('a world that names a window that is not one is carried (F5A keeps it opaque) but refused when a launch draws it', () => {
    const c = { ...advanced(), world: { tacloban: 'mid-war' } }
    expect(exportCampaign(c)).toContain('mid-war')
    expect(launchWindows(c.world, 'A2').tacloban).toBe('mid-war') // the sim refuses it by name when the site is drawn (windowOf)
  })

  it('launchSortie never reads or writes the world', () => {
    const c = advanced()
    const l = accept(launchSortie(withPoints(c, 0, 40000), { pilotId: c.roster.live[0]!, mission: ch('A2'), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'x', now: NOW }))
    expect(l.world).toEqual(A1_WORLD)
  })
})
