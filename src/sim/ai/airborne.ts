import type { AircraftEntity } from '../loop.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import { groundUnder } from '../world/ground.js'
import { onGround } from '../ground.js'

/**
 * Whether an aircraft is flying, decided from state. Never from
 * `AircraftEntity.parked`: that flag means "spawned on its wheels" and
 * nothing in the sim clears it, so a player who took off from a deck still
 * read as parked at 399 m (7f final review C1, 2026-09-27), and an AI that
 * landed would read as flying (7g spec §2).
 *
 * The test is the sim's own contact test, `onGround` against what
 * `groundUnder` reports beneath the aircraft -- the same one `canRelease`
 * (weapons/combat.ts) uses for "parked" -- so `airborne` is false on a deck
 * or a runway, true the tick the wheels leave it, and true over open sea. Its
 * threshold is `GROUND_CONTACT_TOLERANCE_M` (0.25 m, ground.ts), not a new
 * height here: an altitude threshold would call an aircraft skimming the sea
 * below it "on the ground". `groundUnder` null (no heightfield and no deck
 * here) is airborne, as in `canRelease`: nothing is there to stand on, and
 * a world with an airplane parked ashore does not tick until its heightfield
 * lands (`AircraftEntity.parked`'s doc: render/frame.ts's `groundSpawn`), so
 * no pilot reads this then.
 */
export function airborne<M>(a: AircraftEntity<M>, terrain: TerrainField | null, decks: readonly Deck[]): boolean {
  const under = groundUnder(terrain, decks, a.state.position.x, a.state.position.z)
  return under === null || !onGround(a.spec, a.state, under.heightM)
}
