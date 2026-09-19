import { v3, ZERO, type Vec3 } from '../math/vec3.js'
import { heightAt, type TerrainField } from './terrain.js'
import { surfaceAt, type ContactSurface } from '../contact.js'
import { insideDeck, deckLocal, deckAxes, type Deck } from './deck.js'

/** What is under a point: its height, what kind of thing it is, and how fast
 *  it is moving. Land and water do not move; a deck moves with its ship. */
export type GroundUnder = {
  readonly heightM: number
  readonly surface: ContactSurface
  readonly velocity: Vec3
  readonly deck: Deck | null
}

/**
 * ONE ground lookup for the whole simulation (Plan 8). A deck wins over the
 * water beneath it; elsewhere this is exactly `heightAt` + `surfaceAt`.
 * `null` means "no ground": no terrain field yet and no deck here, which is
 * the state a parked airplane ashore is held in until its heightfield lands.
 *
 * The returned `velocity` is the velocity OF THE POINT QUERIED, not the
 * deck's `center` -- `deck.velocity` is the ship's reference-point velocity
 * alone, and a point `r` meters from `center` also carries a rigid-body
 * rotational term (`omega x r`, `deck.yawRateRadPerS` times the local
 * offset) while the ship turns. Derived from `d/dheadingRad bow =
 * starboard` and `d/dheadingRad starboard = -bow` (`deckAxes`'s own doc
 * comment): for a point at deck-local `(l.x, l.z)`, `d/dt(position) =
 * l.x * d/dt(starboard) + l.z * d/dt(bow) = omega * (l.z * starboard -
 * l.x * bow)`. Zero whenever the ship isn't turning
 * (`yawRateRadPerS === 0`), and exactly `deck.velocity` at the center
 * (`l.x === l.z === 0`) -- both pinned by
 * `tests/sim/world/ground.test.ts`.
 */
export function groundUnder(terrain: TerrainField | null, decks: readonly Deck[], x: number, z: number): GroundUnder | null {
  for (const deck of decks) {
    if (insideDeck(deck, x, z)) {
      const l = deckLocal(deck, x, z)
      const { bow: b, starboard: s } = deckAxes(deck)
      const omega = deck.yawRateRadPerS
      const velocity = v3(
        deck.velocity.x + omega * (l.z * s.x - l.x * b.x),
        0,
        deck.velocity.z + omega * (l.z * s.z - l.x * b.z),
      )
      return { heightM: deck.center.y, surface: 'deck', velocity, deck }
    }
  }
  if (terrain === null) return null
  const heightM = heightAt(terrain, x, z)
  return { heightM, surface: surfaceAt(heightM), velocity: ZERO, deck: null }
}
