import { Vector3, type Mesh, type Object3D } from 'three'

/** Nodes that move in flight (control surfaces, turrets, props, doors, gear, floats): a position light must not ride on one. */
export const MOVING_PART = /^(Aileron|Flap|Elevator|Rudder|Turret|Prop|Door|Bay|Gear|Float|Hook|Canopy|Cowl|Wheel|Tail[Ww]heel)/

/** World-space triangles of every mesh under `root` (the glb as authored, at rest), skipping any mesh on or under a node `skip` matches. */
export function worldTriangles(root: Object3D, skip: RegExp | null = MOVING_PART): Vector3[][] {
  root.updateMatrixWorld(true)
  const tris: Vector3[][] = []
  root.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    if (skip !== null) { for (let n: Object3D | null = o; n !== null && n !== root; n = n.parent) if (skip.test(n.name)) return }
    const pos = mesh.geometry.getAttribute('position')
    const idx = mesh.geometry.getIndex()
    const v = (i: number): Vector3 => new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
    const n = idx === null ? pos.count : idx.count
    for (let i = 0; i + 2 < n; i += 3) {
      const a = idx === null ? i : idx.getX(i), b = idx === null ? i + 1 : idx.getX(i + 1), c = idx === null ? i + 2 : idx.getX(i + 2)
      tris.push([v(a), v(b), v(c)])
    }
  })
  return tris
}

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). */
export function closestPointOnTriangle(p: Vector3, a: Vector3, b: Vector3, c: Vector3): Vector3 {
  const ab = b.clone().sub(a), ac = c.clone().sub(a), ap = p.clone().sub(a)
  const d1 = ab.dot(ap), d2 = ac.dot(ap)
  if (d1 <= 0 && d2 <= 0) return a.clone()
  const bp = p.clone().sub(b), d3 = ab.dot(bp), d4 = ac.dot(bp)
  if (d3 >= 0 && d4 <= d3) return b.clone()
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return a.clone().add(ab.multiplyScalar(d1 / (d1 - d3)))
  const cp = p.clone().sub(c), d5 = ab.dot(cp), d6 = ac.dot(cp)
  if (d6 >= 0 && d5 <= d6) return c.clone()
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return a.clone().add(ac.multiplyScalar(d2 / (d2 - d6)))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return b.clone().add(c.clone().sub(b).multiplyScalar((d4 - d3) / ((d4 - d3) + (d5 - d6))))
  const denom = 1 / (va + vb + vc)
  return a.clone().add(ab.multiplyScalar(vb * denom)).add(ac.multiplyScalar(vc * denom))
}

/** Distance from p to the nearest triangle. */
export function distanceToSurface(p: Vector3, tris: readonly Vector3[][]): number {
  let best = Infinity
  for (const [a, b, c] of tris) { const d = closestPointOnTriangle(p, a!, b!, c!).distanceTo(p); if (d < best) best = d }
  return best
}

/**
 * The position-light points read off the mesh: the extreme starboard and port wingtip vertices (the
 * most lateral vertex, ties to the one nearest the wing's mid-chord) and the aftmost vertex nearest the
 * centreline. Body frame, +X forward, +Y up, +Z right: the glb's own axes.
 */
export function extractNavPoints(tris: readonly Vector3[][]): { port: number[]; starboard: number[]; tail: number[] } {
  const verts = tris.flat()
  const round = (v: Vector3): number[] => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]
  let zMax = -Infinity, zMin = Infinity, xMin = Infinity
  for (const v of verts) { zMax = Math.max(zMax, v.z); zMin = Math.min(zMin, v.z); xMin = Math.min(xMin, v.x) }
  const cluster = (pred: (v: Vector3) => boolean): Vector3[] => verts.filter(pred)
  const mean = (vs: Vector3[]): Vector3 => vs.reduce((s, v) => s.add(v), new Vector3()).multiplyScalar(1 / vs.length)
  const nearest = (vs: Vector3[], to: Vector3): Vector3 => vs.reduce((b, v) => (v.distanceTo(to) < b.distanceTo(to) ? v : b))
  const tip = (side: 1 | -1): Vector3 => {
    const vs = cluster((v) => (side === 1 ? v.z >= zMax - 0.04 : v.z <= zMin + 0.04))
    return nearest(vs, mean(vs))
  }
  const rear = cluster((v) => v.x <= xMin + 0.05)
  const tail = rear.reduce((b, v) => (Math.abs(v.z) < Math.abs(b.z) ? v : b))
  return { port: round(tip(-1)), starboard: round(tip(1)), tail: round(tail) }
}
