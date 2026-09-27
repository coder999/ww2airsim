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

/** A model script's top-level `NAME = <number>` literal: the figure its header cites or labels an ESTIMATE. */
export function scriptConstant(source: string, name: string): number {
  const m = new RegExp(`^${name} = (-?\\d+(?:\\.\\d+)?)[ \\t]*(?:#.*)?$`, 'm').exec(source)
  if (m === null) throw new Error(`no top-level literal "${name} = <number>" in the script`)
  return Number(m[1])
}

export interface Labeled { readonly label: string; readonly where: string; readonly tri: Tri }

/** p, already in t's plane, lies strictly inside t (not on an edge). */
function inside(p: Vec3, t: Tri, n: Vec3): boolean {
  for (let i = 0; i < 3; i++) {
    const a = t[i]!, b = t[(i + 1) % 3]!
    if (dot(cross(sub(b, a), sub(p, a)), n) <= 1e-9) return false
  }
  return true
}

/**
 * Pairs of triangles with different labels (materials) that lie in one plane, face the same way
 * and overlap, judged by either centroid lying strictly inside the other: two paints z-fighting,
 * as R2's deck slabs did. Opposite-facing coincident faces are one solid resting on another and
 * pass; so does the same paint, which z-fights invisibly. A heuristic: it catches a small face
 * on a large one, which is the case that has happened.
 */
export function coplanarOverlaps(tris: readonly Labeled[], eps = 1e-4): string[] {
  const faces = tris.flatMap((t) => {
    const n = unitNormal(t.tri)
    return n === null ? [] : [{ ...t, n, d: dot(n, t.tri[0]), c: centroid(t.tri) }]
  })
  const out = new Set<string>()
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const a = faces[i]!, b = faces[j]!
      if (a.label === b.label || dot(a.n, b.n) < 1 - 1e-6 || Math.abs(a.d - b.d) > eps) continue
      if (!inside(b.c, a.tri, a.n) && !inside(a.c, b.tri, b.n)) continue
      const c = inside(b.c, a.tri, a.n) ? b.c : a.c
      out.add(`${a.where} (${a.label}) / ${b.where} (${b.label}) at ${c.map((v) => v.toFixed(2)).join(', ')}`)
    }
  }
  return [...out]
}
