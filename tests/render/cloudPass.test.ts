import { describe, expect, it } from 'vitest'
import { bayer4Index, bayer4Offset, cloudCells, cloudTargetSize } from '../../src/render/scene/cloudPass.js'

describe('cloud pass (photoreal Task 3)', () => {
  it('the 4x4 Bayer schedule updates every texel exactly once in 16 frames', () => {
    const phases = Array.from({ length: 4 }, (_, y) =>
      Array.from({ length: 4 }, (_, x) => bayer4Index(x, y)),
    )
    expect(phases).toEqual([
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ])
    expect(phases.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i))
    for (let phase = 0; phase < 16; phase++) {
      const offset = bayer4Offset(phase)
      expect(bayer4Index(offset.x, offset.y)).toBe(phase)
    }
    expect(bayer4Index(4, 4)).toBe(bayer4Index(0, 0))
    expect(bayer4Index(7, 6)).toBe(bayer4Index(3, 2))
  })

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
        const { span } = cloudCells(scale)
        expect(size.width * span).toBeGreaterThanOrEqual(w - 1e-6)
        expect(size.height * span).toBeGreaterThanOrEqual(h - 1e-6)
      }
      // The min-depth block (read from floor(i * span)) covers every
      // full-resolution pixel texel i's span touches, for every i.
      const { span, block } = cloudCells(scale)
      let needed = 0
      for (let i = 0; i < 4000; i++) needed = Math.max(needed, Math.ceil((i + 1) * span) - Math.floor(i * span))
      expect(block, `scale ${scale}`).toBeGreaterThanOrEqual(needed)
    }
    expect(cloudCells(0.5)).toEqual({ span: 2, block: 2 })
    expect(cloudCells(0.25)).toEqual({ span: 4, block: 4 })
    expect(cloudCells(0.45).block).toBe(4)
  })
})
