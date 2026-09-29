import { describe, expect, it } from 'vitest'
import { padGrid, pathData, sampleGrid, smoothPolyline, traceLevel, type Grid } from '../../../src/render/mission/chartIso.js'

const area = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }

describe('traceLevel', () => {
  it('traces a cone as one closed loop at the right radius', () => {
    const grid = sampleGrid(area, 40, (x, z) => 10 - Math.hypot(x, z))
    const lines = traceLevel(grid, 5)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(true)
    for (const [x, z] of lines[0]!.points) expect(Math.hypot(x, z)).toBeCloseTo(5, 1)
  })

  it('traces a ramp as one open line', () => {
    const grid = sampleGrid(area, 40, (x) => x)
    const lines = traceLevel(grid, 0.5)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(false)
    for (const [x] of lines[0]!.points) expect(x).toBeCloseTo(0.5, 6)
  })

  it('keeps two separate blobs separate', () => {
    const grid = sampleGrid(area, 40, (x, z) => Math.max(3 - Math.hypot(x - 5, z), 3 - Math.hypot(x + 5, z)))
    expect(traceLevel(grid, 1)).toHaveLength(2)
  })

  it('traces a saddle as two arcs around the two inside corners', () => {
    const grid: Grid = { cols: 1, rows: 1, minX: 0, minZ: 0, dx: 1, dz: 1, values: Float32Array.from([1, 0, 0, 1]) }
    const lines = traceLevel(grid, 0.5)
    expect(lines).toHaveLength(2)
    const centres = lines.map((l) => [
      l.points.reduce((s, p) => s + p[0], 0) / l.points.length,
      l.points.reduce((s, p) => s + p[1], 0) / l.points.length,
    ])
    centres.sort((a, b) => a[0]! - b[0]!)
    expect(centres[0]![0]).toBeCloseTo(0.25, 6)
    expect(centres[0]![1]).toBeCloseTo(0.25, 6)
    expect(centres[1]![0]).toBeCloseTo(0.75, 6)
    expect(centres[1]![1]).toBeCloseTo(0.75, 6)
  })

  it('returns nothing for a grid that never crosses the level', () => {
    expect(traceLevel(sampleGrid(area, 10, () => -5), 0)).toEqual([])
    expect(traceLevel(sampleGrid(area, 10, () => 5), 0)).toEqual([])
  })
})

describe('padGrid', () => {
  it('closes a region that touches the frame', () => {
    const allLand = sampleGrid(area, 10, () => 5)
    const lines = traceLevel(padGrid(allLand, -1), 0)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(true)
    const xs = lines[0]!.points.map((p) => p[0])
    expect(Math.min(...xs)).toBeLessThan(area.minX)
    expect(Math.max(...xs)).toBeGreaterThan(area.maxX)
  })

  it('leaves an all-sea grid empty', () => {
    expect(traceLevel(padGrid(sampleGrid(area, 10, () => -5), -1), 0)).toEqual([])
  })
})

describe('smoothPolyline', () => {
  const square: [number, number][] = [[0, 0], [4, 0], [4, 4], [0, 4]]
  it('doubles a closed loop each pass and stays closed', () => {
    const out = smoothPolyline({ points: square, closed: true }, 2)
    expect(out.points).toHaveLength(16)
    expect(out.closed).toBe(true)
  })
  it('keeps the endpoints of an open line', () => {
    const out = smoothPolyline({ points: [[0, 0], [2, 2], [4, 0]], closed: false }, 2)
    expect(out.points[0]).toEqual([0, 0])
    expect(out.points[out.points.length - 1]).toEqual([4, 0])
  })
  it('leaves a two-point arc alone', () => {
    const line = { points: [[0, 0], [1, 1]] as [number, number][], closed: false }
    expect(smoothPolyline(line, 2)).toEqual(line)
  })
})

describe('pathData', () => {
  const project = (x: number, z: number) => ({ x, y: z })
  it('writes M/L commands and Z for closed loops', () => {
    expect(pathData([{ points: [[0, 0], [1, 0], [1, 1]], closed: true }], project)).toBe('M0.0 0.0L1.0 0.0L1.0 1.0Z')
    expect(pathData([{ points: [[0, 0], [1, 0]], closed: false }], project)).toBe('M0.0 0.0L1.0 0.0')
  })
  it('is empty for no lines so callers can skip the element', () => {
    expect(pathData([], project)).toBe('')
  })
})
