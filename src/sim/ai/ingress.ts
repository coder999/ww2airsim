import type { AircraftEntity, ShipEntity } from '../loop.js'
import { DT } from '../flight/model.js'
import { length, v3, type Vec3 } from '../math/vec3.js'
import type { Controls } from '../flight/state.js'
import { controlsForLiftVector } from './liftVector.js'
import type { AircraftCombat } from '../weapons/combat.js'
import type { IngressOrders } from './pilot.js'
import { hasGunSolution } from './pursuit.js'

/**
 * The ingress pilot (AI 7c spec §4.5, Plan 7e): the raider the missions
 * spec's Combat Air Patrol sends at the carrier. It flies its route, then its
 * destination, then orbits there; it fights whoever attacks it or comes
 * close, and otherwise keeps coming. It never attacks the ship: there is no
 * torpedo or bombing AI, and the mission engine's deny ring has already
 * fired by the time it arrives.
 *
 * Progress is `PilotDecisionState.legIndex` (ruling W7): `0 … n − 1` flies to
 * that waypoint, `n` (= route length) to the destination, `n + 1` orbits the
 * destination -- or the last waypoint, when there is none.
 */

/** A waypoint (or the destination) counts as reached this close,
 *  horizontally. Tuning value (spec §4.5). */
export const WAYPOINT_REACHED_M = 1000
/** An opposite-side contact this close is engaged (spec §4.5). */
export const INGRESS_ENGAGE_RANGE_M = 3000
/** The current target stays eligible out to here; beyond it the raider
 *  resumes its route (spec §4.5 "Resuming", ruling W8). */
export const INGRESS_RELEASE_RANGE_M = 1.5 * INGRESS_ENGAGE_RANGE_M
/** A contact that hit this aircraft this recently is engaged at any range. */
export const RECENT_HIT_S = 10
/** The desired climb or descent rate is clamped to this (spec §4.5). */
export const MAX_VERTICAL_MPS = 10
/** Desired vertical speed per meter of altitude error, 1/s. Measured
 *  2026-09-26 (tests/sim/ai/ingress.test.ts, three-leg route): every leg ends
 *  within 100 m of its altitude. */
export const ALTITUDE_GAIN_PER_S = 0.3
/** The ingress speed law: throttle = 0.7 + gain x (leg speed − airspeed).
 *  The velocity controller's own law (gain 0.012 about 0.65) settled a
 *  Hellcat 14 m/s short of a 130 m/s leg (measured 2026-09-26, route probe). */
export const INGRESS_THROTTLE_BASE = 0.7
export const INGRESS_THROTTLE_GAIN = 0.05

/** The orbit at the destination. */
export const ORBIT_RADIUS_M = 1500
/** How far round the circle the orbit aims (see ingressDesiredVelocity). */
export const ORBIT_LEAD_RAD = Math.PI / 6

type Goal = { readonly x: number; readonly z: number; readonly altitudeM: number; readonly speedMps: number }

function destinationPoint(orders: IngressOrders, ships: readonly ShipEntity[]): { x: number; z: number } | null {
  const d = orders.destination
  if (d === null) return null
  if (d.kind === 'point') return { x: d.x, z: d.z }
  const ship = ships.find((s) => s.id === d.id)
  return ship === undefined ? null : { x: ship.state.position.x, z: ship.state.position.z }
}

/** Where leg `legIndex` is going, at what altitude and speed. Past the route,
 *  the destination (read live) at the last leg's altitude and speed. */
export function ingressGoal(orders: IngressOrders, legIndex: number, ships: readonly ShipEntity[]): Goal {
  const route = orders.route
  if (legIndex < route.length) return route[legIndex]!
  const last = route[route.length - 1]!
  const dest = destinationPoint(orders, ships)
  return dest === null ? last : { x: dest.x, z: dest.z, altitudeM: last.altitudeM, speedMps: last.speedMps }
}

const horizontalRange = (p: Vec3, g: { x: number; z: number }): number => Math.hypot(g.x - p.x, g.z - p.z)

/** The leg after this tick's progress check. The orbit (`n + 1`) is terminal. */
export function nextLegIndex<M>(self: AircraftEntity<M>, orders: IngressOrders, legIndex: number, ships: readonly ShipEntity[]): number {
  const n = orders.route.length
  if (legIndex > n) return legIndex
  if (horizontalRange(self.state.position, ingressGoal(orders, legIndex, ships)) > WAYPOINT_REACHED_M) return legIndex
  // The last waypoint with nowhere to go next, or a destination that is
  // gone, is orbited where it is.
  if (legIndex === n - 1 && destinationPoint(orders, ships) === null) return n + 1
  return legIndex + 1
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** The velocity the route asks for: toward the goal (or round it, in the
 *  orbit) at the leg's speed, with the vertical part closing the altitude
 *  error, clamped to ±MAX_VERTICAL_MPS. Flown through the velocity controller
 *  under the §3.2 safety envelope. */
export function ingressDesiredVelocity<M>(self: AircraftEntity<M>, orders: IngressOrders, legIndex: number, ships: readonly ShipEntity[]): Vec3 {
  const goal = ingressGoal(orders, legIndex, ships)
  const p = self.state.position
  const vy = clamp(ALTITUDE_GAIN_PER_S * (goal.altitudeM - p.y), -MAX_VERTICAL_MPS, MAX_VERTICAL_MPS)
  const horizontal = Math.sqrt(Math.max(0, goal.speedMps * goal.speedMps - vy * vy))
  let dx = goal.x - p.x
  let dz = goal.z - p.z
  if (legIndex > orders.route.length) {
    // Orbit, seen from above as a pure pursuit of the point ORBIT_LEAD_RAD
    // round the circle ahead of this aircraft's own bearing from the center.
    const phi = Math.atan2(p.z - goal.z, p.x - goal.x) - ORBIT_LEAD_RAD
    dx = goal.x + ORBIT_RADIUS_M * Math.cos(phi) - p.x
    dz = goal.z + ORBIT_RADIUS_M * Math.sin(phi) - p.z
  }
  const len = Math.hypot(dx, dz)
  if (len < 1e-9) return v3(self.state.velocity.x, vy, self.state.velocity.z)
  return v3((dx / len) * horizontal, vy, (dz / len) * horizontal)
}

/** Turn rate per radian of heading error in the orbit, 1/s. */
export const ORBIT_TURN_GAIN_PER_S = 0.3
/** Vertical acceleration per m/s of climb-rate error in the orbit, 1/s. */
export const ORBIT_CLIMB_GAIN_PER_S = 0.5
const G_MPS2 = 9.80665

/**
 * The orbit's controls: the lift vector, not the velocity controller. With
 * the velocity controller the bank stayed near 40 deg, short of the circle's
 * 46, and the pitch loop made up the turn with excess lift: a green Hellcat
 * climbed from 3,000 m to 5,900 m in 230 s at full throttle while asking for
 * -10 m/s (measured 2026-09-26, `.superpowers/7e/orbit.ts`). Here the lift is
 * the horizontal turn the heading error asks for plus exactly the vertical
 * the climb-rate error asks for, flown by `controlsForLiftVector` (7c).
 */
export function ingressOrbitControls<M>(
  self: AircraftEntity<M>, orders: IngressOrders, legIndex: number, ships: readonly ShipEntity[],
): Controls {
  const desired = ingressDesiredVelocity(self, orders, legIndex, ships)
  const v = self.state.velocity
  const speedH = Math.hypot(v.x, v.z)
  const throttle = ingressThrottle(self, orders, legIndex, ships)
  if (speedH < 1) return controlsForLiftVector(self.state, self.spec, v3(0, 1, 0), 1, throttle)
  const fx = v.x / speedH
  const fz = v.z / speedH
  // Right of the ground track (body +z when level): cross(track, up).
  const rx = -fz
  const rz = fx
  const heading = Math.atan2(desired.x * rx + desired.z * rz, desired.x * fx + desired.z * fz)
  const lateral = speedH * ORBIT_TURN_GAIN_PER_S * heading
  const vertical = G_MPS2 + ORBIT_CLIMB_GAIN_PER_S * (desired.y - v.y)
  const lift = v3(rx * lateral, vertical, rz * lateral)
  const n = clamp(length(lift) / G_MPS2, 0.5, 0.8 * self.spec.limits.gLimit)
  return controlsForLiftVector(self.state, self.spec, lift, n, throttle)
}

/** The throttle the route asks for (see INGRESS_THROTTLE_GAIN). */
export function ingressThrottle<M>(self: AircraftEntity<M>, orders: IngressOrders, legIndex: number, ships: readonly ShipEntity[]): number {
  const v = self.state.velocity
  const speed = Math.hypot(v.x, v.y, v.z)
  return clamp(INGRESS_THROTTLE_BASE + INGRESS_THROTTLE_GAIN * (ingressGoal(orders, legIndex, ships).speedMps - speed), 0.2, 1)
}

/**
 * The raider's engage rule (spec §4.5), as `selectTarget`'s `accept`: a
 * contact that has it in its gun cone, or hit it within `RECENT_HIT_S`, or
 * is within `INGRESS_ENGAGE_RANGE_M`; and its current target while it stays
 * within `INGRESS_RELEASE_RANGE_M`. It never turns back to chase anything
 * else.
 */
export function ingressAccepts<M>(
  self: AircraftEntity<M>, record: AircraftCombat, current: string | null, nowS: number,
): (contact: AircraftEntity<M>, rangeM: number) => boolean {
  return (c, rangeM) => {
    if (c.id === current && rangeM <= INGRESS_RELEASE_RANGE_M) return true
    if (rangeM <= INGRESS_ENGAGE_RANGE_M) return true
    if (hasGunSolution(c, self)) return true
    return record.lastHitBy === c.id && record.lastHit !== null && nowS - record.lastHit.tick * DT <= RECENT_HIT_S
  }
}
