// tools/models/stages/split.ts
import type { Document, mat4, Mesh, Node, Primitive } from '@gltf-transform/core'
import { compactPrimitive, joinPrimitives } from '@gltf-transform/functions'
import { meshNodes, onlyScene, ownMesh } from '../document.js'
import { applyMatrix, carve, ensureIndices } from './geometry.js'

export interface SplitRule {
  readonly name: string
  readonly select: 'components' | 'triangles'
  readonly boxMin: readonly [number, number, number]
  readonly boxMax: readonly [number, number, number]
  readonly pivot?: { readonly point: readonly [number, number, number] } | undefined
  readonly cut?: { readonly normal: readonly [number, number, number]; readonly point?: readonly [number, number, number] | undefined } | undefined
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
  // Which crossing triangles to slice: those touching the box, and every crossing triangle joined to one
  // of them by an edge, so a split edge is split on both sides (no T-junction, no crack) wherever the
  // plane runs on through the same skin.
  const sideOf = (v: number): number => { const d = dist(v); return d > EPS ? 1 : d < -EPS ? -1 : 0 }
  const crosses = (t: number): boolean => { const s = [0, 1, 2].map((k) => sideOf(idx[t + k]!)); return s.includes(1) && s.includes(-1) }
  const pkey = (v: number): string => pts[v]!.map((c) => Math.round(c / EPS / 100)).join(',')
  const byEdge = new Map<string, number[]>()
  const edgesOf = (t: number): string[] => [0, 1, 2].map((k) => { const a = pkey(idx[t + k]!), b = pkey(idx[t + (k + 1) % 3]!); return a < b ? `${a}|${b}` : `${b}|${a}` })
  const crossing: number[] = []
  for (let t = 0; t < idx.length; t += 3) if (crosses(t)) { crossing.push(t); for (const e of edgesOf(t)) { const l = byEdge.get(e) ?? []; l.push(t); byEdge.set(e, l) } }
  const active = new Set(crossing.filter((t) => touches(idx[t]!, idx[t + 1]!, idx[t + 2]!)))
  for (const work = [...active]; work.length > 0;) {
    const t = work.pop()!
    for (const e of edgesOf(t)) for (const u of byEdge.get(e) ?? []) if (!active.has(u)) { active.add(u); work.push(u) }
  }
  const out: number[] = []
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t]!, idx[t + 1]!, idx[t + 2]!]
    const s = tri.map(sideOf)
    if (!active.has(t)) { out.push(...tri); continue }
    // Rotate so the lone vertex (the one whose side no other shares) is first; winding is kept.
    const lone = [0, 1, 2].find((k) => s[k] !== 0 && s.filter((x) => x === s[k]).length === 1)!
    const [a, b, c] = [tri[lone]!, tri[(lone + 1) % 3]!, tri[(lone + 2) % 3]!]
    const sb = s[(lone + 1) % 3]!, sc = s[(lone + 2) % 3]!
    if (sb === 0) { const m = cross(a, c); out.push(a, b, m, b, c, m) } // b on the plane: one cut, two triangles
    else if (sc === 0) { const m = cross(a, b); out.push(a, m, c, m, b, c) }
    else { const ab = cross(a, b), ac = cross(a, c); out.push(a, ab, ac, ab, b, c, ab, c, ac) }
  }
  attrs.forEach((a, i) => { const Ctor = (a.getArray() as Float32Array).constructor as Float32ArrayConstructor; a.setArray(new Ctor(data[i]!)) })
  // A reduce, not Math.max(...out): spreading the Zero's ~250k indices overflows the call stack (2026-10-08).
  const Index = out.reduce((m, v) => Math.max(m, v), 0) > 65535 ? Uint32Array : (prim.getIndices()!.getArray() as Uint32Array).constructor as Uint32ArrayConstructor
  prim.getIndices()!.setArray(new Index(out))
}

const ON_PLANE = 1e-4

/** The inverse of a column-major 4 x 4 affine matrix. */
function invert4(m: mat4): number[] {
  const a = [m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!]
  const det = a[0]! * (a[4]! * a[8]! - a[5]! * a[7]!) - a[3]! * (a[1]! * a[8]! - a[2]! * a[7]!) + a[6]! * (a[1]! * a[5]! - a[2]! * a[4]!)
  const i = [
    (a[4]! * a[8]! - a[5]! * a[7]!) / det, (a[2]! * a[7]! - a[1]! * a[8]!) / det, (a[1]! * a[5]! - a[2]! * a[4]!) / det,
    (a[5]! * a[6]! - a[3]! * a[8]!) / det, (a[0]! * a[8]! - a[2]! * a[6]!) / det, (a[2]! * a[3]! - a[0]! * a[5]!) / det,
    (a[3]! * a[7]! - a[4]! * a[6]!) / det, (a[1]! * a[6]! - a[0]! * a[7]!) / det, (a[0]! * a[4]! - a[1]! * a[3]!) / det,
  ]
  const t = [m[12]!, m[13]!, m[14]!]
  const it = [0, 1, 2].map((k) => -(i[k]! * t[0]! + i[3 + k]! * t[1]! + i[6 + k]! * t[2]!))
  return [i[0]!, i[1]!, i[2]!, 0, i[3]!, i[4]!, i[5]!, 0, i[6]!, i[7]!, i[8]!, 0, it[0]!, it[1]!, it[2]!, 1]
}

/**
 * Caps the openings a cut leaves (C1 batch 2 review: a lowered flap showed its hollow inside and the
 * ground through the slot it left). For every slicing plane, the taken triangles' edges lying on it that
 * no other taken triangle shares are chained into loops (by position, so a UV seam does not break a
 * loop) and ear-clipped into a flat face. The face is added twice, with new vertices, one copy facing
 * out of the taken piece and one out of the body it leaves, so both read as solid. A cap vertex
 * copies its loop vertex's attributes except its normal, which is the face's, and its texture
 * coordinates, which are one loop vertex's for the whole cap: a flat panel in the skin's paint. Mutates `prim`; returns the cap triangles for each side.
 */
function capOpenings(parts: readonly { readonly prim: Primitive; readonly world: mat4; readonly take: number[] }[], rule: SplitRule): { take: number[]; leave: number[] }[] {
  // A vertex is (part, index). Positions are compared in the box's frame, keyed to ON_PLANE, so a seam's
  // duplicate vertices, and a skin split across two materials (the F4U's elevators), meet as one.
  type V = readonly [number, number]
  const P = parts.map(({ prim }) => prim.getAttribute('POSITION')!)
  const p = (v: V): number[] => applyMatrix(parts[v[0]]!.world, P[v[0]]!.getArray()!, v[1])
  const key = (v: V): string => p(v).map((c) => Math.round(c / ON_PLANE)).join(',')
  const tris: V[][] = parts.flatMap(({ take }, i) => Array.from({ length: take.length / 3 }, (_, t) => [0, 1, 2].map((k) => [i, take[3 * t + k]!] as V)))
  const ekey = (a: V, b: V): string => { const ka = key(a), kb = key(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}` }
  const count = new Map<string, number>()
  for (const t of tris) for (let k = 0; k < 3; k++) { const e = ekey(t[k]!, t[(k + 1) % 3]!); count.set(e, (count.get(e) ?? 0) + 1) }
  const all = tris.flat()
  const centroid = [0, 1, 2].map((k) => all.reduce((sum, v) => sum + p(v)[k]!, 0) / all.length)
  // Normals live in the host node's frame: the inverse transpose of its world matrix's 3 x 3.
  const inv3 = (m: mat4, n: number[]): number[] => {
    const a = [m[0]!, m[1]!, m[2]!], b = [m[4]!, m[5]!, m[6]!], c = [m[8]!, m[9]!, m[10]!]
    const v = [a[0]! * n[0]! + a[1]! * n[1]! + a[2]! * n[2]!, b[0]! * n[0]! + b[1]! * n[1]! + b[2]! * n[2]!, c[0]! * n[0]! + c[1]! * n[1]! + c[2]! * n[2]!]
    const l = Math.hypot(...v); return v.map((x) => x / l)
  }
  // A world point into a host node's frame (its world matrix inverted; the nodes are affine).
  const toLocal = (m: mat4, q: number[]): number[] => {
    const inv = invert4(m)
    return [0, 1, 2].map((k) => inv[k]! * q[0]! + inv[4 + k]! * q[1]! + inv[8 + k]! * q[2]! + inv[12 + k]!)
  }
  const store = parts.map(({ prim }) => {
    const attrs = prim.listSemantics().map((sem) => ({ sem, a: prim.getAttribute(sem)! }))
    return { attrs, data: attrs.map(({ a }) => Array.from(a.getArray() as ArrayLike<number>)) }
  })
  const out = parts.map(() => ({ take: [] as number[], leave: [] as number[] }))
  // A cap vertex, in part `host`: the loop vertex's position (read from whichever part it came from; all
  // parts are one node, so one frame), the cap's normal, and every other attribute from `paint`, one host
  // vertex for the whole cap, so the cap is a flat panel in the skin's paint. Interpolating the loop's
  // own UVs streaked it: a cap joins upper- and lower-skin vertices from different parts of the atlas.
  const addVertex = (host: number, from: V, normal: number[], paint: number): number => {
    const { attrs, data } = store[host]!
    const src = from[0] === host ? P[host]!.getElement(from[1], [0, 0, 0]) : toLocal(parts[host]!.world, p(from))
    attrs.forEach(({ sem, a }, i) => {
      const n = a.getElementSize()
      if (sem === 'POSITION') data[i]!.push(...src)
      else if (sem === 'NORMAL') data[i]!.push(...normal)
      else for (let k = 0; k < n; k++) data[i]!.push(data[i]![paint * n + k]!)
    })
    return data[0]!.length / attrs[0]!.a.getElementSize() - 1
  }
  for (const plane of planesOf(rule)) {
    const on = (v: V): boolean => Math.abs(plane.n[0]! * p(v)[0]! + plane.n[1]! * p(v)[1]! + plane.n[2]! * p(v)[2]! - plane.d) < ON_PLANE
    // Boundary edges on this plane, oriented as their triangle has them.
    const next = new Map<string, { from: V; to: V }[]>()
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const a = t[k]!, b = t[(k + 1) % 3]!
      if (on(a) && on(b) && count.get(ekey(a, b)) === 1 && key(a) !== key(b)) {
        const list = next.get(key(a)) ?? []; list.push({ from: a, to: b }); next.set(key(a), list)
      }
    }
    if (next.size === 0) continue
    const side = Math.sign(plane.n[0]! * centroid[0]! + plane.n[1]! * centroid[1]! + plane.n[2]! * centroid[2]! - plane.d) || 1
    const outward = plane.n.map((c) => -side * c)
    const e1 = Math.abs(outward[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    const u = (() => { const d = e1[0]! * outward[0]! + e1[1]! * outward[1]! + e1[2]! * outward[2]!; const v = e1.map((x, i) => x - d * outward[i]!); const l = Math.hypot(...v); return v.map((x) => x / l) })()
    const w = [outward[1]! * u[2]! - outward[2]! * u[1]!, outward[2]! * u[0]! - outward[0]! * u[2]!, outward[0]! * u[1]! - outward[1]! * u[0]!]
    const uv2 = (v: V): [number, number] => { const q = p(v); return [q[0]! * u[0]! + q[1]! * u[1]! + q[2]! * u[2]!, q[0]! * w[0]! + q[1]! * w[1]! + q[2]! * w[2]!] }
    // Chain the edges. A closed chain is a loop; open chains (a piece's upper and lower skin lines on its
    // hinge plane, which no edge joins at the span ends) are joined, each end to the nearest unused end.
    const take1 = (k: string): { from: V; to: V } | undefined => {
      const l = next.get(k); if (!l) return undefined
      const e = l.pop()!; if (l.length === 0) next.delete(k); return e
    }
    const ins = new Set<string>()
    for (const l of next.values()) for (const e of l) ins.add(key(e.to))
    const chains: { verts: V[]; closed: boolean }[] = []
    while (next.size > 0) {
      const begin = [...next.keys()].find((k) => !ins.has(k)) ?? next.keys().next().value!
      const verts: V[] = []
      let cur = take1(begin), last: V | null = null
      while (cur) { verts.push(cur.from); last = cur.to; cur = take1(key(cur.to)) }
      const closed = key(last!) === key(verts[0]!)
      if (!closed) verts.push(last!)
      chains.push({ verts, closed })
    }
    const loops = chains.filter((c) => c.closed).map((c) => c.verts)
    const open = chains.filter((c) => !c.closed).map((c) => c.verts)
    if (open.length > 0) {
      const dist = (a: V, b: V): number => Math.hypot(...p(a).map((x, i) => x - p(b)[i]!))
      // Either end of a chain may be the near one: a mirrored source node winds its skin, and so runs its
      // chain, the other way (the F4U's tail). Orientation is settled per cap triangle below.
      // An open chain ends where this plane meets another of the rule's planes (a box face), and the segment
      // that closes it lies along that meeting line, so an end joins the nearest end on the same other
      // plane, which may be its own loop's start. That pairs the skins across their thickness, however thin
      // or thick, and leaves an extra chain (an overlay skin, as the F4U's tail has) a loop of its own rather
      // than a cap stretched diagonally across the span.
      const others = planesOf(rule).filter((q) => q.d !== plane.d || q.n.some((c, k) => c !== plane.n[k]))
      const faces = (v: V): Plane[] => others.filter((q) => Math.abs(q.n[0]! * p(v)[0]! + q.n[1]! * p(v)[1]! + q.n[2]! * p(v)[2]! - q.d) < ON_PLANE)
      const share = (a: V, b: V): boolean => { const fb = faces(b); return faces(a).some((f) => fb.includes(f)) }
      const near = (end: V, v: V): number => (share(end, v) ? 0 : 1e6) + dist(end, v)
      let joined = [...open.shift()!]
      for (;;) {
        const end = joined[joined.length - 1]!
        let best = -1, flip = false, d = joined.length > 2 ? near(end, joined[0]!) : Infinity
        open.forEach((c, i) => {
          if (near(end, c[0]!) < d) { d = near(end, c[0]!); best = i; flip = false }
          if (near(end, c[c.length - 1]!) < d) { d = near(end, c[c.length - 1]!); best = i; flip = true }
        })
        if (best < 0) {
          loops.push(joined)
          if (open.length === 0) break
          joined = [...open.shift()!]
          continue
        }
        const c = open.splice(best, 1)[0]!
        joined.push(...(flip ? c.reverse() : c))
      }
    }
    for (const loop of loops) {
      if (loop.length < 3) continue
      // Ear clipping in the plane's (u, w) frame; (u, w, outward) is right-handed.
      const pts = loop.map(uv2)
      const area = pts.reduce((sum, a, i) => { const b = pts[(i + 1) % pts.length]!; return sum + a[0] * b[1] - b[0] * a[1] }, 0)
      const order = area < 0 ? [...loop.keys()].reverse() : [...loop.keys()]
      const tri2: [number, number, number][] = []
      const cross = (a: [number, number], b: [number, number], c: [number, number]): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      const inTri = (q: [number, number], a: [number, number], b: [number, number], c: [number, number]): boolean => cross(a, b, q) > 0 && cross(b, c, q) > 0 && cross(c, a, q) > 0
      let ring = order
      for (let guard = 0; ring.length > 3 && guard < 10 * loop.length * loop.length; guard++) {
        let clipped = false
        for (let i = 0; i < ring.length; i++) {
          const ia = ring[(i + ring.length - 1) % ring.length]!, ib = ring[i]!, ic = ring[(i + 1) % ring.length]!
          const a = pts[ia]!, b = pts[ib]!, c = pts[ic]!
          if (cross(a, b, c) <= 1e-12) continue
          if (ring.some((j) => j !== ia && j !== ib && j !== ic && inTri(pts[j]!, a, b, c))) continue
          tri2.push([ia, ib, ic]); ring = ring.filter((j) => j !== ib); clipped = true; break
        }
        // ponytail: a loop with no ear left (self-touching, or degenerate) is fanned; caps are flat and small.
        if (!clipped) { for (let i = 1; i + 1 < ring.length; i++) tri2.push([ring[0]!, ring[i]!, ring[i + 1]!]); ring = [] }
      }
      if (ring.length === 3) tri2.push([ring[0]!, ring[1]!, ring[2]!])
      // The cap goes in the part holding most of its loop; its paint is that part's first loop vertex.
      const votes = parts.map((_, i) => loop.filter((v) => v[0] === i).length)
      const host = votes.indexOf(Math.max(...votes))
      const paint = loop.find((v) => v[0] === host)![1]
      const nOut = inv3(parts[host]!.world, outward), nIn = nOut.map((c) => -c)
      const outV = loop.map((v) => addVertex(host, v, nOut, paint)), inV = loop.map((v) => addVertex(host, v, nIn, paint))
      for (const [a, b0, c0] of tri2) {
        // Each cap triangle faces out of the piece whatever the clipping did: a joined loop can cross
        // itself (a gull wing's section), and the fan that then finishes it can wind either way.
        const flip = cross(pts[a]!, pts[b0]!, pts[c0]!) < 0 // counter-clockwise in (u, w) faces out
        const [b, c] = flip ? [c0, b0] : [b0, c0]
        out[host]!.take.push(outV[a]!, outV[b]!, outV[c]!); out[host]!.leave.push(inV[a]!, inV[c]!, inV[b]!)
      }
    }
  }
  store.forEach(({ attrs, data }) => attrs.forEach(({ a }, i) => { const Ctor = (a.getArray() as Float32Array).constructor as Float32ArrayConstructor; a.setArray(new Ctor(data[i]!)) }))
  return out
}

/** Whether `mesh`'s bounds overlap the box: only then is it sliced (and copied). Bounds, not vertices:
 *  a box between two rib stations holds no vertex, yet the skin triangles run through it. */
function touchesBox(mesh: Mesh, world: mat4, rule: SplitRule): boolean {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    for (let v = 0; v < pos.getCount(); v++) {
      const p = applyMatrix(world, pos.getArray()!, v)
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!) }
    }
  }
  return [0, 1, 2].every((k) => hi[k]! >= rule.boxMin[k]! && lo[k]! <= rule.boxMax[k]!)
}

/** The box's six faces, inward, and the rule's cut plane, as planes to slice by. */
function planesOf(rule: SplitRule): Plane[] {
  const planes: Plane[] = []
  for (let k = 0; k < 3; k++) {
    const n = [0, 0, 0]; n[k] = 1
    planes.push({ n, d: rule.boxMin[k]! }, { n, d: rule.boxMax[k]! })
  }
  if (rule.cut) {
    const n = rule.cut.normal, q = rule.cut.point ?? rule.pivot!.point
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
  const shell = triangleShells(indices, positions)
  const lo = new Map<number, number[]>(), hi = new Map<number, number[]>()
  for (let t = 0; t < triCount; t++) {
    const root = shell[t]!
    for (let k = 0; k < 3; k++) {
      const p = worldPos(indices[3 * t + k]!)
      const l = lo.get(root) ?? [Infinity, Infinity, Infinity], h = hi.get(root) ?? [-Infinity, -Infinity, -Infinity]
      for (let a = 0; a < 3; a++) { l[a] = Math.min(l[a]!, p[a]!); h[a] = Math.max(h[a]!, p[a]!) }
      lo.set(root, l); hi.set(root, h)
    }
  }
  return Array.from({ length: triCount }, (_, t) => {
    const root = shell[t]!
    return inside(lo.get(root)!, rule.boxMin, rule.boxMax) && inside(hi.get(root)!, rule.boxMin, rule.boxMax)
  })
}

/** Each triangle's shell id: triangles sharing a vertex POSITION (bit-identical floats) are one
 *  shell, so a hard-edged CAD shell with split normals stays one. Ids are arbitrary but equal per shell. */
export function triangleShells(indices: Uint32Array, positions: ArrayLike<number>): number[] {
  const triCount = indices.length / 3
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
  return triKeys.map((k) => find(k))
}

/** Joins `mesh`'s primitives that share a material and vertex layout into one each. */
export function mergeSameMaterial(mesh: Mesh): void {
  const groups = new Map<unknown, Map<string, Primitive[]>>()
  for (const prim of mesh.listPrimitives()) {
    const layout = prim.listSemantics().map((sem) => `${sem}:${prim.getAttribute(sem)!.getComponentType()}:${prim.getAttribute(sem)!.getType()}`).sort().join(',')
    const byMaterial = groups.get(prim.getMaterial()) ?? new Map<string, Primitive[]>()
    const key = `${prim.getMode()}|${layout}`
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), prim])
    groups.set(prim.getMaterial(), byMaterial)
  }
  for (const g of [...groups.values()].flatMap((m) => [...m.values()])) {
    if (g.length < 2) continue
    const joined = joinPrimitives(g)
    for (const prim of g) { mesh.removePrimitive(prim); prim.dispose() }
    mesh.addPrimitive(joined)
  }
}

/**
 * Stage 2: carves the geometry a rule selects out of every mesh in the scene
 * into ONE new node named `rule.name`, hung at the scene root with an
 * identity transform and its vertices in the source frame. What is left
 * behind stays where it was. A rule that selects nothing fails the build.
 */
export function splitByBox(doc: Document, rule: SplitRule): Node {
  const out = doc.createMesh(rule.name)
  const parts: { node: Node; world: mat4; prim: Primitive; take: number[]; leave: number[] }[] = []
  for (const node of meshNodes(doc)) {
    const world = node.getWorldMatrix()
    if (rule.cut && touchesBox(node.getMesh()!, world, rule)) {
      // Slice in the node's own mesh copy first, so a shared mesh elsewhere is untouched.
      const owned = ownMesh(doc, node)!
      for (const prim of owned.listPrimitives()) {
        if (prim.getMode() !== TRIANGLES) continue
        ensureIndices(doc, prim)
        for (const plane of planesOf(rule)) slice(prim, world, plane, rule.boxMin, rule.boxMax)
      }
    }
    for (const prim of node.getMesh()!.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue
      const indices = prim.getIndices() ? Uint32Array.from(prim.getIndices()!.getArray() as ArrayLike<number>) : null
      const idx = indices ?? Uint32Array.from({ length: prim.getAttribute('POSITION')!.getCount() }, (_, i) => i)
      const chosen = selectTriangles(idx, prim.getAttribute('POSITION')!.getArray()!, world, rule)
      if (!chosen.includes(true)) continue
      const take: number[] = [], leave: number[] = []
      chosen.forEach((c, t) => (c ? take : leave).push(idx[3 * t]!, idx[3 * t + 1]!, idx[3 * t + 2]!))
      parts.push({ node, world, prim, take, leave })
    }
  }
  // Caps across every part at once: a piece's skins can be two materials, even two nodes (the F4U's).
  if (rule.cut && parts.length > 0) {
    capOpenings(parts, rule).forEach((caps, i) => { parts[i]!.take.push(...caps.take); parts[i]!.leave.push(...caps.leave) })
  }
  for (const node of new Set(parts.map((x) => x.node))) {
    const mine = parts.filter((x) => x.node === node)
    const original = node.getMesh()!.listPrimitives()
    const owned = ownMesh(doc, node)!
    const ownedPrims = owned.listPrimitives()
    for (const hit of mine) {
      const prim = ownedPrims[original.indexOf(hit.prim)]!
      ensureIndices(doc, prim)
      out.addPrimitive(carve(doc, prim, Uint32Array.from(hit.take), hit.world))
      if (hit.leave.length === 0) owned.removePrimitive(prim)
      else {
        prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from(hit.leave)))
        compactPrimitive(prim)
      }
    }
  }
  if (out.listPrimitives().length === 0) throw new Error(`split "${rule.name}": the box selected no triangles`)
  // A cut surface is one part: pieces carved from two primitives of one material (the Zero's two
  // Corps skins, 2026-10-08) become one primitive, one draw. Only cuts, so other splits keep their bytes.
  if (rule.cut) mergeSameMaterial(out)
  const node = doc.createNode(rule.name).setMesh(out)
  onlyScene(doc).addChild(node)
  return node
}
