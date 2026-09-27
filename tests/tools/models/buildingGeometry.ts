// tests/tools/models/buildingGeometry.ts
/** Geometry helpers for measuring committed and probe glbs in Node, no Blender (R4). */
import type { Node } from '@gltf-transform/core'

export type Vec3 = [number, number, number]
export type Tri = [Vec3, Vec3, Vec3]

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const centroid = (t: Tri): Vec3 => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3]

/** A mesh node's triangles in world space, in their stored winding. */
export function worldTriangles(node: Node): Tri[] {
  const m = node.getWorldMatrix()
  const out: Tri[] = []
  for (const prim of node.getMesh()?.listPrimitives() ?? []) {
    const pos = prim.getAttribute('POSITION')!
    const idx = prim.getIndices()!
    const v = (i: number): Vec3 => {
      const [x, y, z] = pos.getElement(idx.getScalar(i), [0, 0, 0]) as Vec3
      return [0, 1, 2].map((r) => m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!) as Vec3
    }
    for (let i = 0; i < idx.getCount(); i += 3) out.push([v(i), v(i + 1), v(i + 2)])
  }
  return out
}

/** The unit normal by winding (counterclockwise seen from the side it faces), or null for a sliver. */
export function unitNormal(t: Tri): Vec3 | null {
  const n = cross(sub(t[1], t[0]), sub(t[2], t[0]))
  const l = Math.hypot(n[0], n[1], n[2])
  return l < 1e-9 ? null : [n[0] / l, n[1] / l, n[2] / l]
}
