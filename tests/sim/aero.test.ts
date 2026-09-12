import { describe, it, expect } from 'vitest'
import { liftCoefficient, dragCoefficient, aspectRatio, inducedDragFactor } from '../../src/sim/aero.js'
import { loadAircraftSpec } from '../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const deg = (d: number) => (d * Math.PI) / 180

describe('lift coefficient curve', () => {
  it('equals clAtZeroAlpha at zero angle of attack', () => {
    expect(liftCoefficient(f6f, 0)).toBeCloseTo(f6f.aero.clAtZeroAlpha, 6)
  })

  it('rises linearly below the critical angle', () => {
    const a = liftCoefficient(f6f, deg(4))
    const b = liftCoefficient(f6f, deg(8))
    expect(b - a).toBeCloseTo(f6f.aero.clSlopePerRad * deg(4), 4)
  })

  it('peaks at clMax at the critical angle', () => {
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg))).toBeCloseTo(f6f.aero.clMax, 1)
  })

  it('falls past the critical angle rather than rising forever', () => {
    const peak = liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg))
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg + 8))).toBeLessThan(peak)
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg + 20))).toBeLessThan(peak)
  })

  it('is antisymmetric-ish for negative alpha and never NaN', () => {
    for (let d = -90; d <= 90; d += 1) {
      expect(Number.isFinite(liftCoefficient(f6f, deg(d)))).toBe(true)
    }
    expect(liftCoefficient(f6f, deg(-20))).toBeLessThan(0)
  })
})

describe('drag coefficient', () => {
  it('is minimum at zero lift and equals cd0 there', () => {
    expect(dragCoefficient(f6f, 0)).toBeCloseTo(f6f.aero.cd0, 6)
  })

  it('increases with the square of lift', () => {
    const d1 = dragCoefficient(f6f, 0.4) - f6f.aero.cd0
    const d2 = dragCoefficient(f6f, 0.8) - f6f.aero.cd0
    expect(d2 / d1).toBeCloseTo(4, 2)
  })

  it('is symmetric in the sign of lift', () => {
    expect(dragCoefficient(f6f, -0.6)).toBeCloseTo(dragCoefficient(f6f, 0.6), 9)
  })
})

describe('geometry derived values', () => {
  it('computes aspect ratio as span squared over area', () => {
    expect(aspectRatio(f6f)).toBeCloseTo((13.06 * 13.06) / 31.03, 6)
  })

  it('computes the induced drag factor as 1/(pi*AR*e)', () => {
    expect(inducedDragFactor(f6f)).toBeCloseTo(1 / (Math.PI * aspectRatio(f6f) * f6f.aero.oswaldE), 9)
  })
})
