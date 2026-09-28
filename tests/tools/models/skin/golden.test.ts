// tests/tools/models/skin/golden.test.ts
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
import { paint } from '../../../../tools/models/skin/layers.js'
import { compose } from '../../../../tools/models/skin/compose.js'
import type { ScanId } from '../../../../tools/models/skin/surfaces.js'
import { FIXTURE_ATLAS as W, fixtureDoc, fixtureSidecar, flatScan } from './fixture.js'

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const side = fixtureSidecar({ markings: [{ kind: 'disc', tags: ['wing'], center: [0.4, 0, 0.4], axis: [0, 1, 0], radiusM: 0.2, color: 'hinomaruRed', featherM: 0.02 }] })
export const goldenMaps = () => {
  const t = trianglesOf(fixtureDoc(), side, W)
  return compose(paint(rasterize(t, 2 * W), t.roles, side, new Map<ScanId, ReturnType<typeof flatScan>>([['painted-metal', flatScan()]]), W), side, W)
}

/** Golden hashes, recorded at Task 6 Step 5 from maps the implementer looked at. A change here
 *  is a change to the shared look (spec §5): update deliberately, in the commit that changes it. */
const RAW = {
  baseColor: 'dad0a72bc2f7ee62e2773fcb81184f23a0bcfefecb35218390d8996cc554b176',
  metallicRoughness: '6447297c225d1b4db9e91af79d0694dad80c3ae30153e6de8f41807789ccab93',
  normal: '089436c43f4d6be9f395d57357ad9106d6f1000916afd28fb7ed55797b4c98eb',
}

describe('the skin golden image (DP0, spec §6)', () => {
  it('the raw maps hash to the recorded goldens', () => {
    const m = goldenMaps()
    expect({ baseColor: sha(m.baseColor), metallicRoughness: sha(m.metallicRoughness), normal: sha(m.normal) }).toEqual(RAW)
  })
})
