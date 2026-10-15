import { expect } from 'vitest'
import {
  bankSortie, createCampaign, launchSortie, validateCampaign, zeroCounts,
  type Campaign, type Counts, type Difficulty, type Faction, type MissionDescriptor, type SortieReport,
} from '../../src/campaign/index.js'

export const NOW = '2026-10-14T12:00:00Z'

export const mission = (over: Partial<MissionDescriptor> = {}): MissionDescriptor => ({
  id: 'm1', faction: 'us', kind: 'noncampaign', chapterId: null, minTier: 1, night: false, coordinated: false,
  aircraftIds: ['f6f-hellcat'], scoreEligible: true, authoredBonus: 0, badgeId: null, ...over,
})

export const fresh = (faction: Faction = 'us', id = 'c1', seed = 11): Campaign =>
  createCampaign({ id, faction, playerName: 'Test Player', seed, now: NOW })

export const report = (c: Campaign, over: Partial<SortieReport> = {}): SortieReport => ({
  sortieId: c.pending!.sortieId, end: 'landed', success: false, counts: zeroCounts(), friendlyDestroyed: false, warnings: 0,
  authoredBonus: 0, flight: { flightSeconds: 600, maxAltitudeM: 3000, maxTrueAirspeedMps: 150, landing: 'field' }, badgeId: null, ...over,
})

export const counts = (over: Partial<Counts>): Counts => ({ ...zeroCounts(), ...over })

/** Unwrap an accepted reducer result and prove the new campaign still validates. */
export function accept(r: { ok: true; value: Campaign } | { ok: false; error: { code: string; message: string } }): Campaign {
  if (!r.ok) throw new Error(`reducer rejected: ${r.error.code}: ${r.error.message}`)
  const v = validateCampaign(r.value)
  expect(v.ok ? [] : v.issues).toEqual([])
  return r.value
}

export function launch(c: Campaign, slot: number, m: MissionDescriptor, difficulty: Difficulty = 'easy', aircraft = m.aircraftIds[0]!): Campaign {
  return accept(launchSortie(c, { pilotId: c.roster.live[slot]!, mission: m, aircraft: { id: aircraft, advanced: false }, difficulty, loadout: 'clean', now: NOW }))
}

/** launch + bank. */
export function fly(c: Campaign, slot: number, m: MissionDescriptor, over: Partial<SortieReport> = {}, difficulty: Difficulty = 'easy'): Campaign {
  const launched = launch(c, slot, m, difficulty)
  return accept(bankSortie(launched, report(launched, over), NOW))
}

/** Raise a live pilot to exactly `points` through the real reducers (one grind sortie). */
export function withPoints(c: Campaign, slot: number, points: number): Campaign {
  if (points === 0) return c
  return fly(c, slot, mission({ id: 'grind', faction: c.faction, aircraftIds: [c.faction === 'us' ? 'f6f-hellcat' : 'a6m2-zero'], authoredBonus: points }), { success: true, authoredBonus: points })
}
