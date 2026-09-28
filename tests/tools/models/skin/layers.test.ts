// tests/tools/models/skin/layers.test.ts
import { describe, expect, it } from 'vitest'
import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
import { paint } from '../../../../tools/models/skin/layers.js'
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
    // On the +y face only x lies in the surface: a lap at x = 0.8 m (column 24) and none at z = 0.8 m.
    expect(px(grid.normal, 23, 12)[0]).not.toBe(128)
    expect(px(grid.normal, 12, 23)[1]).toBe(128)
  })
})
