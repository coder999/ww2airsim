import { describe, expect, it } from 'vitest'
import { MAX_EXPOSURE, exposureFor, toneMapFromQuery } from '../../src/render/exposure.js'

describe('exposureFor', () => {
  it('is exactly 1 with the sun at or above 30 degrees', () => {
    expect(exposureFor(90)).toBe(1)
    expect(exposureFor(30)).toBe(1)
  })
  it('rises strictly as the sun sinks through the palette keys', () => {
    expect(exposureFor(10)).toBeGreaterThan(exposureFor(30))
    expect(exposureFor(0)).toBeGreaterThan(exposureFor(10))
    expect(exposureFor(-6)).toBeGreaterThan(exposureFor(0))
  })
  it('never exceeds MAX_EXPOSURE', () => {
    expect(exposureFor(-90)).toBeLessThanOrEqual(MAX_EXPOSURE)
  })
  it('is finite, positive and non-increasing in elevation for every integer degree', () => {
    let previous = Infinity
    for (let e = -90; e <= 90; e++) {
      const x = exposureFor(e)
      expect(Number.isFinite(x)).toBe(true)
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThanOrEqual(previous)
      previous = x
    }
  })
})

describe('toneMapFromQuery', () => {
  it('reads a known name', () => {
    expect(toneMapFromQuery('?toneMap=agx')).toBe('agx')
    expect(toneMapFromQuery('?toneMap=aces')).toBe('aces')
    expect(toneMapFromQuery('?toneMap=none')).toBe('none')
  })
  it('is undefined when absent', () => {
    expect(toneMapFromQuery('')).toBeUndefined()
  })
  it('throws on an unknown name', () => {
    expect(() => toneMapFromQuery('?toneMap=bogus')).toThrow()
  })
})
