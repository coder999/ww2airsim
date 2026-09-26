import { describe, it, expect } from 'vitest'
import { piecewiseLinear } from '../../../src/sim/math/piecewise.js'

const pts: [number, number][] = [[100, 1], [200, 0.5], [300, 0.2]]

describe('piecewiseLinear', () => {
  it('clamps to the end values outside the table', () => {
    expect(piecewiseLinear(pts, 0)).toBe(1)
    expect(piecewiseLinear(pts, 100)).toBe(1)
    expect(piecewiseLinear(pts, 300)).toBe(0.2)
    expect(piecewiseLinear(pts, 1e6)).toBe(0.2)
  })
  it('is exact at every anchor and linear between them', () => {
    expect(piecewiseLinear(pts, 200)).toBe(0.5)
    expect(piecewiseLinear(pts, 150)).toBeCloseTo(0.75, 12)
    expect(piecewiseLinear(pts, 250)).toBeCloseTo(0.35, 12)
  })
})
