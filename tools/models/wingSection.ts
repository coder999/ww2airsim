// tools/models/wingSection.ts
/**
 * Slices a drawn model's wing to find where a store hangs (O1, ordnance spec §2.3). Every
 * coordinate is in the SIM body frame (+X forward, +Y up, +Z right) after `toSim`, which for
 * the Wildcat is exactly wildcat.ts's correction group, so a mount fitted here is where the
 * store appears on the drawn airplane.
 */
import type { Document } from '@gltf-transform/core'
import { meshNodes } from './document.js'
import type { MeshData } from './generated/mesh.js'

const TRIANGLES = 4
/** Column-major 4x4 product a * b. */
function mul(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!
  return out
}

export function sceneTriangles(doc: Document, toSim: readonly number[]): Float64Array {
  const out: number[] = []
  const v = [0, 0, 0]
  for (const node of meshNodes(doc)) {
    const m = mul(toSim, node.getWorldMatrix() as unknown as number[])
    for (const prim of node.getMesh()!.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue
      const pos = prim.getAttribute('POSITION')!, idx = prim.getIndices()
      const n = idx ? idx.getCount() : pos.getCount()
      for (let i = 0; i + 2 < n; i += 3) {
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx ? idx.getScalar(i + k) : i + k, v)
          const [x, y, z] = v as [number, number, number]
          out.push(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!)
        }
      }
    }
  }
  return Float64Array.from(out)
}

export interface WingSection { readonly z: number; readonly leadingX: number; readonly trailingX: number; lowerY(x: number): number }

/** The plane z = `z` cut through every triangle, keeping segments forward of `minX` (the
 *  tail surfaces lie aft of it). lowerY(x) is the lowest surface crossing x: the lower skin. */
export function wingSection(tris: Float64Array, z: number, minX: number): WingSection {
  const segs: number[] = []
  for (let t = 0; t < tris.length; t += 9) {
    const pts: number[] = []
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]] as const) {
      const az = tris[t + a + 2]!, bz = tris[t + b + 2]!
      if ((az - z) * (bz - z) >= 0) continue
      const f = (z - az) / (bz - az)
      pts.push(tris[t + a]! + f * (tris[t + b]! - tris[t + a]!), tris[t + a + 1]! + f * (tris[t + b + 1]! - tris[t + a + 1]!))
    }
    if (pts.length === 4 && pts[0]! >= minX && pts[2]! >= minX) segs.push(...pts)
  }
  if (segs.length === 0) throw new Error(`wingSection: nothing crosses z = ${z} forward of x = ${minX}`)
  let leadingX = -Infinity, trailingX = Infinity
  for (let i = 0; i < segs.length; i += 2) { leadingX = Math.max(leadingX, segs[i]!); trailingX = Math.min(trailingX, segs[i]!) }
  return {
    z, leadingX, trailingX,
    lowerY(x: number): number {
      let y = Infinity
      for (let i = 0; i < segs.length; i += 4) {
        const x0 = segs[i]!, y0 = segs[i + 1]!, x1 = segs[i + 2]!, y1 = segs[i + 3]!
        if (x0 === x1 || (x0 - x) * (x1 - x) > 0) continue
        y = Math.min(y, y0 + ((y1 - y0) * (x - x0)) / (x1 - x0))
      }
      return y
    },
  }
}

export interface MountFit { readonly offset: [number, number, number]; readonly dropM: number; readonly clearanceM: number; readonly leadingX: number; readonly trailingX: number }

const round3 = (v: number): number => Math.round(v * 1000) / 1000

/**
 * Hangs `store` (its origin at the lug tops, +X nose) at `chordFraction` of the chord from the
 * leading edge at station `z`, pitched `pitchRad` nose-up, and drops it the least whole
 * millimeters that leave every vertex under wing at least `minClearanceM` below the lower skin
 * at the vertex's own x, in the wing section at the vertex's z snapped to the nearest 0.05 m
 * (sections are sliced on that grid, not at each vertex's exact z). Vertices ahead of the leading edge or behind the trailing edge
 * have no wing above them and do not constrain the drop.
 */
export function fitMount(sectionAt: (z: number) => WingSection, z: number, chordFraction: number, pitchRad: number, store: MeshData, minClearanceM: number): MountFit {
  const at = sectionAt(z)
  const x = at.leadingX - chordFraction * (at.leadingX - at.trailingX)
  const skin = at.lowerY(x)
  if (!Number.isFinite(skin)) throw new Error(`fitMount: no lower skin at x = ${x}, z = ${z}`)
  const c = Math.cos(pitchRad), s = Math.sin(pitchRad)
  let clearance0 = Infinity
  const p = store.positions
  for (let i = 0; i < p.length; i += 3) {
    const vx = x + p[i]! * c - p[i + 1]! * s
    const vy = skin + p[i]! * s + p[i + 1]! * c
    const vz = z + p[i + 2]!
    const lower = sectionAt(Math.round(vz / 0.05) * 0.05).lowerY(vx)
    if (Number.isFinite(lower)) clearance0 = Math.min(clearance0, lower - vy)
  }
  const dropM = Math.max(0, Math.ceil((minClearanceM - clearance0) * 1000) / 1000)
  return { offset: [round3(x), round3(skin - dropM), z], dropM, clearanceM: clearance0 + dropM, leadingX: at.leadingX, trailingX: at.trailingX }
}

