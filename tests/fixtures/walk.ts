/** Seeded random play through the real reducers (mulberry32): property-test fuel, replayable by seed. */
import {
  SCORE_CLASSES, bankSortie, createCampaign, launchSortie, offers, zeroCounts,
  type Campaign, type Counts, type Difficulty, type Faction, type MissionDescriptor, type SortieEndKind, type SortieReport,
} from '../../src/campaign/index.js'
import { createRng } from '../../src/sim/rng.js'

export const WALK_NOW = '2026-10-14T12:00:00Z'
const ENDS: SortieEndKind[] = ['landed', 'landed', 'landed', 'ditched', 'killed', 'rescued', 'captured', 'abandoned']
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

export type Walk = { campaign: Campaign; steps: number }

export function randomCounts(rng: () => number): Counts {
  const counts = zeroCounts()
  for (const k of SCORE_CLASSES) if (rng() < 0.25) counts[k] = 1 + Math.floor(rng() * 3)
  return counts
}

/** One random launch + bank. Returns the same campaign if nothing could be launched (never in a healthy campaign). */
export function walkStep(c: Campaign, rng: () => number, catalog: readonly MissionDescriptor[]): Campaign {
  const open = offers(c, catalog).flatMap((o) => o.pilots.filter((p) => p.eligible).map((p) => ({ mission: o.mission, pilotId: p.pilotId })))
  if (open.length === 0) return c
  const pick = open[Math.floor(rng() * open.length)]!
  const aircraft = pick.mission.aircraftIds[Math.floor(rng() * pick.mission.aircraftIds.length)]!
  const launched = launchSortie(c, {
    pilotId: pick.pilotId, mission: pick.mission, aircraft: { id: aircraft, advanced: false },
    difficulty: DIFFICULTIES[Math.floor(rng() * 3)]!, loadout: 'clean', now: WALK_NOW,
  })
  if (!launched.ok) throw new Error(`walk: a pilot listed as eligible was refused: ${launched.error.code} ${launched.error.message}`)
  const end = ENDS[Math.floor(rng() * ENDS.length)]!
  const survives = end === 'landed' || end === 'ditched' || end === 'rescued'
  const report: SortieReport = {
    sortieId: launched.value.pending!.sortieId, end, success: survives && rng() < 0.6, counts: randomCounts(rng),
    friendlyDestroyed: rng() < 0.05, warnings: rng() < 0.1 ? 1 : 0, authoredBonus: pick.mission.authoredBonus,
    flight: { flightSeconds: Math.floor(rng() * 1800), maxAltitudeM: Math.floor(rng() * 9000), maxTrueAirspeedMps: Math.floor(rng() * 200), landing: survives ? 'field' : null },
    badgeId: pick.mission.badgeId,
  }
  const banked = bankSortie(launched.value, report, WALK_NOW)
  if (!banked.ok) throw new Error(`walk: bank refused: ${banked.error.code} ${banked.error.message}`)
  return banked.value
}

export function startWalk(faction: Faction, seed: number): Campaign {
  return createCampaign({ id: `w${seed}`, faction, playerName: `Walker ${seed}`, seed, now: WALK_NOW })
}

export const walkRng = (seed: number): (() => number) => createRng(seed * 7919 + 13)
