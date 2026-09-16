import { describe, it, expect } from 'vitest'
import { effectAppearance, effectScaleAndOpacity } from '../../src/render/scene/impactEffect.js'

describe('the impact effect', () => {
  it('is white foam on water and fire on land', () => {
    expect(effectAppearance('water').colorHex).not.toBe(effectAppearance('land').colorHex)
  })

  it('starts small and opaque', () => {
    const at0 = effectScaleAndOpacity(0, 1.5, 30)
    expect(at0.radiusM).toBeGreaterThan(0)
    expect(at0.radiusM).toBeLessThan(30)
    expect(at0.opacity).toBeCloseTo(1, 6)
  })

  it('reaches full size and zero opacity at the end of its life', () => {
    const atEnd = effectScaleAndOpacity(1.5, 1.5, 30)
    expect(atEnd.radiusM).toBeCloseTo(30, 6)
    expect(atEnd.opacity).toBeCloseTo(0, 6)
  })

  it('stays clamped past the end of its life rather than growing forever', () => {
    // The renderer keeps running after the flight ends -- the scene is still
    // being drawn behind the modal -- so this function is called long past the
    // effect's lifetime and must not return a radius that keeps expanding.
    const after = effectScaleAndOpacity(600, 1.5, 30)
    expect(after.radiusM).toBeCloseTo(30, 6)
    expect(after.opacity).toBe(0)
  })
})
