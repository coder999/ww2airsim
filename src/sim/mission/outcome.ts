import type { LandingAt } from '../landing.js'
import type { World } from '../loop.js'
import type { Badge } from './schema.js'
import { lastLanding, type MissionState, type ObjectiveState, type ResolvedObjective } from './state.js'

/** How the flight ended. The kinds are `RecoveryOutcome`'s words in
 *  src/render/debrief.ts, so the debrief and the badge rule cannot drift
 *  apart silently (tests/sim/mission/recoveryAgreement.test.ts). */
export type Recovery =
  | { readonly kind: 'landed'; readonly at: LandingAt | null }
  | { readonly kind: 'ditched' }
  | { readonly kind: 'killed' }

/**
 * The recovery the mission sees for the player right now, read from the
 * same world the frame debriefs from: an impact (ditched or killed), combat
 * destruction (killed), else the mission's most recent landing. Call it
 * when the frame shows a debrief; `null` means still flying with no
 * landing recorded (or no mission, for a landing).
 */
export function recoveryOf<M>(world: World<M>): Recovery | null {
  const player = world.aircraft.find((a) => a.id === world.player)
  if (player === undefined) throw new Error(`recoveryOf: no player aircraft "${world.player}"`)
  if (player.impact !== null) return { kind: player.impact.kind === 'ditched' ? 'ditched' : 'killed' }
  if (world.combat.aircraft[world.player]?.damage.destroyedAt != null) return { kind: 'killed' }
  const landing = world.mission === null ? undefined : lastLanding(world.mission)
  return landing === undefined ? null : { kind: 'landed', at: landing.at }
}

export type FinalStatus = 'complete' | 'incomplete' | 'failed'

/** As the debrief stamps it. `protect` and `deny` complete "when the
 *  mission ends" without failing (spec §2.1), so a live one reads
 *  complete; one still waiting on `after` does not. */
export function finalStatus(o: ResolvedObjective, p: ObjectiveState): FinalStatus {
  if (p.status === 'failed') return 'failed'
  if (p.status === 'complete') return 'complete'
  if (p.status === 'active' && (o.kind === 'protect' || o.kind === 'deny')) return 'complete'
  return 'incomplete'
}

export type ObjectiveResult = {
  readonly id: string
  readonly label: string
  readonly priority: 'primary' | 'secondary'
  readonly final: FinalStatus
}

export type MissionOutcome = {
  readonly result: 'success' | 'no-badge'
  /** The scenario's badge on success, else `null`. */
  readonly badge: Badge | null
  /** Why not, in fixed order (ruling R16); empty on success. */
  readonly reasons: readonly string[]
  readonly objectives: readonly ObjectiveResult[]
}

/**
 * Spec §2.4. Success, and the badge, need BOTH every primary objective
 * complete AND a landing with a non-null `at`. Ditching, an off-field
 * landing, a failed or incomplete primary and death each earn no badge;
 * secondary objectives never gate it.
 */
export function missionOutcome<M>(m: MissionState<M>, recovery: Recovery): MissionOutcome {
  const objectives: ObjectiveResult[] = m.objectives.map((o, i) => ({
    id: o.id, label: o.label, priority: o.priority, final: finalStatus(o, m.progress[i]!),
  }))
  const reasons: string[] = []
  if (recovery.kind === 'killed') reasons.push('Killed')
  else if (recovery.kind === 'ditched') reasons.push('Ditched')
  else if (recovery.at === null) reasons.push('Landed off-field')
  const primary = objectives.filter((o) => o.priority === 'primary')
  for (const o of primary) if (o.final === 'failed') reasons.push(`${o.label}: failed`)
  for (const o of primary) if (o.final === 'incomplete') reasons.push(`${o.label}: incomplete`)
  const success = reasons.length === 0
  return { result: success ? 'success' : 'no-badge', badge: success ? m.badge : null, reasons, objectives }
}
