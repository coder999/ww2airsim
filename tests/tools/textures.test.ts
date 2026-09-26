import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readKtx2Header } from '../../tools/textures/ktx2.js'
import { TEXTURE_SOURCES } from '../../tools/textures/sources.js'
import { SURFACE_LAYERS, surfaceManifestSchema } from '../../src/render/terrain/surfaceManifest.js'

const root = new URL('../../', import.meta.url)
const bytes = (p: string): Uint8Array => new Uint8Array(readFileSync(new URL(p, root)))
const manifest = surfaceManifestSchema.parse(JSON.parse(readFileSync(new URL('content/textures/terrain.json', root), 'utf8')))

// KHR Data Format constants (KTX2 spec / khr_df.h).
const MODEL_ETC1S = 163, MODEL_UASTC = 166, TF_LINEAR = 1, TF_SRGB = 2, SS_BASIS_LZ = 1, SS_ZSTD = 2

describe('committed terrain textures (visual realism §2.1)', () => {
  it('albedo: 1024² ETC1S/BasisLZ sRGB array, one layer per surface layer, full mip chain', () => {
    const h = readKtx2Header(bytes(`content/textures/${manifest.albedo}`))
    expect(h).toMatchObject({ vkFormat: 0, pixelWidth: 1024, pixelHeight: 1024, layerCount: SURFACE_LAYERS.length, faceCount: 1, levelCount: 11, supercompressionScheme: SS_BASIS_LZ, colorModel: MODEL_ETC1S, transferFunction: TF_SRGB })
  })
  it('normal: 512² UASTC/zstd LINEAR array (a normal map must not be sRGB-decoded)', () => {
    const h = readKtx2Header(bytes(`content/textures/${manifest.normal}`))
    expect(h).toMatchObject({ vkFormat: 0, pixelWidth: 512, pixelHeight: 512, layerCount: SURFACE_LAYERS.length, faceCount: 1, levelCount: 10, supercompressionScheme: SS_ZSTD, colorModel: MODEL_UASTC, transferFunction: TF_LINEAR })
  })
  it('manifest layers are SURFACE_LAYERS in order, with sane tiles and linear means', () => {
    expect(manifest.layers.map(l => l.name)).toEqual([...SURFACE_LAYERS])
    for (const l of manifest.layers) {
      expect(l.tileM).toBeGreaterThan(0)
      for (const c of l.meanLinear) { expect(c).toBeGreaterThan(0.01); expect(c).toBeLessThan(0.9) }
    }
  })
  it('every source is CC0 and has an ASSETS.md row naming its page', () => {
    const assets = readFileSync(new URL('ASSETS.md', root), 'utf8')
    for (const s of TEXTURE_SOURCES) {
      expect(s.license).toBe('CC0-1.0')
      const row = assets.split('\n').find(line => line.includes(`https://polyhaven.com/a/${s.id}`))
      expect(row, s.id).toBeDefined()
      expect(row).toContain('CC0')
      expect(row).toContain(s.author)
    }
  })
  it('the vendored Basis transcoder is byte-identical to the one three ships (loader and transcoder must match)', () => {
    for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
      expect(Buffer.compare(bytes(`content/vendor/basis/${f}`), bytes(`node_modules/three/examples/jsm/libs/basis/${f}`)), f).toBe(0)
    }
  })
})

describe('readKtx2Header', () => {
  it('rejects a file that is not KTX2', () => {
    expect(() => readKtx2Header(new Uint8Array(80))).toThrow(/not a KTX2 file/)
  })
})
