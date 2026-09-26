// Runtime loader for the terrain surface KTX2 arrays (Task 3). Kept separate
// from surfaceManifest.ts, which tools/textures/build.ts imports under tsx
// (no Vite, no import.meta.env): this file uses import.meta.env and `three`,
// so nothing in tools/ may import it.
import { RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { SURFACE_LAYERS, surfaceManifestSchema, type SurfaceLayer, type SurfaceManifest } from './surfaceManifest.js'

export { SURFACE_LAYERS, surfaceManifestSchema, type SurfaceLayer, type SurfaceManifest }

export const SURFACE_MANIFEST_URL = `${import.meta.env.BASE_URL}content/textures/terrain.json`
/** Vendored copy of three's transcoder (plan Ruling 5); tests/tools/textures.test.ts
 *  keeps it byte-identical to node_modules/three. */
export const BASIS_TRANSCODER_DIR = `${import.meta.env.BASE_URL}content/vendor/basis/`

export type SurfaceTextures = { readonly manifest: SurfaceManifest; readonly albedo: Texture; readonly normal: Texture }

const PARAM = 'terrainTextures'
/** DEV A/B switch. A typo fails loudly, as `cloudTierFromQuery` does. */
export function terrainTexturesFromQuery(search: string): 'on' | 'off' | undefined {
  const raw = new URLSearchParams(search).get(PARAM)
  if (raw === null) return undefined
  if (raw === 'on' || raw === 'off') return raw
  throw new Error(`${PARAM}: ${JSON.stringify(raw)} is not on or off`)
}

/** Both KTX2 arrays, transcoded for this device (BC on the reference desktop;
 *  three requests every supported feature). Rejects on any failure; the
 *  caller falls back to the procedural surface (plan Ruling 4). */
export async function loadSurfaceTextures(renderer: WebGPURenderer): Promise<SurfaceTextures> {
  const res = await fetch(SURFACE_MANIFEST_URL)
  if (!res.ok) throw new Error(`${SURFACE_MANIFEST_URL}: HTTP ${res.status}`)
  const manifest = surfaceManifestSchema.parse(await res.json())
  const dir = `${import.meta.env.BASE_URL}content/textures/`
  const loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_DIR).detectSupport(renderer)
  try {
    const [albedo, normal] = await Promise.all([loader.loadAsync(dir + manifest.albedo), loader.loadAsync(dir + manifest.normal)])
    for (const [name, t] of [['albedo', albedo], ['normal', normal]] as const) {
      const depth = (t.image as { depth?: number }).depth
      if (depth !== SURFACE_LAYERS.length) throw new Error(`terrain ${name}: ${depth} layers, expected ${SURFACE_LAYERS.length}`)
      t.wrapS = t.wrapT = RepeatWrapping
      // anisotropy stays 1 -- see createDetailTexture in surface.ts for the cost.
      t.name = `terrain-${name}`
      t.needsUpdate = true
    }
    // The albedo's DFD says sRGB (tests/tools/textures.test.ts), so the loader
    // must have tagged it; if not, the hardware would not linearize it and
    // every ratio would be wrong.
    if (albedo.colorSpace !== SRGBColorSpace) throw new Error(`terrain albedo colorSpace ${albedo.colorSpace}, expected sRGB`)
    return { manifest, albedo, normal }
  } finally {
    loader.dispose()
  }
}
