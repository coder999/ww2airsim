import { describe, it, expect } from 'vitest'
import { gearAfter } from '../../src/sim/ground.js'
import { createState } from '../../src/sim/flight/state.js'
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
