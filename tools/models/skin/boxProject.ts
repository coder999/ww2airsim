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

export interface BoxProjectOptions { readonly atlasPx: 512 | 1024 | 2048; readonly palette: ShipPaletteId; readonly skip: (node: Node) => boolean }

export function boxProject(doc: Document, id: string, o: BoxProjectOptions): Sidecar {
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh() && !o.skip(n))
  const bounds = new Map<string, [number, number, number, number]>() // chart key -> [umin, vmin, umax, vmax]
  const keysOf = new Map<object, string[]>()
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
        const key = `${role}|${axis}`
        keys.push(key)
        const box = bounds.get(key) ?? [Infinity, Infinity, -Infinity, -Infinity]
        for (const k of [a, b, c]) {
          const [u, v] = project(axis, p[k]!, p[k + 1]!, p[k + 2]!)
          box[0] = Math.min(box[0], u); box[1] = Math.min(box[1], v); box[2] = Math.max(box[2], u); box[3] = Math.max(box[3], v)
        }
        bounds.set(key, box)
      }
      keysOf.set(prim, keys)
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
  // Split and write UVs: a (vertex, chart) pair is one output vertex, in first-seen order.
  const buffer = doc.getRoot().listBuffers()[0]!
  for (const node of nodes) for (const prim of node.getMesh()!.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!.getArray()!, nor = prim.getAttribute('NORMAL')!.getArray()!, idx = prim.getIndices()!.getArray()!
    const keys = keysOf.get(prim)!
    const remap = new Map<number, number>()
    const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = []
    for (let t = 0; t < idx.length / 3; t++) {
      const ci = chartOf.get(keys[t]!)!, axis = keys[t]!.slice(keys[t]!.indexOf('|') + 1) as BoxAxis
      const [x0, y0] = placed[ci]!, b = bounds.get(keys[t]!)!
      for (let k = 0; k < 3; k++) {
        const old = idx[3 * t + k]!, key = old * ordered.length + ci
        let nv = remap.get(key)
        if (nv === undefined) {
          nv = P.length / 3
          remap.set(key, nv)
          P.push(pos[3 * old]!, pos[3 * old + 1]!, pos[3 * old + 2]!)
          N.push(nor[3 * old]!, nor[3 * old + 1]!, nor[3 * old + 2]!)
          const [u, v] = project(axis, pos[3 * old]!, pos[3 * old + 1]!, pos[3 * old + 2]!)
          U.push((x0 + (u - b[0]) / mpp) / W, (y0 + (v - b[1]) / mpp) / W)
        }
        I.push(nv)
      }
    }
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(U)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buffer))
  }
  const roles: Record<string, [number, number, number]> = {}
  for (const k of ordered) { const r = k.slice(0, k.indexOf('|')); roles[r] = hexToSrgb01(SHIP_PALETTES[o.palette][r.slice(5) as ShipRole]) }
  return parseSidecar(JSON.stringify({
    version: 1, model: id, atlasPx: W, paddingPx: BOX_PADDING_PX, metersPerPx: mpp, roles,
    patches: ordered.map((k, i) => ({ id: i, tag: k, rect: placed![i], originM: [bounds.get(k)![0], bounds.get(k)![1]] })),
    lines: [], markings: [],
  }))
}
