// tests/tools/models/f4uCorsairBlenderGeometry.test.ts
// The F4U duplicate against Kaboldy's Commons three-view, as re-read in tools/models/blender/f4u-corsair-blender.py
// (2026-10-11). The first pass misread that drawing: a rear belly 0.3-0.45 m high, the fin standing on the
// tail cone 0.9 m aft of the drawn one, a uniform 6.5 deg inner anhedral, square tail tips. These inspect the
// built GLB, not its source.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions, type Vec3 } from '../../../tools/models/rig.js'

const GLB = 'content/aircraft/f4u-corsair-blender.glb'
const NOSE_AFT_ORIGIN_M = 2.89
const X = (aft: number): number => NOSE_AFT_ORIGIN_M - aft

async function doc() {
  return modelIO().readBinary(new Uint8Array(readFileSync(GLB)))
}

async function skin(): Promise<Vec3[]> {
  const node = (await doc()).getRoot().listNodes().find((n) => n.getName() === 'f4u_dark')
  expect(node, 'the built Corsair skin node').toBeDefined()
  return worldPositions(node!)
}

/** The skin's connected pieces (vertices joined by triangles), in world space. */
async function components(): Promise<Vec3[][]> {
  const node = (await doc()).getRoot().listNodes().find((n) => n.getName() === 'f4u_dark')!
  const m = node.getWorldMatrix()
  const out: Vec3[][] = []
  for (const prim of node.getMesh()!.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!
    const idx = prim.getIndices()!
    const parent = Array.from({ length: pos.getCount() }, (_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
    for (let t = 0; t < idx.getCount(); t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => find(idx.getScalar(t + k)))
      parent[b!] = a!
      parent[find(c!)] = a!
    }
    const groups = new Map<number, Vec3[]>()
    for (let i = 0; i < pos.getCount(); i++) {
      const [x, y, z] = pos.getElement(i, [0, 0, 0]) as [number, number, number]
      const p: Vec3 = [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!]
      const g = groups.get(find(i)) ?? []
      g.push(p)
      groups.set(find(i), g)
    }
    out.push(...groups.values())
  }
  return out
}

const span = (pts: readonly Vec3[], k: number): number => Math.max(...pts.map((p) => p[k]!)) - Math.min(...pts.map((p) => p[k]!))

// Drawing-measured side ordinates: m aft of the hub tip, top and bottom above the propeller axis.
const BODY: readonly (readonly [number, number, number])[] = [
  [1.00, 0.726, -0.722], [1.50, 0.739, -0.739], [3.00, 0.822, -0.720], [3.90, 0.877, -0.700], [5.60, 1.169, -0.630],
  [6.50, 1.039, -0.534], [7.50, 0.885, -0.405], [8.60, 0.710, -0.221], [9.40, 0.593, -0.067], [10.00, 0.505, 0.075],
]

describe('f4u-corsair-blender against the Commons three-view', () => {
  it('keeps the drawn body ordinates, nose to tail cone', async () => {
    const body = (await components()).filter((c) => span(c, 0) > 9 && span(c, 2) < 1.6).flat()
    expect(body.length, 'the long fuselage loft').toBeGreaterThan(1_000)
    for (const [aft, top, bottom] of BODY) {
      const ring = body.filter((p) => Math.abs(p[2]) < 0.002 && Math.abs(p[0] - X(aft)) < 0.002)
      expect(ring.length, `body ring ${aft.toFixed(2)} m aft`).toBeGreaterThanOrEqual(2)
      expect(Math.max(...ring.map((p) => p[1])), `top at ${aft.toFixed(2)} m`).toBeCloseTo(top, 2)
      expect(Math.min(...ring.map((p) => p[1])), `bottom at ${aft.toFixed(2)} m`).toBeCloseTo(bottom, 2)
    }
  })

  it('puts the hood roof +1.31 m between 4.6 and 5.0 m, faired into a +1.18 m turtle deck', async () => {
    const pts = await skin()
    const top = (from: number, to: number): number => Math.max(...pts.filter((p) => p[0] <= X(from) && p[0] >= X(to)).map((p) => p[1]))
    expect(Math.abs(top(4.6, 5.0) - 1.307)).toBeLessThanOrEqual(0.02)
    expect(top(5.5, 5.9)).toBeLessThanOrEqual(1.19)
    expect(Math.abs(top(3.0, 3.9) - 0.877)).toBeLessThanOrEqual(0.02)
  })

  it('has the drawn fin: round crown +2.31 m near 8.6 m, leading edge at 8.00 m half-way up', async () => {
    const tail = (await skin()).filter((p) => p[0] < X(7.6))
    const crown = tail.reduce((a, p) => (p[1] > a[1] ? p : a))
    expect(Math.abs(crown[1] - 2.31)).toBeLessThanOrEqual(0.02)
    expect(Math.abs(crown[0] - X(8.6))).toBeLessThanOrEqual(0.15)
    const mid = tail.filter((p) => Math.abs(p[1] - 1.45) <= 0.02 && Math.abs(p[2]) < 0.1)
    expect(Math.abs(Math.max(...mid.map((p) => p[0])) - X(8.0))).toBeLessThanOrEqual(0.05)
  })

  it('has the drawn tailplane: 2.535 m half-span on a +0.445 m chord line, elevator hinged at 9.45 m', async () => {
    const tail = (await skin()).filter((p) => p[0] < X(8.5) && Math.abs(p[1] - 0.445) < 0.12)
    expect(Math.abs(Math.max(...tail.map((p) => Math.abs(p[2]))) - 2.535)).toBeLessThanOrEqual(0.02)
    const tip = tail.filter((p) => Math.abs(p[2]) > 2.4)
    expect(Math.abs(tip.reduce((s, p) => s + p[1], 0) / tip.length - 0.445)).toBeLessThanOrEqual(0.02)
    const elevator = (await doc()).getRoot().listNodes().find((n) => n.getName() === 'ElevatorR')!
    expect(Math.abs(Math.max(...worldPositions(elevator).map((p) => p[0])) - X(9.45))).toBeLessThanOrEqual(0.02)
  })

  it('bends the wing as the front view does: steep inner panel, a knee 1.0 m down, a rising outer panel', async () => {
    const wing = (await skin()).filter((p) => p[0] > X(5.0) && p[0] < X(2.15))
    // At the traced rows 1.25 and 4.0 m out (drawn span, scaled 1.0012 to the cited one), where the loft has rings.
    const upper = (z: number): number => Math.max(...wing.filter((p) => Math.abs(Math.abs(p[2]) - z * 1.0012) < 0.005).map((p) => p[1]))
    // Upper silhouette, drawing front view: -0.405 m at 1.25 m out, -0.311 m at 4.0 m out (the first pass: -0.48 m at 1.0 m out).
    expect(Math.abs(upper(1.25) - -0.405)).toBeLessThanOrEqual(0.02)
    expect(Math.abs(upper(4.0) - -0.311)).toBeLessThanOrEqual(0.02)
    const knee = wing.filter((p) => Math.abs(p[2]) > 0.8).reduce((a, p) => (p[1] < a[1] ? p : a))
    expect(Math.abs(knee[1] - -1.0)).toBeLessThanOrEqual(0.03)
    expect(Math.abs(knee[2]) > 1.45 && Math.abs(knee[2]) < 2.2, `knee at |z| ${Math.abs(knee[2]).toFixed(2)}`).toBe(true)
  })
})
