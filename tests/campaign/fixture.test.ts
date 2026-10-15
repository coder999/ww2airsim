/**
 * Task 13: the fixture builder and the F5B seam. `makeCampaign` goes through the real reducers, so its output
 * validates and re-banks. The last test is the consumer example F5B copies: read a campaign with the pure
 * queries, launch through the reducer, bank the report, save, and load it back.
 */
import { describe, expect, it } from 'vitest'
import {
  adjustedScore, bankSortie, commandTitleOf, launchSortie, lifeline, loadCampaign, offers, rankLabel, saveCampaign, tierOf, validateCampaign,
  zeroCounts, type StoragePort,
} from '../../src/campaign/index.js'
import { makeCampaign, flyThrough } from '../fixtures/campaign.js'
import { shippedCatalog } from '../fixtures/catalog.js'
import { NOW } from './helpers.js'

describe('makeCampaign', () => {
  it('builds exactly the roster tiers, chapter progress and faction asked for, and validates', () => {
    const c = makeCampaign({ faction: 'ja', tiers: [1, 2, 3, 5, 6], chapter: 3 })
    expect(validateCampaign(c).ok).toBe(true)
    expect(c.roster.live.map((id) => tierOf(c.pilots[id]!.points))).toEqual([1, 2, 3, 5, 6])
    expect(c.progress.completed).toEqual(['J1', 'J2', 'J3'])
    expect(c.faction).toBe('ja')
    // the chapter-clearing veteran is a closed dossier, not a live pilot
    expect(Object.values(c.pilots).filter((p) => p.status === 'kia')).toHaveLength(1)
  })
  it('a victory with an all-Ensign roster is buildable (a veteran roster that died)', () => {
    const c = makeCampaign({ faction: 'us', chapter: 6 })
    expect(c.progress.victory).toBe(true)
    expect(c.roster.live.every((id) => tierOf(c.pilots[id]!.points) === 1)).toBe(true)
  })
  it('is deterministic for equal arguments and independent of other fixtures', () => {
    expect(makeCampaign({ faction: 'us', tiers: [2, 2, 2, 2, 2], chapter: 1 })).toEqual(makeCampaign({ faction: 'us', tiers: [2, 2, 2, 2, 2], chapter: 1 }))
  })
  it('its output re-banks: a further launch and bank from the fixture is accepted', () => {
    const c = makeCampaign({ faction: 'us', tiers: [3, 1, 1, 1, 1], chapter: 2 })
    const m = shippedCatalog().find((x) => x.id === 'airfield-strike')!
    const after = flyThrough(c, 0, m, { success: true })
    expect(after.revision).toBe(c.revision + 2)
    expect(validateCampaign(after).ok).toBe(true)
  })
  it('a different faction never shares an id, so two fixtures never collide in storage', () => {
    expect(makeCampaign({ faction: 'us' }).id).not.toBe(makeCampaign({ faction: 'ja' }).id)
  })
})

describe('consumer example (F5B copies this)', () => {
  it('headquarters: show the roster, pick the lifeline, fly it, bank it, autosave, reload', () => {
    const store = new Map<string, string>()
    const port: StoragePort = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) }
    const catalog = shippedCatalog()
    let c = makeCampaign({ faction: 'us', tiers: [1, 1, 2, 3, 4], chapter: 1, points: 12_000 })

    // 1. Read: only pure queries, never your own rank or score arithmetic.
    const roster = c.roster.live.map((id) => ({ id, name: c.pilots[id]!.name, rank: rankLabel(c.faction, tierOf(c.pilots[id]!.points)).name }))
    expect(roster.map((r) => r.rank)).toEqual(['Ensign', 'Ensign', 'Lieutenant (junior grade)', 'Lieutenant', 'Lieutenant Commander'])
    expect(commandTitleOf(c.human.ledger.points)).toBeGreaterThanOrEqual(0)
    expect(adjustedScore(c.human)).toBeGreaterThan(0)

    // 2. Mission-first: every open mission with every pilot and why one cannot fly it.
    const menu = offers(c, catalog)
    expect(menu.length).toBeGreaterThan(0)
    expect(menu.every((o) => o.pilots.length === 5)).toBe(true)

    // 3. Launch through the reducer (a rejection comes back as a value, with the same campaign).
    const pick = lifeline(c, catalog)!
    const launched = launchSortie(c, { pilotId: pick.pilotId, mission: pick.mission, aircraft: { id: pick.aircraftId, advanced: false }, difficulty: 'normal', loadout: 'clean', now: NOW })
    if (!launched.ok) throw new Error(launched.error.message)
    c = launched.value
    expect(saveCampaign(port, c)).toEqual({ ok: true }) // autosave after launch: an interrupted sortie reloads as an abandonment

    // 4. The sim's verdict becomes a SortieReport; bank it exactly once.
    const banked = bankSortie(c, {
      sortieId: c.pending!.sortieId, end: 'landed', success: true, counts: { ...zeroCounts(), fighter: 2 }, friendlyDestroyed: false, warnings: 0,
      authoredBonus: pick.mission.authoredBonus, flight: { flightSeconds: 840, maxAltitudeM: 4200, maxTrueAirspeedMps: 160, landing: 'field' }, badgeId: pick.mission.badgeId,
    }, NOW)
    if (!banked.ok) throw new Error(banked.error.message)
    c = banked.value
    expect(c.pending).toBeNull()
    expect(saveCampaign(port, c)).toEqual({ ok: true })

    // 5. Reload: what you saved is what you get back.
    expect(loadCampaign(port, c.id, NOW)).toEqual({ ok: true, campaign: c })
  })
})
