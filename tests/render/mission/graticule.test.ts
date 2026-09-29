import { describe, expect, it } from 'vitest'
import { buildGraticule, formatLatLon, graticuleStepArcmin } from '../../../src/render/mission/graticule.js'

const W = 800
const H = 520
const boxAround = (half: number) => ({ minX: -half, maxX: half, minZ: -half, maxZ: half })
const projectFor = (half: number) => (x: number, z: number) => ({
  x: ((x + half) / (2 * half)) * W,
  y: ((z + half) / (2 * half)) * H,
})

describe('formatLatLon', () => {
  it('writes degrees, minutes and hemisphere', () => {
    expect(formatLatLon(10.75, 'lat')).toBe('10°45′N')
    expect(formatLatLon(-10.75, 'lat')).toBe('10°45′S')
    expect(formatLatLon(125 + 20 / 60, 'lon')).toBe('125°20′E')
  })
})

describe('graticuleStepArcmin', () => {
  it('uses the coarsest step that still gives four lines across', () => {
    expect(graticuleStepArcmin(100_000)).toBe(10)
    expect(graticuleStepArcmin(20_000)).toBe(2)
    expect(graticuleStepArcmin(400_000)).toBe(30)
  })
  it('falls back to one minute for a tiny chart', () => {
    expect(graticuleStepArcmin(2_000)).toBe(1)
  })
})

describe('buildGraticule', () => {
  it('draws several lat and lon lines with margin labels', () => {
    const g = buildGraticule(boxAround(10_000), projectFor(10_000), W, H)
    expect(g.lines.length).toBeGreaterThanOrEqual(6)
    const lat = g.labels.filter((l) => l.text.endsWith('N'))
    const lon = g.labels.filter((l) => l.text.endsWith('E'))
    expect(lat.length).toBeGreaterThanOrEqual(3)
    expect(lon.length).toBeGreaterThanOrEqual(3)
    for (const l of lat) {
      expect(l.x).toBe(-6)
      expect(l.anchor).toBe('end')
      expect(l.y).toBeGreaterThanOrEqual(0)
      expect(l.y).toBeLessThanOrEqual(H + 4)
    }
    for (const l of lon) {
      expect(l.y).toBe(H + 16)
      expect(l.anchor).toBe('middle')
      expect(l.x).toBeGreaterThanOrEqual(0)
      expect(l.x).toBeLessThanOrEqual(W)
    }
  })

  it('survives the minimum 2 km chart without throwing', () => {
    const g = buildGraticule(boxAround(1_000), projectFor(1_000), W, H)
    expect(g.lines.length).toBeLessThanOrEqual(8)
  })
})
