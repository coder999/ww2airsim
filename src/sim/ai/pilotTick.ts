import type { AircraftEntity } from '../loop.js'
import type { CombatState } from '../weapons/combat.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import type { Vec3 } from '../math/vec3.js'
import { deriveFacts, decideManeuver, maneuverControls } from './decision.js'

/** What a pilot may read besides the start-of-tick aircraft snapshot. All of
 *  it is the start of the tick too: `combat` is the record `advance` has just
 *  aged, before this tick's `stepCombat`. */
export type PilotTickContext = {
  readonly nowS: number
  readonly terrain: TerrainField | null
  readonly decks: readonly Deck[]
  readonly wind: Vec3 | null
  readonly combat: CombatState
}

/**
 * One AI pilot's whole tick (7c spec §2): moved verbatim out of `advance()`
 * so the later AI plans (7e, 7f, 7g) grow this file instead of `loop.ts`.
 * Pure. Every pilot reads the same `snapshot`, the start-of-tick array, so
 * reversing the entity array cannot let one pilot see another a tick ahead
 * (entities design §3). Returns `a` itself when there is nothing to fly: no
 * pilot, an impacted or destroyed self, or a target missing from the
 * snapshot (`createWorldOf` rejects the last; the guard keeps a hand-edited
 * world finite instead of fabricating a target).
 */
export function pilotTick<M>(
  a: AircraftEntity<M>,
  snapshot: readonly AircraftEntity<M>[],
  ctx: PilotTickContext,
): AircraftEntity<M> {
  const pilot = a.pilot
  if (pilot == null || a.impact !== null) return a
  const record = ctx.combat.aircraft[a.id]!
  if (record.damage.destroyedAt !== null) return a
  const target = snapshot.find((candidate) => candidate.id === pilot.target)
  if (target === undefined) return a
  let decision = pilot.decision
  if (ctx.nowS >= decision.nextRescoreS) {
    const facts = deriveFacts(a, target, 1 - record.damage.structure, a.state.fuelKg / a.spec.mass.fuelCapacityKg)
    decision = {
      ...decision,
      maneuver: decideManeuver(facts, pilot.skill),
      nextRescoreS: ctx.nowS + pilot.skill.reactionS,
      observedTargetPosition: target.state.position,
      observedTargetVelocity: target.state.velocity,
    }
  }
  const { controls, decision: steered } = maneuverControls(a, target, decision, pilot.skill)
  return { ...a, pilot: { ...pilot, decision: steered }, controls }
}
