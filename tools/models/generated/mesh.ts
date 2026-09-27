import { Document } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import type { PaintTextures } from './paint.js'

/**
 * The geometry kit every generated store is built from (O1, ordnance spec §2.1): a lathe
 * for bodies of revolution and a rolled box for fins, struts and lugs. Pure and
 * deterministic: no randomness, fixed iteration order, so a generator's bytes repeat.
 * Frame: +X nose, +Y up, +Z right (the sim body frame); a store's axis runs along +X at
 * height `axisY`, and its origin is the suspension point.
 */
export type Rgb = readonly [number, number, number]
export type Vec3 = readonly [number, number, number]
export interface MeshData { positions: number[]; normals: number[]; uvs: number[]; colors: number[]; indices: number[] }
/** `side`: a hard corner takes its normal from the one segment on that side; unset = smooth. */
export interface ProfilePoint { readonly x: number; readonly r: number; readonly color: Rgb; readonly side?: 'before' | 'after' }

const toLinear = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
/** An sRGB 0-255 color as linear RGB, the space glTF's COLOR_0 is in. */
export const srgb = (r: number, g: number, b: number): Rgb => [toLinear(r), toLinear(g), toLinear(b)]

export function emptyMesh(): MeshData { return { positions: [], normals: [], uvs: [], colors: [], indices: [] } }

export function mergeMeshes(parts: readonly MeshData[]): MeshData {
  const out = emptyMesh()
  for (const p of parts) {
    const base = out.positions.length / 3
    out.positions.push(...p.positions); out.normals.push(...p.normals); out.uvs.push(...p.uvs); out.colors.push(...p.colors)
    out.indices.push(...p.indices.map((i) => i + base))
  }
  return out
}

/** Two points at one station: a hard edge, normal from the segment before, then after. */
export function corner(x: number, r: number, color: Rgb): ProfilePoint[] {
  return [{ x, r, color, side: 'before' }, { x, r, color, side: 'after' }]
}

const segNormal = (a: ProfilePoint, b: ProfilePoint): [number, number] | null => {
  const dx = b.x - a.x, dr = b.r - a.r, l = Math.hypot(dx, dr)
  // Profiles run nose to tail (dx <= 0): (dr, -dx) points outward.
  return l === 0 ? null : [dr / l, -dx / l]
}

/**
 * Revolves `profile` (nose first, x never increasing) about the line y = axisY, z = 0.
 * Two consecutive points at the same (x, r) are a zero-length span: no triangles, so a color
 * change there is a sharp paint edge. UVs: u around (the largest circumference per tile),
 * v along the axis, both in tiles of `tileM` meters.
 */
export function lathe(profile: readonly ProfilePoint[], segments: number, axisY: number, tileM: number): MeshData {
  if (profile.length < 2) throw new Error('lathe: a profile needs at least two points')
  for (let i = 1; i < profile.length; i++) {
    if (profile[i]!.x > profile[i - 1]!.x) throw new Error(`lathe: point ${i} is ahead of point ${i - 1}; profiles run nose to tail`)
  }
  const prev = (i: number): [number, number] | null => { for (let k = i; k > 0; k--) { const s = segNormal(profile[k - 1]!, profile[k]!); if (s) return s } return null }
  const next = (i: number): [number, number] | null => { for (let k = i; k < profile.length - 1; k++) { const s = segNormal(profile[k]!, profile[k + 1]!); if (s) return s } return null }
  const normalAt = (i: number): [number, number] => {
    const p = profile[i]!, a = prev(i), b = next(i)
    if (p.side === 'before') return a ?? b ?? [1, 0]
    if (p.side === 'after') return b ?? a ?? [1, 0]
    if (a && b) { const n: [number, number] = [a[0] + b[0], a[1] + b[1]]; const l = Math.hypot(...n); return l === 0 ? a : [n[0] / l, n[1] / l] }
    return a ?? b ?? [1, 0]
  }
  const m = emptyMesh()
  const xNose = profile[0]!.x
  const uTiles = (2 * Math.PI * Math.max(...profile.map((p) => p.r))) / tileM
  profile.forEach((p, i) => {
    const [nx, nr] = normalAt(i)
    for (let j = 0; j <= segments; j++) {
      const phi = (2 * Math.PI * j) / segments, c = Math.cos(phi), s = Math.sin(phi)
      m.positions.push(p.x, axisY + p.r * c, p.r * s)
      m.normals.push(nx, nr * c, nr * s)
      m.uvs.push((j / segments) * uTiles, (xNose - p.x) / tileM)
      m.colors.push(...p.color)
    }
  })
  const ring = segments + 1
  for (let i = 0; i < profile.length - 1; i++) {
    const p = profile[i]!, q = profile[i + 1]!
    if (p.x === q.x && p.r === q.r) continue
    for (let j = 0; j < segments; j++) {
      const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1
      if (p.r > 0) m.indices.push(a, c, b)
      if (q.r > 0) m.indices.push(b, c, d)
    }
  }
  return m
}

/** Flat-shaded box, then rolled by `rollRad` about the lathe axis (y = axisY, z = 0): a fin
 *  authored pointing up (+Y) and rolled a quarter turn points right (+Z). Planar UVs per face. */
export function box(min: Vec3, max: Vec3, rollRad: number, axisY: number, color: Rgb, tileM: number): MeshData {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const X: Vec3 = [x1 - x0, 0, 0], Y: Vec3 = [0, y1 - y0, 0], Z: Vec3 = [0, 0, z1 - z0]
  // Each face: origin, u edge, v edge, with u x v the outward normal.
  const faces: [Vec3, Vec3, Vec3][] = [
    [[x1, y0, z0], Y, Z], [[x0, y0, z0], Z, Y],
    [[x0, y1, z0], Z, X], [[x0, y0, z0], X, Z],
    [[x0, y0, z1], X, Y], [[x0, y0, z0], Y, X],
  ]
  const c = Math.cos(rollRad), s = Math.sin(rollRad)
  const roll = (p: Vec3, point: boolean): [number, number, number] => {
    const y = point ? p[1] - axisY : p[1]
    return [p[0], (point ? axisY : 0) + y * c - p[2] * s, y * s + p[2] * c]
  }
  const m = emptyMesh()
  for (const [o, u, v] of faces) {
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const nl = Math.hypot(...n)
    const nn = roll([n[0] / nl, n[1] / nl, n[2] / nl], false)
    const ul = Math.hypot(...u), vl = Math.hypot(...v)
    const base = m.positions.length / 3
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      m.positions.push(...roll([o[0] + a * u[0] + b * v[0], o[1] + a * u[1] + b * v[1], o[2] + a * u[2] + b * v[2]], true))
      m.normals.push(...nn)
      m.uvs.push((a * ul) / tileM, (b * vl) / tileM)
      m.colors.push(...color)
    }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return m
}

/**
 * One node, one mesh, one primitive, one material (O1 §2.3): what one InstancedMesh draws
 * in one call. COLOR_0 carries the paint; the textures carry only wear and roughness, so
 * one texture set serves every store. `paint` null = untextured (tests).
 */
export function storeDocument(name: string, mesh: MeshData, paint: PaintTextures | null): Document {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const acc = (type: 'VEC2' | 'VEC3' | 'SCALAR', array: Float32Array | Uint16Array | Uint32Array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  const vertexCount = mesh.positions.length / 3
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(mesh.positions)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(mesh.normals)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(mesh.uvs)))
    .setAttribute('COLOR_0', acc('VEC3', new Float32Array(mesh.colors)))
    .setIndices(acc('SCALAR', vertexCount < 65536 ? new Uint16Array(mesh.indices) : new Uint32Array(mesh.indices)))
  const material = doc.createMaterial(`${name}-paint`).setBaseColorFactor([1, 1, 1, 1])
  if (paint) {
    doc.createExtension(EXTTextureWebP).setRequired(true)
    const tex = (label: string, bytes: Uint8Array) => doc.createTexture(`${name}-${label}`).setMimeType('image/webp').setImage(bytes)
    material.setBaseColorTexture(tex('baseColor', paint.baseColor))
      .setNormalTexture(tex('normal', paint.normal))
      .setMetallicRoughnessTexture(tex('metallicRoughness', paint.metallicRoughness))
      .setMetallicFactor(1).setRoughnessFactor(1)
  } else {
    material.setMetallicFactor(0).setRoughnessFactor(0.6)
  }
  prim.setMaterial(material)
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim))
  doc.createScene('scene').addChild(node)
  return doc
}
