import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { measureRollRate, measureStallSpeed, measureTakeoffRun, measureTopSpeed } from '../../../tools/testcards/measure.js'

const zero = loadAircraftSpec('a6m2-zero')
const ref = zero.reference

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
})

describe('A6M2: controls stiffen at high speed (Eglin: "slow rate of roll of the Zero at high speeds")', () => {
  // Fraction from content: 1.0 to 111.76 m/s (250 mph), 0.35 at 134.11
  // (300 mph), 0.2 from 156.46 (350 mph). At 150 m/s that is
  // 0.35 - 0.15 * (150 - 134.11) / 22.35 = 0.24336, times 80 deg/s.
  it('rolls at 80 deg/s under 250 mph and about 19.5 deg/s at 150 m/s', () => {
    expect(measureRollRate(zero, 0, 111.76)).toBeCloseTo(80, 0)
    expect(measureRollRate(zero, 0, 150)).toBeCloseTo(80 * 0.24336, 0)
  })
})

describe('A6M2 against F6F-5: the matchup emerges from data (master spec §5; A6M spec §4.3 item 7)', () => {
  const f6f = loadAircraftSpec('f6f-hellcat')
  const table: [number, number][] = [
    [zero.reference.topSpeedAltitudeM, zero.reference.topSpeedMps],
    ...(zero.reference.topSpeedByAltitudeM ?? []),
  ]

  // Measured 2026-09-25, F6F vs Zero, m/s: SL 137.30 / 124.93, 16k 160.28 /
  // 142.10, 30k 169.39 / 131.73.
  it.each(table)('the F6F is faster at %d m', (altitudeM) => {
    expect(measureTopSpeed(f6f, altitudeM)).toBeGreaterThan(measureTopSpeed(zero, altitudeM))
  })

  // Measured 2026-09-25: clean 35.77 vs 45.47, flaps 31.59 vs 39.13 m/s.
  it('the Zero stalls slower, clean and with flaps', () => {
    expect(measureStallSpeed(zero, 0, 0)).toBeLessThan(measureStallSpeed(f6f, 0, 0))
    expect(measureStallSpeed(zero, 0, 1)).toBeLessThan(measureStallSpeed(f6f, 0, 1))
  })

  // Each at its own sourced take-off speed, both at full flaps (how the F6F's
  // trial and card fly). Measured 2026-09-25: 168.17 m vs 236.08 m.
  it('the Zero\'s take-off roll is shorter', () => {
    const zeroRoll = measureTakeoffRun(zero, 75 * 0.44704, 1)
    const f6fRoll = measureTakeoffRun(f6f, 86.5 * 0.44704, 1)
    expect(zeroRoll).toBeLessThan(f6fRoll)
  })

  // The Hellcat pilot's escape: fast, the F6F out-rolls it; slow, it does
  // not. Measured 2026-09-25 (before the fade): at 90 m/s F6F 69.90, Zero
  // 75.79; at 150 m/s the F6F 80.00 and the Zero about 19.5 with the fade.
  it('at 150 m/s EAS the F6F out-rolls the Zero, but at 90 m/s it does not', () => {
    expect(measureRollRate(f6f, 0, 150)).toBeGreaterThan(measureRollRate(zero, 0, 150))
    expect(measureRollRate(f6f, 0, 90)).toBeLessThanOrEqual(measureRollRate(zero, 0, 90))
  })

  // The inputs 7c's envelope reads (its spec §3.3): wing loading at the
  // trial weight. F6F 1,780 N/m^2, Zero 1,101: a ratio of 1.62, well past
  // the 1.1 "turnfight" threshold 7c will use.
  it('the Zero\'s wing loading is at least 1.1x lighter than the F6F\'s at their trial weights', () => {
    const loading = (s: typeof zero) => (s.reference.testMassKg * 9.80665) / s.geometry.wingAreaM2
    expect(loading(f6f) / loading(zero)).toBeGreaterThan(1.1)
  })
})
