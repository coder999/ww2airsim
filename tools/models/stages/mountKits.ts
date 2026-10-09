// tools/models/stages/mountKits.ts
import type { Document, Material, Node } from '@gltf-transform/core'
import { linearFactor, SHIP_ROUGHNESS } from '../../../src/render/scene/shipPalette.js'

/**
 * Generated mount kits (Track M; M1 2026-10-08, rebuilt for M1b 2026-10-09): a kit
 * no model draws is built here. Every light AA kit is generated, on the Blender
 * ships too (M1b), so there is one 40 mm quad in the repo, not two.
 *
 * Kit-local frame: origin on the training axis at the mount's foot, guns toward
 * +x at rest and level, +y up, +z starboard; meters. Each kit is two parts: the
 * mount (palette fitting color), which trains, and its guns (GUNMETAL), which
 * also elevate about `trunnion` (M1b, Ruling B4). Ruling B1: shields, sights,
 * seats and barrels thick enough to read, darker than the hull. Figures are
 * ESTIMATES scaled to the real mounts' footprints (Bofors quad tub about 4 m
 * across, a 5"/38 twin gunhouse about 5 m long); the light kits are drawn true
 * size here and scaled by shipMounts.ts's LIGHT_AA_SCALE (Ruling B3).
 */

interface Soup { pos: number[]; nor: number[]; idx: number[] }
export interface KitParts { readonly mount: Soup; readonly guns: Soup; readonly trunnion: [number, number] }

/** Dark gun steel, sRGB #3a3d40: reads against every palette's gray (Ruling B1). */
export const GUNMETAL_MATERIAL = 'ship:gunmetal'
const GUNMETAL_HEX = 0x3a3d40

const soup = (): Soup => ({ pos: [], nor: [], idx: [] })

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

/** A vertical cylinder on the axis (an open-topped tub when `wall` > 0: outer and inner wall and a rim). */
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

/** A level octagonal barrel along +x from x0, `length` long, centered on (y, z), capped both ends, wound outward. */
function barrel(s: Soup, x0: number, y: number, z: number, length: number, r: number): void {
  const seg = 8
  const ring = (x: number, k: number): number[] => [x, y + r * Math.cos(2 * Math.PI * k / seg), z + r * Math.sin(2 * Math.PI * k / seg)]
  const tip = [x0 + length, y, z], breech = [x0, y, z]
  for (let k = 0; k < seg; k++) {
    quad(s, ring(x0, k), ring(x0, k + 1), ring(x0 + length, k + 1), ring(x0 + length, k))
    quad(s, tip, ring(x0 + length, k), ring(x0 + length, k + 1), tip)
    quad(s, breech, ring(x0, k + 1), ring(x0, k), breech)
  }
}

/** A Bofors in its tub (quad or twin): tub wall, crew platform, carriage, splinter shields either
 *  side of the guns, the layers' seats and the pointer's sight; the guns are receivers and barrels. */
function bofors(n: 2 | 4, tubR: number): KitParts {
  const m = soup(), g = soup()
  const half = n === 4 ? 1.0 : 0.6, ty = 1.3, sp = n === 4 ? 0.45 : 0.6
  cylinder(m, tubR, 0, 1.1, 20, 0.12)
  cylinder(m, tubR - 0.2, 0, 0.3, 20)
  box(m, -0.8, 0.3, -half, 0.5, 1.1, half)
  box(m, 0.55, 0.7, -half - 0.15, 0.62, 1.9, -0.25)
  box(m, 0.55, 0.7, 0.25, 0.62, 1.9, half + 0.15)
  for (const z of [-half - 0.45, half + 0.45]) box(m, -0.5, 0.3, z - 0.2, -0.1, 0.9, z + 0.2)
  box(m, 0.1, 1.9, half - 0.05, 0.3, 2.2, half + 0.25)
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * sp
    box(g, -0.5, ty - 0.17, z - 0.12, 0.45, ty + 0.17, z + 0.12)
    barrel(g, 0.45, ty, z, 2.3, 0.075)
  }
  return { mount: m, guns: g, trunnion: [0.1, ty] }
}

/** A pedestal single (Oerlikon or Type 96): foot plate, pedestal, cradle and shield; gun and magazine. */
function single(length: number, shield: boolean): KitParts {
  const m = soup(), g = soup()
  const ty = 1.15
  cylinder(m, 0.45, 0, 0.1, 12)
  cylinder(m, 0.16, 0.1, ty - 0.1, 10)
  box(m, -0.25, ty - 0.15, -0.3, 0.1, ty + 0.05, 0.3)
  if (shield) box(m, 0.25, 0.75, -0.6, 0.31, 1.75, 0.6)
  box(g, -0.6, ty - 0.1, -0.09, 0.3, ty + 0.12, 0.09)
  box(g, -0.35, ty + 0.12, -0.18, 0.05, ty + 0.38, 0.18)
  barrel(g, 0.3, ty, 0, length, 0.05)
  return { mount: m, guns: g, trunnion: [0, ty] }
}

/** An enclosed gunhouse with `n` barrels from its face. */
function gunhouse(x0: number, x1: number, w: number, h: number, n: number, spacing: number, ty: number, length: number, r: number): KitParts {
  const m = soup(), g = soup()
  box(m, x0, 0, -w / 2, x1, h, w / 2)
  for (let i = 0; i < n; i++) barrel(g, x1 - 0.6, ty, (i - (n - 1) / 2) * spacing, length + 0.6, r)
  return { mount: m, guns: g, trunnion: [x1 - 0.6, ty] }
}

export const GENERATED_KITS: Readonly<Record<string, () => KitParts>> = {
  /** Bofors 40 mm quad (Mk 2) in its tub: tub 4.0 m across, 1.1 m high; four 2.3 m barrels. */
  'mount-40mm-quad': () => bofors(4, 2.0),
  /** Bofors 40 mm twin (Mk 1): tub 2.8 m across. */
  'mount-40mm-twin': () => bofors(2, 1.4),
  /** Type 96 25 mm triple: open mount on a 2.4 m platform, seats either side, three 1.8 m barrels and their magazines. */
  'mount-25mm-triple': () => {
    const m = soup(), g = soup()
    const ty = 1.15
    cylinder(m, 1.2, 0, 0.25, 16)
    cylinder(m, 0.35, 0.25, 0.95, 12)
    box(m, -0.4, 0.9, -0.55, 0.3, 1.0, 0.55)
    for (const z of [-0.85, 0.85]) box(m, -0.5, 0.25, z - 0.18, -0.15, 0.85, z + 0.18)
    for (let i = 0; i < 3; i++) { const z = (i - 1) * 0.3; box(g, -0.5, ty - 0.12, z - 0.1, 0.3, ty + 0.12, z + 0.1); barrel(g, 0.3, ty, z, 1.8, 0.055) }
    box(g, -0.3, ty + 0.12, -0.45, 0.1, ty + 0.4, 0.45)
    return { mount: m, guns: g, trunnion: [0, ty] }
  },
  /** Type 96 25 mm triple in a splinter shield (Yamato's 1944 fit): the triple, with a shield box open at the back. */
  'mount-25mm-triple-shielded': () => {
    const p = GENERATED_KITS['mount-25mm-triple']!()
    box(p.mount, 0.55, 0.25, -1.15, 0.65, 1.9, 1.15)
    for (const z of [-1.15, 1.05]) box(p.mount, -1.0, 0.25, z, 0.65, 1.9, z + 0.1)
    box(p.mount, -1.0, 1.9, -1.15, 0.65, 2.0, 1.15)
    return p
  },
  /** 5"/38 single in an open Mk 24-type mount (Enterprise's): platform, pedestal, carriage and a front shield. */
  'mount-5in38-single-open': () => {
    const m = soup(), g = soup()
    const ty = 1.9
    cylinder(m, 2.2, 0, 0.3, 20)
    cylinder(m, 0.6, 0.3, 1.4, 14)
    box(m, -1.2, 1.4, -0.9, 0.6, 1.8, 0.9)
    box(m, 0.8, 1.0, -1.3, 0.9, 2.6, 1.3)
    box(g, -1.4, ty - 0.3, -0.3, 0.9, ty + 0.3, 0.3)
    barrel(g, 0.9, ty, 0, 4.8, 0.1)
    return { mount: m, guns: g, trunnion: [0, ty] }
  },
  /** Oerlikon 20 mm Mk 4 single: pedestal, shield 1.2 m wide, 2.2 m barrel, drum magazine. */
  'mount-20mm-single': () => single(2.2, true),
  /** Type 96 25 mm single: pedestal, no shield, 1.8 m barrel. */
  'mount-25mm-single': () => single(1.8, false),
  /** 5"/38 twin (Mk 28/Mk 38): a 5.0 x 3.2 m gunhouse, 2.6 m high, two 4.8 m barrels. */
  'mount-5in38-twin': () => gunhouse(-2.6, 2.4, 3.2, 2.6, 2, 1.2, 1.4, 4.8, 0.1),
  /** 5"/38 single (Mk 30), enclosed: 4.0 x 2.8 m, 2.4 m high, one 4.8 m barrel. */
  'mount-5in38-single': () => gunhouse(-2.0, 2.0, 2.8, 2.4, 1, 0, 1.3, 4.8, 0.1),
  /** IJN 127 mm twin (Type 89 open-backed mount): 5.0 x 3.6 m, 2.6 m high. */
  'mount-127mm-twin-ijn': () => gunhouse(-2.4, 2.6, 3.6, 2.6, 2, 1.0, 1.4, 5.0, 0.1),
}

function primitiveOf(doc: Document, s: Soup, material: Material): ReturnType<Document['createPrimitive']> {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer()
  return doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(s.pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(s.nor)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(s.idx)).setBuffer(buffer))
    .setMaterial(material)
}

/** The one gunmetal material a document's generated guns share. */
export function gunmetal(doc: Document): Material {
  return doc.getRoot().listMaterials().find((m) => m.getName() === GUNMETAL_MATERIAL)
    ?? doc.createMaterial(GUNMETAL_MATERIAL).setBaseColorFactor(linearFactor(GUNMETAL_HEX)).setMetallicFactor(0).setRoughnessFactor(SHIP_ROUGHNESS).setAlphaMode('OPAQUE')
}

/** A `Kit_<kit>` mount node with its guns as a separate node, both in kit-local space, and the
 *  trunnion in kit-local meters. Throws if no generator names `kit`. */
export function generateKit(doc: Document, kit: string, material: Material): { mount: Node; guns: Node; trunnion: [number, number, number] } {
  const make = GENERATED_KITS[kit]
  if (!make) throw new Error(`no carved node and no generated kit for "${kit}" (generated: ${Object.keys(GENERATED_KITS).join(', ')})`)
  const p = make()
  const mount = doc.createNode(`Kit_${kit}`).setMesh(doc.createMesh(`Kit_${kit}`).addPrimitive(primitiveOf(doc, p.mount, material)))
  const guns = doc.createNode(`Kit_${kit}_Guns`).setMesh(doc.createMesh(`Kit_${kit}_Guns`).addPrimitive(primitiveOf(doc, p.guns, gunmetal(doc))))
  return { mount, guns, trunnion: [p.trunnion[0], p.trunnion[1], 0] }
}
