// tests/tools/models/skins.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { modelIO } from '../../../tools/models/document.js'
import { measureDocument } from '../../../tools/models/measure.js'

/**
 * Every non-generated entry is skinned (model-detail-pass spec §6). The flat-shaded allowlist
 * that stood here through DP0-DP2 was deleted 2026-09-29 when DP3 skinned the last nine buildings.
 */
const entries = loadModelEntries().filter((e) => e.source.kind !== 'generated')
const read = async (path: string) => modelIO().readBinary(new Uint8Array(readFileSync(path)))

describe('every non-generated entry is skinned (allowlist deleted 2026-09-29, DP3)', () => {
  it.each(entries.map((e) => [e.id, e] as const))('%s: its committed output is textured and its entry says how', async (id, e) => {
    const m = measureDocument(await read(e.output))
    expect(m.textures, `${id} textures`).toBeGreaterThan(0)
    if (e.source.kind === 'blender') expect(e.skin, `${id} skin declaration`).toBe(true)
  })
})

const skinned = entries.filter((e) => (e.source.kind === 'blender' || e.boxSkin !== undefined))
describe.each(skinned.map((e) => [e.id, e] as const))('skinned %s (DP0, DP2; spec §6)', (id, e) => {
  it('its entry says skin: true (a Blender script) or boxSkin (a download)', () => {
    expect(e.source.kind === 'blender' ? e.skin : e.boxSkin?.atlasPx).toBeTruthy()
  })
  it('one skin material with base-color, metallic-roughness and normal WebP maps at its atlas size; TEXCOORD_0 and no TEXCOORD_1 on every primitive but a ship\'s Skirt (ship:boot) and its generated mount kits (ship:fitting, ship:gunmetal)', async () => {
    const doc = await read(e.output)
    const skirt = e.ship?.kind === 'waterline'
    // Track M, M1 (2026-10-08): a mount kit the model has no geometry for is generated in plain
    // ship:fitting paint (tools/models/stages/mountKits.ts), its guns in ship:gunmetal (M1b, Ruling B1);
    // they carry no UVs and are the only other materials. A carved kit's guns keep the skin.
    const GENERATED = ['ship:fitting', 'ship:gunmetal']
    const generated = (n: string): boolean => n.startsWith('Kit_') && doc.getRoot().listNodes().find((x) => x.getName() === n)!.getMesh()!.listPrimitives().every((p) => GENERATED.includes(p.getMaterial()?.getName() ?? ''))
    const used = new Set(doc.getRoot().listNodes().filter((n) => n.getMesh() && generated(n.getName())).flatMap((n) => n.getMesh()!.listPrimitives().map((p) => p.getMaterial()!.getName())))
    // M1d: a download's `mask` materials (Fletcher's railing and net lattices) keep their own texture and UVs.
    const masks = Object.entries(e.ship?.materials ?? {}).filter(([, r]) => r === 'mask').map(([n]) => n)
    expect(doc.getRoot().listMaterials().map((m) => m.getName()).sort()).toEqual([`${id}-skin`, ...(skirt ? ['ship:boot'] : []), ...GENERATED.filter((g) => used.has(g)), ...masks].sort())
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
        if (generated(node.getName())) continue
        if (masks.includes(p.getMaterial()!.getName())) { expect(p.getMaterial()!.getAlphaMode()).toBe('MASK'); continue }
        expect(p.getMaterial(), `${node.getName()}`).toBe(mat)
        expect(p.getAttribute('TEXCOORD_0'), `${node.getName()}`).not.toBeNull(); expect(p.getAttribute('TEXCOORD_1')).toBeNull()
      }
    }
  })
})
