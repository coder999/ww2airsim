import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { airVelocity } from './flight/model.js'
import { effectiveStallSpeedMps, GEAR_DOWN_FRACTION } from './ground.js'
import { deckLocal, type Deck } from './world/deck.js'
import { length, type Vec3 } from './math/vec3.js'
import type { PaddlesParams } from './world/ships.js'

/** What the landing signal officer is holding up (Plan 8 design section 7). */
export type PaddlesCue = 'high' | 'low' | 'fast' | 'slow' | 'roger' | 'cut' | 'wave-off'

/** The approach speed the cue is judged around: 1.15 x the full-flap stall,
 *  the 11b approach figure. Airspeed, not deck-relative: the wing flies
 *  through the air, and the LSO reads the airplane's attitude for it. */
export const APPROACH_SPEED_STALL_MULTIPLE = 1.15

const DEG = Math.PI / 180

/**
 * Pure. `null` unless the airplane is configured (gear and hook down),
 * astern of the deck inside the approach cone, and inside `maxRangeM`.
 * Glideslope is measured to the trap zone's center at deck height; range is
 * the horizontal distance to that point. Priority: wave-off, cut, high/low,
 * fast/slow, roger.
 */
export function paddlesCue(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  deck: Deck,
  params: PaddlesParams,
  wind: Vec3 | null,
): PaddlesCue | null {
  if (controls.hookDown !== true || state.gearFraction < GEAR_DOWN_FRACTION) return null
  const local = deckLocal(deck, state.position.x, state.position.z)
  const zoneZ = -deck.lengthM / 2 + (deck.trapFromSternM + deck.trapToSternM) / 2
  const asternM = zoneZ - local.z
  if (asternM <= 0) return null
  const rangeM = Math.hypot(asternM, local.x)
  if (rangeM > params.maxRangeM) return null
  const offAxisDeg = Math.abs(Math.atan2(local.x, asternM)) / DEG
  if (offAxisDeg > params.coneHalfAngleDeg) return null

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
