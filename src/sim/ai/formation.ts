import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { DT } from '../flight/model.js'
import { qRotate } from '../math/quat.js'
import { add, length, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import type { AircraftCombat } from '../weapons/combat.js'
import { controlsForDesiredVelocity } from './controller.js'
import { RECENT_HIT_S } from './ingress.js'
import type { FormationSlot } from './pilot.js'
import { hasGunSolution, type PilotAssignment } from './pursuit.js'

/**
 * Formation flying (7f spec, 2026-09-27): stations in the leader's heading
 * frame, one station-keeping law that also rejoins, the wingman's engage
 * filter and the leader-lost handoff. Pure. Airframe-agnostic: the only
 * airframe figure read is `reference.stallSpeedMps`.
 */

/** A station, meters, in the leader's heading frame: behind, to the right
 *  (negative is left), above. */
export type Station = { readonly aftM: number; readonly rightM: number; readonly upM: number }

/** Loose cruise stations, a finger-four with the leader (spec §2). Tuning
 *  values. The data carries no chains: slot 2 leads its element only in
 *  the geometry. */
export const STATIONS: Readonly<Record<FormationSlot, Station>> = {
  1: { aftM: 80, rightM: 100, upM: 0 },
  2: { aftM: 80, rightM: -100, upM: 0 },
  3: { aftM: 160, rightM: -200, upM: 0 },
}
/** Trail cover while the leader fights (spec §4, from the 7c design §5). */
export const TRAIL_COVER: Station = { aftM: 500, rightM: 0, upM: 200 }

/* Tuning method for the constants below (Task 3 round 2, 2026-09-27):
 * `.superpowers/7f/r2sweep.sh` sets one constant at a time away from the
 * chosen set and runs `r2measure.ts`, the `formationFlight.test.ts`
 * scenarios with the leader at 110 m/s. Figures read: straight-and-level
 * RMS for slots 1/2/3, turn RMS for slots 1/2, rejoin time, and the
 * ahead-of-station final error. Chosen set: 11.6/11.3/18.4 m, 16.2/18.2 m,
 * 75.8 s, 6.2 m (bounds 25 m, 60 m, 90 s, 50 m). */

/** Desired closure per meter of horizontal station error, 1/s. Measured
 *  2026-09-27 (method above):
 *  0.1 -> 17/17/14 m, 24/26 m, 84 s, 11 m; 0.15 -> 13/13/18, 19/21, 77 s;
 *  0.2 -> 12/11/18, 16/18, 76 s, 6 m; 0.3 -> 12/11/17, 14/16, 75 s, 5 m.
 *  Round 1's 80 m straight-line floor was not this gain: it was a steady
 *  offset (wingman 40 m ahead of and 35 m below station) from the throttle
 *  law and the vertical sink, see FORMATION_THROTTLE_GAIN and
 *  VERTICAL_GAIN_PER_S. 0.2 sits mid-plateau. */
export const CLOSURE_GAIN_PER_S = 0.2
/** The closure the law may add to the leader's velocity (spec §3). Measured
 *  2026-09-27 (method above): 30 -> rejoin 81 s, 40 -> 76 s, 60 ->
 *  76 s (the Hellcat's own acceleration limits it past 40), and ahead-of-
 *  station minimum speed 83/73/64 m/s. Kept at the spec's 40. */
export const MAX_CLOSURE_MPS = 40
/** The vertical part of the desired velocity is clamped to this, as ingress
 *  does. Measured 2026-09-27 (method above):
 *  10 -> turn RMS 35/115 m, 15 -> 17/21 m, 25 -> 16/18 m, 40 -> 16/18 m.
 *  In a 30-degree bank the velocity controller's pitch loop reads part of
 *  the turn as climb (the lateral heading error projects onto the banked
 *  body's up axis), so holding height through a turn needs more than 10 m/s
 *  of commanded descent; round 1's turn climbed 300 m above station at 10. */
export const MAX_FORMATION_VERTICAL_MPS = 25
/** Desired climb per meter of height error, 1/s: stiffer than the horizontal
 *  gain, like `holdHeight`'s 1/s. Commanding level flight, the velocity
 *  controller sinks ~3 m/s at 110 m/s (it aims the nose, not the velocity
 *  vector), so at 0.1 the wingman settled 35 m below station (round 2
 *  diagnosis, `.superpowers/7f/r2diag.ts`, 2026-09-27); at 1 it settles
 *  ~3 m low. Measured 2026-09-27 (method above): 0.5 -> 13/13/19, 23/28 m;
 *  1 -> 12/11/18, 16/18 m; 2 -> 11/11/18, 14/15 m. 1 kept: 2 buys 1-3 m. */
export const VERTICAL_GAIN_PER_S = 1
/** The heading lead through a leader's turn, as a fraction of the bank the
 *  turn needs. `controlsForDesiredVelocity` banks 1.6 x its heading error,
 *  so a wingman fed the leader's own velocity trails in heading by 1/1.6
 *  (0.625) of the bank: 7-10 degrees in the 30-degree turn (round 2
 *  diagnosis, `.superpowers/7f/r2turn.ts`, 2026-09-27). Measured 2026-09-27
 *  (method above), turn RMS: 0 -> 170/275 m, 0.5 -> 25/26 m, 0.55 ->
 *  15/16 m, 0.6 -> 16/18 m, 0.65 -> 27/31 m, 0.7 -> 40/46 m. 0.6: inside
 *  the band that clears 60 m with room, next to the controller's 0.625. */
export const TURN_LEAD_PER_BANK = 0.6
const STANDARD_GRAVITY_MPS2 = 9.80665
/** The desired speed never drops below this multiple of clean stall (Review
 *  Focus 1). Measured 2026-09-27 (method above): 1.2, 1.3 and 1.5
 *  give identical results; the ahead-of-station wingman's minimum speed is
 *  73 m/s against a 53 m/s (1.2 x stall) bound, so the floor never binds in
 *  these scenarios. Kept at Task 2's 1.3. */
export const MIN_SPEED_STALL_FACTOR = 1.3
/** throttle = base + gain x (desired speed - airspeed), like `ingressThrottle`.
 *  Measured 2026-09-27 (method above): GAIN 0.05 -> straight 26/25/29 m,
 *  ahead 18 m; 0.1 -> 14/14/21, 10 m; 0.2 -> 12/11/18, 6 m; 0.4 ->
 *  12/11/18, 5 m. At round 1's 0.05 the law needed a 3.6 m/s speed deficit
 *  to reach the ~0.67 throttle that holds 110 m/s, which the position loop
 *  could only supply as a 40 m along-track offset. BASE 0.65 -> 11/11/18,
 *  14/18 m, ahead 4 m; 0.85 -> 12/11/18, 16/18 m, 6 m; 1.0 -> 13/13/20,
 *  19/19 m, 9 m: flat, so BASE stays 0.85. */
export const FORMATION_THROTTLE_BASE = 0.85
export const FORMATION_THROTTLE_GAIN = 0.2

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** The leader's horizontal heading (unit x, z). Its body forward when it has
 *  (almost) no horizontal velocity, so a vertical leader never yields NaN. */
function headingOf<M>(leader: AircraftEntity<M>): { fx: number; fz: number } {
  const v = leader.state.velocity
  const h = Math.hypot(v.x, v.z)
  if (h > 1) return { fx: v.x / h, fz: v.z / h }
  const f = qRotate(leader.state.attitude, v3(1, 0, 0))
  const hf = Math.hypot(f.x, f.z)
  return hf > 1e-6 ? { fx: f.x / hf, fz: f.z / hf } : { fx: 1, fz: 0 }
}

/** The leader's horizontal heading as a unit ground vector (no vertical
 *  component): the fallback direction when the desired velocity collapses
 *  to zero. */
const headingVec = <M>(leader: AircraftEntity<M>): Vec3 => {
  const { fx, fz } = headingOf(leader)
  return v3(fx, 0, fz)
}

/** Where `station` is now, in world meters. Right of the track is
 *  cross(track, up), as in `ingressOrbitControls`: (-fz, fx). */
export function stationPoint<M>(leader: AircraftEntity<M>, station: Station): Vec3 {
  const { fx, fz } = headingOf(leader)
  const p = leader.state.position
  return v3(p.x - station.aftM * fx - station.rightM * fz, p.y + station.upM, p.z - station.aftM * fz + station.rightM * fx)
}

/** The leader's horizontal turn rate, rad/s (positive turns +x toward +z,
 *  i.e. right), from its last tick's heading change: `previous` is the
 *  state one tick before `state`. Zero with (almost) no horizontal speed. */
export function leaderTurnRate<M>(leader: AircraftEntity<M>): number {
  const v = leader.state.velocity, p = leader.previous.velocity
  if (Math.hypot(v.x, v.z) < 1 || Math.hypot(p.x, p.z) < 1) return 0
  const d = Math.atan2(v.z, v.x) - Math.atan2(p.z, p.x)
  return Math.atan2(Math.sin(d), Math.cos(d)) / DT
}

/** How far ahead to lead the leader's turn, rad: TURN_LEAD_PER_BANK x the
 *  bank a level turn at this rate and speed needs, atan(v w / g). */
const turnLeadRad = <M>(leader: AircraftEntity<M>, w: number): number =>
  TURN_LEAD_PER_BANK * Math.atan(Math.hypot(leader.state.velocity.x, leader.state.velocity.z) * w / STANDARD_GRAVITY_MPS2)

/** Rotate `v`'s horizontal part by `rad` about world up (the same sense as
 *  `leaderTurnRate`). */
const yaw = (v: Vec3, rad: number): Vec3 => {
  const c = Math.cos(rad), s = Math.sin(rad)
  return v3(v.x * c - v.z * s, v.y, v.x * s + v.z * c)
}

/** The leader's velocity plus a clamped correction toward the station (spec
 *  §3). For a slot station the leader-velocity term is fed forward through
 *  the leader's turn: the station's own velocity (the leader's, plus the
 *  turn swinging the station around it), led ahead through the turn
 *  (`turnLeadRad`) so the velocity controller banks with the leader instead
 *  of after it. The correction is proportional on the station error,
 *  stiffer vertically. The same law rejoins from far away.
 *
 *  Trail cover gets the leader's plain velocity, no turn feed-forward. Its
 *  500 m arm makes omega x arm the whole command whenever a fighting leader
 *  turns hard: a player looping at 1.3 rad/s while firing drove the desired
 *  speed to 646-665 m/s (final review M4, 2026-09-27, the review's loop
 *  probe through production `advance`), a station no airframe can fly. Without it the command
 *  stays within the leader's speed plus MAX_CLOSURE_MPS (`formation.test.ts`
 *  pins that bound). Cover is loose by design, so it trails the turn. */
export function stationDesiredVelocity<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, station: Station): Vec3 {
  const sp = stationPoint(leader, station)
  const err = sub(sp, self.state.position)
  const w = station === TRAIL_COVER ? 0 : leaderTurnRate(leader)
  const arm = sub(sp, leader.state.position)
  const lv = yaw(add(leader.state.velocity, v3(-w * arm.z, 0, w * arm.x)), turnLeadRad(leader, w))
  let pull = v3(err.x * CLOSURE_GAIN_PER_S, err.y * VERTICAL_GAIN_PER_S, err.z * CLOSURE_GAIN_PER_S)
  const n = length(pull)
  if (n > MAX_CLOSURE_MPS) pull = scale(pull, MAX_CLOSURE_MPS / n)
  let desired = add(lv, v3(pull.x, clamp(pull.y, -MAX_FORMATION_VERTICAL_MPS - lv.y, MAX_FORMATION_VERTICAL_MPS - lv.y), pull.z))
  const minSpeed = MIN_SPEED_STALL_FACTOR * self.spec.reference.stallSpeedMps
  const speed = length(desired)
  if (speed < minSpeed) desired = speed > 1e-6 ? scale(desired, minSpeed / speed) : scale(headingVec(leader), minSpeed)
  return desired
}

export function formationThrottle<M>(self: AircraftEntity<M>, desired: Vec3): number {
  return clamp(FORMATION_THROTTLE_BASE + FORMATION_THROTTLE_GAIN * (length(desired) - length(self.state.velocity)), 0.2, 1)
}

/** The controls for one tick on station, or on trail cover (spec §3-4). */
export function formationControls<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, slot: FormationSlot, cover: boolean): Controls {
  const desired = stationDesiredVelocity(self, leader, cover ? TRAIL_COVER : STATIONS[slot])
  return { ...controlsForDesiredVelocity(self.state, self.spec, desired), throttle: formationThrottle(self, desired) }
}

/** Distance from this wingman to its own slot's station (tests, `__ww2`). */
export function stationErrorM<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, slot: FormationSlot): number {
  return length(sub(stationPoint(leader, STATIONS[slot]), self.state.position))
}

/** A hostile this close to the leader or the wingman is engaged. A spec-set
 *  value (spec §4, 2026-09-27), the same scale as INGRESS_ENGAGE_RANGE_M --
 *  not measured. */
export const COVER_RANGE_M = 3000
/** The current target stays eligible out to here, as ingress does. */
export const COVER_RELEASE_RANGE_M = 1.5 * COVER_RANGE_M
/** How long trail cover holds after the leader last fired or engaged. A
 *  spec-set value (spec §4, 2026-09-27), not measured. */
export const COVER_LATCH_S = 5

// A parked leader: `airborne` (airborne.ts), shared with targeting (7g).

/** The player fires (`controls.fire`), or an AI leader is engaging. */
export function leaderIsFighting<M>(leader: AircraftEntity<M>): boolean {
  return leader.controls.fire === true || leader.pilot?.decision.mode === 'engage'
}

/**
 * The wingman's engage rule, as `selectTarget`'s `accept` (spec §4): a threat
 * to the leader or to me (gun cone, or within COVER_RANGE_M of either), a
 * recent hitter, or the leader's own target. Everything else in detection
 * range is left alone, so an escort stays with its bomber.
 */
export function wingmanAccepts<M>(
  self: AircraftEntity<M>, leader: AircraftEntity<M>, record: AircraftCombat, current: string | null, nowS: number,
): (contact: AircraftEntity<M>, rangeM: number) => boolean {
  return (c, rangeM) => {
    if (c.id === current && rangeM <= COVER_RELEASE_RANGE_M) return true
    if (rangeM <= COVER_RANGE_M || length(sub(c.state.position, leader.state.position)) <= COVER_RANGE_M) return true
    if (hasGunSolution(c, self) || hasGunSolution(c, leader)) return true
    if (leader.pilot?.decision.targetId === c.id) return true
    return record.lastHitBy === c.id && record.lastHit !== null && nowS - record.lastHit.tick * DT <= RECENT_HIT_S
  }
}

/**
 * A wingman whose leader is down or gone flies on alone (spec §4). It takes
 * on the leader's ingress orders, if any, at the leader's legIndex, so a
 * raider pair that loses its leader still reaches the carrier. A choice is
 * forced this tick (`nextRescoreS = nowS`).
 */
export function leaderlessPilot<M>(pilot: PilotAssignment, leader: AircraftEntity<M> | undefined, nowS: number): PilotAssignment {
  const decision = { ...pilot.decision, nextRescoreS: nowS }
  const orders = leader?.pilot?.ingress
  const alone: PilotAssignment = { target: pilot.target, skill: pilot.skill, decision }
  return orders === undefined ? alone : { ...alone, ingress: orders, decision: { ...decision, legIndex: leader!.pilot!.decision.legIndex } }
}
