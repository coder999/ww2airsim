// tools/models/skin/boxProject.ts
import type { Document, Node } from '@gltf-transform/core'
import { SHIP_PALETTES, type ShipPaletteId, type ShipRole } from '../../../src/render/scene/shipPalette.js'
import { parseSidecar, type Sidecar } from './sidecar.js'
import { hexToSrgb01 } from './shipColors.js'

/**
 * Box projection (DP2; model-detail-pass spec §4, "The 4 untextured downloads"; Ruling S3). For a
 * downloaded ship after shipMaterials: every triangle is projected along its dominant axis at world
 * scale into one chart per (role, axis), the charts are shelf-packed into one atlas at one texel
 * size, and each primitive gets a TEXCOORD_0. A vertex whose faces land in two charts is duplicated
 * with its POSITION and NORMAL copied exactly: geometry never moves (Review Focus 2). Charts overlap
 * themselves where a role's faces lie behind one another along an axis; they share texels, which is
 * harmless because a download's skin has no markings (Ruling S5) and its paint is uniform per role.
 */
export type BoxAxis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'
export const BOX_PADDING_PX = 4
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** The largest |normal| component; ties go to y, then x. Degenerate faces go to +y. */
export function dominantAxis(nx: number, ny: number, nz: number): BoxAxis {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz)
  if (ay >= ax && ay >= az) return ny >= 0 ? '+y' : '-y'
  if (ax >= az) return nx >= 0 ? '+x' : '-x'
  return nz >= 0 ? '+z' : '-z'
}

/** Chart meters (u, v) of a point seen from outside along `axis`: u to the viewer's right, v up; for
 *  the decks (+y, -y) "up" is the bow (+x). Never mirrored (tested). */
export function project(axis: BoxAxis, x: number, y: number, z: number): [number, number] {
  switch (axis) {
    case '+x': return [-z, y]
    case '-x': return [z, y]
    case '+z': return [x, y]
    case '-z': return [-x, y]
    case '+y': return [z, x]
    case '-y': return [-z, x]
  }
}

/** kit.py's _shelf_pack, ported: charts (w m, h m) into a width x width atlas at mpp meters per
 *  pixel, tallest first (ties by index), left to right in shelves, each inset by `pad`. [x, y, w px,
 *  h px] per chart, in input order, or null if they do not fit. */
export function shelfPack(sizes: readonly (readonly [number, number])[], mpp: number, width: number, pad: number): [number, number, number, number][] | null {
  const px = sizes.map(([w, h]) => [Math.max(1, Math.ceil(w / mpp)), Math.max(1, Math.ceil(h / mpp))] as const)
  const order = px.map((_, i) => i).sort((a, b) => px[b]![1] - px[a]![1] || a - b)
  const placed: [number, number, number, number][] = new Array(sizes.length)
  let x = 0, y = 0, shelf = 0
  for (const i of order) {
    const [w, h] = px[i]!
    if (w + 2 * pad > width) return null
    if (x + w + 2 * pad > width) { x = 0; y += shelf; shelf = 0 }
    if (y + h + 2 * pad > width) return null
    placed[i] = [x + pad, y + pad, w, h]
    x += w + 2 * pad
    shelf = Math.max(shelf, h + 2 * pad)
  }
  return placed
}

export interface BoxProjectOptions {
  readonly atlasPx: 512 | 1024 | 2048; readonly palette: ShipPaletteId; readonly skip: (node: Node) => boolean
  /** M1d: one chart per island (faces of one role and axis joined by a shared vertex) instead of one per
   *  (role, axis), so charts no longer stack faces behind one another, and the sidecar lists as `baked` every
   *  island whose own faces do not overlap (a committed bake may paint it). Patches are tagged by role. */
  readonly islands?: boolean
}

/** M1d: an island is `baked` unless more than this fraction of its texels is covered twice (folded or doubled faces). */
export const ISLAND_OVERLAP_MAX = 0.02
/** M1d: the longest an island chart runs (m) before it is cut into bands. ESTIMATE: a battleship's hull side in nine. */
export const ISLAND_MAX_M = 32
/** M1d: an island smaller than this (m) every way is pooled, unbaked (boxProject). ESTIMATE: under ~10 texels it bakes nothing anyway. */
export const ISLAND_TINY_M = 2.0
/** Vertices this close (m) are one vertex for island joins: downloads repeat a corner per face. */
const WELD_M = 1e-4

/** Union-find roots for triangles of one key sharing a welded vertex: island id per triangle, numbered in first-seen order. */
function islandsOf(keys: readonly string[], corners: readonly (readonly [number, number, number])[][]): number[] {
  const parent = keys.map((_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
  const seen = new Map<string, number>()
  for (let t = 0; t < keys.length; t++) for (const c of corners[t]!) {
    const k = `${keys[t]}|${Math.round(c[0] / WELD_M)},${Math.round(c[1] / WELD_M)},${Math.round(c[2] / WELD_M)}`
    const o = seen.get(k)
    if (o === undefined) seen.set(k, t)
    else { const a = find(o), b = find(t); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b) }
  }
  const number = new Map<number, number>()
  return keys.map((_, t) => { const r = find(t); let n = number.get(r); if (n === undefined) { n = number.size; number.set(r, n) } return n })
}

/** The fraction of a chart's covered texel centers that two of its triangles both cover (strictly inside each). */
export function overlapFraction(w: number, h: number, tris: readonly (readonly [number, number])[][]): number {
  const count = new Uint8Array(w * h)
  for (const [a, b, c] of tris) {
    const e = (p: readonly [number, number], q: readonly [number, number], x: number, y: number): number => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
    const area = e(a!, b!, c![0], c![1])
    if (area === 0) continue
    const x0 = Math.max(0, Math.floor(Math.min(a![0], b![0], c![0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(a![0], b![0], c![0])))
    const y0 = Math.max(0, Math.floor(Math.min(a![1], b![1], c![1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(a![1], b![1], c![1])))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5
      if (e(b!, c!, px, py) / area > 0 && e(c!, a!, px, py) / area > 0 && e(a!, b!, px, py) / area > 0 && count[y * w + x]! < 255) count[y * w + x]!++
    }
  }
  let covered = 0, twice = 0
  for (const k of count) { if (k > 0) covered++; if (k > 1) twice++ }
  return covered === 0 ? 1 : twice / covered
}

export function boxProject(doc: Document, id: string, o: BoxProjectOptions): Sidecar {
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh() && !o.skip(n))
  const bounds = new Map<string, [number, number, number, number]>() // chart key -> [umin, vmin, umax, vmax]
  const keysOf = new Map<object, string[]>()
  /** Per primitive, each triangle's (u, v) shift in meters: a tiny island's move to its pooled chart's corner, else 0. */
  const offsOf = new Map<object, Float64Array>()
  // Pass 1: each triangle's (role, axis) key, and (islands) its corners for the joins.
  const allKeys: string[] = [], allCorners: [number, number, number][][] = []
  for (const node of nodes) {
    if (node.getWorldMatrix().some((v, i) => Math.abs(v - IDENTITY[i]!) > 1e-9)) throw new Error(`boxProject ${id}: node ${node.getName()} is not at the identity; run after shipFit's bakeTranslations`)
    for (const prim of node.getMesh()!.listPrimitives()) {
      const role = prim.getMaterial()?.getName() ?? ''
      if (!role.startsWith('ship:')) throw new Error(`boxProject ${id}: ${node.getName()} has material "${role}"; box projection paints ship:<role> materials (run after shipMaterials)`)
      const sem = prim.listSemantics().slice().sort()
      if (prim.getMode() !== 4 || !prim.getIndices() || sem.join(',') !== 'NORMAL,POSITION') throw new Error(`boxProject ${id}: ${node.getName()} needs indexed triangles with only POSITION and NORMAL, got ${sem.join(', ')}`)
      const p = prim.getAttribute('POSITION')!.getArray()!, idx = prim.getIndices()!.getArray()!
      const keys: string[] = []
      for (let t = 0; t < idx.length / 3; t++) {
        const a = 3 * idx[3 * t]!, b = 3 * idx[3 * t + 1]!, c = 3 * idx[3 * t + 2]!
        const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
        const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
        const axis = dominantAxis(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        keys.push(`${role}|${axis}`)
        if (o.islands) allCorners.push([a, b, c].map((k) => [p[k]!, p[k + 1]!, p[k + 2]!] as [number, number, number]))
      }
      allKeys.push(...keys)
      keysOf.set(prim, keys)
    }
  }
  if (o.islands) {
    const isl = islandsOf(allKeys, allCorners)
    // An island longer than ISLAND_MAX_M is cut into bands across its long side, by triangle centroid:
    // one hull side's chart as long as the ship would otherwise set the whole atlas's texel size.
    const centroid = allCorners.map((c, t) => {
      const axis = allKeys[t]!.split('|')[1] as BoxAxis
      const uv = c.map((q) => project(axis, q[0], q[1], q[2]))
      return [(uv[0]![0] + uv[1]![0] + uv[2]![0]) / 3, (uv[0]![1] + uv[1]![1] + uv[2]![1]) / 3] as const
    })
    const box = new Map<number, [number, number, number, number]>()
    centroid.forEach(([u, v], t) => { const b = box.get(isl[t]!) ?? [Infinity, Infinity, -Infinity, -Infinity]; box.set(isl[t]!, [Math.min(b[0], u), Math.min(b[1], v), Math.max(b[2], u), Math.max(b[3], v)]) })
    const band = (t: number): number => {
      const b = box.get(isl[t]!)!, alongU = b[2] - b[0] >= b[3] - b[1]
      const span = alongU ? b[2] - b[0] : b[3] - b[1]
      if (span <= ISLAND_MAX_M) return 0
      const n = Math.ceil(span / ISLAND_MAX_M)
      return Math.min(n - 1, Math.floor(((alongU ? centroid[t]![0] - b[0] : centroid[t]![1] - b[1]) / span) * n))
    }
    // An island whose projection is smaller than ISLAND_TINY_M every way (a rung, a cable, a bolt head) is
    // moved to its own corner and pooled with every other tiny island of its role and axis in one chart: they
    // overlap there and are never baked, but they no longer cost the atlas padding each (Shiratsuyu: 11,545 charts).
    const cbox = new Map<number, [number, number, number, number]>()
    allCorners.forEach((c, t) => {
      const axis = allKeys[t]!.split('|')[1] as BoxAxis, b = cbox.get(isl[t]!) ?? [Infinity, Infinity, -Infinity, -Infinity]
      for (const q of c) { const [u, v] = project(axis, q[0], q[1], q[2]); b[0] = Math.min(b[0], u); b[1] = Math.min(b[1], v); b[2] = Math.max(b[2], u); b[3] = Math.max(b[3], v) }
      cbox.set(isl[t]!, b)
    })
    let t = 0
    for (const node of nodes) for (const prim of node.getMesh()!.listPrimitives()) {
      const keys = keysOf.get(prim)!, offs = new Float64Array(2 * keys.length)
      for (let i = 0; i < keys.length; i++, t++) {
        const b = cbox.get(isl[t]!)!
        if (Math.max(b[2] - b[0], b[3] - b[1]) < ISLAND_TINY_M) { keys[i] = `${keys[i]}|tiny`; offs[2 * i] = -b[0]; offs[2 * i + 1] = -b[1] }
        else keys[i] = `${keys[i]}|${String(isl[t]).padStart(6, '0')}.${String(band(t)).padStart(2, '0')}`
      }
      offsOf.set(prim, offs)
    }
  }
  // Pass 2: each chart's bounds.
  for (const node of nodes) for (const prim of node.getMesh()!.listPrimitives()) {
    const p = prim.getAttribute('POSITION')!.getArray()!, idx = prim.getIndices()!.getArray()!, keys = keysOf.get(prim)!, offs = offsOf.get(prim)
    for (let t = 0; t < idx.length / 3; t++) {
      const key = keys[t]!, axis = key.split('|')[1] as BoxAxis
      const box = bounds.get(key) ?? [Infinity, Infinity, -Infinity, -Infinity]
      for (let k = 0; k < 3; k++) {
        const i = 3 * idx[3 * t + k]!
        const [u0, v0] = project(axis, p[i]!, p[i + 1]!, p[i + 2]!), u = u0 + (offs?.[2 * t] ?? 0), v = v0 + (offs?.[2 * t + 1] ?? 0)
        box[0] = Math.min(box[0], u); box[1] = Math.min(box[1], v); box[2] = Math.max(box[2], u); box[3] = Math.max(box[3], v)
      }
      bounds.set(key, box)
    }
  }
  // One texel size for every chart: from the area estimate, in 3% steps, as kit.py's _pack.
  const ordered = [...bounds.keys()].sort()
  const sizes = ordered.map((k) => { const b = bounds.get(k)!; return [b[2] - b[0], b[3] - b[1]] as const })
  const W = o.atlasPx
  let mpp = Math.sqrt(sizes.reduce((s, [w, h]) => s + Math.max(w, 1e-3) * Math.max(h, 1e-3), 0) / (0.6 * W * W))
  let placed: [number, number, number, number][] | null = null
  for (let i = 0; i < 400 && placed === null; i++) {
    placed = shelfPack(sizes, mpp, W, BOX_PADDING_PX)
    if (placed === null) mpp *= 1.03
  }
  if (placed === null) throw new Error(`boxProject ${id}: ${ordered.length} charts do not pack into ${W} px`)
  const chartOf = new Map(ordered.map((k, i) => [k, i]))
  const chartTris = new Map<number, [number, number][][]>()
  // Split and write UVs: a (vertex, chart) pair is one output vertex, in first-seen order.
  const buffer = doc.getRoot().listBuffers()[0]!
  for (const node of nodes) for (const prim of node.getMesh()!.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!.getArray()!, nor = prim.getAttribute('NORMAL')!.getArray()!, idx = prim.getIndices()!.getArray()!
    const keys = keysOf.get(prim)!, offs = offsOf.get(prim)
    const remap = new Map<number, number>()
    const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = []
    for (let t = 0; t < idx.length / 3; t++) {
      const ci = chartOf.get(keys[t]!)!, axis = keys[t]!.split('|')[1] as BoxAxis
      const [x0, y0] = placed[ci]!, b = bounds.get(keys[t]!)!
      for (let k = 0; k < 3; k++) {
        const old = idx[3 * t + k]!, key = old * ordered.length + ci
        let nv = remap.get(key)
        if (nv === undefined) {
          nv = P.length / 3
          remap.set(key, nv)
          P.push(pos[3 * old]!, pos[3 * old + 1]!, pos[3 * old + 2]!)
          N.push(nor[3 * old]!, nor[3 * old + 1]!, nor[3 * old + 2]!)
          const [u0, v0] = project(axis, pos[3 * old]!, pos[3 * old + 1]!, pos[3 * old + 2]!), u = u0 + (offs?.[2 * t] ?? 0), v = v0 + (offs?.[2 * t + 1] ?? 0)
          U.push((x0 + (u - b[0]) / mpp) / W, (y0 + (v - b[1]) / mpp) / W)
        }
        I.push(nv)
      }
      if (o.islands) {
        const [x0c, y0c] = placed[ci]!
        const list = chartTris.get(ci) ?? []
        list.push([0, 1, 2].map((k) => { const v = I[I.length - 3 + k]!; return [U[2 * v]! * W - x0c, U[2 * v + 1]! * W - y0c] as [number, number] }))
        chartTris.set(ci, list)
      }
    }
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buffer))
  }
  const roles: Record<string, [number, number, number]> = {}
  for (const k of ordered) { const r = k.slice(0, k.indexOf('|')); roles[r] = hexToSrgb01(SHIP_PALETTES[o.palette][r.slice(5) as ShipRole]) }
  const baked = o.islands ? ordered.map((_, i) => i).filter((i) => !ordered[i]!.endsWith('|tiny') && overlapFraction(placed![i]![2], placed![i]![3], chartTris.get(i) ?? []) <= ISLAND_OVERLAP_MAX) : undefined
  return parseSidecar(JSON.stringify({
    version: 1, model: id, atlasPx: W, paddingPx: BOX_PADDING_PX, metersPerPx: mpp, roles,
    patches: ordered.map((k, i) => ({ id: i, tag: o.islands ? k.slice(0, k.indexOf('|')) : k, rect: placed![i], originM: [bounds.get(k)![0], bounds.get(k)![1]] })),
    lines: [], markings: [], ...(baked ? { baked } : {}),
  }))
}
