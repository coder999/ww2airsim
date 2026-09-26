// tools/models/stages/collapse.ts
import type { Document, Node } from '@gltf-transform/core'
import { disposeSubtree, findNode, onlyScene, subtree } from '../document.js'
import { carve, ensureIndices } from './geometry.js'

/**
 * Runs only when an entry has `normalize`. Replaces a kept node's whole
 * subtree (a Sketchfab part is a GROUP node whose mesh hangs one level down,
 * e.g. `Rotor` > `Rotor_Rotor_0`, measured 2026-09-25) with ONE mesh node
 * named `as`, at the scene root, identity transform, vertices in the source
 * frame. `pivot` and `normalize` then see a flat leaf they can re-origin.
 */
export function collapseKept(doc: Document, keep: { readonly node: string; readonly as?: string | undefined }): Node {
  const top = findNode(doc, keep.node)
  const name = keep.as ?? keep.node
  const mesh = doc.createMesh(name)
  for (const n of subtree(top)) {
    const src = n.getMesh()
    if (!src) continue
    const world = n.getWorldMatrix()
    for (const prim of src.listPrimitives()) {
      const copy = prim.clone()
      const indices = ensureIndices(doc, copy)
      mesh.addPrimitive(carve(doc, copy, indices, world))
      copy.dispose()
    }
  }
  if (mesh.listPrimitives().length === 0) throw new Error(`keep "${keep.node}": no mesh under this node`)
  disposeSubtree(top)
  const node = doc.createNode(name).setMesh(mesh)
  onlyScene(doc).addChild(node)
  return node
}
