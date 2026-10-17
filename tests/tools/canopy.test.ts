import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { bakeCanopy, bakeCanopyHeight } from '../../tools/terrain/canopy.js'

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

describe('canopy relief channel', () => {
  const size = 128
  it('is deterministic, uses the byte range, and agrees with the packed slope channels', () => {
    const height = bakeCanopyHeight(size), packed = bakeCanopy(size)
    expect(height.length).toBe(size * size)
    expect(Buffer.from(height).equals(Buffer.from(bakeCanopyHeight(size)))).toBe(true)
    expect(Math.max(...height) - Math.min(...height)).toBeGreaterThan(80)
    // The packed R channel is d(height)/dx. Where a texel climbs steeply in the height channel, R must be above the neutral 128.
    let agree = 0, steep = 0
    for (let y = 0; y < size; y++) for (let x = 1; x < size - 1; x++) {
      const d = height[y * size + x + 1]! - height[y * size + x - 1]!
      if (Math.abs(d) < 24) continue
      steep++
      if ((d > 0) === (packed[(y * size + x) * 4]! > 128)) agree++
    }
    expect(steep).toBeGreaterThan(50)
    expect(agree / steep).toBeGreaterThan(0.95)
  })

  it('matches the committed files byte for byte (a change in the bake needs a rebake)', () => {
    expect(Buffer.from(gunzipSync(readFileSync('content/canopy/height.bin.gz'))).equals(Buffer.from(bakeCanopyHeight()))).toBe(true)
    expect(Buffer.from(gunzipSync(readFileSync('content/canopy/material.bin.gz'))).equals(Buffer.from(bakeCanopy()))).toBe(true)
  })
})

