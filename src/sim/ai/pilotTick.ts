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
import { ingressAccepts, ingressBayDoorsOpen, ingressDesiredVelocity, ingressOrbitControls, ingressThrottle, nextLegIndex } from './ingress.js'
import { loiterDesiredVelocity, loiterReference } from './loiter.js'
import { airframeRepertoire, interruptsLatch, isPhased, latchExpired, maneuverFacts, openLatch, selectManeuver } from './maneuvers.js'
import { aimErrorDraw } from './noise.js'
import { DEFAULT_MANEUVER, type PilotDecisionState } from './pilot.js'
import type { PilotAssignment } from './pursuit.js'
import { airborne } from './airborne.js'
import { COVER_LATCH_S, formationControls, leaderIsFighting, leaderlessPilot, wingmanAccepts } from './formation.js'
import { finishControls, floorTriggerM, heightAboveGround, heightAboveGroundAt, safetyOverride } from './safety.js'
import { isContact, selectTarget, type TargetingView } from './targeting.js'
import { exemptFromFloor, peelOffRecovery, recoveryControls, recoveryGeometry, shouldReturn, startRecovery, threatAstern, withoutHome, withoutRecovery } from './recovery.js'
import { takeoffControls } from './takeoff.js'

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
  leader: AircraftEntity<M> | null,
): string | null {
  if (pilot.target !== null) {
    const fixed = view.snapshot.find((c) => c.id === pilot.target)
    return fixed === undefined || isAircraftDown(view.combat, fixed) ? null : fixed.id
  }
  // 7f spec §4: a wingman fights what threatens its leader or itself, and
  // passes the leader so 7e's LEADER_THREAT_BONUS_M applies.
  if (leader !== null) {
    return selectTarget(a, view, { current, leaderId: leader.id, accept: wingmanAccepts(a, leader, view.combat[a.id]!, current, nowS) })
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
 * 4. Flight: the §3.2 safety override first, then the maneuver, or, for a
 *    wingman with no target, its station (7f); or the loiter when there is
 *    no target.
 */
export function pilotTick<M>(
  a: AircraftEntity<M>,
  snapshot: readonly AircraftEntity<M>[],
  ctx: PilotTickContext,
): AircraftEntity<M> {
  const flown = flyPilot(a, snapshot, ctx)
  // C2: a raider with bay doors works them by range to its destination, whatever it is flying.
  const orders = flown.pilot?.ingress
  if (flown === a || orders === undefined || a.spec.bayDoors === undefined) return flown
  return { ...flown, controls: { ...flown.controls, bayDoorsOpen: ingressBayDoorsOpen(flown, orders, ctx.ships) } }
}

function flyPilot<M>(
  a: AircraftEntity<M>,
  snapshot: readonly AircraftEntity<M>[],
  ctx: PilotTickContext,
): AircraftEntity<M> {
  let pilot = a.pilot
  if (pilot == null || a.impact !== null) return a
  const record = ctx.combat.aircraft[a.id]!
  if (record.damage.destroyedAt !== null) return a
  // 7g spec §3: `landed` is terminal and short-circuits before the rescore:
  // no target choice, no safety override, no noise. The recovery holds it on
  // the brakes and, once, respots it (`state`, and `previous` with it, so the
  // renderer does not interpolate across the move).
  if (pilot.decision.mode === 'landed' && pilot.home !== undefined && pilot.decision.recovery !== undefined) {
    const flown = recoveryControls(a, pilot, ctx, snapshot)
    const landed = { ...pilot, decision: { ...pilot.decision, recovery: flown.recovery, safety: 'none' as const, latch: null } }
    if (flown.state !== undefined) return { ...a, state: flown.state, previous: flown.state, controls: flown.controls, pilot: landed }
    return { ...a, controls: flown.controls, pilot: landed }
  }
  // 7h: a takeoff is flown before any rescore: no target, no fire, no
  // floor, no safety override. `wait` holds on the brakes until there is
  // terrain and the runway is clear (`takeoffClear`, id order).
  if (pilot.decision.mode === 'takeoff' && pilot.decision.takeoff !== undefined) {
    const flown = takeoffControls(a, pilot.decision.takeoff, ctx, snapshot)
    if (flown.takeoff !== null) {
      // Noise only in the climb: a rolling tailwheel does not want jitter.
      const noisy = flown.takeoff.phase === 'climb'
        ? finishControls(a, flown.controls, pilot.skill.controlNoise, pilot.decision.noiseCursor, ctx.wind)
        : { controls: flown.controls, cursor: pilot.decision.noiseCursor }
      return {
        ...a, controls: noisy.controls,
        pilot: { ...pilot, decision: { ...pilot.decision, takeoff: flown.takeoff, safety: 'none', latch: null, noiseCursor: noisy.cursor } },
      }
    }
    // Climb done: an ordinary pilot from this tick. `engage` is a placeholder
    // the forced rescore below replaces (engage, ingress or loiter), so the
    // hand-off tick already flies the ordinary pilot's controls.
    const handed: { -readonly [K in keyof PilotDecisionState]: PilotDecisionState[K] } = { ...pilot.decision, mode: 'engage', nextRescoreS: 0 }
    delete handed.takeoff
    pilot = { ...pilot, decision: handed }
  }
  const view: TargetingView<M> = { snapshot, combat: ctx.combat.aircraft, sides: ctx.sides, terrain: ctx.terrain, decks: ctx.decks }
  // 7f spec §3-4: a wingman's leader, from the start-of-tick snapshot. A
  // down or missing leader hands the wingman its own orders (spec §4).
  let leader: AircraftEntity<M> | null = null
  if (pilot.formation !== undefined) {
    const l = snapshot.find((c) => c.id === pilot!.formation!.leader)
    if (l === undefined || isAircraftDown(ctx.combat.aircraft, l)) pilot = leaderlessPilot(pilot, l, ctx.nowS)
    else leader = l
  }
  // A leader still on its deck or runway is loitered on, not formed on (spec §4).
  const leaderFlying = leader !== null && airborne(leader, ctx.terrain, ctx.decks)
  let decision: PilotDecisionState = pilot.decision
  // 7f spec §4: trail cover holds COVER_LATCH_S past the leader's last shot or engagement.
  if (leader !== null && leaderIsFighting(leader)) decision = { ...decision, coverUntilS: ctx.nowS + COVER_LATCH_S }
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
    const scored = chooseTarget(a, pilot, lost ? null : decision.targetId, view, ctx.nowS, leader)
    // 7g spec §1, §6: the return-to-base decision, for a pilot with a home
    // only (ruling P3: nothing else is written for one without, so every
    // pre-7g world is bit-identical). RTB pre-empts engage unless a threat is
    // astern AND there is something to engage: a threat the orders reject
    // (`chooseTarget` null) would otherwise drop the pilot out of `rtb` into
    // flying away from both it and home. `landed` is terminal.
    let rtb = false
    // 7c-7g §6, "Wingmen go home in formation with their leader": while the
    // leader's recovery is in `transit`, the wingman keeps station (`follow`)
    // rather than going home by itself; once the leader is past `transit`,
    // it peels off into its own recovery (`peelOff`) if it has a home and
    // otherwise loiters (`part`). A threat astern pre-empts both, as it does
    // RTB. A wingman already recovering flies its own recovery. Worlds with
    // no home anywhere never get here: a leader cannot be in `rtb` without one.
    const recovering = decision.mode === 'rtb' || decision.mode === 'landed'
    const leaderMode = leader?.pilot?.decision.mode
    const leaderHomeward = !recovering && (leaderMode === 'rtb' || leaderMode === 'landed')
    const leaderInTransit = leaderHomeward && leaderMode === 'rtb' && leader!.pilot!.decision.recovery?.phase === 'transit'
    const threatened = (): boolean => scored !== null && threatAstern(a, view)
    let follow = false
    let peelOff = false
    let part = false
    if (pilot.home !== undefined) {
      // Ruling P10: the idle clock starts at the pilot's first rescore, not
      // at 0, so a pilot spawned by a trigger at t = 600 s does not go home
      // on its first tick.
      if (decision.lastContactS === undefined || snapshot.some((c) => isContact(a, c, view))) {
        decision = { ...decision, lastContactS: ctx.nowS }
      }
    }
    if (leaderHomeward) {
      if (!threatened()) {
        if (leaderInTransit) follow = true
        else if (pilot.home !== undefined) rtb = peelOff = true
        else part = true
      }
    } else if (pilot.home !== undefined) {
      // A wingman with a flying leader ignores the idle trigger (it goes home with the leader, or once it is lost, P20); fuel, ammo and damage still send it home alone.
      const goHome = !recovering && shouldReturn(a, record, decision, ctx.nowS, !(leader !== null && leaderFlying))
      // On the wheels, or committed by the cut, a threat no longer pre-empts: gear up on the ground crashes.
      const phase = decision.recovery?.phase
      const committed = recovering && (phase === 'rollout' || (phase === 'final' && decision.recovery!.cut))
      rtb = decision.mode === 'landed' || ((recovering || goHome) && (committed || !threatened()))
    }
    const chosen = rtb || follow || part ? null : scored
    if (chosen !== decision.targetId) {
      decision = { ...decision, targetId: chosen, latch: null, named: DEFAULT_MANEUVER[decision.maneuver] }
    }
    const mode = decision.mode === 'landed' ? 'landed'
      : rtb ? 'rtb'
      : chosen !== null ? 'engage'
      : part ? 'loiter'
      : leader !== null && leaderFlying ? 'formation'
      : pilot.ingress !== undefined ? 'ingress' : 'loiter'
    if (mode === 'rtb' && decision.mode !== 'rtb') {
      const recovery = peelOff ? peelOffRecovery(a, pilot.home!, ctx) : startRecovery(ctx.nowS)
      decision = { ...decision, recovery, latch: null, named: DEFAULT_MANEUVER[decision.maneuver] }
    } else if (mode !== 'rtb' && mode !== 'landed' && decision.recovery !== undefined) {
      // Review Focus 4: pre-empted by a threat astern, the recovery restarts
      // at `transit` when it resumes, never mid-approach.
      decision = withoutRecovery(decision)
    }
    decision = {
      ...decision, mode,
      // Latched on entering a loiter, so it holds what it had, not a drift.
      loiter: mode !== 'loiter' ? null : decision.loiter ?? loiterReference(a),
    }
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
        aimError: aimErrorDraw(decision.noiseCursor, pilot.skill.aimErrorRad),
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
  // A recovering pilot flies no target between rescores either (a static
  // `pilot.target` would otherwise be re-read as held above).
  if (decision.mode === 'rtb' || decision.mode === 'landed') target = null
  // 7e spec §4.5: route progress, checked every tick while on the route. An
  // engaged raider keeps its legIndex and resumes there.
  if (target === null && pilot.ingress !== undefined && decision.mode !== 'rtb' && decision.mode !== 'landed') {
    const legIndex = nextLegIndex(a, pilot.ingress, decision.legIndex, ctx.ships)
    if (legIndex !== decision.legIndex) decision = { ...decision, legIndex }
  }
  // 7g Review Focus 5: a home ship that is gone, sunk or deckless drops the
  // home, and the pilot loiters from here rather than throwing.
  if ((decision.mode === 'rtb' || decision.mode === 'landed') && pilot.home!.kind === 'ship' && recoveryGeometry(pilot.home!, ctx) === null) {
    pilot = withoutHome(pilot)
    decision = { ...withoutRecovery(decision), mode: 'loiter', loiter: loiterReference(a) }
  }
  // 7c spec §3.2: the envelope is checked every tick, after the rescore, and
  // outranks any maneuver. It never changes the 7b intent (ruling R11).
  // While the intent is Pursue, the floor follows the target, as perceived at
  // the last rescore, down to 50 ft (Mark, 2026-09-26; `floorTriggerM`).
  // Every other intent, and a pilot with no target, keeps FLOOR_M.
  const pursuedHeightM = target !== null && decision.maneuver === 'pursue'
    ? heightAboveGroundAt(decision.observedTargetPosition, ctx.terrain, ctx.decks) : null
  // 7g spec §6: past `hold`, the whole approach is exempt from the floor
  // (its fix and go-around are below the trigger); overspeed still applies.
  // A -Infinity trigger is one no height or sink rate can reach.
  const flyingRecovery = decision.mode === 'rtb' || decision.mode === 'landed'
  const floorM = flyingRecovery && exemptFromFloor(decision.recovery) ? Number.NEGATIVE_INFINITY : floorTriggerM(pursuedHeightM)
  const override = safetyOverride(a, ctx.terrain, ctx.decks, ctx.wind, floorM)
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
  // 7g: the recovery. `transit` and `hold` keep the floor above (spec §6).
  if (flyingRecovery) {
    const flown = recoveryControls(a, { ...pilot, decision }, ctx, snapshot)
    const { controls, cursor } = finishControls(a, flown.controls, pilot.skill.controlNoise, decision.noiseCursor, ctx.wind)
    const mode = flown.recovery.phase === 'landed' ? 'landed' as const : decision.mode
    const next = { ...decision, mode, recovery: flown.recovery, safety: 'none' as const, latch: null, noiseCursor: cursor }
    return { ...a, ...(flown.state !== undefined ? { state: flown.state } : {}), pilot: { ...pilot, decision: next }, controls }
  }
  // 7f spec §3: on station, by the one law that also rejoins.
  if (target === null && decision.mode === 'formation' && leader !== null && leaderFlying) {
    const base = formationControls(a, leader, pilot.formation!.slot, (decision.coverUntilS ?? 0) > ctx.nowS)
    const { controls, cursor } = finishControls(a, base, pilot.skill.controlNoise, decision.noiseCursor, ctx.wind)
    return { ...a, pilot: { ...pilot, decision: { ...decision, safety: 'none', latch: null, noiseCursor: cursor } }, controls }
  }
  if (target === null) {
    const orders = pilot.ingress
    const base = orders === undefined
      ? controlsForDesiredVelocity(a.state, a.spec, loiterDesiredVelocity(a, decision.loiter ?? loiterReference(a)))
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
