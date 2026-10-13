import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { advance, createWorldOf, playerAircraft } from '../../src/sim/loop.js'
import { nextLandingTracking, NO_LANDING } from '../../src/sim/landing.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import {
  onWater,
  planingFraction,
  restOnWater,
  supportedWaterContact,
  waterBodyRates,
  waterResistanceN,
} from '../../src/sim/waterOperations.js'

const base = loadAircraftSpec('p-38-lightning')
const catalina = loadAircraftSpec('pby-5a-catalina')
const spec: AircraftSpec = {
  ...base,
  waterOperations: {
    hullDepthM: 2.5,
    floatHalfSpanM: 13.6,
    floatDepthM: 2.3,
    restPitchDeg: 3,
    planingPitchDeg: 6,
    planingSpeedMps: 20,
    takeoffSpeedMps: 40,
    maxLandingSpeedMps: 45,
    maxLandingSinkMps: 3,
    displacementDragCoeff: 0.08,
    planingDragCoeff: 0.02,
    taxiYawRateDegPerSec: 8,
    source: 'TEST ESTIMATES',
  },
}

const afloat = createState({ position: v3(0, 2.5, 0), gearFraction: 0, flapFraction: 1 })
const sea = createTerrainField(parseTerrainHeader({
  centreLatDeg: 0,
  centreLonDeg: 0,
  halfExtentM: 100,
  finestSamples: 8193,
  levels: 13,
  encoding: 'int16-decimetres',
}), 12, new Int16Array(9))

describe('water operations', () => {
  it('requires an opted-in hull, retracted gear, and a safe arrival', () => {
    expect(onWater(base, afloat, 0)).toBe(false)
    expect(supportedWaterContact(spec, afloat, 0)).toBe(true)
    expect(supportedWaterContact(spec, { ...afloat, gearFraction: 1 }, 0)).toBe(false)
    expect(supportedWaterContact(spec, { ...afloat, flapFraction: 0 }, 0)).toBe(false)
    expect(supportedWaterContact(spec, { ...afloat, velocity: v3(20, -3.01, 0) }, 0)).toBe(false)
    expect(supportedWaterContact(spec, { ...afloat, velocity: v3(46, -1, 0) }, 0)).toBe(false)
    expect(supportedWaterContact(spec, { ...afloat, velocity: v3(46, 0, 0) }, 0)).toBe(true)
    const banked = { ...afloat, attitude: qFromAxisAngle(v3(1, 0, 0), 11 * Math.PI / 180) }
    expect(supportedWaterContact(spec, banked, 0)).toBe(false)
  })

  it('blends to lower planing resistance without reversing a stopped hull', () => {
    expect(planingFraction(spec, 10)).toBe(0)
    expect(planingFraction(spec, 30)).toBe(0.5)
    expect(planingFraction(spec, 50)).toBe(1)
    expect(waterResistanceN(spec, 1000, 10)).toBeCloseTo(784.532)
    expect(waterResistanceN(spec, 1000, 50)).toBeCloseTo(196.133)
  })

  it('rests on the authored keel datum and removes sink', () => {
    const sunk = { ...afloat, position: v3(4, 2.49, 7), velocity: v3(25, -1, 0) }
    const rested = restOnWater(spec, sunk, 0)
    expect(rested.position).toEqual(v3(4, 2.5, 7))
    expect(rested.velocity.y).toBe(0)
    expect(rested.velocity.x).toBeLessThan(25)
  })

  it('settles roll/pitch and provides low-speed taxi yaw that fades', () => {
    const tilted = {
      ...afloat,
      attitude: qFromAxisAngle(v3(1, 0, 0), 6 * Math.PI / 180),
      velocity: v3(0, 0, 0),
    }
    const low = waterBodyRates(spec, tilted, { pitch: 0, roll: 0, yaw: 1, throttle: 0 }, v3(0, 0, 0))
    expect(low.x).toBeLessThan(0)
    expect(low.y).toBeCloseTo(-8 * Math.PI / 180)
    expect(low.z).toBeGreaterThan(0)
    const fast = waterBodyRates(spec, { ...afloat, velocity: v3(40, 0, 0) }, { pitch: 0, roll: 0, yaw: 1, throttle: 0 }, v3(0, 0.02, 0))
    expect(fast.y).toBeCloseTo(0.02)
  })

  it('stays active and afloat through the real fixed-step/impact seam', () => {
    let world = createWorldOf({
      aircraft: [{
        id: 'amphibian', spec, state: afloat, previous: afloat,
        controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 },
        assistMemory: undefined, impact: null, parked: false,
      }],
      player: 'amphibian',
      terrain: sea,
    })
    for (let i = 0; i < 180; i++) world = advance(world, DT).world
    const airplane = playerAircraft(world)
    expect(airplane.impact).toBeNull()
    expect(airplane.state.position.y).toBeCloseTo(2.5, 6)
    expect(airplane.state.velocity.y).toBeCloseTo(0, 9)
  })

  it('accelerates the real Catalina from displacement through planing and takes off', () => {
    const start = createState({
      position: v3(0, catalina.waterOperations!.hullDepthM, 0),
      attitude: qFromAxisAngle(v3(0, 0, 1), catalina.waterOperations!.restPitchDeg * Math.PI / 180),
      gearFraction: 0,
      flapFraction: 1,
      fuelKg: 1800,
    })
    let world = createWorldOf({
      aircraft: [{
        id: 'catalina', spec: catalina, state: start, previous: start,
        controls: { pitch: 0.18, roll: 0, yaw: 0, throttle: 1, gearDown: false, flapDown: true },
        assistMemory: undefined, impact: null, parked: false,
      }],
      player: 'catalina',
      terrain: sea,
    })
    let maxSpeedMps = 0
    let airborneTick: number | null = null
    for (let i = 0; i < 60 / DT; i++) {
      world = advance(world, DT).world
      const aircraft = playerAircraft(world)
      maxSpeedMps = Math.max(maxSpeedMps, Math.hypot(aircraft.state.velocity.x, aircraft.state.velocity.y, aircraft.state.velocity.z))
      if (aircraft.state.position.y > catalina.waterOperations!.hullDepthM + 10) {
        airborneTick = aircraft.state.tick
        break
      }
      expect(aircraft.impact).toBeNull()
    }
    expect(maxSpeedMps, 'the hull never reached its authored water takeoff speed').toBeGreaterThanOrEqual(catalina.waterOperations!.takeoffSpeedMps)
    expect(airborneTick, 'the Catalina did not climb 10 m clear of the water within 60 seconds').not.toBeNull()
  })

  it('records a completed open-water landing rather than an airfield recovery', () => {
    const high = { ...afloat, position: v3(0, 13, 0), velocity: v3(30, -1, 0) }
    const near = { ...afloat, position: v3(0, 2.5, 0), velocity: v3(30, -1, 0), tick: 1 }
    const stopped = { ...afloat, position: v3(0.5, 2.5, 0), tick: 2 }
    const airborne = nextLandingTracking(spec, NO_LANDING, afloat, high, sea, [])
    const touched = nextLandingTracking(spec, airborne, high, near, sea, [])
    const landed = nextLandingTracking(spec, touched, near, stopped, sea, [])
    expect(landed.report?.at).toEqual({ kind: 'water', id: 'open-water', name: 'Open water' })
    expect(landed.report?.rollOutM).toBeCloseTo(0.5)
  })
})

