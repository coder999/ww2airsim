import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import {
  measureTopSpeed,
  measureClimbRate,
  measureStallSpeed,
  measureRollRate,
} from '../../../tools/testcards/measure.js'

const zero = loadAircraftSpec('a6m2-zero')
const ref = zero.reference

/** Never widen to make a red card pass (f6f.test.ts's rule). Every
 *  tolerance below was set from the measurement in its comment. */
const within = (actual: number, expected: number, tol: number) => {
  const err = Math.abs(actual - expected) / expected
  return { pass: err <= tol, err, actual, expected }
}
const pct = (r: { err: number }) => `${(r.err * 100).toFixed(2)}% off`

const climbSeaLevel = measureClimbRate(zero, 0)

describe('A6M2 Model 21 flight test card (Informational Intelligence Summary No. 85, calibrated table)', () => {
  it('is graded at the trial weight, 5,555 lb, with no take-off distance of its own', () => {
    expect(ref.testMassKg).toBe(2519.71)
    expect(ref.takeoffDistanceM).toBeUndefined()
    expect(ref.topSpeedByAltitudeM).toHaveLength(6)
    expect(ref.climbRateByAltitudeM).toHaveLength(3)
    // The table prints "10,000" twice; the asterisked row is the 16,000 ft
    // critical altitude (spec §4.1). The source string must say so.
    expect(ref.source).toMatch(/16,000/)
  })

  // Measured 2026-09-25 (plan probe): 142.10 m/s against 145.74, -2.50%.
  // 5% is 2x the measurement, tighter than the spec's 15% starting point.
  it('reaches its top speed at the 16,000 ft critical altitude', () => {
    const r = within(measureTopSpeed(zero, ref.topSpeedAltitudeM), ref.topSpeedMps, 0.05)
    expect(r.pass, `top speed ${r.actual.toFixed(2)} m/s vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  // Measured 2026-09-25: SL +3.51%, 5k +2.17%, 10k +0.94%, 20k -2.13%,
  // 25k -2.35%, 30k -3.70%. Spec §4.3 item 2's 5% each; worst is 1.35x under it.
  it.each(zero.reference.topSpeedByAltitudeM ?? [])('reaches its trial speed at %d m', (altitudeM, speedMps) => {
    const r = within(measureTopSpeed(zero, altitudeM), speedMps, 0.05)
    expect(r.pass, `top speed at ${altitudeM} m ${r.actual.toFixed(2)} vs ${speedMps} (${pct(r)})`).toBe(true)
  })

  // Measured 2026-09-25: 16.166 m/s against 13.97, +15.72%. The F6F reads
  // +16.77% on the same harness: the model's known climb bias, shared.
  // 25% is the F6F's tolerance (spec §4.3 item 3).
  it('climbs at its sea-level rate', () => {
    const r = within(climbSeaLevel, ref.climbRateMps, 0.25)
    expect(r.pass, `climb ${r.actual.toFixed(3)} m/s vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  // Measured 2026-09-25: 15k +18.17%, 20k +22.41%, 30k +17.57%. 30% is the
  // spec's figure. The spec's §4.2 baseline (cd0 0.0195, eta 0.75, curve flat
  // to 4,877 m) read +44.2 / +55.7 / +63.1% here: the power curve is shared
  // by level flight (with ram) and the climb (without), and is fitted to both.
  it.each(zero.reference.climbRateByAltitudeM ?? [])('climbs at its trial rate at %d m', (altitudeM, rateMps) => {
    const r = within(measureClimbRate(zero, altitudeM), rateMps, 0.3)
    expect(r.pass, `climb at ${altitudeM} m ${r.actual.toFixed(3)} vs ${rateMps} (${pct(r)})`).toBe(true)
  })

  it('climbs more slowly at each higher altitude in its table', () => {
    const rates = [climbSeaLevel, ...(ref.climbRateByAltitudeM ?? []).map(([a]) => measureClimbRate(zero, a))]
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeLessThan(rates[i - 1]!)
  })

  // Measured 2026-09-25: 35.765 clean (+2.57%), 31.585 flaps (+2.38%).
  // 20% each, the F6F's (spec §4.3 item 5).
  it('stalls near its clean, power-off stall speed', () => {
    const r = within(measureStallSpeed(zero, 0, 0), ref.stallSpeedMps, 0.2)
    expect(r.pass, `stall ${r.actual.toFixed(3)} vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it('stalls near its gear-and-flaps-down stall speed', () => {
    const r = within(measureStallSpeed(zero, 0, 1), ref.stallSpeedFlapMps, 0.2)
    expect(r.pass, `flap stall ${r.actual.toFixed(3)} vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  // (78/69)^2 = 1.2779 is the CLmax ratio the two sourced stalls imply.
  // Measured 2026-09-25: 1.2822.
  it('stalls slower with flaps by about the derived CLmax ratio', () => {
    const clean = measureStallSpeed(zero, 0, 0)
    const flapped = measureStallSpeed(zero, 0, 1)
    expect(flapped).toBeLessThan(clean)
    expect((clean / flapped) ** 2).toBeCloseTo(1.2779, 1)
  })

  // An unsourced estimate graded against itself, as the F6F's is. Measured
  // 2026-09-25: 79.996 deg/s at 95 m/s.
  it('rolls at its estimated rate at the reference speed', () => {
    const r = within(measureRollRate(zero, 0, zero.rates.rateRefSpeedMps), ref.rollRateDegPerSec, 0.15)
    expect(r.pass, `roll ${r.actual.toFixed(3)} deg/s vs ${r.expected}`).toBe(true)
  })
})
