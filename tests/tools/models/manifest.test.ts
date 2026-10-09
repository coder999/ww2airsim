// tests/tools/models/manifest.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadModelEntries, parseModelEntry } from '../../../tools/models/manifest.js'

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

  it('takes a unit-vector pivot axis, for a swept hinge (C1 batch 2)', () => {
    const e = parseModelEntry({ ...valid, keep: [{ node: 'Rotor', as: 'Prop', pivot: { point: [1, 2, 3], axis: [0.6, 0, 0.8] } }] })
    expect(e.keep[0]!.pivot!.axis).toEqual([0.6, 0, 0.8])
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
    ['a pivot axis that is not a unit vector', { ...valid, keep: [{ node: 'Rotor', as: 'Prop', pivot: { point: [1, 2, 3], axis: [1, 1, 0] } }] }, /unit vector/],
    ['a cut without a pivot', { ...valid, split: [{ name: 'T', select: 'triangles', boxMin: [0, 0, 0], boxMax: [1, 1, 1], cut: { normal: [1, 0, 0] } }] }, /a cut needs/],
    ['a cut on components', { ...valid, split: [{ name: 'T', select: 'components', boxMin: [0, 0, 0], boxMax: [1, 1, 1], pivot: { point: [0, 0, 0], axis: '+z' }, cut: { normal: [1, 0, 0] } }] }, /a cut needs/],
    ['a name used twice', { ...valid, split: [{ name: 'Prop', boxMin: [0, 0, 0], boxMax: [1, 1, 1] }], remove: [] }, /used twice/],
    ['removing a kept node', { ...valid, remove: ['Rotor'] }, /also kept/],
    ['a noseNode that names no part', { ...valid, noseNode: 'Spinner' }, /noseNode/],
    ['a texture size that is not a power of two', { ...valid, textures: { maxSize: 1000, format: 'webp' } }, /power of two/],
    ['a zero budget', { ...valid, budget: { ...valid.budget, maxDrawCalls: 0 } }, /maxDrawCalls/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => parseModelEntry(raw)).toThrow(message)
  })

  it('skin: true is a Blender entry\'s alone (DP0)', () => {
    const hangar = JSON.parse(readFileSync('tools/models/entries/hangar.json', 'utf8')) as Record<string, unknown>
    expect(parseModelEntry({ ...hangar, skin: true }).skin).toBe(true)
    expect(() => parseModelEntry({ ...valid, split: [], remove: [], skin: true })).toThrow(/skin/)
  })

  it('a Blender ship may be skinned (DP2), but not with keep or mask rules, which its one skin material replaces', () => {
    const kagero = JSON.parse(readFileSync('tools/models/entries/kagero-dd.json', 'utf8')) as { ship: Record<string, unknown> }
    expect(parseModelEntry({ ...kagero, skin: true }).skin).toBe(true)
    expect(() => parseModelEntry({ ...kagero, skin: true, ship: { ...kagero.ship, materials: { hull: 'keep' } } })).toThrow(/keep and mask do not apply/)
  })
  it('boxSkin is a downloaded ship\'s alone, at its textures.maxSize, with every material classified or mapped to a role (DP2)', () => {
    const essex = JSON.parse(readFileSync('tools/models/entries/essex-cv.json', 'utf8')) as Record<string, unknown>
    expect(parseModelEntry({ ...essex, boxSkin: { atlasPx: 1024 } }).boxSkin).toEqual({ atlasPx: 1024 })
    expect(() => parseModelEntry({ ...essex, boxSkin: { atlasPx: 512 } })).toThrow(/textures.maxSize/)
    expect(() => parseModelEntry({ ...essex, boxSkin: { atlasPx: 1024 }, ship: { ...(essex['ship'] as object), otherMaterials: 'keep' } })).toThrow(/boxSkin/)
    const hangar = JSON.parse(readFileSync('tools/models/entries/hangar.json', 'utf8')) as Record<string, unknown>
    expect(() => parseModelEntry({ ...hangar, boxSkin: { atlasPx: 512 } })).toThrow(/boxSkin/)
  })
})

const generated = {
  id: 'test-bomb',
  output: 'content/ordnance/test-bomb.glb',
  source: { kind: 'generated', generator: 'tools/models/generated/test-bomb.ts', dimensions: 'OP 1664 p. 390', license: 'AGPL-3.0-or-later' },
  textures: { maxSize: 512, format: 'webp' },
  budget: { maxBytes: 1000, maxTriangles: 100, maxDrawCalls: 1 },
}

describe('generated entries (O1)', () => {
  it('accepts a generated entry with no input, and names its kind', () => {
    const e = parseModelEntry(generated)
    expect(e.source.kind).toBe('generated')
    expect(e.input).toBeUndefined()
  })

  it.each([
    ['an input', { ...generated, input: 'tools/models/cache/x.glb' }, /takes no input/],
    ['keep nodes', { ...generated, keep: [{ node: 'A' }] }, /takes no keep/],
    ['a normalize block', { ...generated, normalize: valid.normalize }, /takes no normalize/],
    ['a CC license', { ...generated, source: { ...generated.source, license: 'CC0-1.0' } }, /license/],
    ['a generator outside tools/models/generated/', { ...generated, source: { ...generated.source, generator: 'tools/x.ts' } }, /generator/],
    ['an unknown source kind', { ...generated, source: { ...generated.source, kind: 'fab' } }, /kind/],
  ])('rejects a generated entry with %s', (_label, raw, message) => {
    expect(() => parseModelEntry(raw)).toThrow(message)
  })

  it('rejects a Sketchfab entry writing to content/ordnance/, and one with no input', () => {
    expect(() => parseModelEntry({ ...valid, id: 'x', output: 'content/ordnance/x.glb' })).toThrow(/content\/ordnance/)
    const { input, ...noInput } = valid
    void input
    expect(() => parseModelEntry(noInput)).toThrow(/needs its raw input/)
  })

  it('keeps every pre-O1 Sketchfab entry exactly shaped, plus kind "sketchfab"', () => {
    const before = JSON.parse(readFileSync('tests/tools/models/fixtures/entries-before-o1.json', 'utf8')) as { id: string; source: object }[]
    const beforeIds = new Set(before.map((e) => e.id))
    // DP2 adds `boxSkin` to four of these on purpose, and C1 batch 2 (2026-10-08) unfroze the Wildcat:
    // `frozen` out; `legacyOptimize`, `note`, its aileron `split` and a new `budget` in (its entry's
    // `note` says why). Every other field must be exactly as it was.
    const c1 = (e: Record<string, unknown>): Record<string, unknown> => {
      if (e['id'] !== 'wildcat') return e
      const { frozen, legacyOptimize, note, split, budget, ...rest } = e
      return (void frozen, void legacyOptimize, void note, void split, void budget, rest)
    }
    const now = loadModelEntries().filter((e) => e.source.kind === 'sketchfab' && beforeIds.has(e.id)).map(({ boxSkin, ...rest }) => (void boxSkin, c1(rest)))
    expect(now).toEqual(before.map((e) => c1({ ...e, source: { kind: 'sketchfab', ...e.source } })))
  })
})

const blender = {
  id: 'test-shed',
  output: 'content/buildings/test-shed.glb',
  source: { kind: 'blender', script: 'tools/models/blender/test-shed.py', dimensions: 'footprint from content/bases/x.json (read 2026-09-26)', license: 'AGPL-3.0-or-later' },
  textures: { maxSize: 512, format: 'webp' },
  budget: { maxBytes: 500_000, maxTriangles: 5000, maxDrawCalls: 4 },
}

describe('blender entries (R1, model-roster spec §4.1)', () => {
  it('accepts a blender entry with no input, and keeps the Sketchfab geometry fields open to it', () => {
    const e = parseModelEntry(blender)
    expect(e.source.kind).toBe('blender')
    expect(e.input).toBeUndefined()
    const withStages = parseModelEntry({ ...blender, normalize: valid.normalize, keep: [{ node: 'Prop' }], noseNode: 'Prop' })
    expect(withStages.keep).toHaveLength(1)
  })

  it('accepts content/buildings/ and content/vehicles/ outputs, from any source but generated', () => {
    expect(parseModelEntry({ ...blender, id: 'jeep', output: 'content/vehicles/jeep.glb' }).output).toBe('content/vehicles/jeep.glb')
    expect(parseModelEntry({ ...valid, id: 'tank', output: 'content/vehicles/tank.glb', split: [], remove: [] }).output).toBe('content/vehicles/tank.glb')
  })

  it.each([
    ['an input', { ...blender, input: 'tools/models/cache/test-shed.glb' }, /blender entry takes no input/],
    ['a script outside tools/models/blender/', { ...blender, source: { ...blender.source, script: 'tools/x.py' } }, /script must be tools\/models\/blender/],
    ['the kit module as its script', { ...blender, source: { ...blender.source, script: 'tools/models/blender/kit.py' } }, /kit module/],
    ['the preview module as its script', { ...blender, source: { ...blender.source, script: 'tools/models/blender/preview.py' } }, /kit module/],
    ['a CC license', { ...blender, source: { ...blender.source, license: 'CC-BY-4.0' } }, /license/],
    ['an ordnance output', { ...blender, id: 'b', output: 'content/ordnance/b.glb' }, /content\/ordnance/],
    ['an output folder that does not exist', { ...blender, id: 'p', output: 'content/props/p.glb' }, /output/],
  ])('rejects a blender entry with %s', (_label, raw, message) => {
    expect(() => parseModelEntry(raw)).toThrow(message)
  })

  it('still refuses geometry fields on a generated entry', () => {
    expect(() => parseModelEntry({ ...generated, keep: [{ node: 'A' }] })).toThrow(/takes no keep/)
  })
})
