import { expect, it } from 'vitest'
import { OCEAN_TIERS, oceanTierFromQuery, tierForFrameTimeMs } from '../../../src/render/ocean/tiers.js'
it('degrades both cost knobs and retains a valid FFT sea', () => {
  for (const [i,t] of OCEAN_TIERS.entries()) {
    expect(t.cascades).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(Math.log2(t.n))).toBe(true)
    if (i) {
      expect(t.cascades).toBeLessThanOrEqual(OCEAN_TIERS[i-1]!.cascades)
      expect(t.n).toBeLessThanOrEqual(OCEAN_TIERS[i-1]!.n)
    }
  }
  expect(tierForFrameTimeMs(2)).toBe(OCEAN_TIERS[0])
  expect(tierForFrameTimeMs(100)).toBe(OCEAN_TIERS[2])
  for (const ms of [0,0.1,8,16.7,33,1e6,NaN,Infinity]) expect(OCEAN_TIERS).toContain(tierForFrameTimeMs(ms))
})
it('accepts named overrides and rejects malformed ones', () => {
  expect(oceanTierFromQuery('')).toBeUndefined()
  for (const tier of OCEAN_TIERS) expect(oceanTierFromQuery(`?oceanTier=${tier.name}`)).toBe(tier)
  expect(() => oceanTierFromQuery('?oceanTier=')).toThrow()
  expect(() => oceanTierFromQuery('?oceanTier=fast')).toThrow()
})

it('selects both measured transition boundaries', () => {
  expect(tierForFrameTimeMs(8)).toBe(OCEAN_TIERS[0])
  expect(tierForFrameTimeMs(8.01)).toBe(OCEAN_TIERS[1])
  expect(tierForFrameTimeMs(11)).toBe(OCEAN_TIERS[1])
  expect(tierForFrameTimeMs(11.01)).toBe(OCEAN_TIERS[2])
})
