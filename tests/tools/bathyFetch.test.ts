// tests/tools/bathyFetch.test.ts
import { describe, expect, it } from 'vitest'
import { opendapUrl, subsetWindow, parseSubset } from '../../tools/bathy/fetch.js'

const HEADER = { centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100_000 }

describe('the GEBCO subset window', () => {
  it('covers the whole world box with margin to spare', () => {
    const w = subsetWindow(HEADER, 4)
    // 15 arc-second cells: 463.31 m in latitude at this latitude, so a
    // 200 km box needs ~432 rows, plus margin on both sides.
    expect(w.latCount).toBeGreaterThan(432)
    expect(w.latCount).toBeLessThan(460)
    expect(w.lonCount).toBeGreaterThan(438)
    expect(w.lonCount).toBeLessThan(470)
  })

  it('brackets the world centre', () => {
    const w = subsetWindow(HEADER, 4)
    const latOf = (j: number) => -90 + (j + 0.5) / 240
    const lonOf = (i: number) => -180 + (i + 0.5) / 240
    expect(latOf(w.latStart)).toBeLessThan(10.8)
    expect(latOf(w.latStart + w.latCount - 1)).toBeGreaterThan(10.8)
    expect(lonOf(w.lonStart)).toBeLessThan(125.3)
    expect(lonOf(w.lonStart + w.lonCount - 1)).toBeGreaterThan(125.3)
  })

  it('stays inside the global grid', () => {
    const w = subsetWindow(HEADER, 4)
    expect(w.latStart).toBeGreaterThanOrEqual(0)
    expect(w.lonStart).toBeGreaterThanOrEqual(0)
    expect(w.latStart + w.latCount).toBeLessThanOrEqual(43_200)
    expect(w.lonStart + w.lonCount).toBeLessThanOrEqual(86_400)
  })

  it('names GEBCO_2026 and the elevation variable in the URL', () => {
    const url = opendapUrl(subsetWindow(HEADER, 4))
    expect(url).toContain('gebco_2026')
    expect(url).toContain('elevation')
    // The dataset descriptor verified 2026-09-15 is [lat][lon], in that
    // order. Reversed, the fetch succeeds and returns the wrong ocean.
    expect(url).toMatch(/elevation(%5B|\[)\d+:\d+(%5D|\])(%5B|\[)\d+:\d+(%5D|\])/)
  })
})

const WINDOW = { latStart: 24190, latCount: 2, lonStart: 73270, lonCount: 3 }
const ascii = () => [
  'elevation.elevation[2][3]', '[0], -128, -127, -126', '[1], -10, 20, 30', '',
  'elevation.lat[2]', [0, 1].map((j) => -90 + (24190 + j + 0.5) / 240).join(', '), '',
  'elevation.lon[3]', [0, 1, 2].map((i) => -180 + (73270 + i + 0.5) / 240).join(', '),
].join('\n')

it('preserves asymmetric rows and validates the source coordinate maps', () => {
  expect([...parseSubset(ascii(), WINDOW).elevations]).toEqual([-128, -127, -126, -10, 20, 30])
  expect(() => parseSubset(ascii().replace('[1], -10, 20, 30', ''), WINDOW)).toThrow(/row/)
  expect(() => parseSubset(ascii().replace('-128', 'NaN'), WINDOW)).toThrow(/elevations/)
  expect(() => parseSubset(ascii(), { ...WINDOW, latStart: 24191 })).toThrow(/coordinates/)
  expect(() => parseSubset(ascii().replace('[2][3]', '[3][2]'), WINDOW)).toThrow(/dimensions/)
})

it('places latitude first and uses inclusive subset endpoints', () => {
  expect(opendapUrl(WINDOW)).toContain('elevation[24190:24191][73270:73272]')
})
