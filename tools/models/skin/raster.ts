// tools/models/skin/raster.ts
import type { Document, Node } from '@gltf-transform/core'
import type { Sidecar } from './sidecar.js'

export type Vec3 = [number, number, number]
type UV = [number, number]
export interface RasterTri { readonly p: [Vec3, Vec3, Vec3]; readonly n: [Vec3, Vec3, Vec3]; readonly uv: [UV, UV, UV]; readonly role: number; readonly patch: number }
export interface Triangles { readonly roles: string[]; readonly tris: RasterTri[] }
export interface GBuffer {
  readonly size: number
  readonly covered: Uint8Array
  readonly role: Uint8Array
  readonly patch: Int32Array
  readonly pos: Float32Array
  readonly nrm: Float32Array
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

/** Every triangle of the kit's raw export, in node order, with its role (the material's name)
 *  and its patch (the rect holding its UV centroid, in `atlasPx` pixels). */
export function trianglesOf(doc: Document, side: Sidecar, atlasPx: number, skip: (node: Node) => boolean = () => false): Triangles {
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh() && !skip(n))
  const roles = [...new Set(nodes.flatMap((n) => n.getMesh()!.listPrimitives().map((p) => p.getMaterial()?.getName() ?? '')))].sort()
  for (const r of roles) if (!(r in side.roles)) throw new Error(`skin ${side.model}: material "${r}" is not a role the sidecar lists (${Object.keys(side.roles).join(', ')})`)
  const tris: RasterTri[] = []
  for (const node of nodes) {
    const m = node.getWorldMatrix()
    if (m.some((v, i) => Math.abs(v - IDENTITY[i]!) > 1e-9)) throw new Error(`skin ${side.model}: node ${node.getName()} is not at the identity; skin the kit's raw export`)
    for (const prim of node.getMesh()!.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), nrm = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices()
      if (!pos || !nrm || !uv || !idx || prim.getMode() !== 4) throw new Error(`skin ${side.model}: node ${node.getName()} needs indexed triangles with POSITION, NORMAL and TEXCOORD_0`)
      const role = roles.indexOf(prim.getMaterial()?.getName() ?? '')
      for (let k = 0; k < idx.getCount(); k += 3) {
        const v = [idx.getScalar(k), idx.getScalar(k + 1), idx.getScalar(k + 2)]
        const p = v.map((i) => pos.getElement(i, [0, 0, 0]) as Vec3) as [Vec3, Vec3, Vec3]
        const n = v.map((i) => nrm.getElement(i, [0, 0, 0]) as Vec3) as [Vec3, Vec3, Vec3]
        const t = v.map((i) => uv.getElement(i, [0, 0]) as UV) as [UV, UV, UV]
        const cx = ((t[0][0] + t[1][0] + t[2][0]) / 3) * atlasPx, cy = ((t[0][1] + t[1][1] + t[2][1]) / 3) * atlasPx
        const hit = side.patches.find((q) => cx >= q.rect[0] && cx <= q.rect[0] + q.rect[2] && cy >= q.rect[1] && cy <= q.rect[1] + q.rect[3])
        if (!hit) throw new Error(`skin ${side.model}: node ${node.getName()} triangle ${k / 3} (uv centroid ${cx.toFixed(1)}, ${cy.toFixed(1)} px) lies in no patch`)
        tris.push({ p, n, uv: t, role, patch: hit.id })
      }
    }
  }
  return { roles, tris }
}

const edge = (a: UV, b: UV, x: number, y: number): number => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])

/** One sample at each cell center of a size x size grid over UV [0, 1]^2. A sample on an edge
 *  two triangles share goes to the first: iteration order, not floating-point luck, decides. */
export function rasterize(t: Triangles, size: number): GBuffer {
  const count = size * size
  const g: GBuffer = { size, covered: new Uint8Array(count), role: new Uint8Array(count), patch: new Int32Array(count).fill(-1), pos: new Float32Array(3 * count), nrm: new Float32Array(3 * count) }
  for (const tri of t.tris) {
    const [a, b, c] = tri.uv.map(([u, v]) => [u * size, v * size] as UV) as [UV, UV, UV]
    const area = edge(a, b, c[0], c[1])
    if (area === 0) continue
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - 0.5)), x1 = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0]) - 0.5))
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) - 0.5)), y1 = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1]) - 0.5))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5
      const w0 = edge(b, c, px, py) / area, w1 = edge(c, a, px, py) / area, w2 = edge(a, b, px, py) / area
      if (w0 < 0 || w1 < 0 || w2 < 0) continue
      const i = y * size + x
      if (g.covered[i]) continue
      g.covered[i] = 1; g.role[i] = tri.role; g.patch[i] = tri.patch
      let nx = 0, ny = 0, nz = 0
      for (let k = 0; k < 3; k++) {
        const w = k === 0 ? w0 : k === 1 ? w1 : w2
        g.pos[3 * i + k] = w0 * tri.p[0][k]! + w1 * tri.p[1][k]! + w2 * tri.p[2][k]!
        nx += w * tri.n[k]![0]; ny += w * tri.n[k]![1]; nz += w * tri.n[k]![2]
      }
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      g.nrm[3 * i] = nx / l; g.nrm[3 * i + 1] = ny / l; g.nrm[3 * i + 2] = nz / l
    }
  }
  return g
}
