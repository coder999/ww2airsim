// tests/tools/models/r3Stages.test.ts
import { describe, expect, it } from 'vitest'
import { getBounds } from '@gltf-transform/functions'
import { yawScene } from '../../../tools/models/stages/yaw.js'
import { runPipeline } from '../../../tools/models/build.js'
import { parseModelEntry } from '../../../tools/models/manifest.js'
import { onlyScene } from '../../../tools/models/document.js'
import { principalYawDeg, worldPositions } from '../../../tools/models/rig.js'
import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'

const UID = '0123456789abcdef0123456789abcdef'
const base = {
  id: 'toy',
  input: 'tools/models/cache/toy.glb',
  output: 'content/aircraft/toy.glb',
  source: { url: `https://sketchfab.com/3d-models/toy-${UID}`, uid: UID, author: 'a', license: 'CC-BY-4.0' },
  textures: { maxSize: 512, format: 'webp' },
  budget: { maxBytes: 1_000_000, maxTriangles: 10_000, maxDrawCalls: 10 },
}

/** A 10 x 1 x 2 box along x, turned `deg` about +y by its node, as a showcase pose would be. */
function posed(deg: number) {
  const doc = newDocument()
  const node = addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[-5, 0, -1], [5, 1, 1]]])])
  const h = (deg * Math.PI) / 360
  node.setRotation([0, Math.sin(h), 0, Math.cos(h)])
  return { doc, node }
}

describe('normalize.yawDeg (R3)', () => {
  it('principalYawDeg reads the pose, and yawScene by that squares the model to the axes', () => {
    const { doc, node } = posed(30)
    const yaw = principalYawDeg(worldPositions(node))
    expect(yaw).toBeCloseTo(-30, 6)
    yawScene(doc, '+y', yaw)
    const b = getBounds(onlyScene(doc))
    ;[-5, 0, -1].forEach((v, i) => expect(b.min[i]).toBeCloseTo(v, 5))
    ;[5, 1, 1].forEach((v, i) => expect(b.max[i]).toBeCloseTo(v, 5))
  })

  it('runs first in the pipeline: a yawed entry fits its span on the squared model', async () => {
    const { doc } = posed(30)
    const entry = parseModelEntry({ ...base, normalize: { forward: '+x', up: '+y', origin: [0, 0, 0], yawDeg: -30, fit: { extent: 'span', meters: 2 } } })
    await runPipeline(doc, entry)
    const b = getBounds(onlyScene(doc))
    expect(b.max[0] - b.min[0]).toBeCloseTo(10, 4)
    expect(b.max[2] - b.min[2]).toBeCloseTo(2, 4)
  })

  it('the schema: nonzero, in (-180, 180], inside normalize only', () => {
    const n = { forward: '+x', up: '+y', origin: [0, 0, 0], fit: { extent: 'span', meters: 2 } }
    expect(() => parseModelEntry({ ...base, normalize: { ...n, yawDeg: 0 } })).toThrow(/nonzero and in \(-180, 180\]/)
    expect(() => parseModelEntry({ ...base, normalize: { ...n, yawDeg: -180 } })).toThrow(/nonzero and in \(-180, 180\]/)
    expect(parseModelEntry({ ...base, normalize: { ...n, yawDeg: 180 } }).normalize!.yawDeg).toBe(180)
    expect(() => parseModelEntry({ ...base, yawDeg: 30 })).toThrow()
  })
})

describe('dedupMaterials (R3)', () => {
  function twoLookalikes() {
    const doc = newDocument()
    const a = doc.createMaterial('part-FACES').setBaseColorFactor([0.5, 0.5, 0.5, 1])
    const b = doc.createMaterial('part-FACES_7').setBaseColorFactor([0.5, 0.5, 0.5, 1])
    addMeshNode(doc, 'A', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]], a)])
    addMeshNode(doc, 'B', [boxesPrimitive(doc, [[[2, 0, 0], [3, 1, 1]]], b)])
    return doc
  }
  const normalize = { forward: '+x', up: '+y', origin: [0, 0, 0], fit: { extent: 'length', meters: 3 } }

  it('merges identical materials whatever their names, so join makes one draw', async () => {
    const doc = twoLookalikes()
    await runPipeline(doc, parseModelEntry({ ...base, normalize, dedupMaterials: true }))
    expect(doc.getRoot().listMaterials()).toHaveLength(1)
    expect(doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())).toHaveLength(1)
  })

  it('is off by default: the same document keeps both', async () => {
    const doc = twoLookalikes()
    await runPipeline(doc, parseModelEntry({ ...base, normalize }))
    expect(doc.getRoot().listMaterials()).toHaveLength(2)
  })
})
