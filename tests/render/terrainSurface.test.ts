import { describe, expect, it } from 'vitest'
import { clampDetailSlope, DETAIL_NORMAL_FAR_M, DETAIL_NORMAL_MAX_TILT_DEG, DETAIL_NORMAL_NEAR_M, DETAIL_NORMAL_SCALES, detailNormalFade } from '../../src/render/terrain/surface.js'

describe('terrain detail normal (photoreal Task 13)', () => {
  it('fades from full strength at 500 m to nothing at 2000 m', () => {
    expect(DETAIL_NORMAL_NEAR_M).toBe(500)
    expect(DETAIL_NORMAL_FAR_M).toBe(2000)
    expect(detailNormalFade(0)).toBe(1)
    expect(detailNormalFade(500)).toBe(1)
    expect(detailNormalFade(2000)).toBe(0)
    expect(detailNormalFade(5000)).toBe(0)
    expect(detailNormalFade(1250)).toBeCloseTo(0.5, 12)
  })

  it('is monotonic non-increasing and finite for every input', () => {
    let last = Infinity
    for (let d = 0; d <= 3000; d += 25) {
      const f = detailNormalFade(d)
      expect(f).toBeLessThanOrEqual(last)
      last = f
    }
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const f = detailNormalFade(bad)
      expect(Number.isFinite(f)).toBe(true)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })

  it('clamps the combined tilt at the brief\'s ~12 degrees and leaves smaller slopes alone', () => {
    expect(DETAIL_NORMAL_MAX_TILT_DEG).toBeLessThanOrEqual(12)
    expect(DETAIL_NORMAL_SCALES.map((s) => s.cellM)).toEqual([8, 40])
    const tilt = (s: [number, number]) => (Math.atan(Math.hypot(...s)) * 180) / Math.PI
    // The worst case the amplitudes can produce (smoothstep's peak gradient
    // 1.5 per cell, both scales aligned) is clamped to the cap.
    const worst = DETAIL_NORMAL_SCALES.reduce((s, { cellM, amplitudeM }) => s + (1.5 * amplitudeM) / cellM, 0)
    expect(tilt(clampDetailSlope(worst, 0))).toBeCloseTo(DETAIL_NORMAL_MAX_TILT_DEG, 9)
    expect(tilt(clampDetailSlope(worst * 0.7, -worst * 0.7))).toBeCloseTo(DETAIL_NORMAL_MAX_TILT_DEG, 9)
    expect(clampDetailSlope(0.05, -0.02)).toEqual([0.05, -0.02])
    expect(clampDetailSlope(0, 0)).toEqual([0, 0])
    // A typical slope (neighbors ~0.35 apart) is a visible ~6 degrees.
    const typical = DETAIL_NORMAL_SCALES.reduce((s, { cellM, amplitudeM }) => s + (0.35 * 1.5 * amplitudeM) / cellM, 0)
    expect(tilt([typical, 0])).toBeGreaterThan(4)
    expect(tilt([typical, 0])).toBeLessThan(DETAIL_NORMAL_MAX_TILT_DEG)
  })
})
