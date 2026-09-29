// tests/sim/testcards/f4f.test.ts
// F4F-4 against F6F-5: what the sources say must fall out of the data (W1 spec §1). Grading
// against the F4F's own trials is graded.test.ts's job; this file holds only the matchup.
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { measureTopSpeed, measureClimbRate, measureStallSpeed, measureTakeoffRun } from '../../../tools/testcards/measure.js'

const f4f = loadAircraftSpec('f4f-wildcat')
const f6f = loadAircraftSpec('f6f-hellcat')
const MPH = 0.44704

describe('F4F-4 against F6F-5', () => {
  it('is a real F4F-4, graded at the six-gun combat weight (R2)', () => {
    expect(f4f.reference.testMassKg).toBe(3616.04)
    expect(f4f.geometry.wingSpanM).toBe(11.582)
    expect(f4f.reference.source).not.toMatch(/PLACEHOLDER/)
  })
  it.each([0, 762, 1402.1, 3657.6, 4267.2, 5791.2, 5913.1])('the F6F is faster at %d m', (altitudeM) => {
    expect(measureTopSpeed(f6f, altitudeM)).toBeGreaterThan(measureTopSpeed(f4f, altitudeM))
  })
  it('the F6F climbs faster at sea level', () => {
    expect(measureClimbRate(f6f, 0)).toBeGreaterThan(measureClimbRate(f4f, 0))
  })
  it('the F4F stalls slower, clean and with flaps', () => {
    expect(measureStallSpeed(f4f, 0, 0)).toBeLessThan(measureStallSpeed(f6f, 0, 0))
    expect(measureStallSpeed(f4f, 0, 1)).toBeLessThan(measureStallSpeed(f6f, 0, 1))
  })
  it('the F4F rolls shorter to lift-off, each at its own trial lift-off speed with full flaps', () => {
    expect(measureTakeoffRun(f4f, 73 * MPH, 1)).toBeLessThan(measureTakeoffRun(f6f, 86.5 * MPH, 1))
  })
  it('the F4F has the lighter wing loading at the trial weights', () => {
    expect(f4f.reference.testMassKg / f4f.geometry.wingAreaM2).toBeLessThan(f6f.reference.testMassKg / f6f.geometry.wingAreaM2)
  })
})
