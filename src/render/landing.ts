import { heightAt, type TerrainField } from '../sim/world/terrain.js'
import { supportedContact } from '../sim/ground.js'
import { airspeed } from '../sim/flight/model.js'
import type { AircraftState } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

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
}

/** A completed landing: the touchdown, plus how far the roll-out ran. */
export type LandingReport = {
  readonly touchdownSinkMps: number
  readonly touchdownSpeedMps: number
  readonly rollOutM: number
  readonly tick: number
}

/**
 * The frame's memory of a landing in progress (Mark, 2026-09-17: "when I
 * successfully land, it should prompt the overlay screen (like the crash
 * screen)").
 *
 * Lives in the render layer, not `sim/`, on purpose: the simulation already
 * says everything this needs (`supportedContact`, the state history) and a
 * landing is an OUTCOME the presentation reports, the way the debrief reports
 * a crash. `World.impact` is different -- the sim must know about a crash
 * because it freezes on one. Nothing in the sim changes because a landing was
 * noticed.
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

const wheelHeightM = (spec: AircraftSpec, s: AircraftState, terrain: TerrainField): number =>
  s.position.y - spec.gear.heightM - heightAt(terrain, s.position.x, s.position.z)

const supported = (spec: AircraftSpec, s: AircraftState, terrain: TerrainField): boolean =>
  supportedContact(spec, s, heightAt(terrain, s.position.x, s.position.z))

/**
 * One frame of landing bookkeeping. Pure: `before` and `after` are the
 * airplane's state on either side of this frame's simulation steps, and the
 * result replaces `prev`. Returns `prev` itself (not a copy) when there is no
 * terrain to be on, so the no-terrain path costs nothing.
 */
export function nextLandingTracking(
  spec: AircraftSpec,
  prev: LandingTracking,
  before: AircraftState,
  after: AircraftState,
  terrain: TerrainField | null,
): LandingTracking {
  if (terrain === null || prev.report !== null) return prev

  const height = wheelHeightM(spec, after, terrain)
  const airborne = prev.airborne || height > AIRBORNE_LATCH_M
  const onWheelsNow = supported(spec, after, terrain)

  let touchdown = prev.touchdown
  if (height > AIRBORNE_LATCH_M) {
    touchdown = null
  } else if (airborne && touchdown === null && onWheelsNow && !supported(spec, before, terrain)) {
    touchdown = {
      sinkMps: -before.velocity.y,
      speedMps: airspeed(before),
      x: after.position.x,
      z: after.position.z,
      tick: after.tick,
    }
  }

  const report =
    touchdown !== null && onWheelsNow && airspeed(after) < LANDED_SPEED_MPS
      ? {
          touchdownSinkMps: touchdown.sinkMps,
          touchdownSpeedMps: touchdown.speedMps,
          rollOutM: Math.hypot(after.position.x - touchdown.x, after.position.z - touchdown.z),
          tick: after.tick,
        }
      : null

  if (airborne === prev.airborne && touchdown === prev.touchdown && report === null) return prev
  return { airborne, touchdown, report }
}
