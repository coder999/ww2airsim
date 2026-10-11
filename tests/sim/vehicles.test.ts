import { describe, expect, it } from 'vitest'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { createVehicleState, parseVehicleSpec, stepVehicle } from '../../src/sim/world/vehicles.js'

const spec = parseVehicleSpec({
  id: 'scout', name: 'Scout', lengthM: 3.6, widthM: 1.5, heightM: 1.7,
  maxSpeedMps: 20, turnRateRadPerS: 0.5, hp: 35, view: { model: 'scout' },
})
const route = { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -10 }], speedMps: 5, loop: false }
const ctx = (tick: number, terrain = null) => ({ tick, dt: 1, terrain, wind: null, decks: [] })

describe('ground vehicle kinematics', () => {
  it('follows an authored route deterministically and stops at its end by default', () => {
    let a = createVehicleState(spec, route, null)
    let b = createVehicleState(spec, route, null)
    for (let tick = 1; tick <= 3; tick++) {
      a = stepVehicle(spec, a, route, ctx(tick))
      b = stepVehicle(spec, b, route, ctx(tick))
    }
    expect(a).toEqual(b)
    expect(a.position.z).toBe(-10)
    expect(a.distanceM).toBe(10)
    expect(a.stopped).toBe(true)
    expect(a.speedMps).toBe(0)
  })

  it('loops only when requested and stops immediately when destroyed', () => {
    const loop = { ...route, loop: true }
    let s = createVehicleState(spec, loop, null)
    s = stepVehicle(spec, s, loop, ctx(1))
    s = stepVehicle(spec, s, loop, ctx(2))
    expect(s.waypoint).toBe(0)
    expect(s.stopped).toBe(false)
    const wreck = stepVehicle(spec, s, loop, ctx(3), true)
    expect(wreck.position).toEqual(s.position)
    expect(wreck.stopped).toBe(true)
  })

  it('follows terrain height and derives pitch from the sampled slope', () => {
    const terrain = createTerrainField({ centreLatDeg: 0, centreLonDeg: 0, halfExtentM: 10, finestSamples: 3, levels: 1, encoding: 'int16-decimetres' }, 0,
      new Int16Array([100, 100, 100, 50, 50, 50, 0, 0, 0]))
    const state = createVehicleState(spec, route, terrain)
    expect(state.position.y).toBeCloseTo(5)
    expect(state.pitchRad).toBeGreaterThan(0)
  })

  it('rejects speeds above the vehicle spec limit', () => {
    expect(() => createVehicleState(spec, { ...route, speedMps: 21 }, null)).toThrow(/speed/)
  })
})
