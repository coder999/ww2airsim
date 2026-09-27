// tools/models/rig.ts
/**
 * Measures the parts an airframe articulates (R3): where a propeller's hub is, whether it is
 * N-fold symmetric about a pivot, where a gear leg's hinge is, and how a download is yawed.
 * tests/tools/models/aircraftRigs.test.ts proves every committed rig with these same
 * functions, so a pivot this CLI suggests is the pivot the test checks.
 *
 * `npm run models:rig -- <file.glb> <node | box:x0,y0,z0,x1,y1,z1> [--yaw DEG] [--blades N --axis +x]`
 * prints, in the file's source frame (first turned by --yaw about +y, as an entry's
 * normalize.yawDeg turns it): the part's bounds, centroid, top-hinge estimate and principal
 * yaw; with --blades, its radius and symmetry error about the centroid.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Node } from '@gltf-transform/core'
import { findNode, meshNodes, modelIO, subtree } from './document.js'
import { AXES, type Axis } from './manifest.js'
import { axisVector } from './stages/axes.js'

export type Vec3 = readonly [number, number, number]

function transformed(node: Node): Vec3[] {
  const mesh = node.getMesh()
  if (!mesh) return []
  const m = node.getWorldMatrix()
  const out: Vec3[] = []
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    for (let i = 0; i < pos.getCount(); i++) {
      const [x, y, z] = pos.getElement(i, [0, 0, 0]) as [number, number, number]
      out.push([
        m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
        m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
        m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
      ])
    }
  }
  return out
}

/** Every vertex in `node`'s subtree, in the document's world frame. */
export function worldPositions(node: Node): Vec3[] {
  return subtree(node).flatMap(transformed)
}

/** Every vertex of `nodes` (their own meshes) whose world position lies inside the box. */
export function boxPositions(nodes: readonly Node[], min: Vec3, max: Vec3): Vec3[] {
  return nodes.flatMap(transformed).filter((p) => p.every((v, i) => v >= min[i]! && v <= max[i]!))
}

export function centroid(points: readonly Vec3[]): Vec3 {
  if (points.length === 0) throw new Error('centroid: no points')
  const s = [0, 0, 0]
  for (const p of points) for (let i = 0; i < 3; i++) s[i]! += p[i]!
  return [s[0]! / points.length, s[1]! / points.length, s[2]! / points.length]
}

export function bounds(points: readonly Vec3[]): { min: Vec3; max: Vec3 } {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const p of points) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i]!, p[i]!); max[i] = Math.max(max[i]!, p[i]!) }
  return { min: min as unknown as Vec3, max: max as unknown as Vec3 }
}

/** `p` turned `rad` (right-handed) about the line through `pivot` along the unit `axis` (Rodrigues). */
export function rotateAbout(p: Vec3, pivot: Vec3, axis: Vec3, rad: number): Vec3 {
  const v = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]] as const
  const c = Math.cos(rad), s = Math.sin(rad)
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2]
  const k = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]] as const
  return [0, 1, 2].map((i) => pivot[i]! + v[i]! * c + k[i]! * s + axis[i]! * d * (1 - c)) as unknown as Vec3
}

/** The largest distance of any point from the line through `pivot` along the unit `axis`. */
export function radiusAbout(points: readonly Vec3[], pivot: Vec3, axis: Vec3): number {
  let r = 0
  for (const p of points) {
    const v = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]]
    const d = axis[0] * v[0]! + axis[1] * v[1]! + axis[2] * v[2]!
    r = Math.max(r, Math.hypot(v[0]! - axis[0] * d, v[1]! - axis[1] * d, v[2]! - axis[2] * d))
  }
  return r
}

/**
 * How far a part is from N-fold symmetry about a pivot: every point is turned by 2 pi / blades
 * and matched to its nearest original point. Returns the 95th-percentile distance, capped at 2%
 * of the radius (the search reaches one grid cell of that size). An exact propeller about its
 * hub reads 0. A pivot off the hub reads the cap.
 */
export function symmetryError(points: readonly Vec3[], pivot: Vec3, axis: Vec3, blades: number): number {
  if (!Number.isInteger(blades) || blades < 2) throw new Error(`symmetryError: blades must be an integer >= 2, got ${blades}`)
  const radius = radiusAbout(points, pivot, axis)
  if (!(radius > 0)) throw new Error('symmetryError: the part has no extent about its axis')
  const cell = 0.02 * radius
  const key = (i: number, j: number, k: number): string => `${i},${j},${k}`
  const grid = new Map<string, Vec3[]>()
  for (const p of points) {
    const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell))
    const list = grid.get(k)
    if (list) list.push(p)
    else grid.set(k, [p])
  }
  const turn = (2 * Math.PI) / blades
  const dists = points.map((p) => {
    const q = rotateAbout(p, pivot, axis, turn)
    const i = Math.floor(q[0] / cell), j = Math.floor(q[1] / cell), k = Math.floor(q[2] / cell)
    let best = cell
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
      for (const r of grid.get(key(i + di, j + dj, k + dk)) ?? []) best = Math.min(best, Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]))
    }
    return best
  }).sort((a, b) => a - b)
  return dists[Math.floor(0.95 * (dists.length - 1))]!
}

/** A gear leg's hinge estimate: the centroid of the points within `band` of its height from its top. */
export function legTop(points: readonly Vec3[], band = 0.02): Vec3 {
  const b = bounds(points)
  const cut = b.max[1] - band * (b.max[1] - b.min[1])
  return centroid(points.filter((p) => p[1] >= cut))
}

/** The turn about +y, in degrees in (-90, 90], that lays the points' long horizontal axis on
 *  x. Which end is the nose is the caller's call: add 180 if it lands on -x. */
export function principalYawDeg(points: readonly Vec3[]): number {
  const c = centroid(points)
  let sxx = 0, szz = 0, sxz = 0
  for (const p of points) {
    const dx = p[0] - c[0], dz = p[2] - c[2]
    sxx += dx * dx; szz += dz * dz; sxz += dx * dz
  }
  const deg = (0.5 * Math.atan2(2 * sxz, sxx - szz) * 180) / Math.PI
  return deg <= -90 ? deg + 180 : deg
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const flag = (name: string): string | undefined => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
  const [file, target] = args
  if (!file || !target) {
    console.error('usage: npm run models:rig -- <file.glb> <node | box:x0,y0,z0,x1,y1,z1> [--yaw DEG] [--blades N --axis +x]')
    process.exit(2)
  }
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync(file)))
  const yaw = Number(flag('yaw') ?? 0)
  if (yaw !== 0) {
    const { yawScene } = await import('./stages/yaw.js')
    yawScene(doc, '+y', yaw)
  }
  let pts: Vec3[]
  if (target.startsWith('box:')) {
    const v = target.slice(4).split(',').map(Number)
    pts = boxPositions(meshNodes(doc), [v[0]!, v[1]!, v[2]!], [v[3]!, v[4]!, v[5]!])
  } else pts = worldPositions(findNode(doc, target))
  const f = (p: readonly number[]): string => `[${p.map((x) => x.toFixed(3)).join(', ')}]`
  const b = bounds(pts), c = centroid(pts)
  console.log(`${target}: ${pts.length} vertices, bounds min ${f(b.min)} max ${f(b.max)}`)
  console.log(`centroid ${f(c)}; top hinge estimate ${f(legTop(pts))}; principal yaw ${principalYawDeg(pts).toFixed(3)} deg about +y`)
  const blades = flag('blades')
  if (blades !== undefined) {
    const name = (flag('axis') ?? '+x') as Axis
    if (!AXES.includes(name)) { console.error(`--axis must be one of ${AXES.join(' ')}`); process.exit(2) }
    const axis = axisVector(name)
    console.log(`about the centroid along ${name}: radius ${radiusAbout(pts, c, axis).toFixed(3)}, ${blades}-fold symmetry error p95 ${symmetryError(pts, c, axis, Number(blades)).toFixed(4)}`)
  }
}
