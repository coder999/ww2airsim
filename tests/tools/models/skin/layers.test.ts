// tests/tools/models/skin/layers.test.ts
import { describe, expect, it } from 'vitest'
import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
import { GRID_MIN_TEXELS, paint } from '../../../../tools/models/skin/layers.js'
import { scanFromChannels } from '../../../../tools/models/skin/scans.js'
import { compose, type SkinMaps } from '../../../../tools/models/skin/compose.js'
import type { Sidecar } from '../../../../tools/models/skin/sidecar.js'
import type { ScanId } from '../../../../tools/models/skin/surfaces.js'
import { FIXTURE_ATLAS as W, fixtureDoc, fixtureSidecar, flatScan } from './fixture.js'

const scans = new Map<ScanId, ReturnType<typeof flatScan>>([['painted-metal', flatScan()]])
const build = (side: Sidecar): SkinMaps => {
  const t = trianglesOf(fixtureDoc(), side, W)
  return compose(paint(rasterize(t, 2 * W), t.roles, side, scans, W), side, W)
}
const px = (m: Uint8Array, x: number, y: number): number[] => [m[3 * (y * W + x)]!, m[3 * (y * W + x) + 1]!, m[3 * (y * W + x) + 2]!]
const disc = (tags: string[], extra: Record<string, unknown> = {}) => ({ kind: 'disc', tags, center: [0.4, 0, 0.4], axis: [0, 1, 0], radiusM: 0.2, color: 'hinomaruRed', ...extra })

describe('skin layers (DP0)', () => {
  it('paints each role its sidecar color, lighter only by fading, and leaves the metallic channel at 0 for paint', () => {
    const m = build(fixtureSidecar({ lines: [] }))
    const top = px(m.baseColor, 20, 12), under = px(m.baseColor, 52, 12)
    expect(top[1]!).toBeGreaterThan(top[2]!) // green over blue: ijaGreen
    expect(under[0]!).toBeGreaterThan(140) // the pale underside
    expect(px(m.metallicRoughness, 20, 12)[2]).toBe(0)
  })

  it('a disc marking paints the face it faces and not the underside below it (Review Focus 5)', () => {
    const m = build(fixtureSidecar({ lines: [], markings: [disc(['wing'])] }))
    // (0.4, 0.4) m on patch 0 is texel (8 + 8, 8 + 8); on patch 1 it is (48 + 8, 8 + 8).
    const top = px(m.baseColor, 16, 16), under = px(m.baseColor, 56, 16)
    expect(top[0]!).toBeGreaterThan(top[1]! + 40) // red
    expect(under[0]! - under[1]!).toBeLessThan(20) // still the gray underside
  })

  it('tags restrict a marking to its parts (Review Focus 5)', () => {
    const m = build(fixtureSidecar({ lines: [], markings: [disc(['fuselage'])] }))
    const top = px(m.baseColor, 16, 16)
    expect(top[0]! - top[1]!).toBeLessThan(10) // not red: the wing is not tagged fuselage
  })

  it("a groove's normals tilt toward it: green < 128 just above the line, > 128 just below (Review Focus 2)", () => {
    const m = build(fixtureSidecar())
    // The line is at v = 0.8 m on patch 0: texel row 8 + 16 = 24.
    expect(px(m.normal, 20, 23)[1]).toBeLessThan(126)
    expect(px(m.normal, 20, 25)[1]).toBeGreaterThan(130)
    expect(px(m.normal, 20, 12)).toEqual([128, 128, 255]) // flat away from it
    expect(px(m.baseColor, 20, 24)[1]).toBeLessThan(px(m.baseColor, 20, 12)[1]!) // dirt in the seam
  })

  it('dilation fills the padding from its own patch, never a neighbor, and never black (Review Focus 4)', () => {
    const m = build(fixtureSidecar({ lines: [] }))
    // Patch 0 ends at x = 40 and patch 1 starts at x = 48: columns 40-43 are patch 0's, 44-47 patch 1's.
    for (let x = 40; x < 44; x++) expect(px(m.baseColor, x, 20), `x=${x}`).toEqual(px(m.baseColor, 39, 20))
    for (let x = 44; x < 48; x++) expect(px(m.baseColor, x, 12), `x=${x}`).toEqual(px(m.baseColor, 48, 12))
    for (let i = 0; i < W * W; i++) expect(m.baseColor[3 * i]! + m.baseColor[3 * i + 1]! + m.baseColor[3 * i + 2]!, `texel ${i}`).toBeGreaterThan(0)
  })

  it('a slab paints across a band whatever it faces; a grid cuts laps only on axes lying in the surface', () => {
    const slab = build(fixtureSidecar({ lines: [], markings: [{ kind: 'slab', tags: ['wing'], axis: 'x', fromM: 1.0, toM: 1.2, color: 'insigniaWhite' }] }))
    expect(px(slab.baseColor, 8 + 22, 20)[0]).toBeGreaterThan(180) // x = 1.1 m
    expect(px(slab.baseColor, 8 + 10, 20)[0]).toBeLessThan(120) // x = 0.5 m
    const grid = build(fixtureSidecar({ lines: [], markings: [{ kind: 'grid', tags: ['wing'], spacingM: [0.8, 0.8, null], widthM: 0.02, depth: 1 }] }))
    // x and z both lie in the +y face; y lies along its normal, so the y lap is skipped (its effect on
    // height is pinned by the next test: on this flat y = 0 face it would shift height uniformly, which
    // no normal can show). The x lap sits between columns 23 and 24 (x = u on patch 0). Left of it
    // height falls toward +u, so the normal tilts toward +u, red > 128; right of it, red < 128
    // (compose.ts hx; glTF tangent +x is +u). z has no spacing, so row 23 (z = 0.8 m) stays flat.
    expect(px(grid.normal, 23, 12)[0]).toBeGreaterThan(130)
    expect(px(grid.normal, 24, 12)[0]).toBeLessThan(126)
    expect(px(grid.normal, 12, 23)[1]).toBe(128)
  })

  it('a grid skips an axis along the face normal: a y lap cuts no height on the +y face', () => {
    // Every patch-0 sample sits at y = 0, a multiple of 0.8: without the exclusion each would be -depth.
    const side = fixtureSidecar({ lines: [], markings: [{ kind: 'grid', tags: ['wing'], spacingM: [null, 0.8, null], widthM: 0.02, depth: 1 }] })
    const t = trianglesOf(fixtureDoc(), side, W)
    const p = paint(rasterize(t, 2 * W), t.roles, side, scans, W)
    let count = 0
    for (let i = 0; i < p.size * p.size; i++) {
      if (!p.covered[i] || p.patch[i] !== 0) continue
      count++
      expect(p.height[i], `sample ${i}`).toBe(0)
    }
    expect(count).toBeGreaterThan(4000) // patch 0 is 64 x 64 samples, less the rasterizer's edge rule
  })

  it('a grid axis finer than GRID_MIN_TEXELS texels draws nothing: 0.15 m at 0.05 m/texel is 3 texels (band limit)', () => {
    expect(GRID_MIN_TEXELS).toBe(4)
    // x and z both lie in the +y face, so only the band limit can keep them off; 0.8 m (16 texels) still cuts (the test above).
    const side = fixtureSidecar({ lines: [], markings: [{ kind: 'grid', tags: ['wing'], spacingM: [0.15, null, 0.15], widthM: 0.02, depth: 1 }] })
    const t = trianglesOf(fixtureDoc(), side, W)
    const p = paint(rasterize(t, 2 * W), t.roles, side, scans, W)
    let count = 0
    for (let i = 0; i < p.size * p.size; i++) {
      if (!p.covered[i] || p.patch[i] !== 0) continue
      count++
      expect(p.height[i], `sample ${i}`).toBe(0)
    }
    expect(count).toBeGreaterThan(4000)
  })
})

describe('world-space scan sampling (DP2, Ruling S7)', () => {
  const unitNormals = (n: number): Float32Array => { const a = new Float32Array(3 * n); for (let i = 0; i < n; i++) a[3 * i + 2] = 1; return a }
  // A 4 px, 1 m scan whose luminance ramps across every texel, so any change of sample point changes the result.
  const ramp = scanFromChannels(4, 1, Float32Array.from({ length: 16 }, (_, k) => k / 15), new Float32Array(16).fill(0.5), unitNormals(16))
  /** Two texels at the same world point and normal, in two patches whose chart origins differ. */
  const twoTexels = (role: string) => {
    const size = 4, g = { size, covered: new Uint8Array(16), role: new Uint8Array(16), patch: new Int32Array(16).fill(-1), pos: new Float32Array(48), nrm: new Float32Array(48) }
    for (const [i, patch] of [[0, 0], [15, 1]] as const) { g.covered[i] = 1; g.patch[i] = patch; g.pos.set([1.3, 5, 0.7], 3 * i); g.nrm.set([0, 1, 0], 3 * i) }
    const side = fixtureSidecar({ roles: { [role]: [0.3, 0.25, 0.2] }, lines: [], markings: [],
      patches: [{ id: 0, tag: 'wing', rect: [8, 8, 32, 32], originM: [0, 0] }, { id: 1, tag: 'fuselage', rect: [48, 8, 12, 12], originM: [7.25, -3.5] }] })
    return paint(g, [role], side, new Map([['deck-planks', ramp], ['painted-metal', ramp]]), 64)
  }
  it('a deck samples its planks at world (x, z): one point reads the same from two differently placed charts', () => {
    const out = twoTexels('deck')
    expect([...out.color.subarray(45, 48)]).toEqual([...out.color.subarray(0, 3)])
    expect(out.rough[15]).toBe(out.rough[0])
  })
  it('a chart-sampled role (hull) reads differently there: the check bites', () => {
    const out = twoTexels('hull')
    expect([...out.color.subarray(45, 48)]).not.toEqual([...out.color.subarray(0, 3)])
  })
})
