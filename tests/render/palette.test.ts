import { describe, it, expect } from 'vitest'
import { SUN_ILLUMINANCE, atmospherePalette, srgbHexToLinear } from '../../src/render/sky/palette.js'
import { sunColorAt } from '../../src/render/sky/atmosphere.js'

/** Rec. 709 luminance of a linear triple. */
const lum = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!

describe('sky palette from the atmosphere (photoreal Task 9)', () => {
  it('the sun color is the CPU model\'s transmitted sun times the one intensity constant', () => {
    const p = atmospherePalette(0, 60)
    const expected = sunColorAt(0, 60)
    for (let i = 0; i < 3; i++) expect(p.sunColor[i]).toBeCloseTo(expected[i]! * SUN_ILLUMINANCE, 9)
    // The DirectionalLight's intensity is folded into its color.
    expect(p.sunIntensity).toBe(1)
  })
  it('below the horizon (-6 deg) it is finite and dimmer than at 0 deg, but never black', () => {
    const dusk = atmospherePalette(0, -6)
    const sunset = atmospherePalette(0, 0)
    for (const k of ['sunColor', 'fillSky', 'fillGround', 'zenith', 'horizon'] as const) {
      for (const v of dusk[k]) expect(Number.isFinite(v)).toBe(true)
    }
    expect(lum(dusk.sunColor)).toBeLessThan(lum(sunset.sunColor))
    expect(lum(dusk.fillSky)).toBeLessThan(lum(sunset.fillSky))
    // The dusk floor (spec 4.3: the existing floor behavior is preserved).
    expect(lum(dusk.fillSky)).toBeGreaterThan(0)
    expect(dusk.twilight).toBeGreaterThan(0.5)
    expect(atmospherePalette(0, -20)).toEqual(atmospherePalette(0, -20))
  })
  it('the light warms toward the horizon: red/blue is higher at 5 deg than at 60 deg', () => {
    const low = atmospherePalette(0, 5), high = atmospherePalette(0, 60)
    expect(low.sunColor[0] / low.sunColor[2]).toBeGreaterThan(high.sunColor[0] / high.sunColor[2])
  })
  it('the sky fill is blue at noon and the twilight floor is negligible there', () => {
    const noon = atmospherePalette(0, 68)
    expect(noon.fillSky[2]).toBeGreaterThan(noon.fillSky[0])
    expect(noon.twilight).toBeLessThan(0.05)
  })
  it('converts sRGB hex to linear the way three does', () => {
    expect(srgbHexToLinear(0xffffff)).toEqual([1, 1, 1])
    expect(srgbHexToLinear(0x000000)).toEqual([0, 0, 0])
    const [r] = srgbHexToLinear(0x808080)
    expect(r).toBeCloseTo(0.2158, 3)
  })
})
