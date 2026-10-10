import { describe, expect, it } from 'vitest'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import {
  buildShoreGeometry,
  landSideSign,
  polylineLength,
  resamplePolyline,
  sampleTerrain,
  terrainGrid,
} from '../../tools/shoreline/geometry.js'

const header = parseTerrainHeader({
  centreLatDeg: 10.8,
  centreLonDeg: 125.3,
  halfExtentM: 100,
  finestSamples: 9,
  levels: 3,
  encoding: 'int16-decimetres',
})

const island = (): ReturnType<typeof terrainGrid> => {
  const dm = new Int16Array(9 * 9)
  for (let r = 2; r <= 6; r++) for (let c = 2; c <= 6; c++) dm[r * 9 + c] = 100
  return terrainGrid(header, 0, dm)
}

describe('shoreline geometry', () => {
  it('samples the same node-centred terrain convention as the renderer', () => {
    const g = island()
    expect(sampleTerrain(g, 0, 0)).toBe(10)
    expect(sampleTerrain(g, -100, -100)).toBe(0)
    expect(sampleTerrain(g, -50, -50)).toBe(10)
  })

  it('resamples a closed line without duplicating its first point', () => {
    const square = { closed: true, points: [[0, 0], [10, 0], [10, 10], [0, 10]] as const }
    expect(polylineLength(square)).toBe(40)
    const sampled = resamplePolyline(square, 5)
    expect(sampled.closed).toBe(true)
    expect(sampled.points).toHaveLength(8)
    expect(sampled.points[0]).not.toEqual(sampled.points[sampled.points.length - 1])
  })

  it('chooses a stable land-facing side for a traced coast', () => {
    const g = island()
    const line = { closed: true, points: [[-60, -60], [60, -60], [60, 60], [-60, 60]] as const }
    const sign = landSideSign(g, line)
    expect(sign).toBe(1)
  })

  it('turns a gridded island into one finite curvilinear ribbon loop', () => {
    const shore = buildShoreGeometry(island())
    expect(shore.lines).toHaveLength(1)
    const line = shore.lines[0]!
    expect(line.closed).toBe(true)
    expect(line.points.length).toBeGreaterThan(8)
    for (const p of line.points) {
      expect([p.x, p.z, p.nx, p.nz, p.inlandY, p.dryY].every(Number.isFinite)).toBe(true)
      expect(Math.hypot(p.nx, p.nz)).toBeCloseTo(1, 5)
      expect(sampleTerrain(island(), p.x + p.nx * 20, p.z + p.nz * 20)).toBeGreaterThan(0)
    }
  })

  it('can retain just the lines intersecting prototype bounds', () => {
    const g = island()
    expect(buildShoreGeometry(g, { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }).lines).toHaveLength(0)
    expect(buildShoreGeometry(g, { minX: 70, maxX: 80, minZ: -20, maxZ: 20 }).lines).toHaveLength(1)
  })
})
