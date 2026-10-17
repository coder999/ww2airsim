/**
 * Mission descriptors for the shipped non-campaign pool (plan F5A Task 8, ruling D2). Pure: the
 * caller (a test fixture today, F5B's headquarters tomorrow) supplies the picker rows and each
 * scenario's facts, so a new scenario is enrolled by being in `SCENARIO_OPTIONS` with a `pool`,
 * not by editing a list here. Campaign chapters are authored by F10 and arrive as descriptors.
 */
import type { MissionDescriptor } from './eligibility.js'
import type { Faction, Tier } from './schema.js'

export type ScenarioRow = {
  readonly value: string
  readonly pool: 'noncampaign' | 'training' | 'single' | 'campaign'
  readonly dev: boolean
  readonly aircraft: string
  readonly badge?: { readonly id: string } | undefined
}

export type ScenarioFacts = {
  /** Solar hour the scenario starts at. */
  readonly timeOfDay: number
  /** The nation of the player's airplane. */
  readonly nation: 'allied' | 'japanese'
  /** Every aircraft on the player's side other than the player: its spec and whether it follows a leader. */
  readonly friendlies: readonly { readonly spec: string; readonly follows: boolean }[]
}

/** Leyte, October-December 1944: before 05:30 or from 18:30 is night (GAMEPLAY.md: low light, not darkness). */
export const NIGHT_BEFORE_H = 5.5
export const NIGHT_FROM_H = 18.5
export const isNightHour = (h: number): boolean => h < NIGHT_BEFORE_H || h >= NIGHT_FROM_H

/** Ruling D5 (2026-10-14): the PBY-5A is flown by a Lieutenant (junior grade) or better on any mission. */
export const AIRCRAFT_MIN_TIER: Readonly<Record<string, Tier>> = { 'pby-5a-catalina': 2 }

/**
 * Coordinated operations are "multiple formations or aircraft types" (GAMEPLAY.md): this derives it
 * from the scenario until F10 authors the flag. Two or more friendly aircraft types (the player's
 * included) or two or more friendly formations (a friendly with no leader is a formation leader).
 */
export function isCoordinated(playerSpec: string, friendlies: ScenarioFacts['friendlies']): boolean {
  const types = new Set([playerSpec, ...friendlies.map((f) => f.spec)])
  const formations = friendlies.filter((f) => !f.follows).length
  return types.size >= 2 || formations >= 2
}

/** The descriptor of a score-eligible, repeatable non-campaign row, or null for anything else (ranges, training, dev). */
export function describeScenario(row: ScenarioRow, facts: ScenarioFacts): MissionDescriptor | null {
  if (row.pool !== 'noncampaign' || row.dev) return null
  const faction: Faction = facts.nation === 'japanese' ? 'ja' : 'us'
  return {
    id: row.value, faction, kind: 'noncampaign', chapterId: null,
    minTier: AIRCRAFT_MIN_TIER[row.aircraft] ?? 1,
    night: isNightHour(facts.timeOfDay),
    coordinated: isCoordinated(row.aircraft, facts.friendlies),
    aircraftIds: [row.aircraft], scoreEligible: true, authoredBonus: 0, badgeId: row.badge?.id ?? null,
  }
}

export function buildCatalog(rows: readonly ScenarioRow[], factsOf: (id: string) => ScenarioFacts): MissionDescriptor[] {
  return rows.flatMap((r) => {
    if (r.pool !== 'noncampaign' || r.dev) return []
    const d = describeScenario(r, factsOf(r.value))
    return d ? [d] : []
  })
}
