import { expect, it, vi } from 'vitest'
import { treeFadeFromQuery, treeFadeMode, treePixelThresholdAt } from '../../src/render/scene/treeFade.js'

it('dissolves coverage progressively instead of toggling a whole crown', () => {
  for (const seed of [0.01, 0.3, 0.97]) {
    const thresholds = Array.from({ length: 64 * 64 }, (_, i) => treePixelThresholdAt(i % 64 + 0.5, Math.floor(i / 64) + 0.5, seed))
    for (const opacity of [0, 0.25, 0.5, 0.75, 1]) {
      const coverage = thresholds.filter(t => opacity > t).length / thresholds.length
      expect(Math.abs(coverage - opacity)).toBeLessThan(0.015)
    }
  }
  // Different tree seeds decorrelate overlapping crowns' coverage masks.
  expect(treePixelThresholdAt(20.5, 10.5, 0.01)).not.toBe(treePixelThresholdAt(20.5, 10.5, 0.97))
})

it('offers an explicit baseline and rejects invalid comparison modes', () => {
  expect(treeFadeFromQuery('')).toBe('soft')
  expect(treeFadeFromQuery('?treeFade=whole')).toBe('whole')
  expect(treeFadeFromQuery('?treeFade=pixel')).toBe('pixel')
  expect(treeFadeFromQuery('?treeFade=soft')).toBe('soft')
  expect(() => treeFadeFromQuery('?treeFade=typo')).toThrow('Unknown treeFade')
})

it('uses the accepted soft fade in production even with a comparison query', () => {
  vi.stubEnv('DEV', false)
  vi.stubGlobal('location', { search: '?treeFade=whole' })
  try {
    expect(treeFadeMode()).toBe('soft')
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
})
