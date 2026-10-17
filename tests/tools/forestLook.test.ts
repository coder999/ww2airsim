import { describe, expect, it } from 'vitest'
import { compareLooks, lookStats, meanAbsDifference, type Image } from '../../tools/terrain/forestLook.js'

// Forest canopy rework, Task 8 (2026-10-16): the D8 statistics on pictures whose answers are known by construction.
const solid = (w: number, h: number, rgb: [number, number, number]): Image => {
  const data = new Uint8Array(w * h * 3)
  for (let p = 0; p < w * h; p++) data.set(rgb, p * 3)
  return { data, width: w, height: h, channels: 3 }
}
const paint = (img: Image, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]): Image => {
  const data = Uint8Array.from(img.data)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set(rgb, (y * img.width + x) * img.channels)
  return { ...img, data }
}
const SKY: [number, number, number] = [120, 160, 220], LEAF: [number, number, number] = [40, 90, 40]

describe('look statistics', () => {
  it('reads luminance, coverage and outline of a green square on sky exactly', () => {
    const img = paint(solid(100, 100, SKY), 20, 20, 60, 60, LEAF)
    const s = lookStats(img)
    expect(s.canopyCoverage).toBeCloseTo(0.16, 6)
    // The outline is the 4-neighborhood boundary pixels of the 40x40 square: its perimeter ring, 4 * 40 - 4.
    expect(s.silhouetteCount).toBe(156)
    expect(s.meanLuminance).toBeCloseTo(0.16 * ((0.2126 * 40 + 0.7152 * 90 + 0.0722 * 40) / 255) + 0.84 * ((0.2126 * 120 + 0.7152 * 160 + 0.0722 * 220) / 255), 6)
    expect(s.edgeCount).toBeGreaterThan(100)
    expect(s.edgeCount).toBeLessThan(400)
  })

  it('finds no edges or outline in a flat picture, and no canopy in sky', () => {
    expect(lookStats(solid(32, 32, SKY))).toMatchObject({ canopyCoverage: 0, edgeCount: 0, silhouetteCount: 0 })
  })

  it('counts more edges in a finer pattern', () => {
    const stripes = (period: number): Image => {
      let img = solid(128, 128, LEAF)
      for (let x = 0; x < 128; x += period * 2) img = paint(img, x, 0, x + period, 128, [90, 150, 70])
      return img
    }
    expect(lookStats(stripes(4)).edgeCount).toBeGreaterThan(lookStats(stripes(16)).edgeCount * 2)
  })

  it('compares two looks: identical matches, a darker and thinner one is flagged measure by measure', () => {
    const a = paint(solid(100, 100, SKY), 20, 20, 80, 80, LEAF)
    expect(compareLooks(a, a)).toMatchObject({ meanAbsDifference: 0, outside: [] })
    const b = paint(solid(100, 100, SKY), 20, 20, 50, 50, [20, 45, 20])
    const c = compareLooks(a, b)
    expect(c.change.canopyCoverage).toBeLessThan(-0.2)
    expect(c.outside).toEqual(expect.arrayContaining(['canopyCoverage', 'meanAbsDifference']))
    expect(meanAbsDifference(a, b)).toBeCloseTo(c.meanAbsDifference, 12)
    expect(() => meanAbsDifference(a, solid(50, 50, SKY))).toThrow(/size mismatch/)
  })

  it('treats RGBA input like RGB', () => {
    const rgb = paint(solid(40, 40, SKY), 10, 10, 30, 30, LEAF)
    const rgba: Image = { data: Uint8Array.from({ length: 40 * 40 * 4 }, (_, i) => (i % 4 === 3 ? 255 : rgb.data[Math.floor(i / 4) * 3 + (i % 4)]!)), width: 40, height: 40, channels: 4 }
    expect(lookStats(rgba)).toEqual(lookStats(rgb))
  })
})
