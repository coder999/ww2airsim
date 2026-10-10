import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { bayDoorsShut } from '../bayDoors.js'
import { length, v3, type Vec3 } from '../math/vec3.js'
import { groundUnder } from '../world/ground.js'
import { SEA_LEVEL_M } from '../world/terrain.js'
import { storeTypeOf } from '../weapons/combat.js'
import { predictImpact } from '../weapons/impactPrediction.js'
import { controlsForDesiredVelocity } from './controller.js'
import { goalDesiredVelocity, goalThrottle, liftTowardControls } from './ingress.js'
import { loiterDesiredVelocity, loiterReference } from './loiter.js'
import { controlsForLiftVector } from './liftVector.js'
import { aimErrorDraw } from './noise.js'
import type { AttackKind, AttackState, IngressOrders, PilotDecisionState } from './pilot.js'
import type { PilotTickContext } from './pilotTick.js'
import { heightAboveGround, heightAboveGroundAt, loadFactorBudget } from './safety.js'

/**
 * The attack run (E2, 2026-10-10): what a raider does on arrival when its ingress orders say
 * `attack`, instead of the orbit. A phase machine per kind, each phase a small steering law on the
 * flight controllers every AI already uses; `pilotTick` calls `attackFlight` where the orbit was.
 *
 *   dive-bomb   approach -> dive -> pullout -> egress -> (approach again while a bomb is left | done)
 *   torpedo     approach -> run  -> egress -> (approach again while a torpedo is left | done)
 *   level-bomb  approach -> run  -> egress -> (approach again while a bomb is left | done)
 *   kamikaze    approach -> dive, never out of it: a fast shallow dive at the hull, the bomb let go at point-blank
 *               range, and on into the ship. The sim has no aircraft-into-ship collision, so the blow is the airplane's
 *               own bomb and the airplane ends in the sea beside the hull (ruling R5; the collision itself is open).
 *
 * The pilot errs like any gunner (E1): a sight error drawn once per run, an angle that grows with
 * range, and a delay before he presses the pickle. Both come from his reaction time, so a green
 * pilot is the worse bomber without a new skill field. Every number below is an ESTIMATE,
 * calibrated by `tests/sim/ai/attackHarness.ts` (docs/handoff/2026-10-10-e2-attack-ai.md).
 */

const G = 9.80665
const rad = (deg: number): number => (deg * Math.PI) / 180
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** Dive-bombing. */
export const DIVE_ANGLE_RAD = rad(60)
/** The line of sight steers the dive within this band of angles. */
export const DIVE_MIN_ANGLE_RAD = rad(45)
export const DIVE_MAX_ANGLE_RAD = rad(70)
/** The dive starts no lower than this above the target; below it the bomber keeps climbing on the approach. */
export const MIN_DIVE_HEIGHT_M = 900
/** The approach altitude over the target when the route's own is lower (m above the target). */
export const DIVE_ENTRY_ABOVE_TARGET_M = 1800
/** The roll-in leads the ideal point by this, the pitch-over's ground distance (m). */
export const ROLL_IN_ALLOWANCE_M = 800
/** The dive is flown at this fraction of the never-exceed dive speed. */
export const DIVE_SPEED_FRACTION = 0.8
/** The release height above the target, m: the veteran's, and the green's extra. A pilot who is slow
 *  to react also lets go higher, out of caution (he cannot afford the extra second). */
export const RELEASE_HEIGHT_M = 560
export const RELEASE_HEIGHT_GREEN_EXTRA_M = 240
/** The pipper trim, per tick: the predicted miss along the track, in radians seen from the airplane, walked into the dive angle. */
export const PIPPER_TRIM_PER_TICK = 0.03
export const PIPPER_TRIM_MAX_RAD = rad(25)
/** A release needs the predicted impact this close to the aim, along the track (m). */
export const RELEASE_TOLERANCE_M = 40
/** The pull-out holds this fraction of the load-factor budget (`safety.ts`). */
export const PULLOUT_LOAD_FRACTION = 0.85
/** The pull-out starts when the height still to lose, plus this, is all the height left (m). */
export const PULLOUT_MARGIN_M = 100

/** Torpedo runs. */
/** The run's height above the sea: a veteran's, plus more for each unit of stick noise (a shaky hand flies higher). */
export const RUN_HEIGHT_M = 45
export const RUN_HEIGHT_PER_NOISE_M = 150
/** Never lower than this above the ground the run is flying over, whatever the plan. */
export const RUN_FLOOR_M = 22
/** The run's descent rate from the approach altitude, m/s (it descends faster when the raid arrives close, up to the max),
 *  the straight level run-in it wants before the drop (m), and its look-ahead for high ground, s. */
export const RUN_DESCENT_MPS = 15
export const RUN_DESCENT_MAX_MPS = 30
export const RUN_LEVEL_RUN_IN_M = 2500
export const RUN_LOOKAHEAD_S = 3
/** The run's speed is held under the drop envelope's by this fraction. */
export const RUN_SPEED_FRACTION = 0.85
/** The torpedo's run before it meets the hull (m): the content's run range times this, clamped. */
export const STANDOFF_FRACTION = 0.4
export const STANDOFF_MIN_AFTER_ARM_M = 250
export const STANDOFF_MAX_M = 900
/** Release is refused above this fraction of the envelope's height and speed. */
export const ENVELOPE_RELEASE_FRACTION = 0.9
export const ENVELOPE_RELEASE_SPEED_FRACTION = 0.97
/** The nose must be this close to the aimed track to release (rad). */
export const TORPEDO_ALIGN_RAD = rad(4)

/** Level bombing. */
export const LEVEL_RUN_IN_M = 4000

/** Kamikaze. */
export const KAMIKAZE_DIVE_MIN_RAD = rad(15)
export const KAMIKAZE_DIVE_MAX_RAD = rad(50)
/** The dive starts from at least this height over the target, and rolls in on a 30 degree line. */
export const KAMIKAZE_MIN_HEIGHT_M = 400
export const KAMIKAZE_ENTRY_ABOVE_TARGET_M = 1200
export const KAMIKAZE_DIVE_RAD = rad(30)
export const KAMIKAZE_ROLL_IN_ALLOWANCE_M = 600
export const KAMIKAZE_SPEED_FRACTION = 0.9
/** The bomb is let go inside this horizontal range of the hull, m. */
export const KAMIKAZE_RELEASE_RANGE_M = 150

/** Every kind: the egress runs this far from the target before the next pass (or the end). */
export const EGRESS_RANGE_M = 4000
export const EGRESS_MAX_S = 90

/** The sight error and the delay, per second of the pilot's reaction time (E1's skill, reused). A torpedo is launched
 *  from a mile off at a long target, so its sight is the worse (the same miss in radians counts for less against it). */
export const SIGHT_ERROR_RAD_PER_REACTION_S: Readonly<Record<AttackKind, number>> = { 'dive-bomb': 0.02, 'level-bomb': 0.02, torpedo: 0.04, kamikaze: 0.02 }
export const LATE_FRACTION = 0.5

/** What an attack run flies at: a ship (read live, moving) or a ground point. */
export type AttackTarget = { readonly x: number; readonly y: number; readonly z: number; readonly vx: number; readonly vz: number }

/** The attack target, or null when there is none to attack: a destination that is gone, sunk, or
 *  on the attacker's own side (ruling R2). */
export function attackTarget<M>(self: AircraftEntity<M>, orders: IngressOrders, ctx: PilotTickContext): AttackTarget | null {
  const d = orders.destination
  if (d === null) return null
  const mySide = ctx.sides[self.id]
  if (d.kind === 'point') {
    if (d.side !== undefined && d.side === mySide) return null
    return { x: d.x, y: groundUnder(ctx.terrain, [], d.x, d.z)?.heightM ?? SEA_LEVEL_M, z: d.z, vx: 0, vz: 0 }
  }
  const ship = ctx.ships.find((s) => s.id === d.id)
  if (ship === undefined) return null
  const hurt = ctx.combat.ships[ship.id]
  if (hurt !== undefined && hurt.destroyedTick !== null) return null
  if ((ship.side ?? 'axis') === mySide) return null
  const h = ship.state.headingRad, s = ship.state.speedMps
  return { x: ship.state.position.x, y: SEA_LEVEL_M + ship.spec.deckHeightM / 2, z: ship.state.position.z, vx: s * Math.sin(h), vz: -s * Math.cos(h) }
}

/** What an attack tick decided: this tick's controls and the run's next state. */
export type AttackFlight = { readonly controls: Controls; readonly attack: AttackState }

const COMMITTED: ReadonlySet<string> = new Set(['dive', 'pullout', 'run'])
/** A committed run is not pre-empted by a fighter (ruling R3: defensive fire is E3). */
export const attackCommitted = (s: AttackState | undefined): boolean => s !== undefined && COMMITTED.has(s.phase)

/** The generic floor is off while the run owns its own pull-out: a dive and its pull-out, and a
 *  low torpedo run. (`attackFlight` carries the backstop; the overspeed guard still applies.) */
export function attackExemptFromFloor(kind: AttackKind | undefined, s: AttackState | undefined): boolean {
  if (s === undefined) return false
  return s.phase === 'pullout' || (s.phase === 'dive') || (kind === 'torpedo' && s.phase === 'run')
}

function newRun(a: Pick<AircraftEntity, 'pilot'>, kind: AttackKind, decision: PilotDecisionState, nowS: number, runs: number): AttackState {
  const skill = a.pilot!.skill
  const cursor = (decision.noiseCursor + Math.imul(runs, 0x9e3779b1)) >>> 0
  const sight = aimErrorDraw(cursor, SIGHT_ERROR_RAD_PER_REACTION_S[kind] * skill.reactionS)
  const late = aimErrorDraw((cursor ^ 0x1b873593) >>> 0, 1)
  return {
    phase: 'approach', sinceS: nowS, runs, sight,
    lateS: LATE_FRACTION * skill.reactionS * Math.min(1, Math.abs(late.right)),
    armedSinceS: null, egressHeadingRad: 0, trimRad: 0,
  }
}

const enter = (s: AttackState, phase: AttackState['phase'], nowS: number, extra: Partial<AttackState> = {}): AttackState =>
  ({ ...s, phase, sinceS: nowS, armedSinceS: null, ...extra })

/** The pilot's sight offset at slant range `slantM` along a horizontal line of sight `los` (unit):
 *  across it by the right error, and along it by the up error (long or short of the aim). */
function sightOffset(s: AttackState, slantM: number, los: { x: number; z: number }): { across: Vec3; along: Vec3 } {
  return {
    across: v3(-los.z * slantM * s.sight.right, 0, los.x * slantM * s.sight.right),
    along: v3(los.x * slantM * s.sight.up, 0, los.z * slantM * s.sight.up),
  }
}

/** Climb or descend toward `altitudeM` while moving along (dx, dz) at `speedMps`. */
function levelVelocity(self: AircraftEntity<unknown>, dx: number, dz: number, speedMps: number, altitudeM: number, vyMin: number, vyMax: number): Vec3 {
  const vy = clamp(0.3 * (altitudeM - self.state.position.y), vyMin, vyMax)
  const h = Math.sqrt(Math.max(0, speedMps * speedMps - vy * vy))
  const len = Math.hypot(dx, dz) || 1
  return v3((dx / len) * h, vy, (dz / len) * h)
}

/**
 * One attack tick for an ingress pilot standing at its destination leg. Null when the orders do not
 * apply (no `attack`, no target to attack, nothing to drop, or a kind not flown yet): the caller
 * then flies the orbit, exactly as before E2.
 */
export function attackFlight<M>(
  a: AircraftEntity<M>, orders: IngressOrders, decision: PilotDecisionState, ctx: PilotTickContext,
): AttackFlight | null {
  const kind = orders.attack
  if (kind === undefined) return null
  const target = attackTarget(a, orders, ctx)
  if (target === null) return null
  const rec = ctx.combat.aircraft[a.id]
  if (rec === undefined) return null
  const store = storeTypeOf(a.spec, kind === 'torpedo' ? 'torpedo' : 'bomb')
  if (store === null || (kind === 'torpedo') !== (store.kind === 'torpedo')) return null
  let st = decision.attack
  // A kamikaze needs no bomb to dive; the other kinds have nothing to do without one (the orbit, as before E2).
  if (st === undefined && rec.stores.bombs <= 0 && kind !== 'kamikaze') return null
  const nowS = ctx.nowS
  st ??= newRun(a, kind, decision, nowS, 1)

  const p = a.state.position, v = a.state.velocity
  const gs = Math.hypot(v.x, v.z)
  const speed = length(v)
  const cruise = orders.route[orders.route.length - 1]!
  const dxT = target.x - p.x, dzT = target.z - p.z
  const rangeH = Math.hypot(dxT, dzT)
  const los = rangeH < 1e-6 ? { x: 1, z: 0 } : { x: dxT / rangeH, z: dzT / rangeH }
  const closing = dxT * v.x + dzT * v.z > 0
  const heightT = p.y - target.y
  const heightGround = heightAboveGround(a.state, ctx.terrain, ctx.decks)
  const skill = a.pilot!.skill
  const diveVne = a.spec.limits.diveSpeedMps
  const stall = a.spec.reference.stallSpeedMps
  const bombsLeft = rec.stores.bombs

  // The dive follows the nose (the velocity controller); every other phase turns on the lift vector,
  // which never trades its speed for a climb on a long turn (ingress.ts orbit, measured 2026-09-26).
  const dive = (desired: Vec3, throttle: number): Controls => ({ ...controlsForDesiredVelocity(a.state, a.spec, desired), throttle })
  const fly = (desired: Vec3, throttle: number): Controls => liftTowardControls(a, desired, throttle)
  const hold = (): Controls => fly(loiterDesiredVelocity(a, loiterReference(a)), goalThrottle(a, Math.max(speed, 1.3 * stall)))

  if (st.phase === 'done') return { controls: hold(), attack: st }

  // ---------------------------------------------------------------- egress
  if (st.phase === 'egress') {
    const appAlt = Math.max(cruise.altitudeM, kind === 'torpedo' ? 0 : target.y + DIVE_ENTRY_ABOVE_TARGET_M)
    const away = rangeH >= (kind === 'torpedo' ? EGRESS_RANGE_M * 0.75 : EGRESS_RANGE_M)
    const climbed = kind === 'torpedo' || bombsLeft === 0 || p.y >= appAlt - 300
    if ((away && climbed) || nowS - st.sinceS >= EGRESS_MAX_S) {
      const next = bombsLeft > 0 ? newRun(a, kind, decision, nowS, st.runs + 1) : enter(st, 'done', nowS)
      return { controls: hold(), attack: next }
    }
    const h = st.egressHeadingRad
    const desired = levelVelocity(a, Math.cos(h), Math.sin(h), cruise.speedMps, kind === 'torpedo' ? Math.max(cruise.altitudeM, 300) : appAlt, -5, 10)
    return { controls: fly(desired, 1), attack: st }
  }

  const startEgress = (s: AttackState): AttackState => enter(s, 'egress', nowS, { egressHeadingRad: gs < 1 ? 0 : Math.atan2(v.z, v.x) })
  const pullLoad = PULLOUT_LOAD_FRACTION * loadFactorBudget(a.spec)

  // ---------------------------------------------------------------- pullout
  if (st.phase === 'pullout') {
    const pathUp = gs < 1 ? 0 : Math.atan2(v.y, gs)
    if (v.y >= 0 && pathUp > rad(-2)) return { controls: hold(), attack: startEgress(st) }
    return { controls: controlsForLiftVector(a.state, a.spec, v3(0, 1, 0), pullLoad, 1), attack: st }
  }

  // ---------------------------------------------------------------- approach
  if (st.phase === 'approach') {
    if (kind === 'dive-bomb') {
      const alt = Math.max(cruise.altitudeM, target.y + DIVE_ENTRY_ABOVE_TARGET_M)
      if (heightT >= MIN_DIVE_HEIGHT_M && closing && rangeH <= heightT / Math.tan(DIVE_ANGLE_RAD) + ROLL_IN_ALLOWANCE_M) {
        return attackFlight(a, orders, { ...decision, attack: enter(st, 'dive', nowS) }, ctx)
      }
      const goal = { x: target.x, z: target.z, altitudeM: alt, speedMps: cruise.speedMps }
      return { controls: fly(goalDesiredVelocity(a, goal, null), goalThrottle(a, cruise.speedMps)), attack: st }
    }
    if (kind === 'kamikaze') {
      const alt = Math.max(cruise.altitudeM, target.y + KAMIKAZE_ENTRY_ABOVE_TARGET_M)
      if (heightT >= KAMIKAZE_MIN_HEIGHT_M && closing && rangeH <= heightT / Math.tan(KAMIKAZE_DIVE_RAD) + KAMIKAZE_ROLL_IN_ALLOWANCE_M) {
        return attackFlight(a, orders, { ...decision, attack: enter(st, 'dive', nowS) }, ctx)
      }
      const goal = { x: target.x, z: target.z, altitudeM: alt, speedMps: cruise.speedMps }
      return { controls: fly(goalDesiredVelocity(a, goal, null), goalThrottle(a, cruise.speedMps)), attack: st }
    }
    if (kind === 'level-bomb') {
      if (rangeH <= LEVEL_RUN_IN_M && closing) return attackFlight(a, orders, { ...decision, attack: enter(st, 'run', nowS) }, ctx)
      const goal = { x: target.x, z: target.z, altitudeM: cruise.altitudeM, speedMps: cruise.speedMps }
      return { controls: fly(goalDesiredVelocity(a, goal, null), goalThrottle(a, cruise.speedMps)), attack: st }
    }
    // torpedo
    const runH = RUN_HEIGHT_M + RUN_HEIGHT_PER_NOISE_M * skill.controlNoise
    const descentRange = Math.max(0, cruise.altitudeM - runH) / RUN_DESCENT_MPS * cruise.speedMps + 3500
    if (rangeH <= descentRange && closing) return attackFlight(a, orders, { ...decision, attack: enter(st, 'run', nowS) }, ctx)
    const goal = { x: target.x, z: target.z, altitudeM: cruise.altitudeM, speedMps: cruise.speedMps }
    return { controls: fly(goalDesiredVelocity(a, goal, null), goalThrottle(a, cruise.speedMps)), attack: st }
  }

  // ---------------------------------------------------------------- dive
  if (st.phase === 'dive' && kind === 'kamikaze') {
    // Straight at the hull, led for its motion; no sight error to speak of at this range, no trim, no pull-out.
    const slant = Math.hypot(rangeH, heightT)
    const tHit = slant / Math.max(speed, 60)
    const aimX = target.x + target.vx * tHit, aimZ = target.z + target.vz * tHit
    const dh = Math.hypot(aimX - p.x, aimZ - p.z) || 1
    const want = KAMIKAZE_SPEED_FRACTION * diveVne
    const g = clamp(Math.atan2(p.y - target.y, dh), KAMIKAZE_DIVE_MIN_RAD, KAMIKAZE_DIVE_MAX_RAD)
    const desired = v3(((aimX - p.x) / dh) * Math.cos(g) * want, -Math.sin(g) * want, ((aimZ - p.z) / dh) * Math.cos(g) * want)
    const controls = dive(desired, speed > 0.85 * diveVne ? 0 : 1)
    const release = rangeH <= KAMIKAZE_RELEASE_RANGE_M && bombsLeft > 0 && !bayDoorsShut(a.spec, a.state.bayDoorFraction)
    return { controls: release ? { ...controls, dropBomb: true } : controls, attack: st }
  }
  if (st.phase === 'dive') {
    const slant = Math.hypot(rangeH, heightT)
    const off = sightOffset(st, slant, los)
    const releaseH = RELEASE_HEIGHT_M + RELEASE_HEIGHT_GREEN_EXTRA_M * clamp((skill.reactionS - 0.3) / 0.7, 0, 1)
    const impact = predictImpact(a.spec, a.state, rec.stores, ctx.terrain, ctx.wind, ctx.decks)
    // The aim: where the target will be when the bomb lands (the rest of the dive down to the release height,
    // then the bomb's fall), and off by the pilot's sight error.
    const tHit = (impact?.timeS ?? Math.sqrt((2 * Math.max(heightT, 1)) / G)) + Math.max(0, (heightT - releaseH) / Math.max(-v.y, 30))
    const aimX = target.x + target.vx * tHit + off.across.x + off.along.x
    const aimZ = target.z + target.vz * tHit + off.across.z + off.along.z
    // The pipper trim: walk the dive angle until the bomb dropped now would land on the aim.
    let trimRad = st.trimRad
    let along = 0
    if (impact !== null && gs >= 1) {
      const ex = aimX - impact.point.x, ez = aimZ - impact.point.z
      along = -(ex * v.x + ez * v.z) / gs // positive: the bomb would land long
      trimRad = clamp(trimRad + PIPPER_TRIM_PER_TICK * (along / Math.max(slant, 100)), -PIPPER_TRIM_MAX_RAD, PIPPER_TRIM_MAX_RAD)
    }
    const gamma = gs < 1 ? 0 : Math.atan2(-v.y, gs)
    const radius = (speed * speed) / (G * Math.max(0.5, pullLoad - 1))
    const lossM = radius * (1 - Math.cos(Math.max(0, gamma)))
    const abort = heightGround <= lossM + PULLOUT_MARGIN_M
    const sane = closing && gamma > rad(25) && impact !== null
    let armed = st.armedSinceS
    if (armed === null && sane && heightT <= releaseH && Math.abs(along) <= RELEASE_TOLERANCE_M) armed = nowS
    const doors = !bayDoorsShut(a.spec, a.state.bayDoorFraction)
    const release = armed !== null && nowS - armed >= st.lateS && doors && bombsLeft > 0
    // Heading on the aim; the dive angle is the line of sight to it plus the pipper trim, held to a band.
    const dh = Math.hypot(aimX - p.x, aimZ - p.z) || 1
    const want = DIVE_SPEED_FRACTION * diveVne
    const g = clamp(Math.atan2(p.y - target.y, dh) + trimRad, DIVE_MIN_ANGLE_RAD, DIVE_MAX_ANGLE_RAD)
    const desired = v3(((aimX - p.x) / dh) * Math.cos(g) * want, -Math.sin(g) * want, ((aimZ - p.z) / dh) * Math.cos(g) * want)
    const controls = dive(desired, speed > 0.85 * diveVne ? 0 : goalThrottle(a, DIVE_SPEED_FRACTION * diveVne))
    if (release) return { controls: { ...controls, dropBomb: true }, attack: enter(st, 'pullout', nowS) }
    if (abort) return { controls: controlsForLiftVector(a.state, a.spec, v3(0, 1, 0), pullLoad, 1), attack: enter(st, 'pullout', nowS) }
    return { controls, attack: { ...st, trimRad, armedSinceS: armed } }
  }

  // ---------------------------------------------------------------- run (torpedo, level bomb)
  if (kind === 'level-bomb') {
    const slant = Math.hypot(rangeH, heightT)
    const impact = predictImpact(a.spec, a.state, rec.stores, ctx.terrain, ctx.wind, ctx.decks)
    const timeS = impact?.timeS ?? Math.sqrt((2 * Math.max(heightT, 1)) / G)
    const off = sightOffset(st, slant, los)
    const aimX = target.x + target.vx * timeS + off.across.x + off.along.x
    const aimZ = target.z + target.vz * timeS + off.across.z + off.along.z
    const desired = levelVelocity(a, aimX - p.x, aimZ - p.z, cruise.speedMps, cruise.altitudeM, -10, 10)
    const pass = !closing && rangeH < LEVEL_RUN_IN_M
    let armed = st.armedSinceS
    if (impact !== null && gs > 1) {
      const dx = v.x / gs, dz = v.z / gs
      const along = (aimX - impact.point.x) * dx + (aimZ - impact.point.z) * dz
      const across = Math.abs(-(aimX - impact.point.x) * dz + (aimZ - impact.point.z) * dx)
      if (armed === null && along <= 0 && across <= 300) armed = nowS
    }
    const doors = !bayDoorsShut(a.spec, a.state.bayDoorFraction)
    if (armed !== null && nowS - armed >= st.lateS && doors && bombsLeft > 0) {
      return { controls: { ...fly(desired, goalThrottle(a, cruise.speedMps)), dropBomb: true }, attack: startEgress(st) }
    }
    if (pass && armed === null) return { controls: fly(desired, goalThrottle(a, cruise.speedMps)), attack: startEgress(st) }
    return { controls: fly(desired, goalThrottle(a, cruise.speedMps)), attack: armed === st.armedSinceS ? st : { ...st, armedSinceS: armed } }
  }

  // torpedo run
  const type = store
  const vt = type.runSpeedMps ?? 20
  const armM = type.armRunM ?? 0
  const standoff = clamp(STANDOFF_FRACTION * (type.runRangeM ?? 2000), armM + STANDOFF_MIN_AFTER_ARM_M, STANDOFF_MAX_M)
  const seaH = p.y - SEA_LEVEL_M
  const tf = Math.sqrt((2 * Math.max(seaH, 1)) / G)
  const runH = RUN_HEIGHT_M + RUN_HEIGHT_PER_NOISE_M * skill.controlNoise
  const slant = Math.hypot(rangeH, seaH)
  const lookahead = heightAboveGroundAt(v3(p.x + v.x * RUN_LOOKAHEAD_S, p.y, p.z + v.z * RUN_LOOKAHEAD_S), ctx.terrain, ctx.decks)
  const lowAbove = Math.min(heightGround, lookahead)
  const entryM = gs * tf
  const tRelease = Math.max(0, (rangeH - standoff - entryM) / Math.max(gs, 1))
  const tHit = tRelease + tf + standoff / vt
  const off = sightOffset(st, slant, los)
  const aimX = target.x + target.vx * tHit + off.across.x + off.along.x
  const aimZ = target.z + target.vz * tHit + off.across.z + off.along.z
  const maxSpeed = type.maxDropSpeedMps ?? Infinity
  const maxH = type.maxDropHeightM ?? Infinity
  const runSpeed = Math.min(cruise.speedMps, RUN_SPEED_FRACTION * maxSpeed)
  const climbing = lowAbove < RUN_FLOOR_M * 1.6
  const descent = clamp(((p.y - runH) * Math.max(gs, 30)) / Math.max(rangeH - standoff - RUN_LEVEL_RUN_IN_M, 500), 5, RUN_DESCENT_MAX_MPS)
  const desired = levelVelocity(a, aimX - p.x, aimZ - p.z, runSpeed, climbing ? Math.max(runH, p.y - heightGround + RUN_FLOOR_M * 2) : runH, -Math.max(descent, RUN_DESCENT_MPS * 0), 10)
  const throttle = goalThrottle(a, runSpeed)
  const rangeA = Math.hypot(aimX - p.x, aimZ - p.z)
  const toEntry = rangeA - entryM
  const heading = gs < 1 ? 0 : Math.atan2(v.z, v.x)
  const bearing = Math.atan2(aimZ - p.z, aimX - p.x)
  const misaligned = Math.abs(Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading)))
  const legal = seaH <= ENVELOPE_RELEASE_FRACTION * maxH && speed <= ENVELOPE_RELEASE_SPEED_FRACTION * maxSpeed
  const doors = !bayDoorsShut(a.spec, a.state.bayDoorFraction)
  let armed = st.armedSinceS
  if (armed === null && toEntry <= standoff && legal && doors && misaligned <= TORPEDO_ALIGN_RAD && gs > 1) armed = nowS
  if (armed !== null && nowS - armed >= st.lateS && legal && doors && bombsLeft > 0) {
    return { controls: { ...fly(desired, throttle), dropBomb: true }, attack: startEgress(st) }
  }
  // Inside the arming run the torpedo would be a dud: break the pass off and come again.
  if (toEntry < armM + 60) return { controls: fly(desired, throttle), attack: startEgress(st) }
  return { controls: fly(desired, throttle), attack: armed === st.armedSinceS ? st : { ...st, armedSinceS: armed } }
}
