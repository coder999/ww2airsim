// tests/tools/models/build.test.ts
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Document } from '@gltf-transform/core'
import { blenderIntermediate, checkOutput, finishGenerated, nodeBuildDeps, runBuild, runPipeline, type BuildDeps } from '../../../tools/models/build.js'
import { parseModelEntry, type ModelEntry } from '../../../tools/models/manifest.js'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { measureDocument, nodeTriangles } from '../../../tools/models/measure.js'
import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'
import { fixtureDoc, fixtureSidecar, flatScan } from './skin/fixture.js'

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
    if (entry.source.kind !== 'sketchfab') throw new Error('test setup: entry is a sketchfab entry')
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

  /** sha256 of runPipeline(toyPlane(), entry) written as glb, recorded from the code BEFORE O1
   *  (Task 1 Step 1): the Sketchfab path must not move by a byte. */
  const TOY_SHA256_BEFORE_O1 = '5fdfea188ea255ef66bcd9881eca7fd0a23633a8b41a0d992eb2891e2c3f8d34'
  it('writes the synthetic airplane byte-identically to before O1', async () => {
    const bytes = await modelIO().writeBinary(await runPipeline(toyPlane(), entry))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(TOY_SHA256_BEFORE_O1)
  })
})

/** One closed box under one material: what a generator hands the build. */
function toyBomb(): Document {
  const doc = newDocument()
  addMeshNode(doc, 'toy-bomb', [boxesPrimitive(doc, [[[-0.8, -0.5, -0.2], [0.8, -0.1, 0.2]]], doc.createMaterial('paint'))])
  return doc
}

function fakeDeps(present: string[], haveBlender = true) {
  const lines: string[] = [], written: string[] = [], generated: string[] = [], reads: string[] = [], blenderRuns: string[] = []
  const deps: BuildDeps = {
    exists: (p) => present.includes(p),
    read: async (p) => { reads.push(p); return toyPlane() },
    write: (p) => { written.push(p) },
    encode: (doc) => modelIO().writeBinary(doc),
    log: (l) => { lines.push(l) },
    generate: async () => { generated.push('called'); return toyBomb() },
    haveBlender: () => haveBlender,
    blender: (script, out) => { blenderRuns.push(`${script} -> ${out}`) },
    readText: () => { throw new Error('readText: not used by this test') }, scan: () => Promise.reject(new Error('scan: not used by this test')),
  }
  return { deps, lines, written, generated, reads, blenderRuns }
}

const genEntry = parseModelEntry({
  id: 'toy-bomb', output: 'content/ordnance/toy-bomb.glb',
  source: { kind: 'generated', generator: 'tools/models/generated/toy-bomb.ts', dimensions: 'test figures', license: 'AGPL-3.0-or-later' },
  textures: { maxSize: 512, format: 'webp' },
  budget: { maxBytes: 100_000, maxTriangles: 12, maxDrawCalls: 1 },
})

describe('runBuild (the models:build driver)', () => {
  const frozen = parseModelEntry({ ...entry, id: 'old', output: 'content/aircraft/old.glb', frozen: 'pinned bytes' })

  it('with no id: builds what it can, and names every skip and why', async () => {
    const missing = parseModelEntry({ ...entry, id: 'gone', output: 'content/aircraft/gone.glb', input: 'tools/models/cache/gone.glb' })
    const f = fakeDeps([entry.input!, frozen.input!])
    expect(await runBuild([entry, frozen, missing], [], f.deps)).toBe(0)
    expect(f.written).toEqual(['content/aircraft/toy.glb'])
    expect(f.lines.some((l) => l.startsWith('skipped old: frozen (pinned bytes)'))).toBe(true)
    expect(f.lines.some((l) => l.startsWith('skipped gone: raw input tools/models/cache/gone.glb'))).toBe(true)
  })

  it('an explicit frozen id is refused without --force and built with it', async () => {
    const a = fakeDeps([frozen.input!])
    expect(await runBuild([frozen], ['old'], a.deps)).toBe(1)
    expect(a.written).toEqual([])
    const b = fakeDeps([frozen.input!])
    expect(await runBuild([frozen], ['old', '--force'], b.deps)).toBe(0)
    expect(b.written).toEqual(['content/aircraft/old.glb'])
  })

  it('an unknown id, or an explicit id with no raw input, exits 1', async () => {
    expect(await runBuild([entry], ['nope'], fakeDeps([]).deps)).toBe(1)
    expect(await runBuild([entry], ['toy'], fakeDeps([]).deps)).toBe(1)
  })

  it('over budget: exits 1 and writes nothing', async () => {
    const tight = parseModelEntry({ ...entry, budget: { ...entry.budget, maxTriangles: 10 } })
    const f = fakeDeps([entry.input!])
    expect(await runBuild([tight], ['toy'], f.deps)).toBe(1)
    expect(f.written).toEqual([])
    expect(f.lines[0]).toMatch(/^FAILED toy, nothing written: 60 triangles > budget 10/)
  })
})

describe('generated entries in the build (O1)', () => {
  it('runs the generator, never reads a raw input, and writes the output with its provenance', async () => {
    const f = fakeDeps([])
    expect(await runBuild([genEntry], ['toy-bomb'], f.deps)).toBe(0)
    expect(f.written).toEqual(['content/ordnance/toy-bomb.glb'])
    expect(f.generated).toEqual(['called'])
    const doc = await finishGenerated(toyBomb(), genEntry)
    expect(doc.getRoot().getAsset().extras).toMatchObject({ source: 'generated', generator: 'tools/models/generated/toy-bomb.ts', license: 'AGPL-3.0-or-later', dimensions: 'test figures' })
  })

  it('a generator that throws fails that entry by name and writes nothing', async () => {
    const f = fakeDeps([])
    f.deps.generate = async () => { throw new Error('boom') }
    expect(await runBuild([genEntry], ['toy-bomb'], f.deps)).toBe(1)
    expect(f.written).toEqual([])
    expect(f.lines[0]).toBe('FAILED toy-bomb, nothing written: boom')
  })

  it('a Sketchfab build never calls the generator', async () => {
    const f = fakeDeps([entry.input!])
    expect(await runBuild([entry], ['toy'], f.deps)).toBe(0)
    expect(f.generated).toEqual([])
  })

  it('an over-budget generated model is refused like any other', async () => {
    const tight = parseModelEntry({ ...genEntry, budget: { ...genEntry.budget, maxTriangles: 11 } })
    const f = fakeDeps([])
    expect(await runBuild([tight], ['toy-bomb'], f.deps)).toBe(1)
    expect(f.lines[0]).toMatch(/^FAILED toy-bomb, nothing written: 12 triangles > budget 11/)
  })
})

const shedEntry = parseModelEntry({
  id: 'toy-shed', output: 'content/buildings/toy-shed.glb',
  source: { kind: 'blender', script: 'tools/models/blender/toy-shed.py', dimensions: 'test figures', license: 'AGPL-3.0-or-later' },
  textures: { maxSize: 512, format: 'webp' },
  budget: { maxBytes: 100_000, maxTriangles: 100, maxDrawCalls: 3 },
})

describe('blender entries in the build (R1)', () => {
  it('runs the script into tools/models/cache/<id>.glb, reads that file, and writes the output with its provenance', async () => {
    const f = fakeDeps([])
    expect(await runBuild([shedEntry], ['toy-shed'], f.deps)).toBe(0)
    expect(blenderIntermediate('toy-shed')).toBe('tools/models/cache/toy-shed.glb')
    expect(f.blenderRuns).toEqual(['tools/models/blender/toy-shed.py -> tools/models/cache/toy-shed.glb'])
    expect(f.reads).toEqual(['tools/models/cache/toy-shed.glb'])
    expect(f.written).toEqual(['content/buildings/toy-shed.glb'])
    const doc = await runPipeline(toyPlane(), shedEntry)
    expect(doc.getRoot().getAsset().extras).toMatchObject({ source: 'blender', script: 'tools/models/blender/toy-shed.py', dimensions: 'test figures', license: 'AGPL-3.0-or-later' })
  })

  it('with no Blender: a bare build skips it by name, an explicit one exits 1, and neither runs or writes anything', async () => {
    const bare = fakeDeps([], false)
    expect(await runBuild([shedEntry], [], bare.deps)).toBe(0)
    expect(bare.lines).toEqual(['skipped toy-shed: no blender on PATH; build it on a host with Blender 5.0.1 (nexus)'])
    const explicit = fakeDeps([], false)
    expect(await runBuild([shedEntry], ['toy-shed'], explicit.deps)).toBe(1)
    expect(explicit.lines[0]).toMatch(/^missing toy-shed: no blender on PATH/)
    expect([...bare.blenderRuns, ...explicit.blenderRuns, ...bare.written, ...explicit.written]).toEqual([])
  })

  it('a script that fails (a raise, or the wrong Blender) fails that entry by name, writes nothing, and the rest still build', async () => {
    const f = fakeDeps([entry.input!])
    f.deps.blender = () => { throw new Error('blender 4.2.3 found; models need exactly 5.0.1') }
    expect(await runBuild([shedEntry, entry], ['toy-shed', 'toy'], f.deps)).toBe(1)
    expect(f.lines[0]).toBe('FAILED toy-shed, nothing written: blender 4.2.3 found; models need exactly 5.0.1')
    expect(f.written).toEqual(['content/aircraft/toy.glb'])
  })

  it('Sketchfab and generated builds never run Blender', async () => {
    const f = fakeDeps([entry.input!])
    expect(await runBuild([entry, genEntry], ['toy', 'toy-bomb'], f.deps)).toBe(0)
    expect(f.blenderRuns).toEqual([])
  })
})

describe('a skinned Blender entry (DP0)', () => {
  const hangar = (): ModelEntry => parseModelEntry({ ...JSON.parse(readFileSync('tools/models/entries/hangar.json', 'utf8')), skin: true })
  const deps = (over: Partial<BuildDeps> = {}): { deps: BuildDeps; written: Map<string, Uint8Array>; log: string[] } => {
    const written = new Map<string, Uint8Array>(), log: string[] = []
    return {
      written, log,
      deps: {
        ...nodeBuildDeps(), haveBlender: () => true, blender: () => {},
        exists: (p) => p.endsWith('.skin.json'), read: async () => fixtureDoc(512),
        readText: () => JSON.stringify(fixtureSidecar()), scan: async () => flatScan(),
        write: (p, b) => { written.set(p, b) }, log: (l) => { log.push(l) }, ...over,
      },
    }
  }

  it('builds one skin material with three WebP maps, TEXCOORD_0 on every primitive, in one draw', async () => {
    const d = deps()
    expect(await runBuild([hangar()], ['hangar'], d.deps), d.log.join('\n')).toBe(0)
    const doc = await modelIO().readBinary(d.written.get('content/buildings/hangar.glb')!)
    expect(doc.getRoot().listMaterials().map((m) => m.getName())).toEqual(['hangar-skin'])
    expect(doc.getRoot().listTextures().map((t) => t.getName()).sort()).toEqual(['hangar-skin-baseColor', 'hangar-skin-metallicRoughness', 'hangar-skin-normal'])
    expect(doc.getRoot().listTextures().every((t) => t.getMimeType() === 'image/webp')).toBe(true)
    for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) expect(p.getAttribute('TEXCOORD_0')).not.toBeNull()
    expect(measureDocument(doc).drawCalls).toBe(1)
  })

  it('refuses a skin entry whose script wrote no sidecar, and a sidecar its entry did not ask for', async () => {
    const none = deps({ exists: () => false })
    expect(await runBuild([hangar()], ['hangar'], none.deps)).toBe(1)
    expect(none.log.join('\n')).toMatch(/wrote no .*skin\.json/)
    const plain = parseModelEntry(JSON.parse(readFileSync('tools/models/entries/hangar.json', 'utf8')))
    const extra = deps()
    expect(await runBuild([plain], ['hangar'], extra.deps)).toBe(1)
    expect(extra.log.join('\n')).toMatch(/has no "skin": true/)
  })
})
