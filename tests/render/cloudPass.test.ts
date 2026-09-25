import { describe, expect, it } from 'vitest'
import { cloudCells, cloudTargetSize } from '../../src/render/scene/cloudPass.js'

describe('cloud pass (photoreal Task 3)', () => {
  it('sizes the reduced-resolution target by ceiling, never below one texel', () => {
    expect(cloudTargetSize(2560, 1440, 0.5)).toEqual({ width: 1280, height: 720 })
    expect(cloudTargetSize(3840, 2160, 0.25)).toEqual({ width: 960, height: 540 })
    expect(cloudTargetSize(1, 1, 0.25)).toEqual({ width: 1, height: 1 })
    expect(cloudTargetSize(1001, 3, 0.5)).toEqual({ width: 501, height: 2 })
  })
  it('a cloud texel spans exactly 1/scale pixels, so the target covers the screen at ANY scale (fixed 2026-09-25)', () => {
    // round(1/scale) left the bottom/right 10% of the screen uncovered at
    // 0.45 -- streaks along the bottom of high-6000.
    for (const scale of [0.5, 0.45, 0.4, 0.35, 1 / 3, 0.25]) {
      for (const [w, h] of [[2560, 1440], [3840, 2160], [1001, 3]] as const) {
        const size = cloudTargetSize(w, h, scale)
        const { span, block } = cloudCells(scale)
        expect(size.width * span).toBeGreaterThanOrEqual(w - 1e-6)
        expect(size.height * span).toBeGreaterThanOrEqual(h - 1e-6)
        // The min-depth block covers the texel's span wherever it starts.
        expect(block).toBeGreaterThanOrEqual(Math.ceil(span))
      }
    }
    expect(cloudCells(0.5)).toEqual({ span: 2, block: 2 })
    expect(cloudCells(0.25)).toEqual({ span: 4, block: 4 })
    expect(cloudCells(0.45).block).toBe(4)
  })
})
