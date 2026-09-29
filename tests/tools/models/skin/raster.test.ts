// tests/tools/models/skin/raster.test.ts
import { describe, expect, it } from 'vitest'
import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
import { FIXTURE_ATLAS, fixtureDoc, fixtureSidecar } from './fixture.js'

describe('rasterize (DP0)', () => {
  const side = fixtureSidecar()
  const t = trianglesOf(fixtureDoc(), side, FIXTURE_ATLAS)
  const g = rasterize(t, 2 * FIXTURE_ATLAS)

  it('reads every triangle with its role and its patch', () => {
    expect(t.roles).toEqual(['ijaGreen', 'underside'])
    expect(t.tris.map((x) => x.patch)).toEqual([0, 0, 1, 1, 2, 2])
  })
  it('covers exactly each patch rect at 2x: 64x64 + 24x24 + 12x12 samples', () => {
    let n = 0
    for (let i = 0; i < g.covered.length; i++) n += g.covered[i]!
    expect(n).toBe(64 * 64 + 24 * 24 + 12 * 12)
  })
  it('interpolates position and normal: sample (x, y) in patch 0 is at u = (x + 0.5) / 2 - 8 px', () => {
    const s = 2 * FIXTURE_ATLAS
    const x = 30, y = 40, i = y * s + x
    expect(g.covered[i]).toBe(1)
    expect(g.patch[i]).toBe(0)
    expect(g.pos[3 * i]).toBeCloseTo(((x + 0.5) / 2 - 8) * 0.05, 5)
    expect(g.pos[3 * i + 2]).toBeCloseTo(((y + 0.5) / 2 - 8) * 0.05, 5)
    expect([g.nrm[3 * i], g.nrm[3 * i + 1], g.nrm[3 * i + 2]]).toEqual([0, 1, 0])
  })
  it('refuses a triangle whose UVs fall in no patch, naming the node', () => {
    const doc = fixtureDoc()
    const uv = doc.getRoot().listNodes()[0]!.getMesh()!.listPrimitives()[0]!.getAttribute('TEXCOORD_0')!
    uv.setElement(0, [0.99, 0.99]).setElement(1, [0.98, 0.99]).setElement(2, [0.99, 0.98])
    expect(() => trianglesOf(doc, side, FIXTURE_ATLAS)).toThrow(/fx_0.*no patch/)
  })
  it('refuses a role the sidecar does not list', () => {
    const doc = fixtureDoc()
    doc.getRoot().listMaterials()[0]!.setName('timber')
    expect(() => trianglesOf(doc, side, FIXTURE_ATLAS)).toThrow(/timber/)
  })
})
