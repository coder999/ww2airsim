import { deckOf, type Deck } from '../../../src/sim/world/deck.js'
import { createShipState } from '../../../src/sim/world/ships.js'
import { SEA_LEVEL_M } from '../../../src/sim/world/terrain.js'
import { loadShipSpec, loadAircraftSpec } from '../../../tools/content/load.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import type { ShipEntity } from '../../../src/sim/loop.js'

/** Task 3's span for content-agnostic geometry checks: reused by Task 4. */
export const span = loadAircraftSpec('f6f-hellcat').geometry.wingSpanM

/** A Deck for `shipId`, built the way `tests/sim/world/deck.test.ts` builds
 *  a `ShipEntity` for `deckOf` -- a carrier steady on a heading, far enough
 *  from the origin that the deck-local/world round trip is exercised. */
export function deckFor(shipId: string): Deck {
  const spec = loadShipSpec(shipId)
  const state = createShipState({ position: v3(1000, SEA_LEVEL_M, -2000), headingRad: 0, speedMps: 7.717 })
  const ship: ShipEntity = {
    id: `${shipId}-1`,
    spec,
    state,
    previous: state,
    orders: { waypoints: [{ x: 1000, z: -2000 }, { x: 1000, z: -3000 }], speedMps: 7.717 },
  }
  return deckOf(ship)!
}
