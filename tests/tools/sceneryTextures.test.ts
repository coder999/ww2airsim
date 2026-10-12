import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCENERY_TEXTURE_LAYERS, sceneryTextureManifestSchema } from '../../src/render/scene/sceneryTextureManifest.js'
import { SCENERY_TEXTURE_SOURCES } from '../../tools/textures/scenerySources.js'
import { readKtx2Header } from '../../tools/textures/ktx2.js'

describe('scenery texture assets', () => {
  it('pins one CC0 source in manifest order for every material', () => {
    expect(SCENERY_TEXTURE_SOURCES.map(source => source.layer)).toEqual([...SCENERY_TEXTURE_LAYERS])
    for (const source of SCENERY_TEXTURE_SOURCES) {
      expect(source.license).toBe('CC0-1.0')
      expect(source.diffuse.md5).toMatch(/^[0-9a-f]{32}$/)
      expect(source.normal.md5).toMatch(/^[0-9a-f]{32}$/)
    }
  })

  it('ships the complete manifest and ordinary mipmapped 2-D KTX2 files', () => {
    const manifest = sceneryTextureManifestSchema.parse(JSON.parse(readFileSync('content/textures/scenery.json', 'utf8')))
    expect(manifest.layers.map(layer => layer.name)).toEqual([...SCENERY_TEXTURE_LAYERS])
    for (const layer of manifest.layers) {
      for (const file of [layer.albedo, layer.normal]) {
        const bytes = new Uint8Array(readFileSync(`content/textures/${file}`))
        const header = readKtx2Header(bytes)
        expect(header.layerCount).toBe(0)
        expect(header.levelCount).toBeGreaterThan(1)
      }
    }
  })
})
