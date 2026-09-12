import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../src/sim/content.js'
import { measureTopSpeed, measureClimbRate, measureStallSpeed, measureRollRate }
  from '../../../tools/testcards/measure.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const ref = f6f.reference

/** Wide to start. Tighten as the model matures; never widen to make a red
 *  test pass, because that converts the reference figure into decoration. */
const TOL = 0.15

const within = (actual: number, expected: number, tol = TOL) => {
  const err = Math.abs(actual - expected) / expected
  return { pass: err <= tol, err, actual, expected }
}

describe('F6F-5 flight test card', () => {
  it('reaches its documented top speed at its critical altitude', () => {
    const r = within(measureTopSpeed(f6f, ref.topSpeedAltitudeM), ref.topSpeedMps)
    expect(r.pass, `top speed ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  it('climbs at its documented sea-level rate', () => {
    const r = within(measureClimbRate(f6f, 0), ref.climbRateMps, 0.25)
    expect(r.pass, `climb ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  it('stalls near its documented stall speed', () => {
    const r = within(measureStallSpeed(f6f, 0), ref.stallSpeedMps, 0.2)
    expect(r.pass, `stall ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  // Ruling R4: measured at altitude 0, not the brief's 1000 m. Rate authority
  // scales dynamic pressure against SEA-LEVEL dynamic pressure at the
  // reference speed, so only altitude 0 gives authority exactly 1.0. Measuring
  // at 1000 m and comparing the result to a sea-level reference figure grades
  // the aircraft on the atmosphere instead of on its ailerons.
  it('rolls at its documented rate at the reference speed', () => {
    const r = within(measureRollRate(f6f, 0, f6f.rates.rateRefSpeedMps), ref.rollRateDegPerSec)
    expect(r.pass, `roll ${r.actual.toFixed(1)} deg/s vs reference ${r.expected}`).toBe(true)
  })

  it('climbs more slowly at altitude than at sea level', () => {
    expect(measureClimbRate(f6f, 8000)).toBeLessThan(measureClimbRate(f6f, 0))
  })
})
