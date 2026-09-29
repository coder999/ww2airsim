import { describe, expect, it } from 'vitest'
import { contourIntervalFt, contourLevels, M_PER_FT, scaleBar } from '../../../src/render/mission/chartScale.js'

describe('contourIntervalFt', () => {
  it('coarsens as the chart span grows', () => {
    const spans = [2_000, 10_000, 30_000, 80_000, 200_000]
    const intervals = spans.map(contourIntervalFt)
    expect(intervals).toEqual([50, 50, 100, 200, 500])
  })
})

describe('contourLevels', () => {
  it('marks every fifth level as an index contour', () => {
    const { intervalFt, levels } = contourLevels(1_000 * M_PER_FT, 100)
    expect(intervalFt).toBe(100)
    expect(levels.map((l) => l.levelFt)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])
    expect(levels.filter((l) => l.index).map((l) => l.levelFt)).toEqual([500, 1000])
    expect(levels[0]!.levelM).toBeCloseTo(100 * M_PER_FT, 9)
  })

  it('has no levels when the terrain never reaches the first one', () => {
    expect(contourLevels(10, 100).levels).toEqual([])
  })

  it('caps the count by doubling the interval', () => {
    const { intervalFt, levels } = contourLevels(3_000, 50)
    expect(levels.length).toBeLessThanOrEqual(40)
    expect(intervalFt).toBe(400)
  })
})

describe('scaleBar', () => {
  it('picks a round nautical-mile length near the target width', () => {
    for (const mPerPx of [10, 25, 60, 100, 250]) {
      const bar = scaleBar(mPerPx)
      expect(bar.px).toBeGreaterThan(40)
      expect(bar.px).toBeLessThan(210)
      expect([0.25, 0.5, 1, 2, 5, 10, 20, 50]).toContain(bar.nmi)
      expect(bar.label).toContain(String(bar.nmi))
    }
  })
})
