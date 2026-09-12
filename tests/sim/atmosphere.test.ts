import { describe, it, expect } from 'vitest'
import { densityAt, pressureAt, temperatureAt, speedOfSoundAt } from '../../src/sim/atmosphere.js'

describe('ISA atmosphere', () => {
  it('matches published sea-level values', () => {
    expect(temperatureAt(0)).toBeCloseTo(288.15, 2)
    expect(pressureAt(0)).toBeCloseTo(101325, 0)
    expect(densityAt(0)).toBeCloseTo(1.225, 3)
  })

  it('matches published density at 5000 m', () => {
    expect(densityAt(5000)).toBeCloseTo(0.7364, 3)
  })

  it('matches published density at the tropopause (11000 m)', () => {
    expect(densityAt(11000)).toBeCloseTo(0.3639, 3)
  })

  it('holds temperature constant in the lower stratosphere', () => {
    expect(temperatureAt(12000)).toBeCloseTo(216.65, 2)
    expect(temperatureAt(15000)).toBeCloseTo(216.65, 2)
  })

  it('decreases monotonically with altitude', () => {
    let prev = densityAt(0)
    for (let h = 500; h <= 15000; h += 500) {
      const d = densityAt(h)
      expect(d).toBeLessThan(prev)
      prev = d
    }
  })

  it('extrapolates below sea level without producing nonsense', () => {
    expect(densityAt(-500)).toBeGreaterThan(1.225)
    expect(Number.isFinite(densityAt(-500))).toBe(true)
  })

  it('gives a sea-level speed of sound near 340 m/s', () => {
    expect(speedOfSoundAt(0)).toBeCloseTo(340.3, 1)
  })
})
