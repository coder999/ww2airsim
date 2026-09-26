import type { AircraftEntity, ShipEntity } from '../loop.js'
import type { CombatState } from '../weapons/combat.js'
import { isAircraftDown } from '../weapons/combat.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import { length, sub, type Vec3 } from '../math/vec3.js'
import type { Side } from '../sides.js'
import { controlsForDesiredVelocity } from './controller.js'
import { deriveFacts, decideManeuver, maneuverControls } from './decision.js'
import { friendlyInLineOfFire } from './holdFire.js'
import { ingressAccepts, ingressDesiredVelocity, ingressOrbitControls, ingressThrottle, nextLegIndex } from './ingress.js'
import { loiterDesiredVelocity } from './loiter.js'
import { airframeRepertoire, interruptsLatch, isPhased, latchExpired, maneuverFacts, openLatch, selectManeuver } from './maneuvers.js'
import { DEFAULT_MANEUVER, type PilotDecisionState } from './pilot.js'
import type { PilotAssignment } from './pursuit.js'
import { finishControls, floorTriggerM, heightAboveGround, heightAboveGroundAt, safetyOverride } from './safety.js'
import { selectTarget, type TargetingView } from './targeting.js'

/** What a pilot may read besides the start-of-tick aircraft snapshot. All of
 *  it is the start of the tick too: `combat` is the record `advance` has just
 *  aged, before this tick's `stepCombat`. */
export type PilotTickContext = {
  readonly nowS: number
  readonly terrain: TerrainField | null
  readonly decks: readonly Deck[]
  readonly wind: Vec3 | null
  readonly combat: CombatState
  /** 7e: every aircraft's side (`sidesOf`), built once per tick by `advance`. */
  readonly sides: Readonly<Record<string, Side>>
  /** 7e: this tick's ships, already moved (an ingress destination is read live). */
  readonly ships: readonly ShipEntity[]
}

/** The target a pilot should hold after a choice (7e spec §4.2): a static
 *  target keeps its 7a/7b meaning -- any live aircraft in the snapshot, at
 *  any range (ruling W3) -- and is never replaced; otherwise the scorer picks. */
function chooseTarget<M>(
  a: AircraftEntity<M>, pilot: PilotAssignment, current: string | null, view: TargetingView<M>, nowS: number,
): string | null {
  if (pilot.target !== null) {
    const fixed = view.snapshot.find((c) => c.id === pilot.target)
    return fixed === undefined || isAircraftDown(view.combat, fixed) ? null : fixed.id
  }
  // An ingress pilot fights only what attacks it or comes close (§4.5).
  const accept = pilot.ingress === undefined ? undefined : ingressAccepts(a, view.combat[a.id]!, current, nowS)
  return selectTarget(a, view, accept === undefined ? { current, leaderId: null } : { current, leaderId: null, accept })
}

/**
 * One AI pilot's whole tick (7c spec §2), grown by 7e. Pure. Every pilot
 * reads the same `snapshot`, the start-of-tick array, so reversing the entity
 * array cannot let one pilot see another a tick ahead (entities design §3).
 * Returns `a` itself when there is nothing to fly: no pilot, or an impacted
 * or destroyed self.
 *
 * Each tick, in order (7e):
 * 1. Validity: a target that is down or gone forces a choice NOW (ruling W4).
 * 2. Choice, on rescore or when forced; a changed target clears the latch.
 * 3. With a target, 7b/7c's rescore: intent, perception, named maneuver.
 * 4. Flight: the §3.2 safety override first, then the maneuver, or the
 *    loiter when there is no target.
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
  const view: TargetingView<M> = { snapshot, combat: ctx.combat.aircraft, sides: ctx.sides }
  let decision: PilotDecisionState = pilot.decision
  // A static target is checked from the assignment itself, so a pilot whose
  // decision has not recorded it yet (a hand-built one) still flies it.
  const heldId = pilot.target ?? decision.targetId
  const held = heldId === null ? undefined : snapshot.find((c) => c.id === heldId)
  const lost = heldId !== null && (held === undefined || isAircraftDown(ctx.combat.aircraft, held))
  let target: AircraftEntity<M> | null = lost ? null : (held ?? null)
  if (decision.latch !== null && latchExpired(decision.latch, ctx.nowS)) {
    decision = { ...decision, latch: null, named: DEFAULT_MANEUVER[decision.maneuver] }
  }
  if (lost || ctx.nowS >= decision.nextRescoreS) {
    const chosen = chooseTarget(a, pilot, lost ? null : decision.targetId, view, ctx.nowS)
    if (chosen !== decision.targetId) {
      decision = { ...decision, targetId: chosen, latch: null, named: DEFAULT_MANEUVER[decision.maneuver] }
    }
    decision = { ...decision, mode: chosen !== null ? 'engage' : pilot.ingress !== undefined ? 'ingress' : 'loiter' }
    target = chosen === null ? null : snapshot.find((c) => c.id === chosen)!
    if (target === null) {
      decision = { ...decision, nextRescoreS: ctx.nowS + pilot.skill.reactionS }
    } else {
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
  }
  // 7e spec §4.5: route progress, checked every tick while on the route. An
  // engaged raider keeps its legIndex and resumes there.
  if (target === null && pilot.ingress !== undefined) {
    const legIndex = nextLegIndex(a, pilot.ingress, decision.legIndex, ctx.ships)
    if (legIndex !== decision.legIndex) decision = { ...decision, legIndex }
  }
  // 7c spec §3.2: the envelope is checked every tick, after the rescore, and
  // outranks any maneuver. It never changes the 7b intent (ruling R11).
  // While the intent is Pursue, the floor follows the target, as perceived at
  // the last rescore, down to 50 ft (Mark, 2026-09-26; `floorTriggerM`).
  // Every other intent, and a pilot with no target, keeps FLOOR_M.
  const pursuedHeightM = target !== null && decision.maneuver === 'pursue'
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
  if (target === null) {
    const orders = pilot.ingress
    const base = orders === undefined
      ? controlsForDesiredVelocity(a.state, a.spec, loiterDesiredVelocity(a))
      : decision.legIndex > orders.route.length
        ? ingressOrbitControls(a, orders, decision.legIndex, ctx.ships)
        : {
            ...controlsForDesiredVelocity(a.state, a.spec, ingressDesiredVelocity(a, orders, decision.legIndex, ctx.ships)),
            throttle: ingressThrottle(a, orders, decision.legIndex, ctx.ships),
          }
    const { controls, cursor } = finishControls(a, base, pilot.skill.controlNoise, decision.noiseCursor, ctx.wind)
    return { ...a, pilot: { ...pilot, decision: { ...decision, safety: 'none', latch: null, noiseCursor: cursor } }, controls }
  }
  const { controls, decision: steered } = maneuverControls(a, target, { ...decision, safety: 'none' }, pilot.skill, ctx.wind, ctx.nowS)
  // 7e spec §4.3: hold fire while a friendly is in the line of fire. Against
  // the live range to the target, like the friendlies' own positions.
  const holdFire = controls.fire === true && friendlyInLineOfFire(a, length(sub(target.state.position, a.state.position)), view)
  return { ...a, pilot: { ...pilot, decision: steered }, controls: holdFire ? { ...controls, fire: false } : controls }
}
