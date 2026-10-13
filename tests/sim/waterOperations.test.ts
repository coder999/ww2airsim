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
  safeWaterArrival,
  supportedWaterContact,
  waterBodyRates,
  waterLateralGripAfter,
  waterResistanceN,
} from '../../src/sim/waterOperations.js'
import { waterSurfaceAt, waterSurfaceContext } from '../../src/sim/waterSurface.js'

const base = loadAircraftSpec('p-38-lightning')
const catalina = loadAircraftSpec('pby-5a-catalina')
const spec: AircraftSpec = {
  ...base,
  waterOperations: {
    hullDepthM: 2.5,
    hullBeamM: 3.1,
    displacementDraftM: 0.5,
    planingDraftM: 0.1,
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

const afloat = createState({ position: v3(0, 2, 0), gearFraction: 0, flapFraction: 1 })
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
    expect(safeWaterArrival(spec, { ...afloat, position: v3(0, 2.5, 0), velocity: v3(46, -1, 0) }, 0)).toBe(false)
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

  it('rests at the speed-dependent authored draft and removes sink', () => {
    const sunk = { ...afloat, position: v3(4, 2.49, 7), velocity: v3(25, -1, 0) }
    const rested = restOnWater(spec, sunk, 0)
    expect(rested.position).toEqual(v3(4, 2.1, 7))
    expect(rested.velocity.y).toBe(0)
    expect(rested.velocity.x).toBe(25)
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
    const arrows = waterBodyRates(spec, tilted, { pitch: 0, roll: 1, yaw: 0, throttle: 0 }, v3(0, 0, 0))
    expect(arrows.y).toBeCloseTo(low.y)
    const fast = waterBodyRates(spec, { ...afloat, velocity: v3(40, 0, 0) }, { pitch: 0, roll: 0, yaw: 1, throttle: 0 }, v3(0, 0.02, 0))
    expect(fast.y).toBeCloseTo(0.02)
  })

  it('damps sideways water travel toward the heading without adding energy', () => {
    const turned = { ...afloat, velocity: v3(8, 0, 8) }
    const after = waterLateralGripAfter(spec, turned, 1, v3(0, 0, 0))
    expect(after.x).toBeCloseTo(8)
    expect(after.z).toBeGreaterThan(0)
    expect(after.z).toBeLessThan(8)
    expect(Math.hypot(after.x, after.z)).toBeLessThan(Math.hypot(turned.velocity.x, turned.velocity.z))
  })

  it('stays active and afloat through the real fixed-step/impact seam', () => {
    const water0 = waterSurfaceAt(waterSurfaceContext(0, null), 0, 0)
    const waveAfloat = {
      ...afloat,
      position: v3(0, water0.heightM + spec.waterOperations!.hullDepthM - spec.waterOperations!.displacementDraftM, 0),
      velocity: v3(0, water0.verticalSpeedMps, 0),
    }
    let world = createWorldOf({
      aircraft: [{
        id: 'amphibian', spec, state: waveAfloat, previous: waveAfloat,
        controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 },
        assistMemory: undefined, impact: null, parked: false,
      }],
      player: 'amphibian',
      terrain: sea,
    })
    for (let i = 0; i < 180; i++) world = advance(world, DT).world
    const airplane = playerAircraft(world)
    const support = waterSurfaceAt(waterSurfaceContext(world.tick * DT, world.wind), airplane.state.position.x, airplane.state.position.z)
    expect(airplane.impact).toBeNull()
    expect(airplane.state.position.y).toBeCloseTo(support.heightM + 2, 4)
    expect(airplane.state.velocity.y).toBeCloseTo(support.verticalSpeedMps, 4)
  })

  it('accelerates the real Catalina from displacement through planing and takes off', () => {
    const water0 = waterSurfaceAt(waterSurfaceContext(0, null), 0, 0)
    const start = createState({
      position: v3(0, water0.heightM + catalina.waterOperations!.hullDepthM - catalina.waterOperations!.displacementDraftM, 0),
      velocity: v3(0, water0.verticalSpeedMps, 0),
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

  it('slows a power-off Catalina from the step to taxi speed within 45 seconds', () => {
    const water0 = waterSurfaceAt(waterSurfaceContext(0, null), 0, 0)
    const operations = catalina.waterOperations!
    const speedMps = operations.takeoffSpeedMps - 0.5
    const draftM = operations.planingDraftM
    const start = createState({
      position: v3(0, water0.heightM + operations.hullDepthM - draftM, 0),
      velocity: v3(speedMps, water0.verticalSpeedMps, 0),
      attitude: qFromAxisAngle(v3(0, 0, 1), operations.planingPitchDeg * Math.PI / 180),
      gearFraction: 0,
      flapFraction: 1,
      fuelKg: 1800,
    })
    let world = createWorldOf({
      aircraft: [{
        id: 'catalina', spec: catalina, state: start, previous: start,
        controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: false, flapDown: true },
        assistMemory: undefined, impact: null, parked: false,
      }],
      player: 'catalina', terrain: sea, wind: v3(0, 0, 0),
    })
    let taxiAtS: number | null = null
    for (let i = 1; i <= 45 / DT; i++) {
      world = advance(world, DT).world
      const aircraft = playerAircraft(world)
      expect(aircraft.impact).toBeNull()
      if (Math.hypot(aircraft.state.velocity.x, aircraft.state.velocity.z) <= 5) {
        taxiAtS = i * DT
        break
      }
    }
    expect(taxiAtS, 'the power-off water rollout remained above 10 knots after 45 seconds').not.toBeNull()
  })

  it('turns the real Catalina water-taxi track with the arrow-key roll channel', () => {
    const water0 = waterSurfaceAt(waterSurfaceContext(0, null), 0, 0)
    const operations = catalina.waterOperations!
    const start = createState({
      position: v3(0, water0.heightM + operations.hullDepthM - operations.displacementDraftM, 0),
      velocity: v3(8, water0.verticalSpeedMps, 0),
      attitude: qFromAxisAngle(v3(0, 0, 1), operations.restPitchDeg * Math.PI / 180),
      gearFraction: 0,
      flapFraction: 1,
      fuelKg: 1800,
    })
    let world = createWorldOf({
      aircraft: [{
        id: 'catalina', spec: catalina, state: start, previous: start,
        controls: { pitch: 0, roll: 1, yaw: 0, throttle: 0, gearDown: false, flapDown: true },
        assistMemory: undefined, impact: null, parked: false,
      }],
      player: 'catalina', terrain: sea, wind: v3(0, 0, 0),
    })
    for (let i = 0; i < 5 / DT; i++) world = advance(world, DT).world
    const turned = playerAircraft(world)
    expect(turned.impact).toBeNull()
    expect(turned.state.position.z).toBeGreaterThan(2)
    expect(turned.state.velocity.z).toBeGreaterThan(0.5)
  })

  it('carries a configured Catalina arrival through the real impact seam and rejects an overspeed one', () => {
    const arrive = (speedMps: number, sinkMps: number, pitchDeg = 5) => {
      const start = createState({
        position: v3(0, catalina.waterOperations!.hullDepthM + 0.3, 0),
        velocity: v3(speedMps, -sinkMps, 0),
        attitude: qFromAxisAngle(v3(0, 0, 1), pitchDeg * Math.PI / 180),
        gearFraction: 0,
        flapFraction: 1,
        fuelKg: 1800,
      })
      let world = createWorldOf({
        aircraft: [{
          id: 'catalina', spec: catalina, state: start, previous: start,
          controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: false, flapDown: true },
          assistMemory: undefined, impact: null, parked: false,
        }],
        player: 'catalina', terrain: sea, wind: v3(0, 0, 0),
      })
      for (let i = 0; i < 12; i++) world = advance(world, DT).world
      return playerAircraft(world)
    }

    const safe = arrive(40, 3.4, -1)
    expect(safe.impact).toBeNull()
    expect(onWater(catalina, safe.state, 0)).toBe(true)
    expect(safeWaterArrival(catalina, {
      ...safe.state,
      position: v3(0, catalina.waterOperations!.hullDepthM, 0),
      velocity: v3(50, -1, 0),
    }, 0)).toBe(false)
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

