// tools/models/stages/dedup.ts
import { PropertyType, type Document } from '@gltf-transform/core'
import { dedup } from '@gltf-transform/functions'

/**
 * Opt-in (R3, an entry's `dedupMaterials: true`): merges byte-identical textures, then identical
 * materials, names ignored, before join. manilov.ap's downloads carry one material per
 * sub-object (the F4U 65, the Ki-43 68, measured 2026-09-26), and join groups by material, so
 * without this each would draw once per part. Off by default: no existing output changes.
 */
export async function dedupMaterials(doc: Document): Promise<void> {
  await doc.transform(dedup({ propertyTypes: [PropertyType.TEXTURE, PropertyType.MATERIAL] }))
}
