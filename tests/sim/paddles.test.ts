import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { paddlesCue, APPROACH_SPEED_STALL_MULTIPLE } from '../../src/sim/paddles.js'
import { deckOf, deckWorld, type Deck } from '../../src/sim/world/deck.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { createState, type Controls } from '../../src/sim/flight/model.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { effectiveStallSpeedMps } from '../../src/sim/ground.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { ShipEntity } from '../../src/sim/loop.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const cv = loadShipSpec('essex-cv')
const params = cv.paddles!
const HEADING = 0.3

const deck: Deck = (() => {
  const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: HEADING, speedMps: 7.717 })
  const ship: ShipEntity = { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -1 }], speedMps: 7.717 } }
  return deckOf(ship)!
})()
const zoneCenterZ = -deck.lengthM / 2 + (deck.trapFromSternM + deck.trapToSternM) / 2
const CONFIGURED: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.3, gearDown: true, flapDown: true, hookDown: true }
const approachMps = APPROACH_SPEED_STALL_MULTIPLE * effectiveStallSpeedMps(f6f, 1)

/** An airplane `rangeM` astern of the zone center, `offsetDeg` off the glideslope, `lateralDeg` off the wake,
 *  flying at `speedMps` of AIRSPEED toward the deck (calm air, so that is its ground velocity too; the
 *  ship's own speed is not added: the LSO reads the wing, not the deck). */
function onFinal(rangeM: number, offsetDeg = 0, lateralDeg = 0, speedMps = approachMps) {
  const lat = (lateralDeg * Math.PI) / 180
  const local = { x: Math.sin(lat) * rangeM, z: zoneCenterZ - Math.cos(lat) * rangeM }
  const at = deckWorld(deck, local.x, local.z)
  const heightM = deck.center.y + rangeM * Math.tan(((params.glideslopeDeg + offsetDeg) * Math.PI) / 180)
  const toward = v3(Math.sin(deck.headingRad), 0, -Math.cos(deck.headingRad))
  return createState({
    position: v3(at.x, heightM + f6f.gear.heightM, at.z),
    velocity: v3(toward.x * speedMps, -speedMps * Math.sin((params.glideslopeDeg * Math.PI) / 180), toward.z * speedMps),
    gearFraction: 1, flapFraction: 1,
  })
}

describe('paddlesCue', () => {
  it('is silent with gear or hook up, outside the cone, or beyond max range', () => {
    expect(paddlesCue(f6f, onFinal(1000), { ...CONFIGURED, hookDown: false }, deck, params, null)).toBeNull()
    expect(paddlesCue(f6f, { ...onFinal(1000), gearFraction: 0 }, CONFIGURED, deck, params, null)).toBeNull()
    expect(paddlesCue(f6f, onFinal(1000, 0, params.coneHalfAngleDeg + 5), CONFIGURED, deck, params, null)).toBeNull()
    expect(paddlesCue(f6f, onFinal(params.maxRangeM + 100), CONFIGURED, deck, params, null)).toBeNull()
    // Ahead of the ship is not "on final".
    const ahead = onFinal(1000)
    const bow = deckWorld(deck, 0, deck.lengthM)
    expect(paddlesCue(f6f, { ...ahead, position: v3(bow.x, ahead.position.y, bow.z) }, CONFIGURED, deck, params, null)).toBeNull()
  })

  it('reads roger on slope and speed, high and low off slope, fast and slow off speed', () => {
    expect(paddlesCue(f6f, onFinal(1000), CONFIGURED, deck, params, null)).toBe('roger')
    expect(paddlesCue(f6f, onFinal(1000, params.glideslopeToleranceDeg + 0.3), CONFIGURED, deck, params, null)).toBe('high')
    expect(paddlesCue(f6f, onFinal(1000, -(params.glideslopeToleranceDeg + 0.3)), CONFIGURED, deck, params, null)).toBe('low')
    expect(paddlesCue(f6f, onFinal(1000, 0, 0, approachMps + params.speedBandMps + 1), CONFIGURED, deck, params, null)).toBe('fast')
    expect(paddlesCue(f6f, onFinal(1000, 0, 0, approachMps - params.speedBandMps - 1), CONFIGURED, deck, params, null)).toBe('slow')
  })

  it('cuts inside cut range when on, waves off inside wave-off range when not', () => {
    expect(paddlesCue(f6f, onFinal(params.cutRangeM - 10), CONFIGURED, deck, params, null)).toBe('cut')
    expect(paddlesCue(f6f, onFinal(params.waveOffRangeM - 10, 2), CONFIGURED, deck, params, null)).toBe('wave-off')
    expect(paddlesCue(f6f, onFinal(params.waveOffRangeM - 10, 0, 0, approachMps + 10), CONFIGURED, deck, params, null)).toBe('wave-off')
    // Between wave-off and cut range, on and on: still roger, not yet cut.
    expect(paddlesCue(f6f, onFinal((params.cutRangeM + params.waveOffRangeM) / 2), CONFIGURED, deck, params, null)).toBe('roger')
  })

  it('judges speed through the AIR: a headwind down the deck reads as more airspeed', () => {
    const wind = v3(-Math.sin(deck.headingRad) * 8, 0, Math.cos(deck.headingRad) * 8) // from ahead of the ship
    // Ground speed exactly at the approach speed plus 8 m/s of headwind is 8 m/s fast through the air.
    expect(paddlesCue(f6f, onFinal(1000, 0, 0, approachMps), CONFIGURED, deck, params, wind)).toBe('fast')
    expect(paddlesCue(f6f, onFinal(1000, 0, 0, approachMps - 8), CONFIGURED, deck, params, wind)).toBe('roger')
  })
})
