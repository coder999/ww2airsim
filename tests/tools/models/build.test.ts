// tests/tools/models/build.test.ts
import { describe, expect, it } from 'vitest'
import type { Document } from '@gltf-transform/core'
import { checkOutput, runBuild, runPipeline, type BuildDeps } from '../../../tools/models/build.js'
import { parseModelEntry, type ModelEntry } from '../../../tools/models/manifest.js'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { measureDocument, nodeTriangles } from '../../../tools/models/measure.js'
import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'

/** A Sketchfab-shaped toy airplane: nose +x, up +y, right +z, every part a group holding a mesh. */
function toyPlane(): Document {
  const doc = newDocument()
  const paint = doc.createMaterial('paint').setAlphaMode('BLEND')
  const root = doc.createNode('RootNode')
  doc.getRoot().listScenes()[0]!.addChild(root)
  const part = (name: string, boxes: Parameters<typeof boxesPrimitive>[1]) => {
    const g = doc.createNode(name)
    root.addChild(g)
    addMeshNode(doc, `${name}_${name}_0`, [boxesPrimitive(doc, boxes, paint)], g)
  }
  part('Rotor', [[[5, -1, -0.1], [5.2, 1, 0.1]]])
  part('Corps', [[[-4, -0.5, -0.5], [5, 0.5, 0.5]], [[0, -0.1, -6], [1, 0.1, 6]], [[-4.2, -0.8, -0.1], [-3.9, -0.6, 0.1]], [[1, -1, -0.3], [2, -0.6, 0.3]]])
  part('Verriere', [[[0, 0.5, -0.3], [1, 0.9, 0.3]]])
  return doc
}

const entry: ModelEntry = parseModelEntry({
  id: 'toy',
  input: 'tools/models/cache/toy.glb',
  output: 'content/aircraft/toy.glb',
  source: { url: 'https://sketchfab.com/3d-models/toy-0123456789abcdef0123456789abcdef', uid: '0123456789abcdef0123456789abcdef', author: 'tester', license: 'CC-BY-4.0' },
  normalize: { forward: '+x', up: '+y', origin: [0, 0, 0], fit: { extent: 'span', meters: 12 } },
  keep: [{ node: 'Rotor', as: 'Prop', pivot: { point: [5.1, 0, 0], axis: '+x' } }],
  split: [
    { name: 'Tailwheel', boxMin: [-4.5, -1, -0.5], boxMax: [-3.5, -0.55, 0.5], pivot: { point: [-4, -0.6, 0], axis: '+z' } },
    { name: 'DropTank', boxMin: [0.5, -1.5, -1], boxMax: [2.5, -0.55, 1] },
  ],
  remove: ['DropTank'],
  textures: { maxSize: 1024, format: 'webp' },
  budget: { maxBytes: 100_000, maxTriangles: 100, maxDrawCalls: 3 },
  noseNode: 'Prop',
})

describe('runPipeline on a synthetic airplane', () => {
  it('keeps and splits the parts, drops the tank, joins the rest, and meets its contract', async () => {
    const doc = await runPipeline(toyPlane(), entry)
    const io = modelIO()
    const bytes = await io.writeBinary(doc)
    expect(checkOutput(doc, bytes.byteLength, entry)).toEqual([])
    const m = measureDocument(doc)
    // Prop 12 + Tailwheel 12 + joined body (fuselage 12 + wing 12 + canopy 12) = 60; the tank's 12 are gone.
    expect(m.triangles).toBe(60)
    expect(m.drawCalls).toBe(3)
    expect(nodeTriangles(findNode(doc, 'Tailwheel'))).toBe(12)
    expect(m.blendMaterials).toEqual([])
    const again = await io.readBinary(bytes)
    const prop = findNode(again, 'Prop')
    expect(prop.getExtras()['pivotAxis']).toEqual([1, 0, 0])
    expect(prop.getTranslation()[0]).toBeCloseTo(5.1, 6) // span 12 over source span 12: scale 1
    expect(findNode(again, 'Tailwheel').getExtras()['pivotAxis']).toEqual([0, 0, 1])
    expect(again.getRoot().getAsset().extras).toMatchObject({ source: entry.source.url, license: 'CC-BY-4.0', author: 'tester' })
  })

  it('checkOutput names every broken limit with its measured value', async () => {
    const doc = await runPipeline(toyPlane(), entry)
    const tight = parseModelEntry({ ...entry, budget: { maxBytes: 10, maxTriangles: 59, maxDrawCalls: 2 } })
    const problems = checkOutput(doc, 5000, tight)
    expect(problems).toContain('5000 bytes > budget 10')
    expect(problems).toContain('60 triangles > budget 59')
    expect(problems).toContain('3 draw calls > budget 2')
  })

  it('fails the build when a listed part is missing from the input', async () => {
    const bad = parseModelEntry({ ...entry, keep: [{ node: 'Leg d', as: 'GearR' }], noseNode: undefined })
    await expect(runPipeline(toyPlane(), bad)).rejects.toThrow(/"Leg d"/)
  })
})

describe('runBuild (the models:build driver)', () => {
  function fakeDeps(present: string[]) {
    const lines: string[] = [], written: string[] = []
    const deps: BuildDeps = {
      exists: (p) => present.includes(p),
      read: async () => toyPlane(),
      write: (p) => { written.push(p) },
      encode: (doc) => modelIO().writeBinary(doc),
      log: (l) => { lines.push(l) },
    }
    return { deps, lines, written }
  }
  const frozen = parseModelEntry({ ...entry, id: 'old', output: 'content/aircraft/old.glb', frozen: 'pinned bytes' })

  it('with no id: builds what it can, and names every skip and why', async () => {
    const missing = parseModelEntry({ ...entry, id: 'gone', output: 'content/aircraft/gone.glb', input: 'tools/models/cache/gone.glb' })
    const f = fakeDeps([entry.input, frozen.input])
    expect(await runBuild([entry, frozen, missing], [], f.deps)).toBe(0)
    expect(f.written).toEqual(['content/aircraft/toy.glb'])
    expect(f.lines.some((l) => l.startsWith('skipped old: frozen (pinned bytes)'))).toBe(true)
    expect(f.lines.some((l) => l.startsWith('skipped gone: raw input tools/models/cache/gone.glb'))).toBe(true)
  })

  it('an explicit frozen id is refused without --force and built with it', async () => {
    const a = fakeDeps([frozen.input])
    expect(await runBuild([frozen], ['old'], a.deps)).toBe(1)
    expect(a.written).toEqual([])
    const b = fakeDeps([frozen.input])
    expect(await runBuild([frozen], ['old', '--force'], b.deps)).toBe(0)
    expect(b.written).toEqual(['content/aircraft/old.glb'])
  })

  it('an unknown id, or an explicit id with no raw input, exits 1', async () => {
    expect(await runBuild([entry], ['nope'], fakeDeps([]).deps)).toBe(1)
    expect(await runBuild([entry], ['toy'], fakeDeps([]).deps)).toBe(1)
  })

  it('over budget: exits 1 and writes nothing', async () => {
    const tight = parseModelEntry({ ...entry, budget: { ...entry.budget, maxTriangles: 10 } })
    const f = fakeDeps([entry.input])
    expect(await runBuild([tight], ['toy'], f.deps)).toBe(1)
    expect(f.written).toEqual([])
    expect(f.lines[0]).toMatch(/^FAILED toy, nothing written: 60 triangles > budget 10/)
  })
})
