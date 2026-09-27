// tools/models/stages/dedup.ts
import { PropertyType, type Document, type Primitive } from '@gltf-transform/core'
import { dedup, joinPrimitives } from '@gltf-transform/functions'

/**
 * Opt-in (R3, an entry's `dedupMaterials: true`): merges byte-identical textures, then identical
 * materials, names ignored, before join. manilov.ap's downloads carry one material per
 * sub-object (the F4U 65, the Ki-43 68, measured 2026-09-26), and join groups by material, so
 * without this each would draw once per part. Off by default: no existing output changes.
 *
 * Then, within each mesh, joins the primitives that now share a material, mode and attribute
 * layout. join (stage 6) never touches a kept or split part, so without this a part collapsed
 * from many sub-objects still drew once per sub-object: the F6F's legs were 11 primitives over
 * 7 materials each, 49 draws against a budget of 47 (R3 Task 5, 2026-09-27).
 */
export async function dedupMaterials(doc: Document): Promise<void> {
  await doc.transform(dedup({ propertyTypes: [PropertyType.TEXTURE, PropertyType.MATERIAL] }))
  const layout = (p: Primitive): string => [
    doc.getRoot().listMaterials().indexOf(p.getMaterial()!),
    p.getMode(),
    p.getIndices() ? 'i' : 'n',
    ...p.listSemantics().map((s) => `${s}:${p.getAttribute(s)!.getType()}:${p.getAttribute(s)!.getComponentType()}:${p.getAttribute(s)!.getNormalized()}`).sort(),
    p.listTargets().length,
  ].join('|')
  for (const mesh of doc.getRoot().listMeshes()) {
    const groups = new Map<string, Primitive[]>()
    for (const p of mesh.listPrimitives()) {
      if (p.listTargets().length > 0) continue
      const k = layout(p)
      groups.set(k, [...(groups.get(k) ?? []), p])
    }
    for (const prims of groups.values()) {
      if (prims.length < 2) continue
      const joined = joinPrimitives(prims)
      for (const p of prims) { mesh.removePrimitive(p); p.dispose() }
      mesh.addPrimitive(joined)
    }
  }
}
