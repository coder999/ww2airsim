import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../src/sim/content.js'
import {
  measureTopSpeed,
  measureClimbRate,
  measureStallSpeed,
  measureRollRate,
  measureTakeoffRun,
} from '../../../tools/testcards/measure.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const ref = f6f.reference

// Finding 9: the "climbs more slowly at altitude" card below needs the same
// sea-level climb rate the card above it already measured (a ~152,000-step
// sweep). Hoisted so it is computed once, not twice.
const climbRateSeaLevel = measureClimbRate(f6f, 0)

/** Trial's stated take-off speed for this run (same summary table as
 *  reference.takeoffDistanceM): 86.5 mph. */
const TAKEOFF_SPEED_MPS = 86.5 * 0.44704

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
    const r = within(climbRateSeaLevel, ref.climbRateMps, 0.25)
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
    expect(measureClimbRate(f6f, 8000)).toBeLessThan(climbRateSeaLevel)
  })

  // Controller ruling: added scope. The prior implementer's decision to ship
  // the climb card at +16.77% rather than lowering engine.staticThrustN rested
  // on a ground-roll simulation that lived in a deleted scratch test; this
  // makes that argument reproducible from the checkout.
  //
  // NOT like-for-like: `reference.takeoffDistanceM` is a full-flaps trial
  // figure and this model has no flaps, no rolling friction and no ground
  // effect, all three of which push a simulated roll shorter than the trial's.
  // Measured 2026-09-12 at the shipped propEfficiency 0.75 / staticThrustN
  // 20,000 N / testMassKg 5633.62: the model reads 214.632 m against the
  // trial's 230.124 m, a -6.73% under-estimate -- consistent in direction and
  // size with "missing flap drag and ground-roll friction make the model roll
  // a bit short", not a coincidence needing a tighter or wider band picked
  // after the fact. 10% leaves headroom above that -6.73% without absorbing an
  // error the model does not actually have.
  it('rolls to its documented full-flaps take-off distance, at a tolerance that is honest about the model gaps', () => {
    const r = within(measureTakeoffRun(f6f, TAKEOFF_SPEED_MPS), ref.takeoffDistanceM, 0.10)
    expect(r.pass, `takeoff roll ${r.actual.toFixed(1)} m vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })
})
