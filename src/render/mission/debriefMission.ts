import type { World } from '../../sim/loop.js'
import { missionOutcome, recoveryOf } from '../../sim/mission/outcome.js'
import type { Badge } from '../../sim/mission/schema.js'
import type { DebriefModel } from '../debrief.js'

/**
 * The debrief's objectives block and verdict (M2 R9): every objective's
 * final status, the badge verdict line, and the badge itself (or `null`).
 * `null` when the world was never a mission world -- a plain flight has no
 * objectives block at all.
 */
export type DebriefMission = {
  readonly objectives: readonly { readonly label: string; readonly priority: 'primary' | 'secondary'; readonly final: 'complete' | 'incomplete' | 'failed' }[]
  readonly verdict: string
  readonly more: readonly string[]
  readonly badge: Badge | null
}

/**
 * Builds the debrief's mission block from the world the debrief is being
 * raised for. `null` for a world with no mission (`world.mission === null`).
 */
export function missionDebrief<M>(world: World<M>): DebriefMission | null {
  if (world.mission === null) return null
  const recovery = recoveryOf(world)
  // Every debrief is raised by a landing, an impact or a destruction, so
  // recoveryOf is non-null here; a null means the two signals disagree (M1's
  // recoveryAgreement.test.ts pins that they do not). Fail loudly.
  if (recovery === null) throw new Error('missionDebrief: a debrief with no recovery the mission can see')
  const o = missionOutcome(world.mission, recovery)
  const objectives = o.objectives.map(({ label, priority, final }) => ({ label, priority, final }))
  if (o.result === 'success') {
    return { objectives, verdict: o.badge === null ? 'MISSION COMPLETE' : `BADGE AWARDED: ${o.badge.name}`, more: [], badge: o.badge }
  }
  const [first, ...rest] = o.reasons
  return { objectives, verdict: `${first!} — no badge`, more: rest, badge: null }
}

/**
 * Folds a `DebriefMission` (if any) into a `DebriefModel`, and reports the
 * badge id `main.ts` should award to the roster, if any. A mission-less
 * world returns the SAME model object (no `mission` field added) and a
 * `null` badge id, so a plain flight's debrief renders exactly as before.
 */
export function withMissionDebrief<M>(model: DebriefModel, world: World<M>): { readonly model: DebriefModel; readonly badgeId: string | null } {
  const mission = missionDebrief(world)
  return mission === null ? { model, badgeId: null } : { model: { ...model, mission }, badgeId: mission.badge?.id ?? null }
}
