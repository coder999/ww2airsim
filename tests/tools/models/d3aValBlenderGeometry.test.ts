// tests/tools/models/d3aValBlenderGeometry.test.ts
// Regressions for Mark's 2026-10-11 review: the first Val duplicate had a wavy/kinked body,
// daylight below the canopy sides, and fixed spats that stopped short of the wing. These are
// geometry checks against the re-measured D3A1 drawing and exact-variant/period photographs
// recorded in tools/models/blender/d3a-val-blender.py; they inspect the built GLB, not its source.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { modelIO } from '../../../tools/models/document.js'

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
// Visible drawing ordinates plus the explicitly photo-constrained, wing-occluded belly run.
const BODY: readonly (readonly [number, number, number])[] = [
  [10.19, 0.02, -0.02], [9.88, 0.30, -0.18], [9.17, 0.50, -0.25],
  [8.82, 0.55, -0.28], [8.39, 0.61, -0.30], [7.62, 0.72, -0.32],
  [6.84, 0.78, -0.34], [6.17, 0.70, -0.36], [5.29, 0.70, -0.38],
  [4.52, 0.70, -0.40], [3.74, 0.72, -0.48], [3.51, 0.74, -0.50],
  [2.96, 0.78, -0.58], [2.45, 0.84, -0.72], [2.18, 0.88, -0.82],
  [1.92, 0.85, -0.94], [1.39, 0.85, -0.92], [0.86, 0.82, -0.88],
  [0.54, 0.88, -0.84], [0.18, 0.20, -0.20],
]

describe('d3a-val-blender repaired geometry', () => {
  it('keeps the re-measured body ordinates and never overshoots between them', async () => {
    const components = await skinComponents()
    const body = components.filter((component) => {
      const { min, max } = bounds(component)
      return max[0] - min[0] > 9 && max[2] - min[2] < 1.3
    }).flat()
    expect(body.length, 'long center fuselage components').toBeGreaterThan(1_000)
    const centerline = body.filter((point) => Math.abs(point[2]) < 0.002)
    for (const [aft, top, bottom] of BODY) {
      const x = NOSE_AFT_ORIGIN_M - aft
      const ring = centerline.filter((point) => Math.abs(point[0] - x) < 0.002)
      expect(ring.length, `body ring ${aft.toFixed(2)} m aft of the spinner`).toBeGreaterThanOrEqual(2)
      expect(Math.max(...ring.map((point) => point[1])), `top at ${aft.toFixed(2)} m`).toBeCloseTo(top, 2)
      expect(Math.min(...ring.map((point) => point[1])), `bottom at ${aft.toFixed(2)} m`).toBeCloseTo(bottom, 2)
    }
    const ordered = [...BODY].reverse()
    for (let i = 0; i < ordered.length - 1; i++) {
      const [aft0, top0, bottom0] = ordered[i]!
      const [aft1, top1, bottom1] = ordered[i + 1]!
      const [x0, x1] = [NOSE_AFT_ORIGIN_M - aft0, NOSE_AFT_ORIGIN_M - aft1]
      const interval = centerline.filter((point) => point[0] >= x0 && point[0] <= x1)
      expect(Math.max(...interval.map((point) => point[1]))).toBeLessThanOrEqual(Math.max(top0, top1) + 0.006)
      expect(Math.min(...interval.map((point) => point[1]))).toBeGreaterThanOrEqual(Math.min(bottom0, bottom1) - 0.006)
    }
  })

  it('buries every full-width greenhouse section below the fuselage shoulder', async () => {
    const components = await skinComponents()
    // Optimization joins all static material into one primitive, but each canopy panel remains
    // its own connected component. Select by the fitted greenhouse envelope instead of assuming
    // those panels share vertices with one another.
    const canopy = components.flat().filter((point) =>
      point[0] >= -4.16 && point[0] <= -0.95 && point[1] >= 0.30 && Math.abs(point[2]) <= 0.40,
    )
    expect(canopy.length, 'fitted greenhouse vertices').toBeGreaterThan(500)
    for (const x of [-3.75, -3.10, -2.56, -1.95, -1.35]) {
      const section = canopy.filter((point) => Math.abs(point[0] - x) < 0.002)
      expect(section.length, `greenhouse section x ${x}`).toBeGreaterThanOrEqual(8)
      expect(Math.min(...section.map((point) => point[1])), `greenhouse closure x ${x}`).toBeLessThanOrEqual(0.49)
    }
  })

  it('has a fixed root/fairing component that overlaps each spat and wing', async () => {
    const components = await skinComponents()
    for (const side of [-1, 1]) {
      const root = components.find((component) => {
        const { min, max } = bounds(component)
        const centerZ = (min[2] + max[2]) / 2
        return Math.abs(centerZ - side * 1.62) < 0.12 && min[1] <= -0.33 && max[1] >= -0.20 &&
          min[0] < 0.257 && max[0] > 0.257 && max[0] - min[0] < 0.30 && max[2] - min[2] < 0.30
      })
      expect(root, `${side < 0 ? 'left' : 'right'} fixed-gear root reaches from spat into wing`).toBeDefined()
    }
  })
})
