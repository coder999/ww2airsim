import { describe, expect, it } from 'vitest'
import { buildChartLayers, LAND_THRESHOLD_M } from '../../../src/render/mission/chartLayers.js'
import { parseCoverHeader } from '../../../src/sim/world/cover.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { createTerrainField, type TerrainField } from '../../../src/sim/world/terrain.js'

const header = parseTerrainHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
  finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
})

/** Level 9 is a 17x17 grid, 12.5 km apart: a 1000 m cone of radius 5 samples in the middle. */
const cone = (): TerrainField => {
  const heights = new Int16Array(17 * 17)
  for (let r = 0; r < 17; r++) {
    for (let c = 0; c < 17; c++) heights[r * 17 + c] = Math.round(10 * 1000 * Math.max(0, 1 - Math.hypot(c - 8, r - 8) / 5))
  }
  return createTerrainField(header, 9, heights)
}

const withEastForest = (terrain: TerrainField): TerrainField => {
  const coverHeader = parseCoverHeader({
    centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, samples: 1025,
    channels: ['tree', 'crop', 'mangrove', 'open'], encoding: 'rgba8-sixteenths',
  })
  const data = new Uint8Array(1025 * 1025 * 4)
  for (let r = 0; r < 1025; r++) for (let c = 512; c < 1025; c++) data[(r * 1025 + c) * 4] = 255
  return { ...terrain, cover: { header: coverHeader, data, firm: [] } }
}

const wide = { minX: -80_000, maxX: 80_000, minZ: -80_000, maxZ: 80_000 }

describe('buildChartLayers', () => {
  it('draws no land layers without terrain but still picks an interval', () => {
    const layers = buildChartLayers(null, wide)
    expect(layers.land).toEqual([])
    expect(layers.coast).toEqual([])
    expect(layers.contours).toEqual([])
    expect(layers.woodland).toEqual([])
    expect(layers.intervalFt).toBe(500)
  })

  it('traces an island as one land loop, a coast and nested contours', () => {
    const layers = buildChartLayers(cone(), wide)
    expect(layers.land).toHaveLength(1)
    expect(layers.land[0]!.closed).toBe(true)
    expect(layers.coast.length).toBeGreaterThanOrEqual(1)
    expect(layers.intervalFt).toBe(500)
    expect(layers.contours.map((c) => c.levelFt)).toEqual([500, 1000, 1500, 2000, 2500, 3000])
    expect(layers.contours.filter((c) => c.index).map((c) => c.levelFt)).toEqual([2500])
    for (const c of layers.contours) expect(c.lines.length).toBeGreaterThanOrEqual(1)
    expect(layers.woodland).toEqual([])
  })

  it('has no land in an all-sea view', () => {
    const away = { minX: 85_000, maxX: 99_000, minZ: 85_000, maxZ: 96_000 }
    const layers = buildChartLayers(cone(), away)
    expect(layers.land).toEqual([])
    expect(layers.coast).toEqual([])
    expect(layers.contours).toEqual([])
  })

  it('fills an inland view with one frame-sized land loop and no coast', () => {
    const inland = { minX: -3_000, maxX: 3_000, minZ: -2_000, maxZ: 2_000 }
    const layers = buildChartLayers(cone(), inland)
    expect(layers.land).toHaveLength(1)
    expect(layers.coast).toEqual([])
  })

  it('keeps woodland on land and only where the cover says trees', () => {
    const layers = buildChartLayers(withEastForest(cone()), wide)
    expect(layers.woodland.length).toBeGreaterThanOrEqual(1)
    for (const loop of layers.woodland) {
      for (const [x, z] of loop.points) {
        expect(x).toBeGreaterThan(-2_000)
        expect(Math.hypot(x, z)).toBeLessThan(75_000)
      }
    }
    expect(layers.crop).toEqual([])
    expect(layers.mangrove).toEqual([])
  })

  it('never emits more than 40 contour levels on a small chart of tall land', () => {
    const tiny = { minX: -5_000, maxX: 5_000, minZ: -3_000, maxZ: 3_000 }
    const layers = buildChartLayers(cone(), tiny)
    expect(layers.contours.length).toBeLessThanOrEqual(40)
  })

  it('reads sea for the part of a view outside the 200 km world', () => {
    const edge = { minX: 90_000, maxX: 140_000, minZ: -20_000, maxZ: 10_000 }
    const layers = buildChartLayers(cone(), edge)
    expect(layers.land).toEqual([])
  })

  it('exports the land threshold the cover threshold masks with', () => {
    expect(LAND_THRESHOLD_M).toBeGreaterThan(0)
    expect(LAND_THRESHOLD_M).toBeLessThan(0.3)
  })
})
