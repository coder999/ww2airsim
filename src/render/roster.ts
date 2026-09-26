import { addKillsByType, TARGET_TYPES, zeroKillsByType, type TargetType } from '../sim/weapons/targetType.js'
import type { Loadout } from '../sim/weapons/stores.js'
import type { RecoveryOutcome } from './debrief.js'
import type { FlightSegment } from './flightRecord.js'

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

export type LandingKind = 'trap' | 'field' | 'ditched'
export type LogOutcome = LandingKind | 'killed'

/** Career totals (dossier spec §B.1) -- stored, never derived from `log`,
 *  so they survive the 200-entry log cap intact. */
export type Career = {
  readonly flightSeconds: number
  readonly landings: Readonly<Record<LandingKind, number>>
  readonly maxAltitudeM: number
  readonly maxTrueAirspeedMps: number
}

export const ZERO_CAREER: Career = { flightSeconds: 0, landings: { trap: 0, field: 0, ditched: 0 }, maxAltitudeM: 0, maxTrueAirspeedMps: 0 }

/** One banked sortie's line in the pilot's mission log (dossier spec §B.1). */
export type MissionLogEntry = {
  readonly at: string
  readonly scenarioId: string
  readonly aircraft: string
  readonly loadout: Loadout
  readonly outcome: LogOutcome
  readonly points: number
  readonly killsByType: Readonly<Record<TargetType, number>>
  readonly flightSeconds: number
  readonly maxAltitudeM: number
  readonly maxTrueAirspeedMps: number
}

/** The facts about a sortie `applyMissionResult` needs to bank a log entry
 *  and fold career totals -- optional so every existing caller that only
 *  cares about score/rank/status keeps compiling. */
export type SortieFacts = {
  readonly at: string
  readonly scenarioId: string
  readonly aircraft: string
  readonly loadout: Loadout
  readonly outcome: LogOutcome
  readonly segment: FlightSegment
}

/** Oldest entry dropped past this cap; `career` totals are stored
 *  separately and are unaffected by the cap. */
export const MISSION_LOG_CAP = 200

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
  readonly career: Career
  readonly log: readonly MissionLogEntry[]
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
    career: ZERO_CAREER,
    log: [],
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
/** Folds one sortie's facts into career totals (dossier spec §B.1):
 *  `flightSeconds` accumulates, `landings` counts only non-`killed`
 *  outcomes, and the two peaks keep the career maximum. */
function foldCareer(c: Career, s: SortieFacts): Career {
  return {
    flightSeconds: c.flightSeconds + s.segment.flightSeconds,
    landings: s.outcome === 'killed' ? c.landings : { ...c.landings, [s.outcome]: c.landings[s.outcome] + 1 },
    maxAltitudeM: Math.max(c.maxAltitudeM, s.segment.maxAltitudeM),
    maxTrueAirspeedMps: Math.max(c.maxTrueAirspeedMps, s.segment.maxTrueAirspeedMps),
  }
}

function logEntry(s: SortieFacts, points: number, kills: Readonly<Record<TargetType, number>>): MissionLogEntry {
  return {
    at: s.at, scenarioId: s.scenarioId, aircraft: s.aircraft, loadout: s.loadout, outcome: s.outcome,
    points, killsByType: kills, ...s.segment,
  }
}

export function applyMissionResult(
  pilot: PilotRecord,
  scoreTotal: number,
  outcome: RecoveryOutcome,
  killsSinceLastBank: Readonly<Record<TargetType, number>> = zeroKillsByType(),
  sortie?: SortieFacts,
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
    ...(sortie === undefined ? {} : {
      career: foldCareer(pilot.career, sortie),
      log: [...pilot.log, logEntry(sortie, scoreTotal, killsSinceLastBank)].slice(-MISSION_LOG_CAP),
    }),
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
  sortie?: SortieFacts,
): readonly PilotRecord[] {
  return roster.map((p) => (p.id === pilotId ? applyMissionResult(p, scoreTotal, outcome, killsSinceLastBank, sortie) : p))
}

const STORAGE_KEY = 'ww2airsim.roster.v1'

// Dossier spec §B.3, same zero-fill philosophy as `career` below.
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

const LOADOUTS: readonly Loadout[] = ['clean', 'bombs', 'rockets', 'both']
// titleScreen.ts's `DEFAULT_LOADOUT` ('both') is the canonical default;
// duplicated here rather than imported because titleScreen.ts imports THIS
// module (roster.ts) -- importing it back would be a cycle.
const FALLBACK_LOADOUT: Loadout = 'both'
const LOG_OUTCOMES: readonly LogOutcome[] = ['trap', 'field', 'ditched', 'killed']

/**
 * Fix round 2 finding 1: a hand-edited or future-format log entry used to be
 * cast straight to `MissionLogEntry` with zero validation -- a missing/wrong-
 * typed `outcome` then threw straight out of `dossier.ts`'s
 * `OUTCOME_LABEL[e.outcome]` (undefined key) or `e.at.slice` (not a string),
 * taking the whole Dossier down over one bad line, the same "one bad record
 * kills the feature" class `validatePilot` itself exists to prevent for the
 * pilot record as a whole. Same philosophy as `career` below: a malformed
 * FIELD is zero-filled or dropped, never allowed to throw. A malformed
 * ENTIRE entry (not just a field) is dropped outright -- there is no
 * sensible default `at`/`scenarioId`/`aircraft`/`outcome` to invent for a
 * mission log line that never really happened.
 */
function validateLogEntry(value: unknown): MissionLogEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const e = value as Record<string, unknown>
  if (typeof e.at !== 'string' || typeof e.scenarioId !== 'string' || typeof e.aircraft !== 'string') return null
  if (typeof e.outcome !== 'string' || !LOG_OUTCOMES.includes(e.outcome as LogOutcome)) return null
  const kbt = (typeof e.killsByType === 'object' && e.killsByType !== null ? e.killsByType : {}) as Record<string, unknown>
  const killsByType = Object.fromEntries(TARGET_TYPES.map((t) => [t, num(kbt[t])])) as Readonly<Record<TargetType, number>>
  const loadout = LOADOUTS.includes(e.loadout as Loadout) ? (e.loadout as Loadout) : FALLBACK_LOADOUT
  return {
    at: e.at,
    scenarioId: e.scenarioId,
    aircraft: e.aircraft,
    loadout,
    outcome: e.outcome as LogOutcome,
    points: num(e.points),
    killsByType,
    flightSeconds: num(e.flightSeconds),
    maxAltitudeM: num(e.maxAltitudeM),
    maxTrueAirspeedMps: num(e.maxTrueAirspeedMps),
  }
}

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
  // Dossier spec §B.3: pre-dossier records (and hand-edited partial ones)
  // are completed with zeros, never thrown -- a throw here empties the whole
  // roster through loadRoster's catch (review focus 4).
  const c = (typeof v.career === 'object' && v.career !== null ? v.career : {}) as Record<string, unknown>
  const l = (typeof c.landings === 'object' && c.landings !== null ? c.landings : {}) as Record<string, unknown>
  const career: Career = {
    flightSeconds: num(c.flightSeconds),
    landings: { trap: num(l.trap), field: num(l.field), ditched: num(l.ditched) },
    maxAltitudeM: num(c.maxAltitudeM),
    maxTrueAirspeedMps: num(c.maxTrueAirspeedMps),
  }
  // Fix round 2 finding 1: each entry validated and zero-filled/dropped on
  // its own -- one malformed line no longer takes the whole log (or the
  // whole pilot) down with it.
  const log = Array.isArray(v.log)
    ? (v.log as unknown[]).map(validateLogEntry).filter((e): e is MissionLogEntry => e !== null)
    : []
  return { ...(v as unknown as PilotRecord), career, log }
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
