// tests/render/hangar/framing.test.ts
import { describe, expect, it } from 'vitest'
import { CAMERA_PRESETS, framingDistance, presetDirection } from '../../../src/render/hangar/framing.js'

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
})
