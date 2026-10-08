// tools/models/stages/pivot.ts
import type { Document, Node } from '@gltf-transform/core'
import { transformMesh } from '@gltf-transform/functions'
import type { Pivot } from '../manifest.js'
import type { Vec3 } from './axes.js'
import { ownMesh } from '../document.js'
import { axisVector } from './axes.js'

/** A control surface's hinge from a Blender script's sidecar (C1): any unit axis, not just a named one. */
export interface Hinge { readonly point: Vec3; readonly axis: Vec3 }

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(...v)
  if (!(l > 1e-9)) throw new Error(`hinge axis must be a nonzero vector, got ${v.join(', ')}`)
  return [v[0] / l, v[1] / l, v[2] / l]
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/**
 * Stage 3: moves a collapsed or split node's origin onto `pivot.point`
 * without moving any vertex in the world, and records the hinge axis in the
 * node's extras as `pivotAxis`. `normalize` rotates both into the output
 * frame; GLTFLoader surfaces extras as `Object3D.userData.pivotAxis`, which is
 * where an airframe module reads the axis a part turns about.
 */
export function pivotNode(doc: Document, node: Node, pivot: Pivot | Hinge): void {
  const world = node.getWorldMatrix()
  if (world.some((v, i) => Math.abs(v - IDENTITY[i]!) > 1e-12) || node.getParentNode() !== null) {
    throw new Error(`pivot "${node.getName()}": expected a scene-root node with an identity transform (collapse or split it first)`)
  }
  const [px, py, pz] = pivot.point
  transformMesh(ownMesh(doc, node)!, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -px, -py, -pz, 1])
  node.setTranslation([px, py, pz])
  node.setExtras({ ...node.getExtras(), pivotAxis: typeof pivot.axis === 'string' ? axisVector(pivot.axis) : unit(pivot.axis) })
}
