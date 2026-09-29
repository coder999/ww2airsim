// tests/tools/models/skins.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { modelIO } from '../../../tools/models/document.js'
import { measureDocument } from '../../../tools/models/measure.js'

/**
 * Entries still flat-shaded: no UVs, no textures (model-detail-pass spec §6). The list shrinks
 * with each plan and never grows; DP3 deletes it. Blender entries leave it as they are skinned;
 * the four downloads are the ships made for 3D printing (spec §2, §8 Q1, DP2).
 */
const FLAT_SHADED: readonly string[] = [
  'aaa', 'ammunition-bunker', 'b-29-superfortress', 'barracks-and-huts', 'cleveland-cl',
  'coastal-gun-battery', 'fuel-tank-farm', 'ki-21-sally', 'mogami-ca',
  'p-38-lightning', 'pier-and-warehouses', 'radio-radar-station', 'revetment', 'tower',
  'yamato-bb',
]
/** Lower it with every entry that leaves the list; never raise it. */
const CEILING = 15

const entries = loadModelEntries().filter((e) => e.source.kind !== 'generated')
const read = async (path: string) => modelIO().readBinary(new Uint8Array(readFileSync(path)))

describe('the flat-shaded allowlist (DP0)', () => {
  it('only shrinks: sorted, unique, every id an entry, at most CEILING', () => {
    expect([...FLAT_SHADED].sort()).toEqual(FLAT_SHADED)
    expect(new Set(FLAT_SHADED).size).toBe(FLAT_SHADED.length)
    for (const id of FLAT_SHADED) expect(entries.some((e) => e.id === id), id).toBe(true)
    expect(FLAT_SHADED.length).toBeLessThanOrEqual(CEILING)
  })
  it.each(entries.map((e) => [e.id, e] as const))('%s is listed exactly when its committed output is untextured', async (id, e) => {
    const m = measureDocument(await read(e.output))
    expect(FLAT_SHADED.includes(id), `${id}: ${m.textures} textures`).toBe(m.textures === 0)
  })
})

const skinned = entries.filter((e) => (e.source.kind === 'blender' || e.boxSkin !== undefined) && !FLAT_SHADED.includes(e.id))
describe.each(skinned.map((e) => [e.id, e] as const))('skinned %s (DP0, DP2; spec §6)', (id, e) => {
  it('its entry says skin: true (a Blender script) or boxSkin (a download)', () => {
    expect(e.source.kind === 'blender' ? e.skin : e.boxSkin?.atlasPx).toBeTruthy()
  })
  it('one skin material with base-color, metallic-roughness and normal WebP maps at its atlas size; TEXCOORD_0 and no TEXCOORD_1 on every primitive but a ship\'s Skirt (ship:boot)', async () => {
    const doc = await read(e.output)
    const skirt = e.ship?.kind === 'waterline'
    expect(doc.getRoot().listMaterials().map((m) => m.getName()).sort()).toEqual((skirt ? [`${id}-skin`, 'ship:boot'] : [`${id}-skin`]).sort())
    const mat = doc.getRoot().listMaterials().find((m) => m.getName() === `${id}-skin`)!
    for (const t of [mat.getBaseColorTexture(), mat.getMetallicRoughnessTexture(), mat.getNormalTexture()]) {
      expect(t).not.toBeNull(); expect(t!.getMimeType()).toBe('image/webp')
    }
    expect(measureDocument(doc).maxTextureSize).toBe(e.textures.maxSize)
    // Ruling S1: a ship's skin is not metallic (no environment map; ship spec §5.1-5.2).
    expect(mat.getMetallicFactor()).toBe(e.ship ? 0 : 1)
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getMesh()) continue
      for (const p of node.getMesh()!.listPrimitives()) {
        if (node.getName() === 'Skirt') { expect(p.getMaterial()!.getName()).toBe('ship:boot'); continue }
        expect(p.getMaterial(), `${node.getName()}`).toBe(mat)
        expect(p.getAttribute('TEXCOORD_0'), `${node.getName()}`).not.toBeNull(); expect(p.getAttribute('TEXCOORD_1')).toBeNull()
      }
    }
  })
})

it('no entry says skin: true or boxSkin while its output is still listed flat', () => {
  for (const e of entries) if (FLAT_SHADED.includes(e.id)) { expect(e.skin, e.id).toBeUndefined(); expect(e.boxSkin, e.id).toBeUndefined() }
})
