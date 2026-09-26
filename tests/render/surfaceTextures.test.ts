import { describe, expect, it } from 'vitest'
import { BASIS_TRANSCODER_DIR, surfaceManifestSchema, terrainTexturesFromQuery } from '../../src/render/terrain/surfaceTextures.js'

describe('terrainTexturesFromQuery', () => {
  it('reads on/off, is undefined when absent, and throws on a typo', () => {
    expect(terrainTexturesFromQuery('')).toBeUndefined()
    expect(terrainTexturesFromQuery('?terrainTextures=off')).toBe('off')
    expect(terrainTexturesFromQuery('?terrainTextures=on')).toBe('on')
    expect(() => terrainTexturesFromQuery('?terrainTextures=of')).toThrow(/terrainTextures/)
  })
})

describe('surfaceManifestSchema', () => {
  const layer = (name: string) => ({ name, source: 'x', tileM: 10, meanLinear: [0.2, 0.2, 0.2] })
  const ok = { version: 1, albedo: 'a.ktx2', normal: 'n.ktx2', layers: ['sand', 'grass', 'dirt', 'jungle', 'rock'].map(layer) }
  it('accepts layers in SURFACE_LAYERS order and rejects any other order', () => {
    expect(surfaceManifestSchema.safeParse(ok).success).toBe(true)
    const swapped = { ...ok, layers: ['grass', 'sand', 'dirt', 'jungle', 'rock'].map(layer) }
    expect(surfaceManifestSchema.safeParse(swapped).success).toBe(false)
  })
})

describe('BASIS_TRANSCODER_DIR', () => {
  it('ends in a slash, because KTX2Loader appends file names to it', () => {
    expect(BASIS_TRANSCODER_DIR.endsWith('/content/vendor/basis/')).toBe(true)
  })
})
