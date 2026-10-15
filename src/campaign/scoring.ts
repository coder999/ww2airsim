import {
  SCORE_CLASSES, SCORE_POINTS,
  type Counts, type Difficulty, type PendingSortie, type SortieReport, type Tier,
} from './schema.js'

/** Fixed bonus on a badge-earning sortie: Recruit 0, Veteran 500, Ace 1,000 (GAMEPLAY.md). */
export const DIFFICULTY_BONUS: Readonly<Record<Difficulty, number>> = { easy: 0, normal: 500, hard: 1000 }

/** Human-only roster bonus per living pilot, by tier: 0 / 100 / ... / 500. */
export const rosterBonusOf = (tiers: readonly Tier[]): number => tiers.reduce((sum, t) => sum + (t - 1) * 100, 0)

export const destructionPoints = (counts: Counts): number => SCORE_CLASSES.reduce((sum, k) => sum + counts[k] * SCORE_POINTS[k], 0)

export type SortieScore = {
  destruction: number; difficulty: number; completion: number
  /** abandoned or friendly-destroyed: everything is zero and there is no badge or progress. */
  forfeited: boolean
}

/**
 * Pure score of one sortie for the assigned pilot (and, before the roster bonus, the human).
 * Destruction banks on any normal debrief, successful or not; difficulty and completion need
 * `success`; abandonment and a destroyed friendly forfeit all of it (C3 steps 2-3).
 */
export function scoreSortie(report: SortieReport, pending: Pick<PendingSortie, 'difficulty'>): SortieScore {
  if (report.end === 'abandoned' || report.friendlyDestroyed) return { destruction: 0, difficulty: 0, completion: 0, forfeited: true }
  return {
    destruction: destructionPoints(report.counts),
    difficulty: report.success ? DIFFICULTY_BONUS[pending.difficulty] : 0,
    completion: report.success ? report.authoredBonus : 0,
    forfeited: false,
  }
}
