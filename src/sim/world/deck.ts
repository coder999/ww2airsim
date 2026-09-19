import { v3, type Vec3 } from '../math/vec3.js'
import { shipVelocity, wrapPi } from './ships.js'
import type { ShipEntity } from '../loop.js'

// The fixed timestep -- `src/sim/flight/model.ts`'s `DT` -- duplicated here
// rather than imported: `flight/model.ts` imports `groundUnder` from
// `../world/ground.js`, which imports `insideDeck`/`Deck` from THIS file, so
// importing `DT` from `flight/model.ts` here closes a real depcruise cycle
// (confirmed 2026-09-19 by trying the import and running `npx depcruise src
// --config .dependency-cruiser.cjs`: `model.ts -> world/ground.ts ->
// deck.ts -> model.ts` was reported as a `no-circular` violation).
const DT = 1 / 60

/**
 * A carrier's flight deck as the ground constraint sees it this tick: a
 * rectangle in the ship's frame, at the flight deck's height, carrying the
 * ship's velocity. Derived by `advance` from `world.ships` AFTER they step
 * (entities design section 9), never stored on an entity, so it can never be
 * stale. Deck-local coordinates: `x` across to starboard, `z` along toward
 * the bow, both meters from the deck center.
 */
export type Deck = {
  readonly shipId: string
  readonly center: Vec3
  readonly headingRad: number
  readonly lengthM: number
  readonly widthM: number
  /**
   * The ship's, at the deck CENTER; `groundUnder` adds the rotational term
   * for the point queried.
   *
   * Found and measured 2026-09-19 while building the Task 2 chock-on-deck
   * acceptance test: a plain, uniform `Deck.velocity` (the ship's reference-
   * point velocity applied everywhere on the rectangle) disagreed with
   * `deckWorld`/`deckLocal`'s fully-rotating geometry -- a spot 110 m aft of
   * an Essex-class carrier's reference point, during a turn at its content
   * file's 0.01745 rad/s, needs an extra ~1.92 m/s of rotational velocity
   * that this field alone does not carry, which slid a "chocked" airplane
   * off the 32.9 m-wide deck in about 9 seconds. Fixed by adding
   * `yawRateRadPerS` below and having `groundUnder` compute the point's
   * actual velocity from it, rather than handing back this field directly.
   */
  readonly velocity: Vec3
  /**
   * The ship's yaw rate this tick, rad/s: `wrapPi(state.headingRad -
   * previous.headingRad) / DT`, positive turning to starboard (the same
   * sign `stepShip`'s heading already uses). Zero before the first step,
   * when `state === previous`. `groundUnder` uses this with `deckAxes` to
   * add the rigid-body rotational term (`omega x r`) a point away from
   * `center` actually has, which `velocity` alone does not carry -- see
   * that field's own doc comment.
   */
  readonly yawRateRadPerS: number
  readonly trapFromSternM: number
  readonly trapToSternM: number
}

export function deckOf(ship: ShipEntity): Deck | null {
  const fd = ship.spec.flightDeck
  if (fd === undefined) return null
  const zone = ship.spec.trapZone ?? { fromSternM: 0, toSternM: 0 }
  const { position, headingRad, speedMps } = ship.state
  return {
    shipId: ship.id,
    center: v3(position.x, position.y + fd.heightM, position.z),
    headingRad,
    lengthM: fd.lengthM,
    widthM: fd.widthM,
    velocity: shipVelocity(headingRad, speedMps),
    yawRateRadPerS: wrapPi(headingRad - ship.previous.headingRad) / DT,
    trapFromSternM: zone.fromSternM,
    trapToSternM: zone.toSternM,
  }
}

export function decksOf(ships: readonly ShipEntity[]): readonly Deck[] {
  const decks: Deck[] = []
  for (const s of ships) {
    const d = deckOf(s)
    if (d !== null) decks.push(d)
  }
  return decks
}

/**
 * The deck's two horizontal unit axes, world-frame: `bow` is one meter
 * toward the bow (the compass convention of `shipVelocity`, +x east, +z
 * south, north = -z), `starboard` is the bow direction turned a quarter
 * turn clockwise seen from above. Exported so `groundUnder`
 * (`src/sim/world/ground.ts`) uses the SAME two directions `deckWorld`/
 * `deckLocal` do -- one copy, so the two modules cannot disagree about
 * which way "toward the bow" or "to starboard" points.
 *
 * `d/dheadingRad bow = starboard` and `d/dheadingRad starboard = -bow`
 * (differentiate the `sin`/`cos` pairs below) is what `groundUnder`'s
 * rotational-velocity term is built from.
 */
export function deckAxes(deck: Deck): { bow: { x: number; z: number }; starboard: { x: number; z: number } } {
  const h = deck.headingRad
  return { bow: { x: Math.sin(h), z: -Math.cos(h) }, starboard: { x: Math.cos(h), z: Math.sin(h) } }
}

export function deckWorld(deck: Deck, x: number, z: number): { x: number; z: number } {
  const { bow: b, starboard: s } = deckAxes(deck)
  return { x: deck.center.x + s.x * x + b.x * z, z: deck.center.z + s.z * x + b.z * z }
}

export function deckLocal(deck: Deck, x: number, z: number): { x: number; z: number } {
  const { bow: b, starboard: s } = deckAxes(deck)
  const dx = x - deck.center.x, dz = z - deck.center.z
  return { x: dx * s.x + dz * s.z, z: dx * b.x + dz * b.z }
}

export function insideDeck(deck: Deck, x: number, z: number): boolean {
  const l = deckLocal(deck, x, z)
  return Math.abs(l.x) <= deck.widthM / 2 && Math.abs(l.z) <= deck.lengthM / 2
}

/** Inside the rectangle AND between the trap zone's two stern distances. */
export function insideTrapZone(deck: Deck, x: number, z: number): boolean {
  if (!insideDeck(deck, x, z)) return false
  const fromStern = deckLocal(deck, x, z).z + deck.lengthM / 2
  return fromStern >= deck.trapFromSternM && fromStern <= deck.trapToSternM
}
