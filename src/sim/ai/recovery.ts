import type { AircraftEntity } from '../loop.js'
import type { AircraftState, Controls } from '../flight/state.js'
import type { AircraftSpec } from '../flight/schema.js'
import { qRotate } from '../math/quat.js'
import { dot, length, scale, sub, v3 } from '../math/vec3.js'
import type { AircraftCombat } from '../weapons/combat.js'
import { deckOf, type Deck } from '../world/deck.js'
import type { PaddlesParams } from '../world/ships.js'
import { heightAt, SEA_LEVEL_M } from '../world/terrain.js'
import { carrierAimPoint } from './approach.js'
import { controlsForDesiredVelocity } from './controller.js'
import { goalDesiredVelocity, goalThrottle, orbitControls, type Goal } from './ingress.js'
import type { PilotDecisionState, RecoveryHome, RecoveryState } from './pilot.js'
import type { PilotTickContext } from './pilotTick.js'
import type { PilotAssignment } from './pursuit.js'
import { isContact, type TargetingView } from './targeting.js'

/**
 * 7g, the recovery (7c-7g design §6 as amended by the 7g spec): the
 * return-to-base decision and the phase machine that flies it. This file owns
 * `PilotDecisionState.recovery`; `pilotTick` owns the mode.
 *
 * Task 5 flies `transit` to the initial point and `hold` there. The later
 * phases (`join` onward) are added by Tasks 6-8.
 */

/** 7c-7g §6 triggers (7g spec §1). */
export const RTB_FUEL_FRACTION = 0.25
export const RTB_STRUCTURE = 0.5
/** Seconds without a hostile contact before a homed pilot goes home. */
export const RTB_IDLE_S = 30
/** The initial point: this far out along the extended centerline... */
export const IP_DISTANCE_M = 8000
/** ...this high above touchdown elevation. */
export const IP_HEIGHT_M = 600
/** Horizontally this close, `transit` has reached the initial point. */
export const IP_ARRIVAL_M = 1000
/** The hold's orbit radius around the initial point, turning left. */
export const HOLD_RADIUS_M = 1500
/** A hostile contact this close in the rear cone pre-empts the recovery (§6). */
export const THREAT_ASTERN_RANGE_M = 1500
export const THREAT_ASTERN_HALF_ANGLE_RAD = Math.PI / 3
/**
 * Transit and hold speed as a fraction of `limits.diveSpeedMps`. The AI's
 * airframe envelope (`envelope.ts`) carries no cruise figure (checked
 * 2026-09-28), and every aircraft spec has a dive limit, so cruise is taken
 * as a fixed fraction of it: 130 m/s on a 216 m/s dive limit.
 */
export const CRUISE_DIVE_FRACTION = 0.6

/**
 * The hold's speed, as the same fraction. Not cruise: at cruise the orbit
 * cannot hold its speed in the turn, the throttle law pins full power, and
 * the excess climbs it. Measured 2026-09-28 (a veteran held at cv-1's IP,
 * target 617 m): at 0.6 it drifted 734 -> 813 m over 210 s, still climbing;
 * at 0.55 it was 664 m after 210 s, still descending; at 0.5 it settled at
 * 645 m within 90 s and stayed there.
 */
export const HOLD_DIVE_FRACTION = 0.5

export const cruiseSpeedMps = (spec: AircraftSpec): number => CRUISE_DIVE_FRACTION * spec.limits.diveSpeedMps

/** What the recovery reads from the pilot's tick context. */
export type RecoveryContext = Pick<PilotTickContext, 'nowS' | 'terrain' | 'ships' | 'combat'>

/** 7c-7g §6 triggers, 7g spec §1. The fuel one is practically dormant:
 *  FUEL_KG_PER_JOULE (flight/model.ts) makes a full load last hours. */
export function shouldReturn<M>(a: AircraftEntity<M>, record: AircraftCombat, decision: PilotDecisionState, nowS: number): boolean {
  if (a.state.fuelKg / a.spec.mass.fuelCapacityKg <= RTB_FUEL_FRACTION) return true
  if (record.guns.length > 0 && record.guns.every((g) => g.ammo <= 0)) return true
  if (record.damage.structure < RTB_STRUCTURE) return true
  return nowS - (decision.lastContactS ?? 0) >= RTB_IDLE_S
}

/** A hostile contact inside THREAT_ASTERN_RANGE_M in my rear cone. */
export function threatAstern<M>(a: AircraftEntity<M>, view: TargetingView<M>): boolean {
  const back = scale(qRotate(a.state.attitude, v3(1, 0, 0)), -1)
  return view.snapshot.some((c) => {
    if (!isContact(a, c, view)) return false
    const to = sub(c.state.position, a.state.position)
    const r = length(to)
    return r > 0 && r <= THREAT_ASTERN_RANGE_M && dot(back, scale(to, 1 / r)) >= Math.cos(THREAT_ASTERN_HALF_ANGLE_RAD)
  })
}

/** Where a recovery aims this tick. Headings are compass (0 = north, -z). */
export type RecoveryGeometry = {
  readonly aimX: number
  readonly aimZ: number
  readonly headingRad: number
  /** Terrain height at the aim (a runway) or the flight deck's height. */
  readonly touchdownM: number
  readonly deck: Deck | null
  readonly paddles: PaddlesParams | null
}

/**
 * The approach geometry for `home`, recomputed every tick (Review Focus 2:
 * a carrier's is read from its live deck). The carrier aim is
 * `carrierApproachProfile`'s. `null` when it cannot be known: a runway while
 * `ctx.terrain` is null (the pilot holds at the IP until terrain arrives,
 * 7c-7g §6), or a home ship that is gone, sunk or deckless (the caller drops
 * `home`, Review Focus 5).
 */
export function recoveryGeometry(home: RecoveryHome, ctx: Pick<RecoveryContext, 'terrain' | 'ships' | 'combat'>): RecoveryGeometry | null {
  if (home.kind === 'runway') {
    if (ctx.terrain === null) return null
    return {
      aimX: home.aimX, aimZ: home.aimZ, headingRad: home.headingRad,
      touchdownM: heightAt(ctx.terrain, home.aimX, home.aimZ), deck: null, paddles: null,
    }
  }
  const ship = ctx.ships.find((s) => s.id === home.id)
  if (ship === undefined) return null
  if ((ctx.combat.ships[home.id]?.destroyedTick ?? null) !== null) return null
  const deck = deckOf(ship)
  if (deck === null) return null
  const aim = carrierAimPoint(deck)
  return { aimX: aim.x, aimZ: aim.z, headingRad: deck.headingRad, touchdownM: deck.center.y, deck, paddles: ship.spec.paddles ?? null }
}

/** A runway's geometry while terrain is absent: sea level at the aim. */
function seaLevelGeometry(home: Extract<RecoveryHome, { kind: 'runway' }>): RecoveryGeometry {
  return { aimX: home.aimX, aimZ: home.aimZ, headingRad: home.headingRad, touchdownM: SEA_LEVEL_M, deck: null, paddles: null }
}

/** A point `distanceM` short of the aim on the extended centerline. */
function onCenterline(geo: RecoveryGeometry, distanceM: number): { x: number; z: number } {
  // The bow (landing direction), compass convention: (sin h, -cos h).
  return { x: geo.aimX - Math.sin(geo.headingRad) * distanceM, z: geo.aimZ + Math.cos(geo.headingRad) * distanceM }
}

/** The initial point: IP_DISTANCE_M short of the aim on the extended centerline. */
export const initialPoint = (geo: RecoveryGeometry): { x: number; z: number } => onCenterline(geo, IP_DISTANCE_M)

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** `decision` with no `recovery` key at all (not `undefined`), so it compares
 *  equal to a decision that never recovered. */
export function withoutRecovery(decision: PilotDecisionState): PilotDecisionState {
  const out: Mutable<PilotDecisionState> = { ...decision }
  delete out.recovery
  return out
}

/** `pilot` with no `home` key: Review Focus 5's drop. */
export function withoutHome(pilot: PilotAssignment): PilotAssignment {
  const out: Mutable<PilotAssignment> = { ...pilot }
  delete out.home
  return out
}

/** A fresh recovery, entered at `transit`. */
export const startRecovery = (nowS: number): RecoveryState =>
  ({ phase: 'transit', sinceS: nowS, cut: false, joinedAtS: null, restAtS: null, respotted: false })

/**
 * One tick of the recovery phase machine: the controls before noise (the
 * caller runs them through `finishControls`) and the next recovery state.
 * `state` is set only on the respot tick (Task 7).
 *
 * - `transit`: straight at the initial point, IP_HEIGHT_M above touchdown,
 *   at cruise, by the ingress route's velocity and throttle laws. The §3.2
 *   safety floor stays on (7g spec §6), so a ridge on the line is a climb.
 * - `hold`: the ingress orbit, left-hand, HOLD_RADIUS_M round the IP, at
 *   HOLD_DIVE_FRACTION of the dive limit.
 */
export function recoveryControls<M>(
  a: AircraftEntity<M>, pilot: PilotAssignment, ctx: RecoveryContext, _snapshot: readonly AircraftEntity<M>[],
): { controls: Controls; recovery: RecoveryState; state?: AircraftState } {
  const home = pilot.home!
  const geo = recoveryGeometry(home, ctx) ?? (home.kind === 'runway' ? seaLevelGeometry(home) : null)
  if (geo === null) throw new Error(`recoveryControls: home ship "${home.kind === 'ship' ? home.id : ''}" is gone; pilotTick drops the home first`)
  let recovery = pilot.decision.recovery ?? startRecovery(ctx.nowS)
  const ip = initialPoint(geo)
  const goal: Goal = { x: ip.x, z: ip.z, altitudeM: geo.touchdownM + IP_HEIGHT_M, speedMps: cruiseSpeedMps(a.spec) }
  const p = a.state.position
  if (recovery.phase === 'transit' && Math.hypot(ip.x - p.x, ip.z - p.z) <= IP_ARRIVAL_M) {
    // Task 6 turns this into `join` when the approach is free.
    recovery = { ...recovery, phase: 'hold', sinceS: ctx.nowS }
  }
  if (recovery.phase === 'transit') {
    const controls = {
      ...controlsForDesiredVelocity(a.state, a.spec, goalDesiredVelocity(a, goal, null)),
      throttle: goalThrottle(a, goal.speedMps),
    }
    return { controls, recovery }
  }
  return { controls: orbitControls(a, { ...goal, speedMps: HOLD_DIVE_FRACTION * a.spec.limits.diveSpeedMps }, HOLD_RADIUS_M), recovery }
}
