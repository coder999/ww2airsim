import { TARGET_TYPES, zeroKillsByType, type TargetType } from '../sim/weapons/targetType.js'
import type { RecoveryOutcome } from './debrief.js'

export type Rank = { readonly abbrev: string; readonly name: string; readonly threshold: number }

/** Master spec §8's ladder, with §8's own period-accuracy substitution
 *  (Commodore/Rear Admiral for the modern one-/two-star titles) already
 *  applied -- this table IS the substitution, not a later patch on top of
 *  the modern one. */
export const RANK_LADDER: readonly Rank[] = [
  { abbrev: 'ENS', name: 'Ensign', threshold: 0 },
  { abbrev: 'LTJG', name: 'Lieutenant, junior grade', threshold: 2_500 },
  { abbrev: 'LT', name: 'Lieutenant', threshold: 7_500 },
  { abbrev: 'LCDR', name: 'Lieutenant Commander', threshold: 17_500 },
  { abbrev: 'CDR', name: 'Commander', threshold: 35_000 },
  { abbrev: 'CAPT', name: 'Captain', threshold: 60_000 },
  { abbrev: 'COMO', name: 'Commodore', threshold: 100_000 },
  { abbrev: 'RADM', name: 'Rear Admiral', threshold: 150_000 },
  { abbrev: 'VADM', name: 'Vice Admiral', threshold: 225_000 },
  { abbrev: 'ADM', name: 'Admiral', threshold: 325_000 },
]

export function rankFor(cumulativeScore: number): Rank {
  let current = RANK_LADDER[0]!
  for (const rank of RANK_LADDER) {
    if (cumulativeScore >= rank.threshold) current = rank
  }
  return current
}

export type PilotRecord = {
  readonly id: string
  readonly name: string
  readonly rank: Rank
  readonly cumulativeScore: number
  readonly missionsFlown: number
  readonly sorties: number
  readonly killsByType: Readonly<Record<TargetType, number>>
  readonly badges: readonly string[]
  readonly status: 'active' | 'kia'
  readonly resurrections: number
}

let nextId = 1

export function createPilot(name: string): PilotRecord {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('a pilot needs a name')
  return {
    id: `pilot-${Date.now()}-${nextId++}`,
    name: trimmed,
    rank: RANK_LADDER[0]!,
    cumulativeScore: 0,
    missionsFlown: 0,
    sorties: 0,
    killsByType: zeroKillsByType(),
    badges: [],
    status: 'active',
    resurrections: 0,
  }
}

export function startSortie(pilot: PilotRecord): PilotRecord {
  return {
    ...pilot,
    sorties: pilot.sorties + 1,
    status: 'active',
    resurrections: pilot.status === 'kia' ? pilot.resurrections + 1 : pilot.resurrections,
  }
}

export function applyMissionResult(
  pilot: PilotRecord,
  scoreTotal: number,
  outcome: RecoveryOutcome,
): PilotRecord {
  const cumulativeScore = pilot.cumulativeScore + scoreTotal
  return {
    ...pilot,
    cumulativeScore,
    rank: rankFor(cumulativeScore),
    missionsFlown: pilot.missionsFlown + 1,
    status: outcome === 'killed' ? 'kia' : pilot.status,
  }
}

const STORAGE_KEY = 'ww2airsim.roster.v1'

function validatePilot(value: unknown): PilotRecord {
  if (typeof value !== 'object' || value === null) throw new Error('pilot record is not an object')
  const v = value as Record<string, unknown>
  for (const field of ['id', 'name', 'rank', 'cumulativeScore', 'missionsFlown', 'sorties', 'killsByType', 'badges', 'status', 'resurrections']) {
    if (!(field in v)) throw new Error(`pilot record missing "${field}"`)
  }
  const rank = v.rank as Rank
  if (!RANK_LADDER.some((r) => r.abbrev === rank.abbrev && r.threshold === rank.threshold)) {
    throw new Error(`unknown rank "${rank.abbrev}"`)
  }
  const killsByType = v.killsByType as Record<string, unknown>
  for (const t of TARGET_TYPES) {
    if (typeof killsByType[t] !== 'number') throw new Error(`killsByType missing "${t}"`)
  }
  return v as unknown as PilotRecord
}

export function loadRoster(): readonly PilotRecord[] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return []
  return (JSON.parse(raw) as unknown[]).map(validatePilot)
}

export function saveRoster(roster: readonly PilotRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roster))
}

export function exportRoster(roster: readonly PilotRecord[]): string {
  return JSON.stringify(roster, null, 2)
}

export function importRoster(json: string): readonly PilotRecord[] {
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('roster export is not an array')
  return parsed.map(validatePilot)
}
