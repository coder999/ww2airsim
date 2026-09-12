import { describe, it, expect } from 'vitest'
import { liftCoefficient, dragCoefficient, aspectRatio, inducedDragFactor } from '../../src/sim/aero.js'
import { loadAircraftSpec } from '../../src/sim/content.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

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

describe('post-stall drag blend (Important 3)', () => {
  it('is unchanged at or below the critical angle', () => {
    const cl = liftCoefficient(f6f, deg(10))
    expect(dragCoefficient(f6f, cl, deg(10))).toBeCloseTo(dragCoefficient(f6f, cl), 9)
    const clAtCrit = liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg))
    expect(dragCoefficient(f6f, clAtCrit, deg(f6f.aero.alphaCritDeg)))
      .toBeCloseTo(dragCoefficient(f6f, clAtCrit), 9)
  })

  it('rises monotonically past the critical angle, using the true post-stall Cl at each angle', () => {
    const angles = [f6f.aero.alphaCritDeg, 25, 35, 45, 60, 75, 90]
    const cds = angles.map((d) => dragCoefficient(f6f, liftCoefficient(f6f, deg(d)), deg(d)))
    for (let i = 1; i < cds.length; i++) {
      expect(cds[i]!).toBeGreaterThan(cds[i - 1]!)
    }
  })

  it('approaches a flat-plate value near 90 degrees', () => {
    const cd90 = dragCoefficient(f6f, liftCoefficient(f6f, deg(90)), deg(90))
    expect(cd90).toBeGreaterThan(1.0)
    expect(cd90).toBeLessThanOrEqual(1.2)
  })

  it('is never non-finite across the full angle range', () => {
    for (let d = -180; d <= 180; d += 1) {
      const cl = liftCoefficient(f6f, deg(d))
      expect(Number.isFinite(dragCoefficient(f6f, cl, deg(d)))).toBe(true)
    }
  })

  it('never goes negative, even for an alphaCritDeg beyond 90 degrees (round 2 minor)', () => {
    // schema.ts only requires alphaCritDeg > 0, not < 90. No shipped spec
    // does this, but nothing stops one from having alphaCritDeg=120: the
    // blend fraction's span (90 - alphaCritDeg) then goes negative, and
    // without a floor on `t` this drove Cd to -1.0523 at 150 degrees --
    // drag that accelerates the aircraft. `t` is now clamped to [0, 1] on
    // both ends, so past-the-stall Cd for a spec like this should just sit
    // at its attached-flow value (no post-stall blend applies) rather than
    // going negative.
    const wideStallSpec = {
      ...f6f,
      aero: { ...f6f.aero, alphaCritDeg: 120 },
    } satisfies AircraftSpec
    const cl = liftCoefficient(wideStallSpec, deg(150))
    const cd = dragCoefficient(wideStallSpec, cl, deg(150))
    expect(cd).toBeGreaterThanOrEqual(f6f.aero.cd0)
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
