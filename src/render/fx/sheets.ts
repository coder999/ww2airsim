import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { BASIS_TRANSCODER_DIR } from '../terrain/surfaceTextures.js'
import { FX_SHEETS, fxSheetManifestSchema, type FxSheetManifest } from './sheetManifest.js'

export const FX_SHEETS_DIR = `${import.meta.env.BASE_URL}content/fx/`
export type FxSheetTextures = { readonly manifest: FxSheetManifest; readonly lightA: Texture; readonly lightB: Texture; readonly motion: Texture; readonly fallback: boolean }

/** The three flipbook arrays (plan E1 Rulings R7, R8). Never rejects: any
 *  failure warns and returns `fallbackFxSheets()` (Review Focus 2), because
 *  a console error fails every Tier 2 spec and effects are not worth a
 *  failure screen. */
export async function loadFxSheets(renderer: WebGPURenderer): Promise<FxSheetTextures> {
  try {
    const res = await fetch(`${FX_SHEETS_DIR}sheets.json`)
    if (!res.ok) throw new Error(`${FX_SHEETS_DIR}sheets.json: HTTP ${res.status}`)
    const manifest = fxSheetManifestSchema.parse(await res.json())
    const loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_DIR).detectSupport(renderer)
    try {
      const images = [manifest.images.lightA, manifest.images.lightB, manifest.images.motion]
      const [lightA, lightB, motion] = await Promise.all(images.map((f) => loader.loadAsync(FX_SHEETS_DIR + f)))
      for (const [name, t] of [['lightA', lightA], ['lightB', lightB], ['motion', motion]] as const) {
        const depth = (t!.image as { depth?: number }).depth
        if (depth !== manifest.frames) throw new Error(`fx ${name}: ${depth} layers, expected ${manifest.frames}`)
        if (t!.colorSpace === SRGBColorSpace) throw new Error(`fx ${name} is tagged sRGB; lightmaps are linear data`)
        t!.minFilter = LinearMipmapLinearFilter; t!.magFilter = LinearFilter
        t!.name = `fx-${name}`; t!.needsUpdate = true
      }
      return { manifest, lightA: lightA!, lightB: lightB!, motion: motion!, fallback: false }
    } finally {
      loader.dispose()
    }
  } catch (err) {
    console.warn('fx sheets did not load; effects draw procedural blobs instead:', err)
    return fallbackFxSheets()
  }
}

/** A 16 px, one-frame procedural atlas in the same layout: round soft blobs,
 *  evenly lit, emission in the fireball and flame cells only. */
export function fallbackFxSheets(): FxSheetTextures {
  const cellPx = 16, cols = 3, rows = 2, w = cols * cellPx, h = rows * cellPx
  const a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4), m = new Uint8Array(w * h * 4)
  FX_SHEETS.forEach((name, cell) => {
    const glow = name === 'fireball' || name === 'flame'
    for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
      const r = Math.hypot((x + 0.5) / cellPx - 0.5, (y + 0.5) / cellPx - 0.5) / 0.45
      const d = Math.round(255 * Math.max(0, 1 - r) ** 1.5)
      const i = (((Math.floor(cell / cols) * cellPx + y) * w) + (cell % cols) * cellPx + x) * 4
      a.set([153, 153, 191, d], i)
      b.set([115, 89, 153, glow ? d : 0], i)
      m.set([128, 128, 0, 255], i)
    }
  })
  const tex = (data: Uint8Array, name: string): DataArrayTexture => {
    const t = new DataArrayTexture(data, w, h, 1)
    t.format = RGBAFormat; t.type = UnsignedByteType; t.minFilter = LinearFilter; t.magFilter = LinearFilter
    t.generateMipmaps = false; t.name = name; t.needsUpdate = true
    return t
  }
  const manifest = fxSheetManifestSchema.parse({
    version: 1, images: { lightA: 'fallback-a.ktx2', lightB: 'fallback-b.ktx2', motion: 'fallback-m.ktx2' },
    cellPx, cols, rows, frames: 1, motionScale: 0,
    sheets: FX_SHEETS.map((name, cell) => ({ name, cell })), provenance: { generator: 'placeholder', seed: 0 },
  })
  return { manifest, lightA: tex(a, 'fx-fallback-a'), lightB: tex(b, 'fx-fallback-b'), motion: tex(m, 'fx-fallback-m'), fallback: true }
}
