import { describe, it, expect } from 'vitest'
import { SKY_HAZE, SKY_ZENITH, paletteFor, srgbHexToLinear } from '../../src/render/sky/palette.js'
import { SKY_HAZE as DOME_HAZE, SKY_ZENITH as DOME_ZENITH } from '../../src/render/scene/sky.js'

describe('sky palette (Plan 16c)', () => {
  it('the high key is today\'s constants, and the dome still exports them', () => {
    const high = paletteFor(70)
    expect(high.sunColor).toEqual(srgbHexToLinear(0xfff2e0))
    expect(high.sunIntensity).toBe(2.5)
    expect(high.zenith).toEqual(srgbHexToLinear(SKY_ZENITH))
    expect(high.horizon).toEqual(srgbHexToLinear(SKY_HAZE))
    expect(high.fillSky).toEqual(srgbHexToLinear(0x9eb8cc))
    expect(high.fillGround).toEqual(srgbHexToLinear(0x18384f))
    expect(high.sunTint).toEqual([1, 1, 1])
    expect(high.ambientScale).toBe(1)
    expect(paletteFor(30)).toEqual(high)
    expect(DOME_HAZE).toBe(SKY_HAZE)
    expect(DOME_ZENITH).toBe(SKY_ZENITH)
  })
  it('converts sRGB hex to linear the way three does', () => {
    expect(srgbHexToLinear(0xffffff)).toEqual([1, 1, 1])
    expect(srgbHexToLinear(0x000000)).toEqual([0, 0, 0])
    const [r] = srgbHexToLinear(0x808080)
    expect(r).toBeCloseTo(0.2158, 3)
  })
  it('is continuous across the keys and warms toward the horizon', () => {
    let prev = paletteFor(40)
    for (let e = 39.9; e >= -8; e -= 0.1) {
      const p = paletteFor(e)
      for (const k of ['sunColor', 'zenith', 'horizon', 'fillSky', 'fillGround'] as const) {
        for (let i = 0; i < 3; i++) expect(Math.abs(p[k][i]! - prev[k][i]!)).toBeLessThan(0.02)
      }
      expect(Math.abs(p.sunIntensity - prev.sunIntensity)).toBeLessThan(0.05)
      prev = p
    }
    const horizon = paletteFor(0)
    expect(horizon.sunColor[0]).toBeGreaterThan(horizon.sunColor[2] * 3)
    expect(horizon.horizon[0]).toBeGreaterThan(paletteFor(70).horizon[0])
    expect(paletteFor(0).sunIntensity).toBeLessThan(paletteFor(10).sunIntensity)
  })
  it('holds flat at twilight: never black, never below the floor', () => {
    const t = paletteFor(-6)
    expect(paletteFor(-20)).toEqual(t)
    expect(paletteFor(-90)).toEqual(t)
    expect(t.sunIntensity).toBe(0)
    expect(t.zenith[2]).toBeGreaterThan(0)
    expect(t.ambientScale).toBeGreaterThan(0.1)
  })
})
