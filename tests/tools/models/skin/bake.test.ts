// tests/tools/models/skin/bake.test.ts
/**
 * M1c (plan 2026-10-09-m1c-ship-detail, "Determinism"): a committed bake is composed only where its
 * sidecar says, and a bake whose inputs moved refuses by name rather than painting a misfit map.
 */
import { describe, expect, it } from 'vitest'
import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
import { paint } from '../../../../tools/models/skin/layers.js'
import { compose, type SkinMaps } from '../../../../tools/models/skin/compose.js'
import { checkBake, type BakeManifest, type BakeMaps } from '../../../../tools/models/skin/bake.js'
import { loadDownloadBake } from '../../../../tools/models/build.js'
import type { Sidecar } from '../../../../tools/models/skin/sidecar.js'
import type { ScanId } from '../../../../tools/models/skin/surfaces.js'
import { FIXTURE_ATLAS as W, fixtureDoc, fixtureSidecar, flatScan } from './fixture.js'

const scans = new Map<ScanId, ReturnType<typeof flatScan>>([['painted-metal', flatScan()]])
const build = (side: Sidecar, bake: BakeMaps | null): SkinMaps => {
  const t = trianglesOf(fixtureDoc(), side, W)
  return compose(paint(rasterize(t, 2 * W), t.roles, side, scans, W), side, W, bake)
}
const px = (m: Uint8Array, x: number, y: number): number[] => [m[3 * (y * W + x)]!, m[3 * (y * W + x) + 1]!, m[3 * (y * W + x) + 2]!]
/** Fully occluded everywhere, and every normal tilted toward +x (image right). */
const darkTilted: BakeMaps = { size: W, ao: new Uint8Array(3 * W * W), normal: new Uint8Array(3 * W * W).map((_, i) => [218, 128, 218][i % 3]!) }

describe('committed bake (M1c)', () => {
  it('darkens and tilts only the patches the sidecar lists as baked', () => {
    const plain = build(fixtureSidecar({ lines: [] }), null)
    const baked = build(fixtureSidecar({ lines: [], baked: [0] }), darkTilted)
    // Patch 0 (listed): texel (20, 12). Patch 1 (not listed): texel (52, 12).
    expect(px(baked.baseColor, 20, 12)[1]!).toBeLessThan(px(plain.baseColor, 20, 12)[1]! * 0.7)
    expect(px(baked.normal, 20, 12)[0]!).toBeGreaterThan(px(plain.normal, 20, 12)[0]! + 30)
    expect(px(baked.baseColor, 52, 12)).toEqual(px(plain.baseColor, 52, 12))
    expect(px(baked.normal, 52, 12)).toEqual(px(plain.normal, 52, 12))
  })

  it('a sidecar without a baked list ignores a bake entirely', () => {
    const plain = build(fixtureSidecar({ lines: [] }), null)
    const unlisted = build(fixtureSidecar({ lines: [] }), darkTilted)
    expect(Buffer.from(unlisted.baseColor).equals(Buffer.from(plain.baseColor))).toBe(true)
  })

  it('a bake refuses by name when its raw glb, its detail list or its size moved', () => {
    const m: BakeManifest = { version: 1, model: 'penn', rawSha256: 'a'.repeat(64), detailSha256: 'b'.repeat(64), size: 2048, info: {}, date: '2026-10-09' }
    expect(() => checkBake(m, 'penn', 'a'.repeat(64), 'b'.repeat(64), 2048)).not.toThrow()
    expect(() => checkBake(m, 'penn', 'c'.repeat(64), 'b'.repeat(64), 2048)).toThrow(/stale bake for penn: the raw glb .*re-bake on Ryzen: npm run models:bake -- penn/)
    expect(() => checkBake(m, 'penn', 'a'.repeat(64), 'c'.repeat(64), 2048)).toThrow(/stale bake for penn: the detail list/)
    expect(() => checkBake(m, 'penn', 'a'.repeat(64), 'b'.repeat(64), 1024)).toThrow(/2048 px but its atlas is 1024 px/)
    expect(() => checkBake(m, 'kagero', 'a'.repeat(64), 'b'.repeat(64), 2048)).toThrow(/manifest is for penn/)
  })

  it('a download whose bake input or detail list moved refuses by name (M1d)', async () => {
    await expect(loadDownloadBake('yamato-bb', new Uint8Array([1]), '[]', 2048))
      .rejects.toThrow(/stale bake for yamato-bb: the raw glb \(geometry or UVs\) and the detail list changed since it was baked; re-bake on Ryzen: npm run models:bake -- yamato-bb/)
  })
})
