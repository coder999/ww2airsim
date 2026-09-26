// tests/tools/models/shipStages.test.ts
import { describe, expect, it } from 'vitest'
import type { Document } from '@gltf-transform/core'
import { KHRMaterialsSpecular } from '@gltf-transform/extensions'
import { checkOutput, runBuild, runPipeline, type BuildDeps } from '../../../tools/models/build.js'
import { parseModelEntry, type ModelEntry } from '../../../tools/models/manifest.js'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { measureDocument } from '../../../tools/models/measure.js'
import { documentSoup } from '../../../tools/models/stages/shipFit.js'
import { shipMaterials } from '../../../tools/models/stages/shipMaterials.js'
import { fitProblems } from '../../../src/render/scene/shipFit.js'
import { loadShipSpec } from '../../../tools/content/load.js'
import { addMeshNode, boxesPrimitive, newDocument, type V3 } from './fixtures.js'

/**
 * tests/render/shipFixtures.ts's carrier (hull 260 x 26 x 15, deck slab 256 x
 * 30 topped at 16, island 24 m tall at z 12..15), authored the way the CV-6
 * is: bow toward -z, a tenth of the size, one material.
 */
function toyCarrier(islandSide: 1 | -1 = 1): Document {
  const doc = newDocument()
  const paint = doc.createMaterial('Material.001')
  // Output (x bow, y up, z starboard) -> source (x = z, y, z = -x), / 10.
  const box = (min: V3, max: V3): [V3, V3] => [[min[2] / 10, min[1] / 10, -max[0] / 10], [max[2] / 10, max[1] / 10, -min[0] / 10]]
  const island: [V3, V3] = islandSide === 1 ? [[0, 16, 12], [40, 40, 15]] : [[0, 16, -15], [40, 40, -12]]
  addMeshNode(doc, 'Object_2', [boxesPrimitive(doc, [box([-130, 0, -13], [130, 15, 13]), box([-128, 15, -15], [128, 16, 15]), box(...island)], paint)])
  return doc
}

const SOURCE = { url: 'https://sketchfab.com/3d-models/toy-cv-0123456789abcdef0123456789abcdef', uid: '0123456789abcdef0123456789abcdef', author: 'tester', license: 'CC-BY-4.0' }

const carrierEntry: ModelEntry = parseModelEntry({
  id: 'toy-cv',
  input: 'tools/models/cache/toy-cv.glb',
  output: 'content/ships/toy-cv.glb',
  source: SOURCE,
  normalize: { forward: '-z', up: '+y', origin: [0, 0, 0], fit: { extent: 'length', meters: 265.8 } },
  textures: { maxSize: 1024, format: 'webp' },
  opaque: false,
  budget: { maxBytes: 100_000, maxTriangles: 200, maxDrawCalls: 5 },
  ship: { spec: 'essex-cv', fit: 'deck', kind: 'waterline', palette: 'usn-1944', otherMaterials: 'classify', smokeOrigin: [20, 44, 14.5], bow: 'island-starboard' },
})

describe('the ship block in ModelEntrySchema', () => {
  const raw = { ...carrierEntry, ship: { ...carrierEntry.ship } } as Record<string, unknown>
  const bad = (patch: Record<string, unknown>): unknown => () => parseModelEntry({ ...raw, ...patch })
  it('parses, defaulting materials to {}', () => {
    expect(carrierEntry.ship!.materials).toEqual({})
  })
  it('refuses every inconsistent combination, naming it', () => {
    expect(bad({ ship: undefined })).toThrow(/content\/ships\/ output needs a ship block/)
    expect(bad({ output: 'content/aircraft/toy-cv.glb' })).toThrow(/only a content\/ships\/ output takes a ship block/)
    expect(bad({ opaque: true })).toThrow(/shipMaterials owns alpha/)
    expect(bad({ normalize: undefined })).toThrow(/a ship needs normalize/)
    expect(bad({ ship: { ...carrierEntry.ship, bow: 'narrow-end' } })).toThrow(/island-starboard/)
    expect(bad({ ship: { ...carrierEntry.ship, kind: 'full-hull' } })).toThrow(/keelM/)
    expect(bad({ ship: { ...carrierEntry.ship, otherMaterials: 'paint' } })).toThrow()
    expect(bad({ ship: { ...carrierEntry.ship, palette: 'ijn' } })).toThrow()
  })
})

describe('runPipeline on a synthetic carrier', () => {
  it('fits it, skirts it, paints it in roles, marks it, and meets its contract', async () => {
    const doc = await runPipeline(toyCarrier(), carrierEntry)
    const io = modelIO()
    const bytes = await io.writeBinary(doc)
    expect(checkOutput(doc, bytes.byteLength, carrierEntry)).toEqual([])
    const again = await io.readBinary(bytes)
    const names = again.getRoot().listMaterials().map((m) => m.getName()).sort()
    expect(names).toEqual(['ship:boot', 'ship:deck', 'ship:flightDeck', 'ship:hull', 'ship:superstructure'])
    expect(measureDocument(again).drawCalls).toBe(5)
    expect(findNode(again, 'SmokeOrigin').getTranslation()).toEqual([20, 44, 14.5])
    const band = findNode(again, 'TrapBand')
    expect(band.getTranslation()[0]).toBeCloseTo(-262.7 / 2 + 80, 6)
    expect(band.getExtras()['halfWidthM']).toBeCloseTo(0.45 * 32.9, 6)
    expect(again.getRoot().getAsset().extras).toMatchObject({ shipFit: { spec: 'essex-cv' }, source: SOURCE.url })
    // Tier 1's own re-measure, on the bytes that would be committed.
    expect(fitProblems(documentSoup(again), loadShipSpec('essex-cv'), carrierEntry.ship!).problems).toEqual([])
  })

  it('refuses a mirrored carrier, naming the island', async () => {
    await expect(runPipeline(toyCarrier(-1), carrierEntry)).rejects.toThrow(/island mean z .* not to starboard/)
  })

  it('takes its ShipSpec from the injected loader, so a moved deck fails the build', async () => {
    const cv = loadShipSpec('essex-cv')
    const raised = { ...cv, deckHeightM: 30, flightDeck: { ...cv.flightDeck!, heightM: 30 } }
    await expect(runPipeline(toyCarrier(), carrierEntry, () => raised)).rejects.toThrow(/sy\/sx 1\.8\d+ outside/)
  })
})

describe('shipMaterials', () => {
  it('maps roles, masks lattices, keeps a textured material at metalness 0 without its extensions or tangents', () => {
    const doc = newDocument()
    const spec = doc.createExtension(KHRMaterialsSpecular)
    const hull = doc.createMaterial('hullgrey').setMetallicFactor(0.4)
    const lattice = doc.createMaterial('mesh').setAlphaMode('BLEND')
    const textured = doc.createMaterial('DefaultMaterial').setMetallicFactor(1).setExtension('KHR_materials_specular', spec.createSpecular().setSpecularFactor(0.5))
    const other = doc.createMaterial('rope')
    const withUv = (m: Parameters<typeof boxesPrimitive>[2]) => {
      const p = boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]], m)
      p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(16)))
      p.setAttribute('TANGENT', doc.createAccessor().setType('VEC4').setArray(new Float32Array(32)))
      return p
    }
    addMeshNode(doc, 'a', [withUv(hull), withUv(lattice), withUv(textured), withUv(other)])
    const ship = parseModelEntry({ ...carrierEntry, ship: { ...carrierEntry.ship, fit: 'hull', kind: 'full-hull', keelM: -1, bow: 'narrow-end', materials: { hullgrey: 'hull', mesh: 'mask', DefaultMaterial: 'keep' }, otherMaterials: 'fitting' } }).ship!
    shipMaterials(doc, ship, null)
    const prims = doc.getRoot().listMeshes()[0]!.listPrimitives()
    const by = (name: string) => prims.find((p) => p.getMaterial()!.getName() === name)!
    expect(by('ship:hull').listSemantics().sort()).toEqual(['POSITION'])
    expect(by('ship:fitting').listSemantics().sort()).toEqual(['POSITION'])
    expect(by('mesh').getMaterial()!.getAlphaMode()).toBe('MASK')
    expect(by('mesh').getMaterial()!.getAlphaCutoff()).toBe(0.5)
    expect(by('mesh').listSemantics()).toContain('TEXCOORD_0')
    expect(by('DefaultMaterial').listSemantics().sort()).toEqual(['POSITION', 'TEXCOORD_0'])
    expect(doc.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toEqual([])
    for (const m of doc.getRoot().listMaterials()) {
      expect(m.getMetallicFactor(), m.getName()).toBe(0)
      expect(m.getAlphaMode(), m.getName()).not.toBe('BLEND')
    }
  })
})

describe('runBuild with a ship whose fit fails', () => {
  it('logs FAILED naming the problem, writes nothing for it, and still builds the rest', async () => {
    const good = parseModelEntry({ ...carrierEntry, id: 'good-cv', input: 'tools/models/cache/good-cv.glb', output: 'content/ships/good-cv.glb' })
    const lines: string[] = [], written: string[] = []
    const deps: BuildDeps = {
      exists: () => true,
      read: async (p) => toyCarrier(p.includes('good') ? 1 : -1),
      write: (p) => { written.push(p) },
      encode: (d) => modelIO().writeBinary(d),
      log: (l) => { lines.push(l) },
    }
    expect(await runBuild([carrierEntry, good], [], deps)).toBe(1)
    expect(written).toEqual(['content/ships/good-cv.glb'])
    expect(lines[0]).toMatch(/^FAILED toy-cv, nothing written: ship essex-cv: .*island mean z/)
  })
})
