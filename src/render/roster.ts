import { addKillsByType, TARGET_TYPES, zeroKillsByType, type TargetType } from '../sim/weapons/targetType.js'
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

export function createPilot(name: string): PilotRecord {
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('a pilot needs a name')
  return {
    // Whole-branch review M-4: `crypto.randomUUID()`, not a `Date.now()` +
    // in-module counter -- the counter resets to 1 on every page load, so
    // two pilots created in the same millisecond across two different page
    // loads (a real possibility: a fast "New pilot" click right after boot)
    // could collide on the same id. Standard since Chrome 92/Firefox
    // 95/Safari 15.4 and Node 19 (this repo's Node is v22); no polyfill
    // needed for this build's targets.
    id: crypto.randomUUID(),
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

/**
 * `killsSinceLastBank` (whole-branch review I-2) is the same per-type delta
 * `main.ts` already computes via `debrief.ts`'s `killsSince` right before
 * calling this -- ADDED into the pilot's existing `killsByType`, not an
 * overwrite, so it accumulates across the pilot's whole career the same way
 * `missionsFlown` does. Optional and defaulted to a zero record rather than
 * required, so every existing direct caller (this file's own tests) that
 * only cares about score/rank/status keeps compiling.
 *
 * Whole-branch review I-4: `status` reverts to `'active'` on ANY outcome
 * other than `'killed'`, not just when it was already `'active'`. Design §2
 * calls "selecting a `kia` pilot and starting a flight" the resurrection
 * moment, via `startSortie` -- but Restart deliberately does NOT call
 * `startSortie` again (this plan's own "Ruling": Restart redoes the SAME
 * sortie, not a new one), so a pilot who died, pressed Restart, and landed
 * successfully this time had no path back to `'active'` before this fix --
 * `status: outcome === 'killed' ? 'kia' : pilot.status` left an already-`kia`
 * pilot `kia` forever once `startSortie` was skipped. Surviving a sortie
 * (landing or ditching, however it started) is itself proof the pilot is
 * flying, so it clears `kia` regardless of path. `resurrections` is
 * deliberately left untouched here and stays exclusively `startSortie`'s to
 * increment -- counting it again here would double-count the SAME
 * resurrection `startSortie` already counted when New Game was pressed with
 * a `kia` pilot selected.
 */
export function applyMissionResult(
  pilot: PilotRecord,
  scoreTotal: number,
  outcome: RecoveryOutcome,
  killsSinceLastBank: Readonly<Record<TargetType, number>> = zeroKillsByType(),
): PilotRecord {
  const cumulativeScore = pilot.cumulativeScore + scoreTotal
  return {
    ...pilot,
    cumulativeScore,
    rank: rankFor(cumulativeScore),
    missionsFlown: pilot.missionsFlown + 1,
    // Whole-branch review M-3: one increment per DEBRIEF shown, not per
    // sortie -- a land -> Continue -> later crash counts as two missions
    // against the one sortie that started them both. Deliberate: each
    // debrief scores its own segment of the flight independently
    // (`killsSince`'s whole reason for existing), so each is arguably its
    // own "mission" by that same logic. Undocumented before this review.
    killsByType: addKillsByType(pilot.killsByType, killsSinceLastBank),
    status: outcome === 'killed' ? 'kia' : 'active',
  }
}

/**
 * `applyMissionResult` applied to whichever roster entry has `pilotId`,
 * leaving every other pilot untouched -- the pure "find this pilot and bank
 * this result" logic `main.ts`'s `bankMissionResult` closure wraps with the
 * `currentPilotId === null` no-op guard and the `saveRoster` persistence
 * call (Plan 9 Task 6). Extracted here, rather than left inline only in
 * `main.ts`, so the land -> continue -> one more kill -> land again
 * double-banking scenario (this plan's own Review Focus) is testable without
 * a DOM or a browser storage global -- `main.ts`'s own closures have no
 * other precedent for direct testing in this repo.
 */
export function applyMissionResultToRoster(
  roster: readonly PilotRecord[],
  pilotId: string,
  scoreTotal: number,
  outcome: RecoveryOutcome,
  killsSinceLastBank?: Readonly<Record<TargetType, number>>,
): readonly PilotRecord[] {
  return roster.map((p) => (p.id === pilotId ? applyMissionResult(p, scoreTotal, outcome, killsSinceLastBank) : p))
}

const STORAGE_KEY = 'ww2airsim.roster.v1'

function validatePilot(value: unknown): PilotRecord {
  if (typeof value !== 'object' || value === null) throw new Error('pilot record is not an object')
  const v = value as Record<string, unknown>
  for (const field of ['id', 'name', 'rank', 'cumulativeScore', 'missionsFlown', 'sorties', 'killsByType', 'badges', 'status', 'resurrections']) {
    if (!(field in v)) throw new Error(`pilot record missing "${field}"`)
  }
  const rank = v.rank as Rank
  // Whole-branch review I-1: matched by `abbrev` alone, not also by
  // `threshold`. A saved pilot's rank is an identity ("LTJG"), not a claim
  // about where today's ladder currently draws that rank's line -- matching
  // both meant retuning any threshold in `RANK_LADDER` would make every
  // already-saved pilot at that rank unparseable, throwing `loadRoster` for
  // every returning player. `abbrev` is the more stable identity field:
  // thresholds are exactly the kind of number a balance pass retunes: names
  // and abbreviations are not.
  if (!RANK_LADDER.some((r) => r.abbrev === rank.abbrev)) {
    throw new Error(`unknown rank "${rank.abbrev}"`)
  }
  const killsByType = v.killsByType as Record<string, unknown>
  for (const t of TARGET_TYPES) {
    if (typeof killsByType[t] !== 'number') throw new Error(`killsByType missing "${t}"`)
  }
  return v as unknown as PilotRecord
}

/**
 * Whole-branch review I-1: tolerant of a corrupt/unreadable blob, unlike
 * `importRoster` below -- that is a different, user-initiated action (an
 * explicit file import) where a throw is the right contract, so the user
 * sees exactly what is wrong with the file they picked. `loadRoster` runs
 * unguarded during `boot()` and inside `titleScreen.ts`'s `build()`
 * (rebuilt on every title show, including a return-to-title mid-session), so
 * a malformed `ww2airsim.roster.v1` value -- hand-edited, corrupted by a
 * failed write, or written by some future format this build does not
 * understand -- used to throw straight out of `boot()` (crashing the whole
 * app with no in-app recovery) or out of the title's click handler (the
 * same "silently abort the whole action" failure class the TDZ bug found
 * elsewhere in this plan already was). A player with one bad roster entry
 * would lose the entire app, not just that one pilot.
 */
export function loadRoster(): readonly PilotRecord[] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return []
  try {
    return (JSON.parse(raw) as unknown[]).map(validatePilot)
  } catch (err) {
    console.warn('roster in localStorage is corrupt or unreadable; starting with an empty roster:', err)
    return []
  }
}

/**
 * Whole-branch review M-5: guarded, not left to throw. `saveRoster` is
 * reached from inside the render loop via `main.ts`'s `bankMissionResult`
 * (called the instant a landing/ditching/death is detected, sixty times a
 * second until the guard tick catches it) -- a storage-disabled browser
 * (Safari private browsing is the common real case) throws on `setItem`,
 * and an uncaught throw there would crash the frame loop over a lost save,
 * which is worse than the save itself being lost.
 */
export function saveRoster(roster: readonly PilotRecord[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(roster))
  } catch (err) {
    console.warn('roster could not be saved to localStorage:', err)
  }
}

export function exportRoster(roster: readonly PilotRecord[]): string {
  return JSON.stringify(roster, null, 2)
}

export function importRoster(json: string): readonly PilotRecord[] {
  const parsed: unknown = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('roster export is not an array')
  return parsed.map(validatePilot)
}
