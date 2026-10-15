import { tierOf } from './ranks.js'
import { chaptersOf, type Campaign, type ChapterId, type Faction, type Pilot, type Tier } from './schema.js'

/** Supplied by content (F10 authors; the shipped seed is built by `catalog.ts`). */
export type MissionDescriptor = {
  id: string; faction: Faction; kind: 'campaign' | 'noncampaign'
  chapterId: ChapterId | null; minTier: Tier; night: boolean; coordinated: boolean
  aircraftIds: readonly string[]; scoreEligible: true // anything not score-eligible is not in the catalog (D2)
  authoredBonus: number; badgeId: string | null
}
export type AircraftDescriptor = { id: string; advanced: boolean }

/** "Advanced" is an authored category, not "multi-engine" (GAMEPLAY.md): P-38, B-17, B-29 / G4M, Ki-21, Ki-57. */
export const ADVANCED_AIRCRAFT: readonly string[] = [
  'p-38-lightning', 'b-17-flying-fortress', 'b-29-superfortress', 'g4m-betty', 'ki-21-sally', 'ki-57-ii-topsy',
]
export const describeAircraft = (id: string): AircraftDescriptor => ({ id, advanced: ADVANCED_AIRCRAFT.includes(id) })

export type IneligibleReason = 'rank' | 'night' | 'advanced' | 'coordinated' | 'finale' | 'pilot-closed' | 'faction'
export type Eligibility = { ok: true } | { ok: false; reason: IneligibleReason; needTier: Tier }

/**
 * Can this pilot fly this mission in this aircraft? `faction` is the campaign's: a pilot record
 * does not carry one. The reported reason is the requirement that sets the highest tier needed.
 */
export function eligibility(pilot: Pilot, mission: MissionDescriptor, aircraft: AircraftDescriptor, faction: Faction): Eligibility {
  if (pilot.status !== 'active') return { ok: false, reason: 'pilot-closed', needTier: mission.minTier }
  if (mission.faction !== faction) return { ok: false, reason: 'faction', needTier: mission.minTier }
  const finale = mission.chapterId === 'A6' || mission.chapterId === 'J6'
  const needs: [IneligibleReason, Tier][] = [
    ['finale', finale ? 6 : 1], ['coordinated', mission.coordinated ? 5 : 1], ['advanced', aircraft.advanced ? 3 : 1],
    ['night', mission.night ? 2 : 1], ['rank', mission.minTier],
  ]
  const need = Math.max(...needs.map(([, t]) => t)) as Tier
  const tier = tierOf(pilot.points)
  if (tier >= need) return { ok: true }
  return { ok: false, reason: needs.find(([, t]) => t === need)![0], needTier: need }
}

export type Lock = { open: true } | { open: false; reason: 'previous-chapter' | 'completed' | 'faction'; needs: ChapterId | null }

/** Chapters unlock in sequence; a completed chapter is not replayable (D11); non-campaign missions are always open. */
export function missionLock(c: Campaign, mission: MissionDescriptor): Lock {
  if (mission.faction !== c.faction) return { open: false, reason: 'faction', needs: null }
  if (mission.kind === 'noncampaign') return { open: true }
  const chapters = chaptersOf(c.faction)
  const index = mission.chapterId === null ? -1 : chapters.indexOf(mission.chapterId)
  if (index < 0) return { open: false, reason: 'faction', needs: null }
  const done = c.progress.completed.length
  if (index < done) return { open: false, reason: 'completed', needs: null }
  if (index > done) return { open: false, reason: 'previous-chapter', needs: chapters[done]! }
  return { open: true }
}

export type Offer = { mission: MissionDescriptor; pilots: { pilotId: string; eligible: boolean; reason?: IneligibleReason; needTier?: Tier }[] }

/** Mission-first screen (F5B): every open mission, with all five live pilots and why a pilot cannot fly it. */
export function offers(c: Campaign, catalog: readonly MissionDescriptor[]): Offer[] {
  return catalog.filter((m) => missionLock(c, m).open).map((mission) => ({
    mission,
    pilots: c.roster.live.map((pilotId) => {
      const pilot = c.pilots[pilotId]!
      const results = mission.aircraftIds.map((a) => eligibility(pilot, mission, describeAircraft(a), c.faction))
      if (results.some((r) => r.ok)) return { pilotId, eligible: true }
      const nearest = (results as { ok: false; reason: IneligibleReason; needTier: Tier }[]).sort((x, y) => x.needTier - y.needTier)[0]!
      return { pilotId, eligible: false, reason: nearest.reason, needTier: nearest.needTier }
    }),
  }))
}

/** The no-deadlock query: the first open mission a live pilot can fly, preferring non-campaign missions. */
export function lifeline(c: Campaign, catalog: readonly MissionDescriptor[]): { mission: MissionDescriptor; pilotId: string; aircraftId: string } | null {
  for (const mission of catalog.filter((m) => m.kind === 'noncampaign')) {
    if (!missionLock(c, mission).open) continue
    for (const pilotId of c.roster.live) {
      const pilot = c.pilots[pilotId]!
      for (const aircraftId of mission.aircraftIds) {
        if (eligibility(pilot, mission, describeAircraft(aircraftId), c.faction).ok) return { mission, pilotId, aircraftId }
      }
    }
  }
  return null
}

/** Cheap structural check on a descriptor; the shell and content tests call it on every catalog entry. */
export function missionProblems(m: MissionDescriptor): string[] {
  const out: string[] = []
  if (!m.id) out.push('empty id')
  if (m.aircraftIds.length === 0) out.push('no aircraft')
  if (!(m.minTier >= 1 && m.minTier <= 6)) out.push('minTier outside 1..6')
  if (!Number.isSafeInteger(m.authoredBonus) || m.authoredBonus < 0) out.push('authoredBonus must be a non-negative integer')
  if (m.kind === 'campaign' && (m.chapterId === null || m.chapterId[0] !== (m.faction === 'us' ? 'A' : 'J'))) out.push('campaign mission needs a chapter of its own faction')
  if (m.kind === 'noncampaign' && m.chapterId !== null) out.push('non-campaign mission must have no chapter')
  return out
}
