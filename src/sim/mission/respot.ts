import type { AircraftSpec } from '../flight/schema.js'
import { createState, type AircraftState } from '../flight/state.js'
import { groundUnder } from '../world/ground.js'
import { qFromAxisAngle } from '../math/quat.js'
import { v3 } from '../math/vec3.js'
import { deckOf, deckWorld, type Deck } from '../world/deck.js'
import type { AircraftEntity, EntityId, ShipEntity } from '../loop.js'

/** Mark, 2026-09-26: after an intermediate trap the deck crew respots the
 *  player on his start spot, because a trap never releases
 *  (`arrested` latches while the wheels are on the deck, model.ts). */
export type RespotOrder = { readonly ship: string; readonly spot: { readonly x: number; readonly z: number } }
/** Seconds from the landing (logged at rest) to the respot (M3-R2). */
export const RESPOT_DELAY_S = 3
/** The deck crew clears the wire: the frame raises the hook lever on each
 *  respot (ruling F-C1, 2026-09-27; `FrameState.respotHandledTick` in
 *  src/render/frame.ts), so the line reports it rather than asking for it. */
export const RESPOT_MESSAGE = 'Flight deck: respotted for launch, hook up. Launch when ready.'

/** An airplane at rest on `spot` of `deck`, facing the bow, gear down,
 *  moving with the deck. `buildAircraft`'s ship-parked start, moved here
 *  so the respot and the start are one construction. */
export function stateOnDeck(
  spec: AircraftSpec, deck: Deck, spot: { readonly x: number; readonly z: number },
  keep: Partial<Pick<AircraftState, 'fuelKg' | 'flapFraction' | 'tick'>> = {},
): AircraftState {
  const at = deckWorld(deck, spot.x, spot.z)
  return createState({
    position: v3(at.x, deck.center.y + spec.gear.heightM, at.z),
    velocity: groundUnder(null, [deck], at.x, at.z)!.velocity,
    attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck.headingRad),
    gearFraction: 1,
    ...keep,
  })
}

export function respotPlayer<M>(
  aircraft: readonly AircraftEntity<M>[], player: EntityId, ships: readonly ShipEntity[], order: RespotOrder, tick: number,
): AircraftEntity<M>[] {
  const ship = ships.find((s) => s.id === order.ship)
  const deck = ship === undefined ? null : deckOf(ship)
  if (deck === null) throw new Error(`respot: ship "${order.ship}" has no flight deck in this world`)
  return aircraft.map((a) => {
    if (a.id !== player) return a
    const state = stateOnDeck(a.spec, deck, order.spot, { fuelKg: a.state.fuelKg, flapFraction: a.state.flapFraction, tick })
    return { ...a, state, previous: state }
  })
}
