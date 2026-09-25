import { describe, it, expect } from 'vitest'
import { HalfFloatType, LinearFilter } from 'three'
import {
  AP_MAX_DISTANCE_M, AP_SLICES, apSliceCoord, apSliceDepthM, createAtmosphereLuts, disposeAtmosphereLuts, getAtmosphereLuts,
  skyViewLutParams, skyViewLutUv, SKY_VIEW_HEIGHT, SKY_VIEW_WIDTH,
} from '../../src/render/sky/atmosphereLuts.js'
import { TRANSMITTANCE_LUT_HEIGHT, TRANSMITTANCE_LUT_WIDTH } from '../../src/render/sky/atmosphere.js'

describe('atmosphere LUTs (photoreal Task 8)', () => {
  it('builds four half-float, linearly filtered targets of the spec sizes', () => {
    const luts = createAtmosphereLuts()
    const size = (t: { image: unknown }) => { const i = t.image as { width: number; height: number }; return [i.width, i.height] }
    expect(size(luts.transmittance)).toEqual([TRANSMITTANCE_LUT_WIDTH, TRANSMITTANCE_LUT_HEIGHT])
    expect(size(luts.multiScattering)).toEqual([32, 32])
    expect(size(luts.skyView)).toEqual([SKY_VIEW_WIDTH, SKY_VIEW_HEIGHT])
    expect(size(luts.aerialPerspective)).toEqual([1024, 32])
    for (const t of [luts.transmittance, luts.multiScattering, luts.skyView, luts.aerialPerspective]) {
      expect(t.type).toBe(HalfFloatType)
      expect(t.magFilter).toBe(LinearFilter)
    }
    luts.dispose()
  })
  it('is one module-level instance until disposed', () => {
    const a = getAtmosphereLuts()
    expect(getAtmosphereLuts()).toBe(a)
    disposeAtmosphereLuts()
    expect(getAtmosphereLuts()).not.toBe(a)
    disposeAtmosphereLuts()
  })
  it('slices are squared in depth: thin near the eye, the last one at the range', () => {
    expect(apSliceDepthM(AP_SLICES - 1)).toBe(AP_MAX_DISTANCE_M)
    expect(apSliceDepthM(0)).toBeCloseTo(AP_MAX_DISTANCE_M / 1024, 6)
    for (let k = 0; k < AP_SLICES; k++) expect(apSliceCoord(apSliceDepthM(k))).toBeCloseTo(k, 9)
    expect(apSliceCoord(0)).toBe(-1)
    expect(apSliceCoord(3 * AP_MAX_DISTANCE_M)).toBe(AP_SLICES - 1)
  })
  it('sky-view mapping round-trips and puts the horizon at v = 0.5 in unit terms', () => {
    for (const h of [10, 1900, 6000]) {
      for (const zc of [0.99, 0.5, 0.05, 0.0, -0.01, -0.3, -0.95]) {
        for (const lc of [1, 0.3, -0.7, -1]) {
          const [u, v] = skyViewLutUv(h, zc, lc)
          const p = skyViewLutParams(h, u, v)
          expect(p.viewZenithCos).toBeCloseTo(zc, 6)
          expect(p.lightViewCos).toBeCloseTo(lc, 6)
        }
      }
    }
    // Near-horizon rows are dense: +-2 degrees about the horizon span far
    // more rows than 2 degrees near the zenith.
    const row = (zc: number) => skyViewLutUv(1900, zc, 1)[1] * SKY_VIEW_HEIGHT
    const nearHorizon = row(Math.sin(-2 * Math.PI / 180)) - row(Math.sin(2 * Math.PI / 180))
    const nearZenith = row(Math.cos(4 * Math.PI / 180)) - row(Math.cos(0))
    expect(nearHorizon).toBeGreaterThan(3 * nearZenith)
  })
})

describe('?atmosphere=', () => {
  it('parses off, ignores absence, throws on a typo', async () => {
    const { atmosphereFromQuery } = await import('../../src/render/sky/atmosphereLuts.js')
    expect(atmosphereFromQuery('?atmosphere=off')).toBe('off')
    expect(atmosphereFromQuery('?x=1')).toBeUndefined()
    expect(() => atmosphereFromQuery('?atmosphere=of')).toThrow()
  })
})
