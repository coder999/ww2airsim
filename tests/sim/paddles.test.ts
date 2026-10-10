import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadShipSpec, loadScenarioBundle } from '../../tools/content/load.js'
import { paddlesCue, paddlesWindow, APPROACH_SPEED_STALL_MULTIPLE } from '../../src/sim/paddles.js'
import { deckOf, deckWorld, type Deck } from '../../src/sim/world/deck.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { createState, DT, type Controls } from '../../src/sim/flight/model.js'
import { SEA_LEVEL_M, createTerrainField } from '../../src/sim/world/terrain.js'
import { effectiveStallSpeedMps } from '../../src/sim/ground.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { advance, playerAircraft, withAircraftState, withControls, type ShipEntity, type World } from '../../src/sim/loop.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor, GROUND_TRUTH_TIER } from '../../src/render/content.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import type { AircraftState } from '../../src/sim/flight/state.js'
import { approachControls, VREF_STALL_MULTIPLE } from '../../tools/autopilot/approach.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'

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

/** `onFinal`'s position, flying the other way: a tight downwind extended
 *  astern, away from the ship (ruling F-I2). */
const flyingAway = (rangeM: number) => {
  const s = onFinal(rangeM)
  return { ...s, velocity: v3(-s.velocity.x, s.velocity.y, -s.velocity.z) }
}
/** `onFinal`'s position, holding station on the ship: no closure at all. */
const keepingStation = (rangeM: number) => ({ ...onFinal(rangeM), velocity: deck.velocity })

describe('the window needs closure on the deck (ruling F-I2)', () => {
  it('the same position flying AWAY from the ship gives no window and no cue', () => {
    expect(paddlesCue(f6f, onFinal(1000), CONFIGURED, deck, params, null)).toBe('roger')
    expect(paddlesWindow(f6f, flyingAway(1000), CONFIGURED, deck, params)).toBe(false)
    expect(paddlesCue(f6f, flyingAway(1000), CONFIGURED, deck, params, null)).toBeNull()
    expect(paddlesCue(f6f, flyingAway(params.waveOffRangeM - 10), CONFIGURED, deck, params, null)).toBeNull()
  })

  it('holding station on the ship, no bow-ward speed relative to the deck, is not closing', () => {
    expect(paddlesWindow(f6f, keepingStation(1000), CONFIGURED, deck, params)).toBe(false)
    expect(paddlesCue(f6f, keepingStation(1000), CONFIGURED, deck, params, null)).toBeNull()
  })
})

describe('paddlesWindow (M3-R4): exactly the gate of paddlesCue', () => {
  it('agrees with paddlesCue !== null on the unit fixtures, with or without wind', () => {
    const wind = v3(-Math.sin(deck.headingRad) * 8, 0, Math.cos(deck.headingRad) * 8)
    const cases: [ReturnType<typeof onFinal>, Controls][] = [
      [onFinal(1000), CONFIGURED],
      [onFinal(1000), { ...CONFIGURED, hookDown: false }],
      [{ ...onFinal(1000), gearFraction: 0 }, CONFIGURED],
      [onFinal(1000, 0, params.coneHalfAngleDeg + 5), CONFIGURED],
      [onFinal(params.maxRangeM + 100), CONFIGURED],
      [onFinal(params.cutRangeM - 10), CONFIGURED],
      [onFinal(params.waveOffRangeM - 10, 2), CONFIGURED],
      [flyingAway(1000), CONFIGURED],
      [flyingAway(params.waveOffRangeM - 10), CONFIGURED],
      [keepingStation(1000), CONFIGURED],
    ]
    for (const [state, controls] of cases) {
      for (const w of [null, wind]) {
        expect(paddlesWindow(f6f, state, controls, deck, params)).toBe(paddlesCue(f6f, state, controls, deck, params, w) !== null)
      }
    }
  })

  it('agrees with paddlesCue !== null every 60th tick of the carrierLanding approach', () => {
    // The Step 1 probe's approach (M3 Task 3, 2026-09-26): carrierLanding.test.ts's setup and loop.
    const level = finestFetchedLevelFor(GROUND_TRUTH_TIER)
    const header = loadTerrainHeader()
    const terrain = createTerrainField(header, level, loadTerrainLevel(level, header))
    let world: World<undefined> = worldFromScenario(loadScenarioBundle('deck-quals'), terrain)
    const ship = () => world.ships.find((s) => s.id === 'cv-1')!
    const deck0 = deckOf(ship())!
    const wind = world.wind!
    const APPROACH_M = 4000
    const aimLocalZ = -deck0.lengthM / 2 + deck0.trapFromSternM
    const startLocal = deckWorld(deck0, 0, aimLocalZ - APPROACH_M)
    const vref = VREF_STALL_MULTIPLE * f6f.reference.stallSpeedFlapMps
    const along = v3(Math.sin(deck0.headingRad), 0, -Math.cos(deck0.headingRad))
    world = withAircraftState(world, world.player, createState({
      position: v3(startLocal.x, deck0.center.y + f6f.gear.heightM + APPROACH_M * Math.tan((3.5 * Math.PI) / 180), startLocal.z),
      velocity: v3(along.x * (vref + 7.717), 0, along.z * (vref + 7.717)),
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck0.headingRad),
      gearFraction: 1,
      flapFraction: 1,
    }))
    world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }
    const table: { state: AircraftState; controls: Controls; deck: Deck }[] = []
    for (let i = 0; i < 60 * 125; i++) {
      const before = playerAircraft(world).state
      const d = deckOf(ship())!
      const aim = deckWorld(d, 0, aimLocalZ)
      const controls = approachControls(f6f, before, {
        aimX: aim.x, aimZ: aim.z, runwayHeadingRad: d.headingRad,
        touchdownElevationM: d.center.y, surfaceVelocity: d.velocity, windVelocity: wind, hookDown: true,
      })
      if (i % 60 === 0) table.push({ state: before, controls, deck: d })
      world = advance(withControls(world, world.player, controls), DT).world
    }
    const p = ship().spec.paddles!
    const inside = table.filter((r) => paddlesWindow(f6f, r.state, r.controls, r.deck, p)).length
    // Both sides of the gate are exercised: in on final, out before and after.
    expect(inside).toBeGreaterThan(10)
    expect(table.length - inside).toBeGreaterThan(10)
    for (const r of table) {
      expect(paddlesWindow(f6f, r.state, r.controls, r.deck, p)).toBe(paddlesCue(f6f, r.state, r.controls, r.deck, p, wind) !== null)
    }
  })
})
