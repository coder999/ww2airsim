// tools/models/stages/remove.ts
import type { Document } from '@gltf-transform/core'
import { disposeSubtree, findNode } from '../document.js'

/** Stage 1 (and again after `split`, for split names): drops each named node and
 *  everything below it. A name that matches no node fails the build. */
export function removeNodes(doc: Document, names: readonly string[]): void {
  for (const name of names) disposeSubtree(findNode(doc, name))
}
