import type { AircraftEntity } from '../loop.js'
import { dot, length, sub } from '../math/vec3.js'
import { sameSide, type Side } from '../sides.js'
import { isAircraftDown, type CombatState } from '../weapons/combat.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import { airborne } from './airborne.js'
import { hasGunSolution } from './pursuit.js'

/**
 * Target selection (AI 7c spec §4.2, Plan 7e). Runs at rescore, alongside the
 * intent choice, and reads ONLY the start-of-tick snapshot: other pilots'
 * `decision.targetId`s included, so two pilots rescoring on the same tick
 * cannot see each other's new picks, and array order cannot matter.
 *
 * The score is a weighted sum in METERS OF RANGE: each bonus reads "this
 * contact is worth as much as one this much nearer". The weights are tuning
 * values, chosen 2026-09-26 so the order of precedence is threat to me >
 * threat to my leader > friendlies already on it > hysteresis = tail toward
 * me, each spanning at most a few km of range; the furball soak
 * (`tests/sim/ai/furball.test.ts`) is what holds them to account.
 */

/** Tuning value; the sim cannot see clouds (Mark, 2026-09-25, spec §9). */
export const DETECTION_RANGE_M = 8000
/** The contact has me in its gun cone (7b's `threatAstern`, read symmetrically). */
export const THREAT_BONUS_M = 3000
/** The contact has my leader in its gun cone. 7f supplies the leader. */
export const LEADER_THREAT_BONUS_M = 2000
/** Scaled by the angle off the contact's tail toward me over pi: the full
 *  bonus for a contact flying straight away from me, none for one flying at me. */
export const TAIL_BONUS_M = 1000
/** Per same-side pilot (not me) whose snapshot `targetId` is this contact. */
export const ENGAGED_PENALTY_M = 1500
/** My current target, so a pick does not flicker between near-equals. */
export const STICKY_BONUS_M = 1000

export type TargetingView<M> = {
  /** The start-of-tick aircraft array every pilot reads. */
  readonly snapshot: readonly AircraftEntity<M>[]
  /** The start-of-tick combat records (`isAircraftDown`). */
  readonly combat: CombatState['aircraft']
  /** `sidesOf` over the snapshot, built once per tick by `advance`. */
  readonly sides: Readonly<Record<string, Side>>
  /** For `airborne` (7g spec §2): a contact's ground state, not its spawn flag. */
  readonly terrain: TerrainField | null
  /** For `airborne`, live this tick (7g spec §2). */
  readonly decks: readonly Deck[]
}

export type TargetingOptions<M> = {
  readonly current: string | null
  readonly leaderId: string | null
  /** A further filter on candidates (the ingress pilot's engage rule, §4.5). */
  readonly accept?: (contact: AircraftEntity<M>, rangeM: number) => boolean
}

/** Opposite side, not down (destroyed or impacted), airborne by ground state
 *  (7g spec §2: never the spawn flag `parked`), and within
 *  `DETECTION_RANGE_M`. */
export function isContact<M>(self: AircraftEntity<M>, c: AircraftEntity<M>, view: TargetingView<M>): boolean {
  if (c.id === self.id) return false
  if (view.sides[c.id] === undefined || sameSide(view.sides, self.id, c.id)) return false
  if (isAircraftDown(view.combat, c)) return false
  if (!airborne(c, view.terrain, view.decks)) return false
  return length(sub(c.state.position, self.state.position)) <= DETECTION_RANGE_M
}

export function contactScore<M>(
  self: AircraftEntity<M>, c: AircraftEntity<M>, view: TargetingView<M>, opts: TargetingOptions<M>,
): number {
  const toSelf = sub(self.state.position, c.state.position)
  const rangeM = length(toSelf)
  let score = -rangeM
  if (hasGunSolution(c, self)) score += THREAT_BONUS_M
  if (opts.leaderId !== null) {
    const leader = view.snapshot.find((a) => a.id === opts.leaderId)
    if (leader !== undefined && hasGunSolution(c, leader)) score += LEADER_THREAT_BONUS_M
  }
  const speed = length(c.state.velocity)
  // No velocity or a coincident position carries no tail information: half
  // the bonus, the value for a contact flying across.
  const tailFraction = speed < 1e-6 || rangeM < 1e-6
    ? 0.5
    : Math.acos(Math.min(1, Math.max(-1, dot(c.state.velocity, toSelf) / (speed * rangeM)))) / Math.PI
  score += TAIL_BONUS_M * tailFraction
  for (const f of view.snapshot) {
    // A downed friendly keeps its last targetId; it engages nothing.
    if (f.id === self.id || f.pilot == null || f.pilot.decision.targetId !== c.id || isAircraftDown(view.combat, f)) continue
    if (sameSide(view.sides, self.id, f.id)) score -= ENGAGED_PENALTY_M
  }
  if (c.id === opts.current) score += STICKY_BONUS_M
  return score
}

/** The best contact's id, or `null` when there is none. Ties break by id. */
export function selectTarget<M>(self: AircraftEntity<M>, view: TargetingView<M>, opts: TargetingOptions<M>): string | null {
  let best: string | null = null
  let bestScore = -Infinity
  for (const c of view.snapshot) {
    if (!isContact(self, c, view)) continue
    if (opts.accept !== undefined && !opts.accept(c, length(sub(c.state.position, self.state.position)))) continue
    const score = contactScore(self, c, view, opts)
    if (score > bestScore || (score === bestScore && best !== null && c.id < best)) {
      best = c.id
      bestScore = score
    }
  }
  return best
}
