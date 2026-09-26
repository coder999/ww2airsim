// tools/models/stages/opaque.ts
import type { Document } from '@gltf-transform/core'

/**
 * Stage 8: every material OPAQUE. The Wildcat's raw download marked its hull
 * and canopy BLEND over a baked AO mask in alpha, and GLTFLoader turned that
 * into a see-through hull (Mark, 2026-09-24). This replaces the binary patch
 * `forceOpaqueMaterials` did in the old build.ts.
 */
export function forceOpaque(doc: Document): void {
  for (const m of doc.getRoot().listMaterials()) m.setAlphaMode('OPAQUE')
}
