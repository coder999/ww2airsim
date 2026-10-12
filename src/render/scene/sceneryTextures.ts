import { RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { BASIS_TRANSCODER_DIR } from '../terrain/surfaceTextures.js'
import {
  SCENERY_TEXTURE_LAYERS,
  sceneryTextureManifestSchema,
  type SceneryTextureLayer,
  type SceneryTextureManifest,
} from './sceneryTextureManifest.js'

export { SCENERY_TEXTURE_LAYERS, sceneryTextureManifestSchema, type SceneryTextureLayer, type SceneryTextureManifest }

export const SCENERY_TEXTURE_MANIFEST_URL = `${import.meta.env.BASE_URL}content/textures/scenery.json`

export type SceneryTexturePair = {
  readonly albedo: Texture
  readonly normal: Texture
  readonly tileM: number
  readonly meanLinear: readonly [number, number, number]
}
export type SceneryTextures = {
  readonly manifest: SceneryTextureManifest
  readonly layers: Readonly<Record<SceneryTextureLayer, SceneryTexturePair>>
}

export function sceneryTexturesFromQuery(search: string): 'on' | 'off' | undefined {
  const raw = new URLSearchParams(search).get('sceneryTextures')
  if (raw === null) return undefined
  if (raw === 'on' || raw === 'off') return raw
  throw new Error(`sceneryTextures: ${JSON.stringify(raw)} is not on or off`)
}

/** Loads the six small, independent scenery maps. Independent KTX2 files let
 * every material retain normal 2-D sampling/triplanar projection while the
 * renderer keeps exactly the same meshes and draw calls. */
export async function loadSceneryTextures(renderer: WebGPURenderer): Promise<SceneryTextures> {
  const response = await fetch(SCENERY_TEXTURE_MANIFEST_URL)
  if (!response.ok) throw new Error(`${SCENERY_TEXTURE_MANIFEST_URL}: HTTP ${response.status}`)
  const manifest = sceneryTextureManifestSchema.parse(await response.json())
  const loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_DIR).detectSupport(renderer)
  const base = `${import.meta.env.BASE_URL}content/textures/`
  try {
    const entries = await Promise.all(manifest.layers.map(async layer => {
      const [albedo, normal] = await Promise.all([loader.loadAsync(base + layer.albedo), loader.loadAsync(base + layer.normal)])
      albedo.wrapS = albedo.wrapT = normal.wrapS = normal.wrapT = RepeatWrapping
      albedo.name = `scenery-${layer.name}-albedo`
      normal.name = `scenery-${layer.name}-normal`
      albedo.needsUpdate = normal.needsUpdate = true
      if (albedo.colorSpace !== SRGBColorSpace) throw new Error(`${layer.name} albedo colorSpace ${albedo.colorSpace}, expected sRGB`)
      return [layer.name, { albedo, normal, tileM: layer.tileM, meanLinear: layer.meanLinear }] as const
    }))
    return { manifest, layers: Object.fromEntries(entries) as unknown as Record<SceneryTextureLayer, SceneryTexturePair> }
  } finally {
    loader.dispose()
  }
}
