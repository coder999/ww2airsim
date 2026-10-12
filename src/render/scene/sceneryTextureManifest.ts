// Shared by the browser loader and tools/textures/buildScenery.ts. Keep this
// module free of Three.js and import.meta so tsx can execute it in Node.
import { z } from 'zod'

export const SCENERY_TEXTURE_LAYERS = ['steel', 'timber', 'concrete'] as const
export type SceneryTextureLayer = (typeof SCENERY_TEXTURE_LAYERS)[number]

const textureLayerSchema = z.object({
  name: z.enum(SCENERY_TEXTURE_LAYERS),
  source: z.string(),
  author: z.string(),
  tileM: z.number().positive(),
  albedo: z.string().endsWith('.ktx2'),
  normal: z.string().endsWith('.ktx2'),
  meanLinear: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),
})

export const sceneryTextureManifestSchema = z.object({
  version: z.literal(1),
  layers: z.array(textureLayerSchema).length(SCENERY_TEXTURE_LAYERS.length),
}).refine(
  manifest => manifest.layers.every((layer, index) => layer.name === SCENERY_TEXTURE_LAYERS[index]),
  'layers must be in SCENERY_TEXTURE_LAYERS order',
)

export type SceneryTextureManifest = z.infer<typeof sceneryTextureManifestSchema>
