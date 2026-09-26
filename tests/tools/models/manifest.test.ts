// tests/tools/models/manifest.test.ts
import { describe, expect, it } from 'vitest'
import { parseModelEntry } from '../../../tools/models/manifest.js'

const valid = {
  id: 'test-plane',
  input: 'tools/models/cache/test-plane.glb',
  output: 'content/aircraft/test-plane.glb',
  source: { url: 'https://sketchfab.com/3d-models/test-plane-0123456789abcdef0123456789abcdef', uid: '0123456789abcdef0123456789abcdef', author: 'someone', license: 'CC-BY-4.0' },
  normalize: { forward: '+x', up: '+y', origin: [0, 0, 0], fit: { extent: 'span', meters: 12 } },
  keep: [{ node: 'Rotor', as: 'Prop', pivot: { point: [1, 2, 3], axis: '+x' } }],
  split: [{ name: 'Tank', select: 'triangles', boxMin: [0, 0, 0], boxMax: [1, 1, 1] }],
  remove: ['Tank'],
  textures: { maxSize: 1024, format: 'webp' },
  budget: { maxBytes: 1000, maxTriangles: 100, maxDrawCalls: 3 },
  noseNode: 'Prop',
}

describe('ModelEntrySchema', () => {
  it('accepts a complete entry and fills defaults', () => {
    const e = parseModelEntry({ ...valid, split: [], remove: [] })
    expect(e.opaque).toBe(true)
    expect(e.split).toEqual([])
    expect(parseModelEntry({ ...valid, split: [{ name: 'T', boxMin: [0, 0, 0], boxMax: [1, 1, 1] }], remove: [] }).split[0]!.select).toBe('components')
  })

  it.each([
    ['an unknown top-level key', { ...valid, outptu: 'x' }, /outptu/],
    ['an output basename that is not the id', { ...valid, output: 'content/aircraft/other.glb' }, /basename must equal id/],
    ['an input outside tools/models/cache/', { ...valid, input: 'content/models/candidates/x.glb' }, /input/],
    ['an output outside content/aircraft|ships', { ...valid, output: 'content/models/test-plane.glb' }, /output/],
    ['a uid that is not the url tail', { ...valid, source: { ...valid.source, uid: 'f'.repeat(32) } }, /last segment/],
    ['a ShareAlike license', { ...valid, source: { ...valid.source, license: 'CC-BY-SA-4.0' } }, /license/],
    ['forward parallel to up', { ...valid, normalize: { ...valid.normalize, up: '-x' } }, /parallel/],
    ['a split box with min >= max', { ...valid, split: [{ name: 'T', boxMin: [0, 0, 0], boxMax: [1, 0, 1] }], remove: [] }, /exceed boxMin/],
    ['a pivot without normalize', { ...valid, normalize: undefined }, /pivot needs normalize/],
    ['a name used twice', { ...valid, split: [{ name: 'Prop', boxMin: [0, 0, 0], boxMax: [1, 1, 1] }], remove: [] }, /used twice/],
    ['removing a kept node', { ...valid, remove: ['Rotor'] }, /also kept/],
    ['a noseNode that names no part', { ...valid, noseNode: 'Spinner' }, /noseNode/],
    ['a texture size that is not a power of two', { ...valid, textures: { maxSize: 1000, format: 'webp' } }, /power of two/],
    ['a zero budget', { ...valid, budget: { ...valid.budget, maxDrawCalls: 0 } }, /maxDrawCalls/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => parseModelEntry(raw)).toThrow(message)
  })
})
