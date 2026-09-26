import { describe, expect, it } from 'vitest'
import { clampDetailSlope, DETAIL_NORMAL_FAR_M, DETAIL_NORMAL_MAX_TILT_DEG, DETAIL_NORMAL_NEAR_M, DETAIL_NORMAL_SCALES, detailNormalFade } from '../../src/render/terrain/surface.js'
import { albedoDetailFade, normalToSlope, ALBEDO_DETAIL_NEAR_M, ALBEDO_DETAIL_FAR_M } from '../../src/render/terrain/surfaceDetail.js'

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

import { composeSurface, type SurfaceLeaves, type SurfaceWeights } from '../../src/render/terrain/surface.js'

describe('composeSurface (visual realism §2.1: weights unchanged)', () => {
  const mixN = (a: number, b: number, t: number): number => a + (b - a) * t
  // Seeded LCG: the same 500 cases every run.
  let s = 1944
  const rnd = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)

  /** A literal transcription of terrainSurfaceNode's nested mix() chain as of
   *  044dc75, BEFORE the split. If this and composeSurface ever disagree, the
   *  refactor changed the blend. */
  function before(l: SurfaceLeaves<number>, w: SurfaceWeights<number>): number {
    const grassOrForest = mixN(l.grass, l.forest, w.forest)
    const withSoilPatches = mixN(grassOrForest, l.soil, w.soilPatch)
    const land = mixN(mixN(withSoilPatches, l.paddy, w.crop), l.mangrove, w.mangrove)
    const ground = mixN(mixN(l.sand, land, w.beachToLand), l.rock, w.bare)
    const wet = mixN(ground, l.wetBank, w.wetBank)
    const withWater = mixN(wet, l.water, w.water)
    return mixN(withWater, l.road, w.road)
  }
  const leaves = (): SurfaceLeaves<number> => ({
    sand: rnd(), grass: rnd(), forest: rnd(), soil: rnd(), paddy: rnd(),
    mangrove: rnd(), rock: rnd(), wetBank: rnd(), water: rnd(), road: rnd(),
  })
  // `crop` and `mangrove` are `fraction * cover.ready`: include ready = 0,
  // the no-land-cover-yet state (Review Focus 3).
  const weights = (ready: number): SurfaceWeights<number> => ({
    forest: rnd(), soilPatch: rnd() * 0.45, crop: rnd() * ready, mangrove: rnd() * ready,
    beachToLand: rnd(), bare: rnd(), wetBank: rnd() * 0.8, water: rnd(), road: rnd(),
  })

  it('matches the pre-split nested blend exactly, with and without land cover', () => {
    for (let i = 0; i < 500; i++) {
      const l = leaves(), w = weights(i % 2)
      expect(composeSurface(l, w, mixN)).toBe(before(l, w))
    }
  })

  it('is a partition of unity: equal leaves give that value back for any weights', () => {
    // This is what makes a per-layer texel/mean ratio preserve the average color.
    for (let i = 0; i < 200; i++) {
      const v = rnd()
      const l: SurfaceLeaves<number> = { sand: v, grass: v, forest: v, soil: v, paddy: v, mangrove: v, rock: v, wetBank: v, water: v, road: v }
      expect(composeSurface(l, weights(1), mixN)).toBeCloseTo(v, 12)
    }
  })
})

describe('albedoDetailFade', () => {
  it('is 1 near, 0 far, monotone between, finite for junk', () => {
    expect(albedoDetailFade(0)).toBe(1)
    expect(albedoDetailFade(ALBEDO_DETAIL_NEAR_M)).toBe(1)
    expect(albedoDetailFade(ALBEDO_DETAIL_FAR_M)).toBe(0)
    expect(albedoDetailFade(1e7)).toBe(0)
    expect(albedoDetailFade(Number.NaN)).toBe(1)
    let prev = 1
    for (let d = ALBEDO_DETAIL_NEAR_M; d <= ALBEDO_DETAIL_FAR_M; d += 100) { const f = albedoDetailFade(d); expect(f).toBeLessThanOrEqual(prev); prev = f }
  })
})

describe('normalToSlope (plan Ruling 6: OpenGL normal maps, uv = worldXZ / tileM)', () => {
  // A flat texel is (0.5, 0.5, 1).
  it('flat texel -> zero slope', () => {
    const [sx, sz] = normalToSlope([0.5, 0.5, 1])
    expect(sx).toBeCloseTo(0, 6); expect(sz).toBeCloseTo(0, 6)
  })
  it('a normal leaning toward +x means the ground falls toward +x (dh/dx < 0)', () => {
    expect(normalToSlope([0.75, 0.5, 0.95])[0]).toBeLessThan(0)
  })
  it('a normal leaning image-up (+G, which is -z) means the ground rises toward +z (dh/dz > 0)', () => {
    expect(normalToSlope([0.5, 0.75, 0.95])[1]).toBeGreaterThan(0)
  })
  it('a grazing texel stays finite (nz floored)', () => {
    const [sx, sz] = normalToSlope([1, 0.5, 0.5])
    expect(Number.isFinite(sx) && Number.isFinite(sz)).toBe(true)
  })
})
