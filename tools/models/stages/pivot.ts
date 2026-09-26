// tools/models/stages/pivot.ts
import type { Document, Node } from '@gltf-transform/core'
import { transformMesh } from '@gltf-transform/functions'
import type { Pivot } from '../manifest.js'
import { ownMesh } from '../document.js'
import { axisVector } from './axes.js'

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/**
 * Stage 3: moves a collapsed or split node's origin onto `pivot.point`
 * without moving any vertex in the world, and records the hinge axis in the
 * node's extras as `pivotAxis`. `normalize` rotates both into the output
 * frame; GLTFLoader surfaces extras as `Object3D.userData.pivotAxis`, which is
 * where an airframe module reads the axis a part turns about.
 */
export function pivotNode(doc: Document, node: Node, pivot: Pivot): void {
  const world = node.getWorldMatrix()
  if (world.some((v, i) => Math.abs(v - IDENTITY[i]!) > 1e-12) || node.getParentNode() !== null) {
    throw new Error(`pivot "${node.getName()}": expected a scene-root node with an identity transform (collapse or split it first)`)
  }
  const [px, py, pz] = pivot.point
  transformMesh(ownMesh(doc, node)!, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -px, -py, -pz, 1])
  node.setTranslation([px, py, pz])
  node.setExtras({ ...node.getExtras(), pivotAxis: axisVector(pivot.axis) })
}
