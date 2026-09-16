import { describe, it, expect } from 'vitest'
import {
  gearAfter,
  gearDragN,
  onGround,
  restOnSurface,
  supportedContact,
  GROUND_CONTACT_TOLERANCE_M,
  MAX_SUPPORTED_SINK_MPS,
} from '../../src/sim/ground.js'
import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const DT = 1 / 60

describe('landing gear', () => {
  it('starts up, so no existing flight gains drag it did not have', () => {
    expect(createState().gearFraction).toBe(0)
  })

  it('takes the spec travel time to come down, not one tick', () => {
    let g = 0
    for (let i = 0; i < 60 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, true, DT)
    expect(g).toBeCloseTo(1, 6)
  })

  it('is still on its way down halfway through the travel time', () => {
    let g = 0
    for (let i = 0; i < 30 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, true, DT)
    expect(g).toBeGreaterThan(0.3)
    expect(g).toBeLessThan(0.7)
  })

  it('retracts on the same travel time', () => {
    let g = 1
    for (let i = 0; i < 60 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, false, DT)
    expect(g).toBeCloseTo(0, 6)
  })

  it('never leaves [0, 1], whatever dt it is handed', () => {
    expect(gearAfter(f6f, 0.9, true, 100)).toBe(1)
    expect(gearAfter(f6f, 0.1, false, 100)).toBe(0)
  })

  it('holds position for a non-finite dt rather than poisoning the state', () => {
    // Every other dt consumer in this codebase guards this; a NaN reaching
    // gearFraction would reach drag and from there the integrator.
    expect(gearAfter(f6f, 0.5, true, Number.NaN)).toBe(0.5)
  })
})

describe('gear drag', () => {
  it('is nothing with the gear up', () => {
    expect(gearDragN(f6f, 0, 5000)).toBe(0)
  })

  it('scales with how far the gear has travelled', () => {
    const half = gearDragN(f6f, 0.5, 5000)
    const full = gearDragN(f6f, 1, 5000)
    expect(half).toBeCloseTo(full / 2, 9)
    expect(full).toBeGreaterThan(0)
  })

  it('scales with dynamic pressure, like every other drag term here', () => {
    expect(gearDragN(f6f, 1, 10000)).toBeCloseTo(2 * gearDragN(f6f, 1, 5000), 9)
  })
})

describe('weight on wheels', () => {
  const at = (y: number) => createState({ position: v3(0, y, 0) })

  it('is false well above the ground', () => {
    expect(onGround(at(500), 0)).toBe(false)
  })

  it('is true resting exactly on it', () => {
    expect(onGround(at(0), 0)).toBe(true)
  })

  it('is true within the contact tolerance', () => {
    expect(onGround(at(GROUND_CONTACT_TOLERANCE_M * 0.5), 0)).toBe(true)
  })

  it('is false just outside it', () => {
    expect(onGround(at(GROUND_CONTACT_TOLERANCE_M * 2), 0)).toBe(false)
  })

  it('reads a hilltop as ground, not sea level', () => {
    expect(onGround(at(1000), 1000)).toBe(true)
    expect(onGround(at(1000), 0)).toBe(false)
  })

  it('is false for a non-finite position rather than true', () => {
    // Written as a positive comparison so NaN fails it, the same posture
    // `contactOutcome` takes: a broken state must not be reported as safely
    // on the ground, where the constraint would then act on it.
    expect(onGround(at(Number.NaN), 0)).toBe(false)
  })
})

describe('the ground constraint', () => {
  it('kills the sink rate of an airplane settling onto the surface', () => {
    const s = createState({ position: v3(0, 0.1, 0), velocity: v3(50, -2, 0) })
    const r = restOnSurface(s, 0)
    expect(r.velocity.y).toBe(0)
    expect(r.velocity.x).toBe(50)
  })

  it('places it exactly on the surface', () => {
    expect(restOnSurface(createState({ position: v3(0, 0.1, 0) }), 0).position.y).toBe(0)
  })

  it('NEVER lifts an airplane that is below the surface', () => {
    // Raising it would add g*h and trip assertNoEnergyGain at idle throttle.
    // Below the surface is Plan 10's business, not this function's.
    const below = createState({ position: v3(0, -5, 0), velocity: v3(50, -2, 0) })
    expect(restOnSurface(below, 0).position.y).toBe(-5)
  })

  it('leaves a climbing airplane alone, vertical velocity included', () => {
    // On the take-off roll the airplane is within tolerance of the ground while
    // rotating; clamping a positive climb rate to zero would pin it to the
    // runway and it would never fly.
    const r = restOnSurface(createState({ position: v3(0, 0.1, 0), velocity: v3(60, 3, 0) }), 0)
    expect(r.velocity.y).toBe(3)
  })
})

describe('supported contact (Task 5b)', () => {
  const resting = (extra: Partial<AircraftState> = {}) =>
    createState({ position: v3(0, 0, 0), velocity: v3(0, 0, 0), gearFraction: 1, ...extra })

  it('is supported with the gear down, resting, at no sink rate', () => {
    expect(supportedContact(f6f, resting(), 0)).toBe(true)
  })

  it('is NOT supported with the gear up, all else equal', () => {
    expect(supportedContact(f6f, resting({ gearFraction: 0 }), 0)).toBe(false)
  })

  it('is NOT supported arriving faster than the sink-rate limit', () => {
    const hard = resting({ velocity: v3(0, -MAX_SUPPORTED_SINK_MPS - 1, 0) })
    expect(supportedContact(f6f, hard, 0)).toBe(false)
  })

  it('is NOT supported well above the ground', () => {
    expect(supportedContact(f6f, resting({ position: v3(0, 500, 0) }), 0)).toBe(false)
  })

  it('is NOT supported for a non-finite state, the same posture contactOutcome takes', () => {
    expect(supportedContact(f6f, resting({ position: v3(0, Number.NaN, 0) }), 0)).toBe(false)
  })
})
