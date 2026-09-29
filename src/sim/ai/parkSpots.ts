import type { AircraftSpec } from '../flight/schema.js'
import { createState, type AircraftState } from '../flight/state.js'
import { localToWorld, parkedAttitude, insideRect, type Airfield } from '../world/airfields.js'
import type { Deck } from '../world/deck.js'
import { v3 } from '../math/vec3.js'

/** Tuning values, 7g spec §3. Clear of the bow's edge. */
export const PARK_BOW_MARGIN_M = 15
/** Clear of the trap zone's forward edge (a trapped airplane rolls a few meters past the wire it caught). */
export const PARK_TRAP_CLEARANCE_M = 40
/** From the runway's edge to the park row's centerline. */
export const PARK_RUNWAY_OFFSET_M = 30
/** Between wingtips. */
export const PARK_GAP_M = 3

/**
 * 7g spec §3: the deck park, deck-local (x starboard, z toward the bow).
 * A column either side of the centerline, staggered fore-and-aft rather
 * than paired abreast, filling aft from the bow toward
 * PARK_TRAP_CLEARANCE_M forward of the trap zone's forward edge. Spot 0 is
 * the most forward, starboard side. Pure geometry: no content fields.
 *
 * Staggered rather than a rigid two-abreast grid because a two-abreast row
 * needs `wingSpanM` of clearance PLUS a full `wingSpanM` between the two
 * columns (`PARK_GAP_M` on top of that) -- more than a Casablanca-class
 * CVE's flight deck (24.38 m, versus a shipped carrier fighter's ~13 m
 * wingspan) has to give side to side. Staggering trades that side-to-side
 * clearance for fore-and-aft clearance (Pythagorean: an aircraft on the
 * opposite side one row aft is already `2 * columnX` apart across the
 * deck, so it needs less additional `z` separation to clear
 * `wingSpanM + PARK_GAP_M` than a same-row neighbor would), so the same
 * minimum spacing holds throughout at the deck's actual width instead of
 * demanding one it does not have. On a deck wide enough for two full
 * abreast columns (an Essex-class fleet carrier, verified 2026-09-28: 9
 * spots) this reduces to the same average density a two-abreast grid
 * gives; it is only the packing SHAPE that changes, never used to invent
 * room a narrow deck does not have.
 */
export function deckParkSpots(deck: Deck, wingSpanM: number): readonly { x: number; z: number }[] {
  const target = wingSpanM + PARK_GAP_M // minimum clearance between any two spots
  const maxColumnX = deck.widthM / 2 - wingSpanM / 2
  if (maxColumnX < 0) return [] // a deck too narrow even for one centered spot parks nothing
  const columnX = Math.min(target / 2, maxColumnX)
  // Same-column spots two rows apart need `target` of `z`; opposite-column
  // spots one row apart already have `2 * columnX` of `x`, so they need only
  // enough `z` to make up the rest of `target` on the hypotenuse.
  const rowStep = Math.max(target / 2, Math.sqrt(Math.max(0, target ** 2 - (2 * columnX) ** 2)))

  const aftLimit = -deck.lengthM / 2 + deck.trapToSternM + PARK_TRAP_CLEARANCE_M + wingSpanM / 2
  const bowEdge = deck.lengthM / 2 - wingSpanM / 2
  // PARK_BOW_MARGIN_M's clearance is kept only when the deck has room to
  // spare for it; a deck too short to give both it AND a first spot (a
  // Casablanca-class CVE's trap clearance alone consumes most of the room
  // forward of the wires) parks flush with the bow instead of parking
  // nothing at all.
  const zWithMargin = bowEdge - PARK_BOW_MARGIN_M
  const zTop = zWithMargin >= aftLimit ? zWithMargin : bowEdge

  const spots: { x: number; z: number }[] = []
  let side: 1 | -1 = 1
  for (let z = zTop; z >= aftLimit; z -= rowStep) {
    spots.push({ x: side * columnX, z })
    side = side === 1 ? -1 : 1
  }
  return spots
}

/**
 * 7g spec §3, §7: one row parallel to the runway, runway-local (x across, z
 * along), on the apron's side (sign of `apron.x`), else local -x. Along the
 * apron's length when there is one, else the runway's. Spots inside a
 * building footprint are dropped here; the terrain check is a content test
 * (spec §7), because the heightfield is not loaded when this runs.
 */
export function runwayParkSpots(a: Airfield, wingSpanM: number): readonly { x: number; z: number }[] {
  const side = a.apron !== null && a.apron.x !== 0 ? Math.sign(a.apron.x) : -1
  const x = side * (a.runway.widthM / 2 + PARK_RUNWAY_OFFSET_M)
  const pitch = wingSpanM + PARK_GAP_M
  const [zFrom, zTo] = a.apron !== null
    ? [a.apron.z - a.apron.lengthM / 2 + wingSpanM / 2, a.apron.z + a.apron.lengthM / 2 - wingSpanM / 2]
    : [-a.runway.lengthM / 2 + wingSpanM / 2, a.runway.lengthM / 2 - wingSpanM / 2]
  const spots: { x: number; z: number }[] = []
  for (let z = zFrom; z <= zTo; z += pitch) {
    const w = localToWorld(a, x, z)
    if (a.buildings.some((b) => insideRect(a, b, w.x, w.z))) continue
    spots.push({ x, z })
  }
  return spots
}

/** An airplane at rest on runway-local `spot`, facing down the runway, gear
 *  down, wheels on `groundHeightM`. The airfield sibling of `stateOnDeck`
 *  (src/sim/mission/respot.ts). */
export function parkedStateOnRunway(
  spec: AircraftSpec, a: Airfield, spot: { readonly x: number; readonly z: number }, groundHeightM: number,
  keep: Partial<Pick<AircraftState, 'fuelKg' | 'flapFraction' | 'tick'>> = {},
): AircraftState {
  const w = localToWorld(a, spot.x, spot.z)
  return createState({
    position: v3(w.x, groundHeightM + spec.gear.heightM, w.z),
    velocity: v3(0, 0, 0),
    attitude: parkedAttitude(a),
    gearFraction: 1,
    ...keep,
  })
}
