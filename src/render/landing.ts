import { supportedContact } from '../sim/ground.js'
import { airspeed } from '../sim/flight/model.js'
import type { AircraftState } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import { airfieldAt, type Airfield } from '../sim/world/airfields.js'
import { groundUnder, type GroundUnder } from '../sim/world/ground.js'
import { deckLocal, type Deck } from '../sim/world/deck.js'
import type { TerrainField } from '../sim/world/terrain.js'
import { sub, length } from '../sim/math/vec3.js'

/**
 * Where a flight touched down, and what it looked like at that instant.
 * Sink and speed are taken from the state BEFORE the contact step -- after
 * it the ground constraint has already zeroed the sink.
 */
export type Touchdown = {
  readonly sinkMps: number
  readonly speedMps: number
  readonly x: number
  readonly z: number
  readonly tick: number
  /** The deck under the wheels at touchdown, or `null` for an airfield or
   *  open-water arrival. */
  readonly deck: Deck | null
}

/** A completed landing: the touchdown, plus how far the roll-out ran. */
export type LandingReport = {
  readonly touchdownSinkMps: number
  readonly touchdownSpeedMps: number
  readonly rollOutM: number
  readonly tick: number
  /** Where the flight ended: the airfield whose runway the touchdown lies
   *  inside, the carrier whose deck it was arrested on, or `null` off-field.
   *  Master spec section 8's recovery multiplier reads this in Plan 9. */
  readonly at: { readonly kind: 'airfield' | 'carrier'; readonly name: string } | null
}

/**
 * The frame's memory of a landing in progress (Mark, 2026-09-17: "when I
 * successfully land, it should prompt the overlay screen (like the crash
 * screen)").
 *
 * Lives in the render layer, not `sim/`, on purpose: the simulation already
 * says everything this needs (`supportedContact`, the state history) and a
 * landing is an OUTCOME the presentation reports, the way the debrief reports
 * a crash. An `AircraftEntity`'s `impact` is different -- the sim must know
 * about a crash because that entity stops stepping on one. Nothing in the sim
 * changes because a landing was noticed.
 *
 * - `airborne` latches once the wheels have been `AIRBORNE_LATCH_M` clear of
 *   the ground since spawn, and is what tells a landing from an airplane that
 *   spawned parked and never moved: without it, the parked spawn would be
 *   "landed" on its first frame.
 * - `touchdown` is the first supported contact after that, and is forgotten
 *   again if the wheels climb back above the latch height -- a go-around
 *   reports the landing that actually happens, not the bounce before it.
 * - `report` is set once, when the airplane is on its wheels below
 *   `LANDED_SPEED_MPS`, and stays until `acknowledgeLanding` (frame.ts)
 *   clears the whole record for the next flight.
 */
export type LandingTracking = {
  readonly airborne: boolean
  readonly touchdown: Touchdown | null
  readonly report: LandingReport | null
}

export const NO_LANDING: LandingTracking = { airborne: false, touchdown: null, report: null }

/** Wheel height above the ground at which a flight counts as airborne. Well
 *  above the ground constraint's tolerance and any bounce on the take-off
 *  roll, well below the height a go-around climbs to. */
export const AIRBORNE_LATCH_M = 10
/** Ground speed below which a supported airplane has come to rest. The same
 *  figure `tests/sim/landing.test.ts` stops its roll-out at. */
export const LANDED_SPEED_MPS = 1

const groundFor = (terrain: TerrainField | null, decks: readonly Deck[], s: AircraftState) =>
  groundUnder(terrain, decks, s.position.x, s.position.z)

const wheelHeightM = (spec: AircraftSpec, s: AircraftState, g: GroundUnder): number =>
  s.position.y - spec.gear.heightM - g.heightM

const supported = (spec: AircraftSpec, s: AircraftState, g: GroundUnder | null): boolean =>
  g !== null && supportedContact(spec, s, g.heightM, g.surface, g.velocity)

/**
 * One frame of landing bookkeeping. Pure: `before` and `after` are the
 * airplane's state on either side of this frame's simulation steps, and the
 * result replaces `prev`. Returns `prev` itself (not a copy) when there is no
 * ground under the airplane, so the no-ground path costs nothing.
 */
export function nextLandingTracking(
  spec: AircraftSpec,
  prev: LandingTracking,
  before: AircraftState,
  after: AircraftState,
  terrain: TerrainField | null,
  airfields: readonly Airfield[],
  decks: readonly Deck[] = [],
): LandingTracking {
  if (prev.report !== null) return prev
  const gAfter = groundFor(terrain, decks, after)
  if (gAfter === null) return prev

  const height = wheelHeightM(spec, after, gAfter)
  const airborne = prev.airborne || height > AIRBORNE_LATCH_M
  const onWheelsNow = supported(spec, after, gAfter)

  let touchdown = prev.touchdown
  if (height > AIRBORNE_LATCH_M) {
    touchdown = null
  } else if (airborne && touchdown === null && onWheelsNow && !supported(spec, before, groundFor(terrain, decks, before))) {
    touchdown = {
      sinkMps: -(before.velocity.y - gAfter.velocity.y),
      speedMps: airspeed({ ...before, velocity: sub(before.velocity, gAfter.velocity) }),
      x: after.position.x,
      z: after.position.z,
      tick: after.tick,
      deck: gAfter.deck,
    }
  }

  // At rest RELATIVE to what it landed on: a trapped airplane sails at 15 kn.
  const restSpeed = length(sub(after.velocity, gAfter.velocity))
  const report =
    touchdown !== null && onWheelsNow && restSpeed < LANDED_SPEED_MPS
      ? {
          touchdownSinkMps: touchdown.sinkMps,
          touchdownSpeedMps: touchdown.speedMps,
          rollOutM: rollOutM(touchdown, after, gAfter),
          tick: after.tick,
          at: landedAt(touchdown, airfields, gAfter),
        }
      : null

  if (airborne === prev.airborne && touchdown === prev.touchdown && report === null) return prev
  return { airborne, touchdown, report }
}

/** Roll-out in the frame of the surface: on a deck, the deck-local distance,
 *  so the ship's own travel is not counted. */
function rollOutM(touchdown: Touchdown, after: AircraftState, g: GroundUnder): number {
  if (touchdown.deck !== null && g.deck !== null && g.deck.shipId === touchdown.deck.shipId) {
    const a = deckLocal(touchdown.deck, touchdown.x, touchdown.z)
    const b = deckLocal(g.deck, after.position.x, after.position.z)
    return Math.hypot(b.x - a.x, b.z - a.z)
  }
  return Math.hypot(after.position.x - touchdown.x, after.position.z - touchdown.z)
}

function landedAt(touchdown: Touchdown, airfields: readonly Airfield[], g: GroundUnder): LandingReport['at'] {
  if (g.deck !== null && touchdown.deck !== null && g.deck.shipId === touchdown.deck.shipId) return { kind: 'carrier', name: g.deck.shipId }
  const field = airfieldAt(airfields, touchdown.x, touchdown.z)
  return field === null ? null : { kind: 'airfield', name: field.name }
}
