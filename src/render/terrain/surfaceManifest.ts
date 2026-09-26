// Imported by tools/ under tsx (no Vite): must stay free of import.meta.env
// and of `three`. Task 3's runtime loader lives in surfaceTextures.ts, which
// re-exports these names alongside the loader that needs import.meta.env.
import { z } from 'zod'

/** The five terrain materials (visual realism §2.1), in the order of the
 *  KTX2 array layers. The build writes them in this order and the shader
 *  indexes them by position, so this list is the single source of truth. */
export const SURFACE_LAYERS = ['sand', 'grass', 'dirt', 'jungle', 'rock'] as const
export type SurfaceLayer = (typeof SURFACE_LAYERS)[number]

export const surfaceManifestSchema = z.object({
  version: z.literal(1),
  albedo: z.string().endsWith('.ktx2'),
  normal: z.string().endsWith('.ktx2'),
  layers: z.array(z.object({
    name: z.enum(SURFACE_LAYERS),
    source: z.string(),
    /** Real-world metres one texture repeat covers (the source's own scan size). */
    tileM: z.number().positive(),
    /** Mean of the 1024² albedo, linear RGB: the divisor that makes a texel a
     *  ratio around 1 (plan Ruling 1). */
    meanLinear: z.tuple([z.number(), z.number(), z.number()]),
  })).length(SURFACE_LAYERS.length),
}).refine(m => m.layers.every((l, i) => l.name === SURFACE_LAYERS[i]), 'layers must be in SURFACE_LAYERS order')
export type SurfaceManifest = z.infer<typeof surfaceManifestSchema>
