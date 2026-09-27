import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { airVelocity } from './flight/model.js'
import { effectiveStallSpeedMps, GEAR_DOWN_FRACTION } from './ground.js'
import { deckAxes, deckLocal, type Deck } from './world/deck.js'
import { length, type Vec3 } from './math/vec3.js'
import type { PaddlesParams } from './world/ships.js'

/** What the landing signal officer is holding up (Plan 8 design section 7). */
export type PaddlesCue = 'high' | 'low' | 'fast' | 'slow' | 'roger' | 'cut' | 'wave-off'

/** The approach speed the cue is judged around: 1.15 x the full-flap stall,
 *  the 11b approach figure. Airspeed, not deck-relative: the wing flies
 *  through the air, and the LSO reads the airplane's attitude for it. */
export const APPROACH_SPEED_STALL_MULTIPLE = 1.15

const DEG = Math.PI / 180

/** Where the airplane is relative to the deck's trap zone, when it is in
 *  the Paddles window (configured, astern, in the cone and range, and
 *  closing on the deck); `null` when it is not. The single gate both
 *  `paddlesCue` and `paddlesWindow` read (M3-R4), so the LSO and the pass
 *  tracker can never disagree about who is "in the groove". */
function paddlesGeometry(
  state: AircraftState,
  controls: Controls,
  deck: Deck,
  params: PaddlesParams,
): { readonly local: { readonly x: number; readonly z: number }; readonly asternM: number; readonly rangeM: number } | null {
  if (controls.hookDown !== true || state.gearFraction < GEAR_DOWN_FRACTION) return null
  const local = deckLocal(deck, state.position.x, state.position.z)
  const zoneZ = -deck.lengthM / 2 + (deck.trapFromSternM + deck.trapToSternM) / 2
  const asternM = zoneZ - local.z
  if (asternM <= 0) return null
  const rangeM = Math.hypot(asternM, local.x)
  if (rangeM > params.maxRangeM) return null
  const offAxisDeg = Math.abs(Math.atan2(local.x, asternM)) / DEG
  if (offAxisDeg > params.coneHalfAngleDeg) return null
  // Closing (ruling F-I2, 2026-09-27): horizontal speed relative to the
  // deck, along its bow axis, must be positive. Without it a tight downwind
  // extended astern, flown AWAY from the ship, opened a pass, and the 180
  // degree turn back (about 25 s) outlasted PASS_RESOLVE_S, so it scored a
  // wave-off. The deck's center velocity, not the point's: the rotational
  // term (`groundUnder`) is across the wake here, not along it.
  const { bow } = deckAxes(deck)
  const closingMps = (state.velocity.x - deck.velocity.x) * bow.x + (state.velocity.z - deck.velocity.z) * bow.z
  if (!(closingMps > 0)) return null
  return { local, asternM, rangeM }
}

/**
 * Pure. `true` exactly when `paddlesCue` would return a cue for the same
 * inputs: gear and hook down, astern of the trap zone's center, inside the
 * approach cone and `maxRangeM`, and closing on the deck (moving toward its
 * bow faster than it does; ruling F-I2). Wind changes which cue is shown, never
 * whether one is, so this takes none. The mission's pass tracker reads it
 * (src/sim/mission/passes.ts).
 */
export function paddlesWindow(
  _spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  deck: Deck,
  params: PaddlesParams,
): boolean {
  return paddlesGeometry(state, controls, deck, params) !== null
}

/**
 * Pure. `null` unless the airplane is configured (gear and hook down),
 * astern of the deck inside the approach cone, inside `maxRangeM`, and
 * closing on the deck (`paddlesWindow`). Glideslope is measured to the trap zone's center at
 * deck height; range is the horizontal distance to that point. Priority:
 * wave-off, cut, high/low, fast/slow, roger.
 */
export function paddlesCue(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  deck: Deck,
  params: PaddlesParams,
  wind: Vec3 | null,
): PaddlesCue | null {
  const g = paddlesGeometry(state, controls, deck, params)
  if (g === null) return null
  const { rangeM } = g

  const wheelsAboveDeckM = state.position.y - spec.gear.heightM - deck.center.y
  const slopeDeg = Math.atan2(wheelsAboveDeckM, rangeM) / DEG
  const slopeError = slopeDeg - params.glideslopeDeg
  const onSlope = Math.abs(slopeError) <= params.glideslopeToleranceDeg

  const approachMps = APPROACH_SPEED_STALL_MULTIPLE * effectiveStallSpeedMps(spec, state.flapFraction)
  const speedError = length(airVelocity(state, wind)) - approachMps
  const onSpeed = Math.abs(speedError) <= params.speedBandMps

  if (rangeM <= params.waveOffRangeM && !(onSlope && onSpeed)) return 'wave-off'
  if (rangeM <= params.cutRangeM) return 'cut'
  if (!onSlope) return slopeError > 0 ? 'high' : 'low'
  if (!onSpeed) return speedError > 0 ? 'fast' : 'slow'
  return 'roger'
}
