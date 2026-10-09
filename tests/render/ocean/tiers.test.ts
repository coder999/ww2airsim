import { expect, it } from 'vitest'
import { OCEAN_TIERS, PROBE_HIGH_MS, PROBE_MEDIUM_MS, oceanTierFromQuery, tierForFrameIntervalsMs } from '../../../src/render/ocean/tiers.js'
it('degrades both cost knobs and retains a valid FFT sea', () => {
  for (const [i,t] of OCEAN_TIERS.entries()) {
    expect(t.cascades).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(Math.log2(t.n))).toBe(true)
    if (i) {
      expect(t.cascades).toBeLessThanOrEqual(OCEAN_TIERS[i-1]!.cascades)
      expect(t.n).toBeLessThanOrEqual(OCEAN_TIERS[i-1]!.n)
    }
  }
})
it('accepts named overrides and rejects malformed ones', () => {
  expect(oceanTierFromQuery('')).toBeUndefined()
  for (const tier of OCEAN_TIERS) expect(oceanTierFromQuery(`?oceanTier=${tier.name}`)).toBe(tier)
  expect(() => oceanTierFromQuery('?oceanTier=')).toThrow()
  expect(() => oceanTierFromQuery('?oceanTier=fast')).toThrow()
})

// A4: the verdict reads the frame rate the pilot got, by its median.
const flat = (ms: number, n = 240) => Array.from({ length: n }, () => ms)
it('the frame-interval verdict: 120 and 60 Hz hold High, 40 fps is Medium, 25 fps is Low', () => {
  expect(tierForFrameIntervalsMs(flat(8.33)).tier).toBe(OCEAN_TIERS[0])
  expect(tierForFrameIntervalsMs(flat(16.7)).tier).toBe(OCEAN_TIERS[0])
  expect(tierForFrameIntervalsMs(flat(25)).tier).toBe(OCEAN_TIERS[1])
  expect(tierForFrameIntervalsMs(flat(40)).tier).toBe(OCEAN_TIERS[2])
})
it('the boundaries are inclusive', () => {
  expect(tierForFrameIntervalsMs(flat(PROBE_HIGH_MS)).tier).toBe(OCEAN_TIERS[0])
  expect(tierForFrameIntervalsMs(flat(PROBE_HIGH_MS + 0.01)).tier).toBe(OCEAN_TIERS[1])
  expect(tierForFrameIntervalsMs(flat(PROBE_MEDIUM_MS)).tier).toBe(OCEAN_TIERS[1])
  expect(tierForFrameIntervalsMs(flat(PROBE_MEDIUM_MS + 0.01)).tier).toBe(OCEAN_TIERS[2])
})
it('hitches do not decide it: a 120 Hz run with one in ten frames at 100 ms is still High', () => {
  const run = flat(8.33).map((ms, i) => (i % 10 === 0 ? 100 : ms))
  expect(tierForFrameIntervalsMs(run)).toEqual({ tier: OCEAN_TIERS[0], medianMs: 8.33 })
})
it('a 60 Hz display alternating 16.7 and 33.3 ms frames (about 40 fps) is Medium', () => {
  const run = flat(16.7).map((ms, i) => (i % 2 === 0 ? 33.3 : ms))
  expect(tierForFrameIntervalsMs(run).tier).toBe(OCEAN_TIERS[1])
})
it('refuses to judge nothing', () => {
  expect(() => tierForFrameIntervalsMs([])).toThrow()
})
