import { describe, expect, it } from 'vitest'
import { bakeHorizons, horizonAngle, horizonDistances, skyVisibility, type HeightGrid } from '../../tools/terrain/horizons.js'

const grid = (height: (x: number, z: number) => number): HeightGrid => ({
  samples: 17, stepM: 10, heights: Float32Array.from({ length: 17 * 17 }, (_, i) => height(i % 17, Math.floor(i / 17))),
})
const distances = horizonDistances(10, 160)

describe('terrain horizons', () => {
  it('keeps flat ground and an open inclined plane fully sky-lit', () => {
    for (const [sx, sz] of [[0, 0], [0.7, 0.3], [-0.4, 0.8]]) {
      const g = grid((x, z) => 200 + x * 10 * sx! + z * 10 * sz!)
      const angles = Array.from({ length: 16 }, (_, i) => horizonAngle(g, 8, 8, i * Math.PI / 8, distances))
      expect(skyVisibility(angles, sx!, sz!)).toBeCloseTo(1, 5)
    }
  })
  it('finds a ridge in its own direction and does not invent one behind the receiver', () => {
    const g = grid(x => x === 12 ? 150 : 100)
    expect(horizonAngle(g, 8, 8, 0, distances)).toBeCloseTo(Math.atan(50 / 40), 6)
    expect(horizonAngle(g, 8, 8, Math.PI, distances)).toBe(0)
  })
  it('reduces diffuse light inside a bowl, but leaves its exposed summit open', () => {
    const bowl = grid((x, z) => 100 + Math.hypot(x - 8, z - 8) * 10)
    const peak = grid((x, z) => 300 - Math.hypot(x - 8, z - 8) * 10)
    const angles = (g: HeightGrid) => Array.from({ length: 16 }, (_, i) => horizonAngle(g, 8, 8, i * Math.PI / 8, distances))
    expect(skyVisibility(angles(bowl), 0, 0)).toBeCloseTo(0.5, 1)
    expect(skyVisibility(angles(peak), 0, 0)).toBe(1)
  })
  it('packs directional layers in north-to-south rows and keeps sea neutral', () => {
    const g = grid(x => x === 12 ? 50 : 0)
    const sea = bakeHorizons(g, 17, 8, 100)
    expect(sea.sky[8 * 17 + 8]).toBe(255)
    expect(sea.horizons[8 * 17 + 8]).toBe(0)
    const land = bakeHorizons(grid(x => x === 12 ? 150 : 100), 17, 8, 100)
    expect(land.horizons[8 * 17 + 8]).toBeGreaterThan(100)
    expect(land.horizons[4 * 17 * 17 + 8 * 17 + 8]).toBe(0)
    expect(land.horizons.length).toBe(8 * land.sky.length)
  })
})
