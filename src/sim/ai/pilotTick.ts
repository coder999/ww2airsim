import type { AircraftEntity } from '../loop.js'
import type { CombatState } from '../weapons/combat.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import type { Vec3 } from '../math/vec3.js'
import { deriveFacts, decideManeuver, maneuverControls } from './decision.js'
import { airframeRepertoire, interruptsLatch, isPhased, latchExpired, maneuverFacts, openLatch, selectManeuver } from './maneuvers.js'
import { DEFAULT_MANEUVER } from './pilot.js'
import { finishControls, floorTriggerM, heightAboveGround, heightAboveGroundAt, safetyOverride } from './safety.js'

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
  if (decision.latch !== null && latchExpired(decision.latch, ctx.nowS)) {
    decision = { ...decision, latch: null, named: DEFAULT_MANEUVER[decision.maneuver] }
  }
  if (ctx.nowS >= decision.nextRescoreS) {
    const facts = deriveFacts(a, target, 1 - record.damage.structure, a.state.fuelKg / a.spec.mass.fuelCapacityKg)
    const intent = decideManeuver(facts, pilot.skill)
    decision = {
      ...decision,
      nextRescoreS: ctx.nowS + pilot.skill.reactionS,
      observedTargetPosition: target.state.position,
      observedTargetVelocity: target.state.velocity,
    }
    // A latched maneuver holds through the rescore: perception still
    // refreshes (7d), the choice does not (spec §3.5).
    if (decision.latch === null || interruptsLatch(decision.latch, intent, facts)) {
      // The airframe's content may exclude maneuvers (7c Task 14): the Zero
      // does not fly the Immelmann, whatever the pilot's skill.
      const named = selectManeuver(
        maneuverFacts(a, target, facts, intent, heightAboveGround(a.state, ctx.terrain, ctx.decks)), airframeRepertoire(pilot.skill, a.spec),
      )
      decision = { ...decision, maneuver: intent, named, latch: isPhased(named) ? openLatch(named, a, ctx.nowS) : null }
    }
  }
  // 7c spec §3.2: the envelope is checked every tick, after the rescore, and
  // outranks any maneuver. It never changes the 7b intent (ruling R11).
  // While the intent is Pursue, the floor follows the target, as perceived at
  // the last rescore, down to 50 ft (Mark, 2026-09-26; `floorTriggerM`).
  // Every other intent keeps FLOOR_M.
  const pursuedHeightM = decision.maneuver === 'pursue'
    ? heightAboveGroundAt(decision.observedTargetPosition, ctx.terrain, ctx.decks) : null
  const override = safetyOverride(a, ctx.terrain, ctx.decks, ctx.wind, floorTriggerM(pursuedHeightM))
  if (override !== null) {
    const { controls, cursor } = finishControls(a, override.controls, pilot.skill.controlNoise, decision.noiseCursor, ctx.wind)
    return {
      ...a,
      pilot: {
        ...pilot,
        decision: {
          ...decision, safety: override.mode, noiseCursor: cursor,
          latch: null, named: DEFAULT_MANEUVER[decision.maneuver],
        },
      },
      controls,
    }
  }
  const { controls, decision: steered } = maneuverControls(a, target, { ...decision, safety: 'none' }, pilot.skill, ctx.wind, ctx.nowS)
  return { ...a, pilot: { ...pilot, decision: steered }, controls }
}
