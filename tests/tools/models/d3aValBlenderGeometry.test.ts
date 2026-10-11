// tests/tools/models/d3aValBlenderGeometry.test.ts
// Regressions for Mark's 2026-10-11 reviews: the first Val duplicate had a wavy/kinked body, daylight
// below the canopy sides and spats short of the wing; the repair that followed read the side view about
// 1.35x too large (a 1.72 m cowl, a canopy 1.1 m aft and 0.29 m high, a 2.34 m straight-edged fin).
// These are geometry checks against the D3A1 drawing as re-read in tools/models/blender/d3a-val-blender.py;
// they inspect the built GLB, not its source.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions } from '../../../tools/models/rig.js'

type Point = readonly [number, number, number]

function transformed(point: Point, matrix: readonly number[]): Point {
  const [x, y, z] = point
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
  ]
}

async function skinComponents(): Promise<Point[][]> {
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/d3a-val-blender.glb')))
  const node = doc.getRoot().listNodes().find((candidate) => candidate.getName() === 'd3a2_dark')
  expect(node, 'the built Val skin node').toBeDefined()
  const matrix = node!.getWorldMatrix()
  const out: Point[][] = []
  for (const primitive of node!.getMesh()!.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION')!
    const parent = Array.from({ length: positions.getCount() }, (_, i) => i)
    const used = new Set<number>()
    const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]!))
    const join = (a: number, b: number): void => {
      const [ra, rb] = [find(a), find(b)]
      if (ra !== rb) parent[rb] = ra
    }
    const indices = primitive.getIndices()
    const count = indices?.getCount() ?? positions.getCount()
    for (let i = 0; i < count; i += 3) {
      const triangle = [0, 1, 2].map((j) => indices ? indices.getScalar(i + j) : i + j)
      triangle.forEach((index) => used.add(index))
      join(triangle[0]!, triangle[1]!)
      join(triangle[1]!, triangle[2]!)
    }
    const groups = new Map<number, Point[]>()
    for (const index of used) {
      const local = positions.getElement(index, [0, 0, 0]) as [number, number, number]
      const group = groups.get(find(index)) ?? []
      group.push(transformed(local, matrix))
      groups.set(find(index), group)
    }
    out.push(...groups.values())
  }
  expect(out.length, 'connected skin components').toBeGreaterThan(10)
  return out
}

function bounds(points: readonly Point[]): { min: Point; max: Point } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis]!, point[axis]!)
    max[axis] = Math.max(max[axis]!, point[axis]!)
  }
  return { min: min as unknown as Point, max: max as unknown as Point }
}

const NOSE_AFT_ORIGIN_M = 2.55
const X = (aft: number) => NOSE_AFT_ORIGIN_M - aft
// Drawing-measured side ordinates (m aft of the spinner: top, bottom above the propeller axis).
const BODY: readonly (readonly [number, number, number])[] = [
  [10.00, 0.10, -0.01], [9.40, 0.22, -0.16], [9.00, 0.25, -0.27], [8.20, 0.35, -0.40],
  [7.00, 0.48, -0.54], [6.00, 0.59, -0.624], [5.00, 0.65, -0.67], [4.00, 0.68, -0.70],
  [3.00, 0.70, -0.706], [2.00, 0.72, -0.69], [1.40, 0.66, -0.67], [1.00, 0.66, -0.66], [0.60, 0.604, -0.604],
]

describe('d3a-val-blender re-measured geometry', () => {
  it('keeps the drawing-measured body ordinates and never overshoots between them', async () => {
    const components = await skinComponents()
    const body = components.filter((component) => {
      const { min, max } = bounds(component)
      return max[0] - min[0] > 9 && max[2] - min[2] < 1.3
    }).flat()
    expect(body.length, 'long center fuselage components').toBeGreaterThan(1_000)
    const centerline = body.filter((point) => Math.abs(point[2]) < 0.002)
    for (const [aft, top, bottom] of BODY) {
      const ring = centerline.filter((point) => Math.abs(point[0] - X(aft)) < 0.002)
      expect(ring.length, `body ring ${aft.toFixed(2)} m aft of the spinner`).toBeGreaterThanOrEqual(2)
      expect(Math.max(...ring.map((point) => point[1])), `top at ${aft.toFixed(2)} m`).toBeCloseTo(top, 2)
      expect(Math.min(...ring.map((point) => point[1])), `bottom at ${aft.toFixed(2)} m`).toBeCloseTo(bottom, 2)
    }
    const ordered = [...BODY].reverse()
    for (let i = 0; i < ordered.length - 1; i++) {
      const [aft0, top0, bottom0] = ordered[i]!
      const [aft1, top1, bottom1] = ordered[i + 1]!
      const interval = centerline.filter((point) => point[0] >= X(aft0) && point[0] <= X(aft1))
      expect(Math.max(...interval.map((point) => point[1]))).toBeLessThanOrEqual(Math.max(top0, top1) + 0.006)
      expect(Math.min(...interval.map((point) => point[1]))).toBeGreaterThanOrEqual(Math.min(bottom0, bottom1) - 0.006)
    }
  })

  it('puts the greenhouse where the drawing does: roof +1.02 m from 2.75 to 4.73 m, deck behind it', async () => {
    const points = (await skinComponents()).flat()
    const top = (from: number, to: number) => Math.max(...points.filter((p) => p[0] <= X(from) && p[0] >= X(to)).map((p) => p[1]))
    // Clear of the antenna mast at 3.9 m and the gunsight ahead of the windscreen.
    expect(top(3.0, 3.6)).toBeCloseTo(1.02, 1)
    expect(top(4.2, 4.7)).toBeCloseTo(1.02, 1)
    // The former canopy ran on to 6.70 m at up to 1.18 m; the drawing's deck there is 0.59-0.62 m.
    expect(top(5.4, 6.0)).toBeLessThanOrEqual(0.66)
    // Every full-width greenhouse section closes on rails buried below the deck's shoulder.
    const canopy = points.filter((p) => p[0] >= X(4.97) && p[0] <= X(2.44) && p[1] >= 0.30 && Math.abs(p[2]) <= 0.40)
    for (const x of [-2.00, -1.25, -0.55]) {
      const section = canopy.filter((point) => Math.abs(point[0] - x) < 0.002)
      expect(section.length, `greenhouse section x ${x}`).toBeGreaterThanOrEqual(8)
      expect(Math.min(...section.map((point) => point[1])), `greenhouse closure x ${x}`).toBeLessThanOrEqual(0.55)
    }
  })

  it('has the drawn fin, rounded crown +1.96 m at 9.37 m on a curved leading edge, and a 4.40 m tailplane', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/d3a-val-blender.glb')))
    const points = (await skinComponents()).flat()
    const tail = points.filter((p) => p[0] < X(8.0))
    const crown = tail.reduce((a, p) => (p[1] > a[1] ? p : a))
    expect(crown[1]).toBeCloseTo(1.96, 1)
    expect(Math.abs(crown[0] - X(9.37))).toBeLessThanOrEqual(0.15)
    // Half-way up (+1.31 m) the leading edge is at 8.60 m, ahead of a straight sweep from fillet to crown (8.73 m).
    const mid = tail.filter((p) => Math.abs(p[1] - 1.31) <= 0.02)
    expect(Math.abs(Math.max(...mid.map((p) => p[0])) - X(8.60))).toBeLessThanOrEqual(0.05)
    const halfSpan = Math.max(...doc.getRoot().listNodes().filter((n) => /^Elevator[LR]$/.test(n.getName()))
      .flatMap((n) => worldPositions(n)).map((p) => Math.abs(p[2]!)))
    expect(halfSpan).toBeGreaterThan(1.85)
    expect(halfSpan).toBeLessThanOrEqual(2.20)
  })

  it('has one faired leg per side from inside the spat into the wing', async () => {
    const components = await skinComponents()
    for (const side of [-1, 1]) {
      const root = components.find((component) => {
        const { min, max } = bounds(component)
        const centerZ = (min[2] + max[2]) / 2
        return Math.abs(centerZ - side * 1.62) < 0.08 && min[1] <= -0.90 && max[1] >= -0.20 &&
          min[0] < 0.257 && max[0] > 0.257 && max[0] - min[0] < 0.5 && max[2] - min[2] < 0.15
      })
      expect(root, `${side < 0 ? 'left' : 'right'} faired leg reaches from spat into wing`).toBeDefined()
    }
  })
})
