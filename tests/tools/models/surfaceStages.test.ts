// tests/tools/models/surfaceStages.test.ts
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { measureDocument, nodeTriangles } from '../../../tools/models/measure.js'
import { simplifyDocument } from '../../../tools/models/stages/simplify.js'
import { joinExcept } from '../../../tools/models/stages/join.js'
import { compressTextures } from '../../../tools/models/stages/textures.js'
import { forceOpaque } from '../../../tools/models/stages/opaque.js'
import { addMeshNode, boxesPrimitive, gridPrimitive, newDocument } from './fixtures.js'

describe('simplifyDocument', () => {
  it('reduces a dense mesh, honors perNode by the nearest named ancestor, and fails on an unknown perNode name', async () => {
    const doc = newDocument()
    const canopy = doc.createNode('Verriere')
    doc.getRoot().listScenes()[0]!.addChild(canopy)
    const inner = addMeshNode(doc, 'Verriere_0', [gridPrimitive(doc, 40, 10)], canopy)
    const body = addMeshNode(doc, 'Corps', [gridPrimitive(doc, 40, 10)])
    expect(nodeTriangles(inner)).toBe(3200)
    await simplifyDocument(doc, { ratio: 1, error: 0.01, perNode: { Verriere: 0.1 } })
    expect(nodeTriangles(inner)).toBeLessThan(3200 * 0.2)
    expect(nodeTriangles(body)).toBe(3200)
    await expect(simplifyDocument(doc, { ratio: 1, error: 0.01, perNode: { Nope: 0.5 } })).rejects.toThrow(/"Nope"/)
  })
})

describe('joinExcept', () => {
  it('joins every same-material mesh except the parts, which survive by name', async () => {
    const doc = newDocument()
    const paint = doc.createMaterial('paint')
    addMeshNode(doc, 'Prop', [boxesPrimitive(doc, [[[5, 0, 0], [6, 1, 1]]], paint)])
    addMeshNode(doc, 'Wing', [boxesPrimitive(doc, [[[0, 0, -6], [1, 0.2, 6]]], paint)])
    addMeshNode(doc, 'Fuselage', [boxesPrimitive(doc, [[[-4, 0, 0], [4, 1, 1]]], paint)])
    await joinExcept(doc, new Set(['Prop']))
    const m = measureDocument(doc)
    expect(m.drawCalls).toBe(2)
    expect(m.triangles).toBe(36)
    expect(nodeTriangles(findNode(doc, 'Prop'))).toBe(12)
  })
})

describe('compressTextures + forceOpaque', () => {
  it('re-encodes as WebP no larger than maxSize, requires only EXT_texture_webp, and makes BLEND opaque', async () => {
    const doc = newDocument()
    const png = await sharp({ create: { width: 64, height: 32, channels: 4, background: { r: 40, g: 80, b: 30, alpha: 1 } } }).png().toBuffer()
    const tex = doc.createTexture('paint').setImage(new Uint8Array(png)).setMimeType('image/png')
    const mat = doc.createMaterial('hull').setBaseColorTexture(tex).setAlphaMode('BLEND')
    addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]], mat)])
    await compressTextures(doc, 16)
    forceOpaque(doc)
    const m = measureDocument(doc)
    expect(m.maxTextureSize).toBe(16)
    expect(doc.getRoot().listTextures()[0]!.getMimeType()).toBe('image/webp')
    expect(m.extensionsRequired).toEqual(['EXT_texture_webp'])
    expect(m.blendMaterials).toEqual([])
    // And it survives a write/read round trip.
    const io = modelIO()
    const again = await io.readBinary(await io.writeBinary(doc))
    expect(measureDocument(again).extensionsRequired).toEqual(['EXT_texture_webp'])
  })
})
