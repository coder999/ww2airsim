// tools/models/stages/simplify.ts
import type { Document, Node } from '@gltf-transform/core'
import { simplifyPrimitive, weldPrimitive } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import type { ModelEntry } from '../manifest.js'
import { findNode, meshNodes, ownMesh } from '../document.js'

type Simplify = NonNullable<ModelEntry['simplify']>

/** The ratio for one mesh node: the nearest ancestor-or-self named in
 *  `perNode`, else the entry-wide ratio. */
function ratioFor(node: Node, s: Simplify): number {
  for (let n: Node | null = node; n; n = n.getParentNode()) {
    const r = s.perNode[n.getName()]
    if (r !== undefined) return r
  }
  return s.ratio
}

/**
 * meshoptimizer's simplifier, geometry only, no compression. Runs BEFORE
 * collapse, normalize and join (this plan moves it up from the spec's step 6)
 * because `perNode` names SOURCE nodes, `Verriere` and `Rotor`, which
 * collapse renames and join dissolves. The error bound is relative to each
 * mesh's radius, so the source frame's units do not matter.
 */
export async function simplifyDocument(doc: Document, s: Simplify): Promise<void> {
  await MeshoptSimplifier.ready
  for (const name of Object.keys(s.perNode)) findNode(doc, name)
  for (const node of meshNodes(doc)) {
    const ratio = ratioFor(node, s)
    if (ratio >= 1) continue
    for (const prim of ownMesh(doc, node)!.listPrimitives()) {
      weldPrimitive(prim)
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: s.error, lockBorder: false })
    }
  }
}
