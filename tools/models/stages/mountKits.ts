// tools/models/stages/mountKits.ts
import type { Document, Material, Node } from '@gltf-transform/core'

/**
 * Generated mount kits (Track M, M1, ruling-by-default 2026-10-08): a ship whose
 * model has no geometry for a kit its armament names (a print-model download
 * with empty 40 mm tubs, say) gets this one, built here and painted with its
 * palette's fitting role. Kit-local frame: origin on the training axis at the
 * mount's foot, barrels toward +x at rest, +y up, +z starboard; meters.
 * Deliberately plain boxes and cylinders: at the distances a pilot sees a ship,
 * a mount reads by its silhouette and its barrel count. Figures are ESTIMATES
 * scaled to the real mounts' footprints (Bofors quad tub about 4 m across, a
 * 5"/38 twin gunhouse about 5 m long).
 */

interface Soup { pos: number[]; nor: number[]; idx: number[] }

function quad(s: Soup, a: number[], b: number[], c: number[], d: number[]): void {
  // The diagonals' cross product: well defined for a quad with a collapsed edge (a cap's fan slice).
  const u = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!], v = [d[0]! - b[0]!, d[1]! - b[1]!, d[2]! - b[2]!]
  const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
  const l = Math.hypot(n[0]!, n[1]!, n[2]!) || 1
  const base = s.pos.length / 3
  for (const p of [a, b, c, d]) { s.pos.push(...p); s.nor.push(n[0]! / l, n[1]! / l, n[2]! / l) }
  s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

/** An axis-aligned box from (x0, y0, z0) to (x1, y1, z1), wound outward. */
function box(s: Soup, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  quad(s, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]) // top
  quad(s, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]) // bottom
  quad(s, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]) // +x
  quad(s, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]) // -x
  quad(s, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]) // +z
  quad(s, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]) // -z
}

/** A vertical cylinder (open-topped tub when `wall` > 0: an outer and inner wall and a rim). */
function cylinder(s: Soup, r: number, y0: number, y1: number, seg = 16, wall = 0): void {
  const at = (rr: number, k: number, y: number): number[] => [rr * Math.cos(2 * Math.PI * k / seg), y, -rr * Math.sin(2 * Math.PI * k / seg)]
  for (let k = 0; k < seg; k++) {
    quad(s, at(r, k, y0), at(r, k + 1, y0), at(r, k + 1, y1), at(r, k, y1))
    if (wall > 0) {
      const ri = r - wall
      quad(s, at(ri, k + 1, y0), at(ri, k, y0), at(ri, k, y1), at(ri, k + 1, y1))
      quad(s, at(r, k, y1), at(r, k + 1, y1), at(ri, k + 1, y1), at(ri, k, y1))
    } else {
      quad(s, at(0, k, y1), at(r, k, y1), at(r, k + 1, y1), at(0, k + 1, y1))
    }
  }
}

/** A square-section barrel from `breech` (x, y, z), `length` long, elevated `elevDeg` toward +x. */
function barrel(s: Soup, x: number, y: number, z: number, length: number, r: number, elevDeg: number): void {
  const e = elevDeg * Math.PI / 180, c = Math.cos(e), sn = Math.sin(e)
  // Local barrel frame: along (c, sn, 0), up (-sn, c, 0), side (0, 0, 1).
  const p = (a: number, u: number, w: number): number[] => [x + a * c - u * sn, y + a * sn + u * c, z + w]
  const A = [p(0, -r, -r), p(0, r, -r), p(0, r, r), p(0, -r, r)]
  const B = [p(length, -r, -r), p(length, r, -r), p(length, r, r), p(length, -r, r)]
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(s, A[i]!, A[j]!, B[j]!, B[i]!) }
  quad(s, B[0]!, B[1]!, B[2]!, B[3]!)
}

function barrels(s: Soup, n: number, spacing: number, x: number, y: number, length: number, r: number, elevDeg: number): void {
  for (let i = 0; i < n; i++) barrel(s, x, y, (i - (n - 1) / 2) * spacing, length, r, elevDeg)
}

export const GENERATED_KITS: Readonly<Record<string, (s: Soup) => void>> = {
  /** Bofors 40 mm quad in its tub: tub 4.0 m across, 1.1 m high; four 2.4 m barrels at 25 deg. */
  'mount-40mm-quad': (s) => { cylinder(s, 2.0, 0, 1.1, 16, 0.12); box(s, -0.7, 0, -0.9, 0.7, 1.3, 0.9); barrels(s, 4, 0.32, 0.3, 1.2, 2.4, 0.06, 25) },
  /** Bofors 40 mm twin: tub 2.8 m across. */
  'mount-40mm-twin': (s) => { cylinder(s, 1.4, 0, 1.0, 14, 0.1); box(s, -0.5, 0, -0.6, 0.5, 1.2, 0.6); barrels(s, 2, 0.36, 0.3, 1.1, 2.4, 0.06, 25) },
  /** Type 96 25 mm triple: open mount on a 2.4 m platform, three 1.5 m barrels. */
  'mount-25mm-triple': (s) => { cylinder(s, 1.2, 0, 0.25, 12); box(s, -0.5, 0.25, -0.6, 0.4, 1.2, 0.6); barrels(s, 3, 0.3, 0.2, 1.1, 1.5, 0.05, 25) },
  /** 5"/38 twin (Mk 28/Mk 38): a 5.0 x 3.2 m gunhouse, 2.6 m high, two 4.8 m barrels. */
  'mount-5in38-twin': (s) => { box(s, -2.6, 0, -1.6, 2.4, 2.6, 1.6); barrels(s, 2, 1.2, 2.2, 1.4, 4.8, 0.1, 5) },
  /** 5"/38 single (Mk 30), enclosed: 4.0 x 2.8 m, 2.4 m high, one 4.8 m barrel. */
  'mount-5in38-single': (s) => { box(s, -2.0, 0, -1.4, 2.0, 2.4, 1.4); barrels(s, 1, 0, 1.8, 1.3, 4.8, 0.1, 5) },
  /** IJN 127 mm twin (Type 89 open-backed mount): 5.0 x 3.6 m, 2.6 m high. */
  'mount-127mm-twin-ijn': (s) => { box(s, -2.4, 0, -1.8, 2.6, 2.6, 1.8); barrels(s, 2, 1.0, 2.4, 1.4, 5.0, 0.1, 10) },
}

/** A `Kit_<kit>` node from the generator, posed by the caller. Throws if no generator names `kit`. */
export function generateKit(doc: Document, kit: string, material: Material): Node {
  const make = GENERATED_KITS[kit]
  if (!make) throw new Error(`no carved node and no generated kit for "${kit}" (generated: ${Object.keys(GENERATED_KITS).join(', ')})`)
  const s: Soup = { pos: [], nor: [], idx: [] }
  make(s)
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer()
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(s.pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(s.nor)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(s.idx)).setBuffer(buffer))
    .setMaterial(material)
  return doc.createNode(`Kit_${kit}`).setMesh(doc.createMesh(`Kit_${kit}`).addPrimitive(prim))
}
