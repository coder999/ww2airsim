import {
  SCORE_CLASSES, SCORE_POINTS,
  type Counts, type Difficulty, type PendingSortie, type SortieReport, type Tier,
} from './schema.js'

/** Fixed bonus on a badge-earning sortie: Recruit 0, Veteran 500, Ace 1,000 (GAMEPLAY.md). */
export const DIFFICULTY_BONUS: Readonly<Record<Difficulty, number>> = { easy: 0, normal: 500, hard: 1000 }

/** Human-only roster bonus per living pilot, by tier: 0 / 100 / ... / 500. */
export const rosterBonusOf = (tiers: readonly Tier[]): number => tiers.reduce((sum, t) => sum + (t - 1) * 100, 0)

export const destructionPoints = (counts: Counts): number => SCORE_CLASSES.reduce((sum, k) => sum + counts[k] * SCORE_POINTS[k], 0)

/**
 * The ends that forfeit whatever the sortie had not yet banked (F5C D5, 2026-10-16): a pilot who does not come
 * back, or who walks away, keeps only what an earlier landing banked. A ditching or a rescue survives and banks.
 * One place, so the rule can be flipped without touching the reducers.
 */
export const FORFEITING_ENDS: readonly SortieReport['end'][] = ['abandoned', 'killed', 'captured']
/** A destroyed friendly forfeits the unbanked part whatever the end was (F5A, D6). */
export const forfeitsUnbanked = (r: Pick<SortieReport, 'end' | 'friendlyDestroyed'>): boolean =>
  r.friendlyDestroyed || FORFEITING_ENDS.includes(r.end)

export type SortieScore = {
  destruction: number; difficulty: number; completion: number
  /** the unbanked part is forfeited (see `forfeitsUnbanked`): everything is zero and there is no badge or progress. */
  forfeited: boolean
}

/**
 * Pure score of the UNBANKED part of a sortie for the assigned pilot (and, before the roster bonus, the human):
 * `report.counts` here is the delta since the last bank, and `report.success` is true only when this bank is the
 * one that qualifies. Destruction banks on a normal debrief, successful or not; difficulty and completion need
 * `success`; a forfeiting end zeroes all of it (C3 steps 2-3, F5C D5).
 */
export function scoreSortie(report: SortieReport, pending: Pick<PendingSortie, 'difficulty'>): SortieScore {
  if (forfeitsUnbanked(report)) return { destruction: 0, difficulty: 0, completion: 0, forfeited: true }
  return {
    destruction: destructionPoints(report.counts),
    difficulty: report.success ? DIFFICULTY_BONUS[pending.difficulty] : 0,
    completion: report.success ? report.authoredBonus : 0,
    forfeited: false,
  }
}
