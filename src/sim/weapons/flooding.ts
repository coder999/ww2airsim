/**
 * Torpedo flooding (Track D step 3, D3 T3, Mark 2026-10-09): a torpedo hit below the waterline does
 * its warhead damage at once, as a bomb does, and then floods the hull. Water keeps draining
 * `hullHp` for a while after the hit, lists the ship toward the side it came in on, and slows it.
 * Floods from several hits add up. Bombs never flood (T4).
 *
 * Every figure here is an ESTIMATE, a game tuning with no historical source, chosen so one Mk 13
 * finishes a destroyer, two or three sink a cruiser, and a battleship survives several (the D3
 * handoff's outcomes table, measured by tests/sim/weapons/flooding.test.ts).
 */

/** ESTIMATE: a hit's flood drains this share of its warhead damage, on top of the blow itself. */
export const FLOOD_DAMAGE_FRACTION = 0.6
/** ESTIMATE: how long one hit's flood runs, draining at a steady rate. */
export const FLOOD_SECONDS = 60
/** ESTIMATE: the most a flooded ship lists, short of capsizing (sinking adds its own list). */
export const MAX_FLOOD_LIST_RAD = 12 * Math.PI / 180
/** ESTIMATE: the full list is reached when one side has taken this share of `hullHp` more water than the other. */
export const FULL_LIST_HULL_FRACTION = 0.5
/** ESTIMATE: speed lost per share of `hullHp` flooded, both sides together. */
export const FLOOD_SLOW_PER_HULL = 1.5
/** ESTIMATE: a flooded ship still steams at this share of its maximum speed until it sinks. */
export const MIN_FLOOD_SPEED_FRACTION = 0.25

/** One hit's flood: `side` +1 starboard, -1 port; `leftHp` still to drain at `rateHps`. */
export type Flood = { readonly side: 1 | -1; readonly leftHp: number; readonly rateHps: number; readonly attacker: string }

/** What a ship's damage record carries for flooding. Absent fields mean "never flooded", so a
 *  record built before D3 (and every test fixture) reads as a dry hull. */
export type FloodState = {
  readonly floods?: readonly Flood[]
  readonly floodedPortHp?: number
  readonly floodedStarboardHp?: number
}

/** The flood one torpedo of `damage` starts on `side`. */
export const floodFrom = (damage: number, side: 1 | -1, attacker: string): Flood => {
  const leftHp = damage * FLOOD_DAMAGE_FRACTION
  return { side, leftHp, rateHps: leftHp / FLOOD_SECONDS, attacker }
}

/** Which side of a hull a point is on: +1 starboard, -1 port. Compass heading as `shipVelocity`:
 *  bow along (sin h, -cos h), so starboard is (cos h, sin h) in x/z. Dead on the centerline is starboard. */
export const hitSide = (center: { x: number; z: number }, headingRad: number, point: { x: number; z: number }): 1 | -1 =>
  (point.x - center.x) * Math.cos(headingRad) + (point.z - center.z) * Math.sin(headingRad) < 0 ? -1 : 1

/** The list, signed: positive to starboard. */
export function floodListRad(d: FloodState, hullHp: number): number {
  const net = ((d.floodedStarboardHp ?? 0) - (d.floodedPortHp ?? 0)) / (hullHp * FULL_LIST_HULL_FRACTION)
  return MAX_FLOOD_LIST_RAD * Math.max(-1, Math.min(1, net))
}

/** The share of its maximum speed a flooded ship can still make; 1 when dry. */
export function floodSpeedFraction(d: FloodState, hullHp: number): number {
  const flooded = ((d.floodedPortHp ?? 0) + (d.floodedStarboardHp ?? 0)) / hullHp
  return Math.max(MIN_FLOOD_SPEED_FRACTION, 1 - FLOOD_SLOW_PER_HULL * flooded)
}
