import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { qRotate } from '../math/quat.js'
import { add, length, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import { controlsForDesiredVelocity } from './controller.js'
import type { FormationSlot } from './pilot.js'

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

/** Desired closure per meter of station error, 1/s. Tuning value (Task 3 measures it). */
export const CLOSURE_GAIN_PER_S = 0.15
/** The closure the law may add to the leader's velocity (spec §3). */
export const MAX_CLOSURE_MPS = 40
/** The vertical part of the desired velocity is clamped to this, as ingress does. */
export const MAX_FORMATION_VERTICAL_MPS = 10
/** The desired speed never drops below this multiple of clean stall (Review Focus 1). */
export const MIN_SPEED_STALL_FACTOR = 1.3
/** throttle = base + gain x (desired speed - airspeed), like `ingressThrottle`. Tuning values (Task 3). */
export const FORMATION_THROTTLE_BASE = 0.7
export const FORMATION_THROTTLE_GAIN = 0.05

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

/** The leader's velocity plus a clamped proportional pull toward the station
 *  (spec §3). The same law rejoins from far away. */
export function stationDesiredVelocity<M>(self: AircraftEntity<M>, leader: AircraftEntity<M>, station: Station): Vec3 {
  const err = sub(stationPoint(leader, station), self.state.position)
  let pull = scale(err, CLOSURE_GAIN_PER_S)
  const n = length(pull)
  if (n > MAX_CLOSURE_MPS) pull = scale(pull, MAX_CLOSURE_MPS / n)
  const lv = leader.state.velocity
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
