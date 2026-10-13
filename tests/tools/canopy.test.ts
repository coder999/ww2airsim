import { describe, expect, it } from 'vitest'
import { bakeCanopy } from '../../tools/terrain/canopy.js'

describe('periodic canopy material', () => {
  it('bakes deterministic relief, variable tone and enclosed gaps without a boundary seam', () => {
    const size = 128, data = bakeCanopy(size)
    expect(Buffer.from(data).equals(Buffer.from(bakeCanopy(size)))).toBe(true)
    const ranges = Array.from({ length: 4 }, (_, c) => Array.from({ length: size * size }, (_, i) => data[i * 4 + c]!))
    for (const channel of ranges) expect(Math.max(...channel) - Math.min(...channel)).toBeGreaterThan(40)
    // Wrapped edge differences should look like an ordinary neighboring pair,
    // rather than the jump made by a nonperiodic height-field bake.
    let edges = 0, inside = 0
    for (let y = 0; y < size; y++) for (let c = 0; c < 4; c++) {
      edges += Math.abs(data[(y * size) * 4 + c]! - data[(y * size + size - 1) * 4 + c]!)
      for (let x = 1; x < size; x++) inside += Math.abs(data[(y * size + x) * 4 + c]! - data[(y * size + x - 1) * 4 + c]!) / (size - 1)
    }
    expect(edges).toBeLessThan(inside * 1.5)
    for (const slopes of ranges.slice(0, 2)) {
      expect(Math.min(...slopes)).toBeLessThan(100)
      expect(Math.max(...slopes)).toBeGreaterThan(155)
    }
    expect(Math.min(...ranges[3]!)).toBeLessThan(180)
  })
})
