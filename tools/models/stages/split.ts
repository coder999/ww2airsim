// tools/models/stages/split.ts
import type { Document, mat4, Mesh, Node, Primitive } from '@gltf-transform/core'
import { compactPrimitive } from '@gltf-transform/functions'
import { meshNodes, onlyScene, ownMesh } from '../document.js'
import { applyMatrix, carve, ensureIndices } from './geometry.js'

export interface SplitRule {
  readonly name: string
  readonly select: 'components' | 'triangles'
  readonly boxMin: readonly [number, number, number]
  readonly boxMax: readonly [number, number, number]
  readonly pivot?: { readonly point: readonly [number, number, number] } | undefined
  readonly cut?: { readonly normal: readonly [number, number, number] } | undefined
}

/** A plane n . p = d, in the frame the box is in. */
interface Plane { readonly n: readonly number[]; readonly d: number }

const EPS = 1e-7

/**
 * Slices every triangle of `prim` that touches the box by `plane`: a triangle with vertices on both
 * sides becomes three, with new vertices on the crossing edges whose every float attribute is
 * interpolated (an affine world matrix keeps the edge parameter, so it is found from world positions).
 * Crossing edges are shared, so the slices stay welded. Mutates `prim`.
 */
function slice(prim: Primitive, world: mat4, plane: Plane, min: readonly number[], max: readonly number[]): void {
  // A clone shares accessors with its source; this one writes its own.
  for (const sem of prim.listSemantics()) prim.setAttribute(sem, prim.getAttribute(sem)!.clone())
  prim.setIndices(prim.getIndices()!.clone())
  const pos = prim.getAttribute('POSITION')!
  const idx = Array.from(prim.getIndices()!.getArray() as ArrayLike<number>)
  const attrs = prim.listSemantics().map((s) => prim.getAttribute(s)!)
  const data = attrs.map((a) => Array.from(a.getArray() as ArrayLike<number>))
  const sizes = attrs.map((a) => a.getElementSize())
  const p = (v: number): [number, number, number] => applyMatrix(world, pos.getArray()!, v)
  const pts: number[][] = Array.from({ length: pos.getCount() }, (_, v) => p(v))
  const dist = (v: number): number => plane.n[0]! * pts[v]![0]! + plane.n[1]! * pts[v]![1]! + plane.n[2]! * pts[v]![2]! - plane.d
  const touches = (a: number, b: number, c: number): boolean =>
    [0, 1, 2].every((k) => Math.max(pts[a]![k]!, pts[b]![k]!, pts[c]![k]!) >= min[k]! - EPS && Math.min(pts[a]![k]!, pts[b]![k]!, pts[c]![k]!) <= max[k]! + EPS)
  const edges = new Map<string, number>()
  const cross = (a: number, b: number): number => {
    const key = a < b ? `${a},${b}` : `${b},${a}`
    const hit = edges.get(key)
    if (hit !== undefined) return hit
    const t = dist(a) / (dist(a) - dist(b))
    attrs.forEach((_, i) => { for (let k = 0; k < sizes[i]!; k++) data[i]!.push(data[i]![a * sizes[i]! + k]! + t * (data[i]![b * sizes[i]! + k]! - data[i]![a * sizes[i]! + k]!)) })
    const v = pts.length
    pts.push([0, 1, 2].map((k) => pts[a]![k]! + t * (pts[b]![k]! - pts[a]![k]!)))
    edges.set(key, v)
    return v
  }
  const out: number[] = []
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t]!, idx[t + 1]!, idx[t + 2]!]
    const s = tri.map((v) => { const d = dist(v); return d > EPS ? 1 : d < -EPS ? -1 : 0 })
    if (!touches(tri[0]!, tri[1]!, tri[2]!) || !(s.includes(1) && s.includes(-1))) { out.push(...tri); continue }
    // Rotate so the lone vertex (the one whose side no other shares) is first; winding is kept.
    const lone = [0, 1, 2].find((k) => s[k] !== 0 && s.filter((x) => x === s[k]).length === 1)!
    const [a, b, c] = [tri[lone]!, tri[(lone + 1) % 3]!, tri[(lone + 2) % 3]!]
    const sb = s[(lone + 1) % 3]!, sc = s[(lone + 2) % 3]!
    if (sb === 0) { const m = cross(a, c); out.push(a, b, m, b, c, m) } // b on the plane: one cut, two triangles
    else if (sc === 0) { const m = cross(a, b); out.push(a, m, c, m, b, c) }
    else { const ab = cross(a, b), ac = cross(a, c); out.push(a, ab, ac, ab, b, c, ab, c, ac) }
  }
  attrs.forEach((a, i) => { const Ctor = (a.getArray() as Float32Array).constructor as Float32ArrayConstructor; a.setArray(new Ctor(data[i]!)) })
  const Index = out.length > 0 && Math.max(...out) > 65535 ? Uint32Array : (prim.getIndices()!.getArray() as Uint32Array).constructor as Uint32ArrayConstructor
  prim.getIndices()!.setArray(new Index(out))
}

/** Whether any vertex of `mesh` lies inside the box: only then is it sliced (and copied). */
function touchesBox(mesh: Mesh, world: mat4, rule: SplitRule): boolean {
  return mesh.listPrimitives().some((prim) => {
    const pos = prim.getAttribute('POSITION')
    if (!pos) return false
    for (let v = 0; v < pos.getCount(); v++) if (inside(applyMatrix(world, pos.getArray()!, v), rule.boxMin, rule.boxMax)) return true
    return false
  })
}

/** The box's six faces, inward, and the rule's cut plane, as planes to slice by. */
function planesOf(rule: SplitRule): Plane[] {
  const planes: Plane[] = []
  for (let k = 0; k < 3; k++) {
    const n = [0, 0, 0]; n[k] = 1
    planes.push({ n, d: rule.boxMin[k]! }, { n, d: rule.boxMax[k]! })
  }
  if (rule.cut) {
    const n = rule.cut.normal, q = rule.pivot!.point
    planes.push({ n, d: n[0] * q[0] + n[1] * q[1] + n[2] * q[2] })
  }
  return planes
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
    const cut = rule.cut ? planesOf(rule).at(-1)! : null
    return Array.from({ length: triCount }, (_, t) => {
      const a = worldPos(indices[3 * t]!), b = worldPos(indices[3 * t + 1]!), c = worldPos(indices[3 * t + 2]!)
      const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
      return inside(m, rule.boxMin, rule.boxMax) && (cut === null || cut.n[0]! * m[0]! + cut.n[1]! * m[1]! + cut.n[2]! * m[2]! >= cut.d)
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
    if (rule.cut && touchesBox(mesh, world, rule)) {
      // Slice in the node's own mesh copy first, so a shared mesh elsewhere is untouched.
      const owned = ownMesh(doc, node)!
      for (const prim of owned.listPrimitives()) {
        if (prim.getMode() !== TRIANGLES) continue
        ensureIndices(doc, prim)
        for (const plane of planesOf(rule)) slice(prim, world, plane, rule.boxMin, rule.boxMax)
      }
    }
    const meshNow = node.getMesh()!
    for (const prim of meshNow.listPrimitives()) {
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
    const originalPrims = meshNow.listPrimitives()
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
