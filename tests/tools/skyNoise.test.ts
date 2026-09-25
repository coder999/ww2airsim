import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildShape, createPermutation, perlinTileable, remap, worleyTileable } from '../../tools/sky/noise.js'
import { buildWeather } from '../../tools/sky/weather.js'
import { detailPath, shapePath, weatherPath, loadDetail, loadShape, loadWeather } from '../../tools/sky/load.js'
import { DETAIL_SIZE, SHAPE_SIZE, WEATHER_SIZE, detailByteLength, shapeByteLength, weatherByteLength } from '../../src/render/sky/noise.js'

describe('tileable noise (Plan 16a)', () => {
  const perm = createPermutation(7)
  it('perlin repeats exactly at its period and stays inside [-1, 1]', () => {
    for (const [x, y, z] of [[0.3, 1.7, 2.2], [3.9, 0.1, 1.5]] as const) {
      const a = perlinTileable(x, y, z, 4, perm)
      expect(perlinTileable(x + 4, y, z, 4, perm)).toBeCloseTo(a, 12)
      expect(perlinTileable(x, y + 8, z - 4, 4, perm)).toBeCloseTo(a, 12)
      expect(Math.abs(a)).toBeLessThanOrEqual(1)
    }
  })
  it('worley repeats at its cell count and stays inside [0, 1]', () => {
    const a = worleyTileable(0.31, 0.62, 0.9, 4, perm)
    expect(worleyTileable(1.31, 0.62, 0.9, 4, perm)).toBeCloseTo(a, 12)
    expect(worleyTileable(0.31, -0.38, 0.9, 4, perm)).toBeCloseTo(a, 12)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(1)
  })
  it('remap is the Schneider remap', () => {
    expect(remap(0.5, 0, 1, 0, 2)).toBe(1)
    expect(remap(0.25, 0.25, 1, 0, 1)).toBe(0)
  })
  it('builds a tileable shape volume: opposite faces are neighbours, and the range is used', () => {
    const n = 16
    const v = buildShape(n, 3)
    expect(v.length).toBe(n * n * n)
    const at = (x: number, y: number, z: number) => v[(z * n + y) * n + x]!
    // Column 0 and column n-1 are adjacent samples under wrapping, so they
    // differ by one texel's worth of the field, never by a seam.
    let worst = 0
    for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) worst = Math.max(worst, Math.abs(at(0, y, z) - at(n - 1, y, z)))
    expect(worst).toBeLessThan(60)
    // The remap lifts the low end on purpose (Schneider 2015): the committed
    // 128-cube spans 110..247. Coverage thresholds it later.
    expect(Math.min(...v)).toBeLessThan(150)
    expect(Math.max(...v)).toBeGreaterThan(200)
  })
})

describe('weather map (Cloud Fidelity II 3.3)', () => {
  const n = 64
  const tile = 12_000 // 188 m texels: fast, and still several cells across
  const map = buildWeather(n, 5, tile)
  const at = (x: number, y: number, c: number) => map[(y * n + x) * 4 + c]!
  it('is deterministic and RGBA', () => {
    expect(map.length).toBe(n * n * 4)
    expect(buildWeather(n, 5, tile)).toEqual(map)
    expect(buildWeather(n, 6, tile)).not.toEqual(map)
  })
  it('tiles: opposite edges are neighbours, not a seam', () => {
    let worst = 0
    for (let y = 0; y < n; y++) worst = Math.max(worst, Math.abs(at(0, y, 0) - at(n - 1, y, 0)), Math.abs(at(y, 0, 0) - at(y, n - 1, 0)))
    // One 188 m texel of a 330 m+ bump: well under the full range.
    expect(worst).toBeLessThan(140)
  })
  it('has separate clouds: peaks at 255-scale centers, gaps at zero, types and tops spread', () => {
    const r = Array.from({ length: n * n }, (_, i) => map[i * 4]!)
    expect(Math.max(...r)).toBeGreaterThan(200)
    // Gaps between clouds carry no potential at all.
    expect(r.filter((v) => v === 0).length / r.length).toBeGreaterThan(0.03)
    const g = Array.from({ length: n * n }, (_, i) => map[i * 4 + 1]!)
    const b = Array.from({ length: n * n }, (_, i) => map[i * 4 + 2]!)
    expect(Math.max(...g) - Math.min(...g)).toBeGreaterThan(100)
    expect(Math.max(...b) - Math.min(...b)).toBeGreaterThan(150)
    // A texel never has more potential than the peak of the cloud it belongs to.
    for (let i = 0; i < n * n; i++) expect(map[i * 4]!).toBeLessThanOrEqual(map[i * 4 + 3]! + 1)
  })
})

const COMMITTED_SHA256: Readonly<Record<string, string>> = {
  // Paste from `sha256sum content/sky/*.gz` after `npm run sky:build`; the
  // commit that changes these says what moved and why.
  'shape.bin.gz': 'ad7af382f211d5ba09eb365d28b70a7a05c11672f107774b6a6f2d7cca8c3fbd',
  'detail.bin.gz': '3291e29dd335627ee5f58d3c21afd1fd3e5a8fd7ce96f1df25895ee5930c81bd',
  'weather.bin.gz': '4573e61f664e243b687f2ec4450acf7a01aa5e720c93b434178c2497491eaa71',
}
describe('the committed noise', () => {
  it('has the size the loader expects and the hashes the build produced', () => {
    expect(loadShape().length).toBe(shapeByteLength())
    expect(loadDetail().length).toBe(detailByteLength())
    expect(loadWeather().length).toBe(weatherByteLength())
    expect(SHAPE_SIZE).toBe(128)
    expect(DETAIL_SIZE).toBe(32)
    expect(WEATHER_SIZE).toBe(512)
    for (const [name, path] of [
      ['shape.bin.gz', shapePath()], ['detail.bin.gz', detailPath()], ['weather.bin.gz', weatherPath()],
    ] as const) {
      expect(createHash('sha256').update(readFileSync(path)).digest('hex'), name).toBe(COMMITTED_SHA256[name])
    }
  })
})
