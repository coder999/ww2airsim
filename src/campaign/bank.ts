/**
 * The only way campaign state changes (plan F5A, C3). Every reducer returns a new `Campaign`
 * with `revision` + 1, or `{ ok: false }` carrying the SAME campaign reference untouched.
 * Nested objects that did not change are shared with the input, so callers must not mutate.
 */
import { tierOf } from './ranks.js'
import { addEntryPilot } from './roster.js'
import { rosterBonusOf, scoreSortie } from './scoring.js'
import {
  CLOSED_LOG_CAP, HUMAN_LOG_CAP, LIVE_LOG_CAP, SCORE_CLASSES, chaptersOf, zeroCounts,
  type Campaign, type Counts, type Difficulty, type LogEntry, type LogFlag, type Pilot, type PilotStatus,
  type SortieFacts, type SortieReport,
} from './schema.js'
import { describeAircraft, eligibility, missionLock, type AircraftDescriptor, type MissionDescriptor } from './eligibility.js'

export type ErrorCode =
  | 'sortie-pending' | 'no-pending' | 'sortie-mismatch' | 'pilot-closed' | 'faction' | 'aircraft-not-offered'
  | 'ineligible' | 'locked' | 'bad-report'
export type ReducerError = { code: ErrorCode; message: string; detail?: string }
export type Result<T> = { ok: true; value: T } | { ok: false; error: ReducerError; campaign: Campaign }

const reject = (campaign: Campaign, code: ErrorCode, message: string, detail?: string): Result<Campaign> => ({
  ok: false, campaign, error: detail === undefined ? { code, message } : { code, message, detail },
})

const addCounts = (a: Counts, b: Counts): Counts => Object.fromEntries(SCORE_CLASSES.map((k) => [k, a[k] + b[k]])) as Counts
const pushCapped = <T,>(list: readonly T[], item: T, cap: number): T[] => [...list, item].slice(-cap)
const withBadge = (badges: readonly string[], id: string | null): string[] => (id === null || badges.includes(id) ? [...badges] : [...badges, id])
const whole = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0)

export type LaunchArgs = {
  pilotId: string; mission: MissionDescriptor; aircraft: AircraftDescriptor; difficulty: Difficulty
  loadout: string; facts?: SortieFacts; now: string
}

/** Reserved `SortieFacts` keys written by launch; F6/F7 must not use them. They feed the log entry. */
export const RESERVED_FACTS = ['aircraft', 'loadout'] as const

/** Eligibility + chapter lock, then a pending sortie; counts toward the adjusted-score denominator at launch. */
export function launchSortie(c: Campaign, a: LaunchArgs): Result<Campaign> {
  if (c.pending) return reject(c, 'sortie-pending', 'A sortie is already pending; bank it or resolve the interruption first.')
  const pilot = c.pilots[a.pilotId]
  if (!pilot || !c.roster.live.includes(a.pilotId)) return reject(c, 'pilot-closed', 'That pilot is not on the live roster.')
  if (a.mission.faction !== c.faction) return reject(c, 'faction', 'That mission belongs to the other campaign.')
  if (!a.mission.aircraftIds.includes(a.aircraft.id)) return reject(c, 'aircraft-not-offered', `${a.aircraft.id} is not offered for ${a.mission.id}.`)
  const aircraft = { id: a.aircraft.id, advanced: a.aircraft.advanced || describeAircraft(a.aircraft.id).advanced }
  const e = eligibility(pilot, a.mission, aircraft, c.faction)
  if (!e.ok) return reject(c, 'ineligible', `Pilot cannot fly this mission (${e.reason}, needs tier ${e.needTier}).`, e.reason)
  const lock = missionLock(c, a.mission)
  if (!lock.open) return reject(c, 'locked', `Mission is locked (${lock.reason}).`, lock.reason)

  const serial = c.serials.sortie + 1
  const chapter = a.mission.chapterId
  const attempt = chapter ? c.progress.attempts[chapter] ?? { launched: 0, failed: 0, abandoned: 0 } : null
  return {
    ok: true,
    value: {
      ...c,
      revision: c.revision + 1,
      serials: { ...c.serials, sortie: serial },
      human: { ...c.human, ledger: { ...c.human.ledger, sorties: c.human.ledger.sorties + 1 } },
      pilots: { ...c.pilots, [pilot.id]: { ...pilot, sorties: pilot.sorties + 1 } },
      progress: chapter && attempt ? { ...c.progress, attempts: { ...c.progress.attempts, [chapter]: { ...attempt, launched: attempt.launched + 1 } } } : c.progress,
      pending: {
        sortieId: `${c.id}:s${serial}`, pilotId: pilot.id, missionId: a.mission.id, chapterId: chapter,
        difficulty: a.difficulty, scoreEligible: a.mission.scoreEligible, launchedAt: a.now,
        facts: { ...(a.facts ?? {}), aircraft: a.aircraft.id, loadout: a.loadout },
      },
    },
  }
}

function badReport(r: SortieReport): string | null {
  if (!Number.isSafeInteger(r.authoredBonus) || r.authoredBonus < 0) return 'authoredBonus must be a non-negative integer'
  if (!Number.isSafeInteger(r.warnings) || r.warnings < 0) return 'warnings must be a non-negative integer'
  for (const k of SCORE_CLASSES) if (!Number.isSafeInteger(r.counts[k]) || r.counts[k] < 0) return `counts.${k} must be a non-negative integer`
  if (r.success && (r.end === 'killed' || r.end === 'captured' || r.end === 'abandoned')) return `a sortie that ended '${r.end}' cannot be a success`
  return null
}

/**
 * One deterministic transaction, in this order (C3): validate, forfeit test, score, ledgers,
 * closure, replacement, progress, attempts/stats/revision, clear pending.
 */
export function bankSortie(c: Campaign, r: SortieReport, now: string): Result<Campaign> {
  const pending = c.pending
  if (!pending) return reject(c, 'no-pending', 'No sortie is pending.')
  if (pending.sortieId !== r.sortieId) return reject(c, 'sortie-mismatch', 'Report does not belong to the pending sortie.')
  const problem = badReport(r)
  if (problem) return reject(c, 'bad-report', problem)
  const pilot = c.pilots[pending.pilotId]!

  const score = scoreSortie(r, pending)
  const forfeited = score.forfeited
  const success = r.success && !forfeited
  const counts: Counts = forfeited ? zeroCounts() : r.counts
  const pilotPoints = score.destruction + score.difficulty + score.completion
  const badgeId = success ? r.badgeId : null

  const flags: LogFlag[] = []
  if (r.end === 'abandoned') flags.push('forfeit-abandoned')
  if (r.friendlyDestroyed) flags.push('forfeit-friendly-destroyed')
  if (r.warnings > 0) flags.push('warned')

  const closeReason: Exclude<PilotStatus, 'active'> | null =
    r.end === 'killed' ? 'kia' : r.end === 'captured' ? 'pow' : r.friendlyDestroyed ? 'discharged' : null

  const flight = r.flight
  const entry = (points: number, roster: number): LogEntry => ({
    sortieId: pending.sortieId, at: now, missionId: pending.missionId, chapterId: pending.chapterId,
    aircraft: String(pending.facts.aircraft ?? ''), loadout: String(pending.facts.loadout ?? ''),
    difficulty: pending.difficulty, end: r.end, success, counts, destruction: score.destruction,
    bonuses: { difficulty: score.difficulty, completion: score.completion, roster },
    points, flightSeconds: whole(flight.flightSeconds), flags,
  })

  // Pilot ledger and career.
  const career = pilot.career
  const updated: Pilot = {
    ...pilot,
    points: pilot.points + pilotPoints,
    banked: pilot.banked + 1,
    counts: addCounts(pilot.counts, counts),
    badges: withBadge(pilot.badges, badgeId),
    career: {
      flightSeconds: career.flightSeconds + whole(flight.flightSeconds),
      landings: flight.landing ? { ...career.landings, [flight.landing]: career.landings[flight.landing] + 1 } : career.landings,
      rescues: career.rescues + (r.end === 'rescued' ? 1 : 0),
      maxAltitudeM: Math.max(career.maxAltitudeM, whole(flight.maxAltitudeM)),
      maxTrueAirspeedMps: Math.max(career.maxTrueAirspeedMps, whole(flight.maxTrueAirspeedMps)),
    },
    log: pushCapped(pilot.log, entry(pilotPoints, 0), closeReason ? CLOSED_LOG_CAP : LIVE_LOG_CAP),
  }
  if (closeReason) {
    updated.status = closeReason
    updated.closure = { sortieId: pending.sortieId, at: now, reason: closeReason, missionId: pending.missionId }
  }

  // Closure + same-call replacement (a draft owned by this call).
  const draft: Campaign = { ...c, pilots: { ...c.pilots, [pilot.id]: updated }, roster: { live: [...c.roster.live] as Campaign['roster']['live'] } }
  if (closeReason) {
    const slot = draft.roster.live.indexOf(pilot.id)
    draft.roster.live[slot] = addEntryPilot(draft)
  }

  // Human ledger: same points, then the roster bonus from the post-promotion, post-replacement roster (D8).
  const roster = success ? rosterBonusOf(draft.roster.live.map((id) => tierOf(draft.pilots[id]!.points))) : 0
  const humanPoints = pilotPoints + roster
  const h = c.human
  const human = {
    ...h,
    ledger: {
      ...h.ledger, points: h.ledger.points + humanPoints, banked: h.ledger.banked + 1,
      counts: addCounts(h.ledger.counts, counts), badges: withBadge(h.ledger.badges, badgeId),
    },
    stats: {
      losses: {
        kia: h.stats.losses.kia + (closeReason === 'kia' ? 1 : 0),
        pow: h.stats.losses.pow + (closeReason === 'pow' ? 1 : 0),
        discharged: h.stats.losses.discharged + (closeReason === 'discharged' ? 1 : 0),
      },
      rescues: h.stats.rescues + (r.end === 'rescued' ? 1 : 0),
      abandoned: h.stats.abandoned + (r.end === 'abandoned' ? 1 : 0),
      warnings: h.stats.warnings + r.warnings,
    },
    log: pushCapped(h.log, entry(humanPoints, roster), HUMAN_LOG_CAP),
  }

  // Progress: only success on the current campaign chapter advances it (steps 7-8).
  let progress = c.progress
  const chapter = pending.chapterId
  if (chapter) {
    const chapters = chaptersOf(c.faction)
    const attempt = c.progress.attempts[chapter] ?? { launched: 0, failed: 0, abandoned: 0 }
    const next = { ...attempt }
    if (r.end === 'abandoned') next.abandoned++
    else if (!success) next.failed++
    progress = { ...progress, attempts: { ...progress.attempts, [chapter]: next } }
    if (success && chapters[c.progress.completed.length] === chapter) {
      const completed = [...c.progress.completed, chapter]
      progress = { ...progress, completed, victory: completed.length === chapters.length }
    }
  }

  return { ok: true, value: { ...draft, revision: c.revision + 1, human, progress, pending: null } }
}

/** A sortie left over at load is an abandoned one (D7): zero points, the pilot survives, the denominator already ticked. */
export function resolveInterrupted(c: Campaign, now: string): Campaign {
  if (!c.pending) return c
  const result = bankSortie(c, {
    sortieId: c.pending.sortieId, end: 'abandoned', success: false, counts: zeroCounts(), friendlyDestroyed: false,
    warnings: 0, authoredBonus: 0, flight: { flightSeconds: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: null }, badgeId: null,
  }, now)
  return result.ok ? result.value : c
}

