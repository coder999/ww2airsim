// tests/render/hangar/framing.test.ts
import { describe, expect, it } from 'vitest'
import { CAMERA_PRESETS, framingDistance, framingRadius, presetDirection } from '../../../src/render/hangar/framing.js'

describe('framing', () => {
  it('a sphere at the framing distance subtends the fill fraction of the narrower half-angle', () => {
    const d = framingDistance(10, 35, 16 / 9, 0.8)
    expect(Math.asin(10 / d)).toBeCloseTo(0.8 * (35 * Math.PI) / 360, 10)
    // Portrait: the horizontal half-angle is narrower, so the camera backs off.
    expect(framingDistance(10, 35, 0.5)).toBeGreaterThan(d)
  })
  it('every preset is a unit vector; side looks at the right (+Z), front at the nose (+X)', () => {
    for (const p of CAMERA_PRESETS) expect(Math.hypot(...presetDirection(p))).toBeCloseTo(1, 12)
    expect(presetDirection('side')).toEqual([0, 0, 1])
    expect(presetDirection('front')).toEqual([1, 0, 0])
  })
  it('only a long, low strip is framed closer: the Jinamoc ramp is, a hut and a pontoon pier are not', () => {
    expect(framingRadius(100, 67.062, 5.35, 16.192)).toBe(80) // the ramp as built (its script constants)
    expect(framingRadius(10, 6.1, 4.4, 14.6)).toBe(10)
    expect(framingRadius(10, 17, 2, 4.9)).toBe(10)
  })
})
