// tools/models/stages/join.ts
import type { Document, Node } from '@gltf-transform/core'
import { join } from '@gltf-transform/functions'

/**
 * Stage 6: joins every mesh EXCEPT the named parts (and anything under them)
 * into as few primitives as materials allow, so draw calls come to roughly
 * materials + parts. glTF-Transform's `join` merges siblings, and after
 * `normalize` every mesh node is a sibling at the scene root.
 */
export async function joinExcept(doc: Document, parts: ReadonlySet<string>): Promise<void> {
  const isPart = (node: Node): boolean => {
    for (let n: Node | null = node; n; n = n.getParentNode()) if (parts.has(n.getName())) return true
    return false
  }
  await doc.transform(join({ keepMeshes: false, keepNamed: false, filter: (node) => !isPart(node) }))
}
