import { describe, it, expect } from 'vitest'
import { SCENE_GROUND_ALBEDO, SUN_ILLUMINANCE, atmospherePalette, interpolatedIrradiance, srgbHexToLinear } from '../../src/render/sky/palette.js'
import { skyIrradiance, sunColorAt } from '../../src/render/sky/atmosphere.js'

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
  it('the boot-time irradiance table matches direct evaluation off-grid: within 3% from 2 deg up, 6% below (Task 9 review)', () => {
    // Log-bilinear on IRRADIANCE_ELEVATIONS_DEG x IRRADIANCE_ALTITUDES_M.
    // Measured 2026-09-25: worst 5.0% (2700 m, -1.5 deg, where the dusk floor
    // already carries the light), <= 3% everywhere from 2 deg up.
    for (const h of [300, 2700, 6800, 10000]) {
      for (const e of [-3.5, -1.5, -0.5, 0.5, 2.5, 7, 15, 26, 47, 80]) {
        const direct = skyIrradiance(h, e, SCENE_GROUND_ALBEDO)
        const table = interpolatedIrradiance(h, e)
        const tol = e >= 2 ? 0.03 : 0.06
        for (const k of ['up', 'down'] as const) {
          for (let c = 0; c < 3; c++) expect(Math.abs(table[k][c]! / direct[k][c]! - 1), `${k}[${c}] at ${h} m, ${e} deg`).toBeLessThan(tol)
        }
      }
    }
  })
  it('the table is continuous: no step as the sun or the eye crosses a grid line', () => {
    let prev = interpolatedIrradiance(2000, -8)
    for (let e = -7.99; e <= 20; e += 0.01) {
      const p = interpolatedIrradiance(2000, e)
      for (let c = 0; c < 3; c++) expect(Math.abs(p.up[c]! / prev.up[c]! - 1)).toBeLessThan(0.02)
      prev = p
    }
    prev = interpolatedIrradiance(0, 1)
    for (let h = 10; h <= 12000; h += 10) {
      const p = interpolatedIrradiance(h, 1)
      for (let c = 0; c < 3; c++) expect(Math.abs(p.up[c]! / prev.up[c]! - 1)).toBeLessThan(0.01)
      prev = p
    }
  })
})
