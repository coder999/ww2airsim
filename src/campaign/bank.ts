/**
 * The only way campaign state changes (plan F5A, C3). Every reducer returns a new `Campaign`
 * with `revision` + 1, or `{ ok: false }` carrying the SAME campaign reference untouched.
 * Nested objects that did not change are shared with the input, so callers must not mutate.
 */
import { tierOf } from './ranks.js'
import { addEntryPilot } from './roster.js'
import { forfeitsUnbanked, rosterBonusOf, scoreSortie } from './scoring.js'
import {
  CLOSED_LOG_CAP, HUMAN_LOG_CAP, LIVE_LOG_CAP, SCORE_CLASSES, chaptersOf, zeroCounts,
  type Campaign, type Counts, type Difficulty, type LogEntry, type LogFlag, type Pilot, type PilotStatus,
  type LegReport, type PendingBanked, type PendingLeg, type PendingSortie, type SortieFacts, type SortieReport,
} from './schema.js'
import { describeAircraft, eligibility, missionLock, type AircraftDescriptor, type MissionDescriptor } from './eligibility.js'

export type ErrorCode =
  | 'sortie-pending' | 'no-pending' | 'sortie-mismatch' | 'pilot-closed' | 'faction' | 'aircraft-not-offered'
  | 'ineligible' | 'locked' | 'bad-report' | 'leg-mismatch'
export type ReducerError = { code: ErrorCode; message: string; detail?: string }
export type Result<T> = { ok: true; value: T } | { ok: false; error: ReducerError; campaign: Campaign }

const reject = (campaign: Campaign, code: ErrorCode, message: string, detail?: string): Result<Campaign> => ({
  ok: false, campaign, error: detail === undefined ? { code, message } : { code, message, detail },
})

const addCounts = (a: Counts, b: Counts): Counts => Object.fromEntries(SCORE_CLASSES.map((k) => [k, a[k] + b[k]])) as Counts
const pushCapped = <T,>(list: readonly T[], item: T, cap: number): T[] => [...list, item].slice(-cap)
const withBadge = (badges: readonly string[], id: string | null): string[] => (id === null || badges.includes(id) ? [...badges] : [...badges, id])
/** Nothing banked yet: what a freshly launched sortie carries. */
export const noBanked = (): PendingBanked => ({
  counts: zeroCounts(), flightSeconds: 0, destruction: 0, difficulty: 0, completion: 0, roster: 0, pilotPoints: 0, humanPoints: 0, qualified: false,
})

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
        legs: [], banked: noBanked(),
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

/** What this report adds to the last bank, or null when a count went DOWN (a cumulative report cannot). */
function deltaOf(now: Counts, banked: Counts): Counts | null {
  const out = {} as Record<(typeof SCORE_CLASSES)[number], number>
  for (const k of SCORE_CLASSES) {
    if (now[k] < banked[k]) return null
    out[k] = now[k] - banked[k]
  }
  return out
}

/**
 * The money half shared by a landing bank and the closing bank (F5C D4). Credits the part of `r` that is not yet
 * banked to the pilot and the commander ledgers, applies the badge, the difficulty and completion bonuses, the roster
 * bonus and the chapter ONCE (at the first qualifying bank), and returns the new campaign (pending still open, with
 * its `banked` totals moved on) plus what this bank was worth. A forfeiting end credits nothing.
 */
type Credited = { draft: Campaign; banked: PendingBanked; pilotPoints: number; humanPoints: number }
function credit(c: Campaign, pending: PendingSortie, r: SortieReport): { ok: true; value: Credited } | { ok: false; error: string } {
  const was = pending.banked
  const forfeited = forfeitsUnbanked(r)
  const delta = forfeited ? zeroCounts() : deltaOf(r.counts, was.counts)
  if (delta === null) return { ok: false, error: 'cumulative counts went down since the last bank' }
  const qualifies = !forfeited && r.success && !was.qualified
  const score = scoreSortie({ ...r, counts: delta, success: qualifies }, pending)
  const pilotPoints = score.destruction + score.difficulty + score.completion
  const badgeId = qualifies ? r.badgeId : null
  const pilot = c.pilots[pending.pilotId]!
  const career = pilot.career
  const seconds = Math.max(0, whole(r.flight.flightSeconds) - was.flightSeconds)
  const updated: Pilot = {
    ...pilot,
    points: pilot.points + pilotPoints,
    counts: addCounts(pilot.counts, delta),
    badges: withBadge(pilot.badges, badgeId),
    career: {
      flightSeconds: career.flightSeconds + seconds,
      landings: r.flight.landing ? { ...career.landings, [r.flight.landing]: career.landings[r.flight.landing] + 1 } : career.landings,
      rescues: career.rescues,
      maxAltitudeM: Math.max(career.maxAltitudeM, whole(r.flight.maxAltitudeM)),
      maxTrueAirspeedMps: Math.max(career.maxTrueAirspeedMps, whole(r.flight.maxTrueAirspeedMps)),
    },
  }
  const draft: Campaign = { ...c, pilots: { ...c.pilots, [pilot.id]: updated } }

  // Roster bonus (human only) from the post-promotion roster (D8); only the qualifying bank earns it.
  const roster = qualifies ? rosterBonusOf(draft.roster.live.map((id) => tierOf(draft.pilots[id]!.points))) : 0
  const humanPoints = pilotPoints + roster
  const h = c.human
  const chapter = pending.chapterId
  let progress = c.progress
  if (qualifies && chapter) {
    const chapters = chaptersOf(c.faction)
    if (chapters[c.progress.completed.length] === chapter) {
      const completed = [...c.progress.completed, chapter]
      progress = { ...progress, completed, victory: completed.length === chapters.length }
    }
  }
  const out: Campaign = {
    ...draft,
    human: {
      ...h,
      ledger: { ...h.ledger, points: h.ledger.points + humanPoints, counts: addCounts(h.ledger.counts, delta), badges: withBadge(h.ledger.badges, badgeId) },
    },
    progress,
  }
  const banked: PendingBanked = {
    counts: addCounts(was.counts, delta), flightSeconds: Math.max(was.flightSeconds, whole(r.flight.flightSeconds)),
    destruction: was.destruction + score.destruction, difficulty: was.difficulty + score.difficulty, completion: was.completion + score.completion,
    roster: was.roster + roster, pilotPoints: was.pilotPoints + pilotPoints, humanPoints: was.humanPoints + humanPoints,
    qualified: was.qualified || qualifies,
  }
  return { ok: true, value: { draft: out, banked, pilotPoints, humanPoints } }
}

/**
 * A landing at a friendly base banks the points earned since the last bank, for good (F5C D4), and keeps the sortie
 * open. The report is CUMULATIVE for the sortie; `leg` is which landing this is (1-based), so a repeated call is
 * refused rather than banked twice. Denominator, `pilot.sorties`, the log and the roster are untouched: those belong
 * to the launch and to `bankSortie`, the closing call.
 */
export function bankLeg(c: Campaign, r: LegReport, now: string): Result<Campaign> {
  const pending = c.pending
  if (!pending) return reject(c, 'no-pending', 'No sortie is pending.')
  if (pending.sortieId !== r.sortieId) return reject(c, 'sortie-mismatch', 'Report does not belong to the pending sortie.')
  if (r.leg !== pending.legs.length + 1) return reject(c, 'leg-mismatch', `This is landing ${r.leg}, but ${pending.legs.length} ${pending.legs.length === 1 ? 'is' : 'are'} already banked.`)
  const problem = badReport(r) ?? (r.end !== 'landed' ? "only a landing banks a leg" : r.friendlyDestroyed ? 'a sortie with a destroyed friendly ends at once; it has no legs' : null)
  if (problem) return reject(c, 'bad-report', problem)
  const done = credit(c, pending, r)
  if (!done.ok) return reject(c, 'bad-report', done.error)
  const { draft, banked, pilotPoints, humanPoints } = done.value
  return {
    ok: true,
    value: {
      ...draft, revision: c.revision + 1,
      pending: { ...pending, banked, legs: [...pending.legs, { place: r.place, at: now, counts: r.counts, pilotPoints, humanPoints }] },
    },
  }
}

/**
 * The closing transaction of a sortie, in this order (C3): validate, forfeit test, score the unbanked part, ledgers,
 * closure, replacement, progress, attempts/stats/revision, the log entry (one per sortie, legs inside), clear pending.
 * With no leg banked it is the whole sortie in one call, as before F5C.
 */
export function bankSortie(c: Campaign, r: SortieReport, now: string): Result<Campaign> {
  const pending = c.pending
  if (!pending) return reject(c, 'no-pending', 'No sortie is pending.')
  if (pending.sortieId !== r.sortieId) return reject(c, 'sortie-mismatch', 'Report does not belong to the pending sortie.')
  const problem = badReport(r)
  if (problem) return reject(c, 'bad-report', problem)
  const done = credit(c, pending, r)
  if (!done.ok) return reject(c, 'bad-report', done.error)
  const { banked } = done.value
  let draft = done.value.draft
  const pilot = draft.pilots[pending.pilotId]!
  const success = banked.qualified

  const flags: LogFlag[] = []
  if (r.end === 'abandoned') flags.push('forfeit-abandoned')
  if (r.friendlyDestroyed) flags.push('forfeit-friendly-destroyed')
  if (r.warnings > 0) flags.push('warned')

  const closeReason: Exclude<PilotStatus, 'active'> | null =
    r.end === 'killed' ? 'kia' : r.end === 'captured' ? 'pow' : r.friendlyDestroyed ? 'discharged' : null

  const entry = (points: number, roster: number, legPoints: (l: PendingLeg) => number): LogEntry => ({
    sortieId: pending.sortieId, at: now, missionId: pending.missionId, chapterId: pending.chapterId,
    aircraft: String(pending.facts.aircraft ?? ''), loadout: String(pending.facts.loadout ?? ''),
    difficulty: pending.difficulty, end: r.end, success, counts: banked.counts, destruction: banked.destruction,
    bonuses: { difficulty: banked.difficulty, completion: banked.completion, roster },
    points, flightSeconds: banked.flightSeconds, flags,
    legs: pending.legs.map((l) => ({ place: l.place, points: legPoints(l) })),
  })

  const updated: Pilot = {
    ...pilot,
    banked: pilot.banked + 1,
    career: { ...pilot.career, rescues: pilot.career.rescues + (r.end === 'rescued' ? 1 : 0) },
    log: pushCapped(pilot.log, entry(banked.pilotPoints, 0, (l) => l.pilotPoints), closeReason ? CLOSED_LOG_CAP : LIVE_LOG_CAP),
  }
  if (closeReason) {
    updated.status = closeReason
    updated.closure = { sortieId: pending.sortieId, at: now, reason: closeReason, missionId: pending.missionId }
  }

  // Closure + same-call replacement (a draft owned by this call).
  draft = { ...draft, pilots: { ...draft.pilots, [pilot.id]: updated }, roster: { live: [...draft.roster.live] as Campaign['roster']['live'] } }
  if (closeReason) {
    const slot = draft.roster.live.indexOf(pilot.id)
    draft.roster.live[slot] = addEntryPilot(draft)
  }

  const h = draft.human
  const human = {
    ...h,
    ledger: { ...h.ledger, banked: h.ledger.banked + 1 },
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
    log: pushCapped(h.log, entry(banked.humanPoints, banked.roster, (l) => l.humanPoints), HUMAN_LOG_CAP),
  }

  // Attempts: only a sortie that never qualified counts as a failure or an abandonment of its chapter.
  let progress = draft.progress
  const chapter = pending.chapterId
  if (chapter && !success) {
    const attempt = progress.attempts[chapter] ?? { launched: 0, failed: 0, abandoned: 0 }
    const next = { ...attempt }
    if (r.end === 'abandoned') next.abandoned++
    else next.failed++
    progress = { ...progress, attempts: { ...progress.attempts, [chapter]: next } }
  }

  return { ok: true, value: { ...draft, revision: c.revision + 1, human, progress, pending: null } }
}

/**
 * A sortie left over at load is an abandoned one (D7): the unbanked part is lost, anything an earlier landing banked
 * stays (F5C D11), the pilot survives, the denominator already ticked.
 */
export function resolveInterrupted(c: Campaign, now: string): Campaign {
  if (!c.pending) return c
  const result = bankSortie(c, {
    sortieId: c.pending.sortieId, end: 'abandoned', success: false, counts: zeroCounts(), friendlyDestroyed: false,
    warnings: 0, authoredBonus: 0, flight: { flightSeconds: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: null }, badgeId: null,
  }, now)
  return result.ok ? result.value : c
}
