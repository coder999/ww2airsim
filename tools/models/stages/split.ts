// tools/models/stages/split.ts
import type { Document, mat4, Node, Primitive } from '@gltf-transform/core'
import { compactPrimitive } from '@gltf-transform/functions'
import { meshNodes, onlyScene, ownMesh } from '../document.js'
import { applyMatrix, carve, ensureIndices } from './geometry.js'

export interface SplitRule {
  readonly name: string
  readonly select: 'components' | 'triangles'
  readonly boxMin: readonly [number, number, number]
  readonly boxMax: readonly [number, number, number]
}

const TRIANGLES = 4

function inside(p: readonly number[], min: readonly number[], max: readonly number[]): boolean {
  return p[0]! >= min[0]! && p[0]! <= max[0]! && p[1]! >= min[1]! && p[1]! <= max[1]! && p[2]! >= min[2]! && p[2]! <= max[2]!
}

/** Which triangles of one primitive the rule takes, as a boolean per triangle.
 *  `components` joins triangles that share a vertex POSITION (bit-identical
 *  float values, so a hard-edged CAD shell with split normals stays one
 *  shell) and takes a shell only if its whole bounding box is inside the box. */
function selectTriangles(indices: Uint32Array, positions: ArrayLike<number>, world: mat4, rule: SplitRule): boolean[] {
  const triCount = indices.length / 3
  const worldPos = (v: number) => applyMatrix(world, positions, v)
  if (rule.select === 'triangles') {
    return Array.from({ length: triCount }, (_, t) => {
      const a = worldPos(indices[3 * t]!), b = worldPos(indices[3 * t + 1]!), c = worldPos(indices[3 * t + 2]!)
      return inside([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], rule.boxMin, rule.boxMax)
    })
  }
  // Union-find over position keys.
  const keyOf = new Map<string, number>()
  const parent: number[] = []
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
  const vertexKey = (v: number): number => {
    const k = `${positions[3 * v]},${positions[3 * v + 1]},${positions[3 * v + 2]}`
    let id = keyOf.get(k)
    if (id === undefined) { id = parent.length; parent.push(id); keyOf.set(k, id) }
    return id
  }
  const triKeys: number[] = []
  for (let t = 0; t < triCount; t++) {
    const ka = vertexKey(indices[3 * t]!), kb = vertexKey(indices[3 * t + 1]!), kc = vertexKey(indices[3 * t + 2]!)
    parent[find(kb)] = find(ka)
    parent[find(kc)] = find(ka)
    triKeys.push(ka)
  }
  const lo = new Map<number, number[]>(), hi = new Map<number, number[]>()
  for (let t = 0; t < triCount; t++) {
    const root = find(triKeys[t]!)
    for (let k = 0; k < 3; k++) {
      const p = worldPos(indices[3 * t + k]!)
      const l = lo.get(root) ?? [Infinity, Infinity, Infinity], h = hi.get(root) ?? [-Infinity, -Infinity, -Infinity]
      for (let a = 0; a < 3; a++) { l[a] = Math.min(l[a]!, p[a]!); h[a] = Math.max(h[a]!, p[a]!) }
      lo.set(root, l); hi.set(root, h)
    }
  }
  return Array.from({ length: triCount }, (_, t) => {
    const root = find(triKeys[t]!)
    return inside(lo.get(root)!, rule.boxMin, rule.boxMax) && inside(hi.get(root)!, rule.boxMin, rule.boxMax)
  })
}

/**
 * Stage 2: carves the geometry a rule selects out of every mesh in the scene
 * into ONE new node named `rule.name`, hung at the scene root with an
 * identity transform and its vertices in the source frame. What is left
 * behind stays where it was. A rule that selects nothing fails the build.
 */
export function splitByBox(doc: Document, rule: SplitRule): Node {
  const out = doc.createMesh(rule.name)
  for (const node of meshNodes(doc)) {
    const world = node.getWorldMatrix()
    const mesh = node.getMesh()!
    const hits: { prim: Primitive; take: Uint32Array; leave: Uint32Array }[] = []
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue
      const indices = prim.getIndices() ? Uint32Array.from(prim.getIndices()!.getArray() as ArrayLike<number>) : null
      const idx = indices ?? Uint32Array.from({ length: prim.getAttribute('POSITION')!.getCount() }, (_, i) => i)
      const chosen = selectTriangles(idx, prim.getAttribute('POSITION')!.getArray()!, world, rule)
      if (!chosen.includes(true)) continue
      const take: number[] = [], leave: number[] = []
      chosen.forEach((c, t) => (c ? take : leave).push(idx[3 * t]!, idx[3 * t + 1]!, idx[3 * t + 2]!))
      hits.push({ prim, take: Uint32Array.from(take), leave: Uint32Array.from(leave) })
    }
    if (hits.length === 0) continue
    const owned = ownMesh(doc, node)!
    const ownedPrims = owned.listPrimitives()
    const originalPrims = mesh.listPrimitives()
    for (const hit of hits) {
      const prim = ownedPrims[originalPrims.indexOf(hit.prim)]!
      ensureIndices(doc, prim)
      out.addPrimitive(carve(doc, prim, hit.take, world))
      if (hit.leave.length === 0) owned.removePrimitive(prim)
      else {
        prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(hit.leave))
        compactPrimitive(prim)
      }
    }
  }
  if (out.listPrimitives().length === 0) throw new Error(`split "${rule.name}": the box selected no triangles`)
  const node = doc.createNode(rule.name).setMesh(out)
  onlyScene(doc).addChild(node)
  return node
}
