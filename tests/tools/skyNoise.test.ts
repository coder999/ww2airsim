import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildCurl, buildShape, createPermutation, perlinTileable, remap, worleyTileable } from '../../tools/sky/noise.js'
import { buildWeather } from '../../tools/sky/weather.js'
import { curlPath, detailPath, shapePath, weatherPath, loadCurl, loadDetail, loadShape, loadWeather } from '../../tools/sky/load.js'
import { CURL_SIZE, DETAIL_SIZE, SHAPE_SIZE, WEATHER_SIZE, curlByteLength, detailByteLength, shapeByteLength, weatherByteLength } from '../../src/render/sky/noise.js'

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
    expect(v.length).toBe(n * n * n * 4)
    const at = (x: number, y: number, z: number, c = 0) => v[((z * n + y) * n + x) * 4 + c]!
    // Column 0 and column n-1 are adjacent samples under wrapping, so they
    // differ by one texel's worth of the field, never by a seam.
    let worst = 0
    for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) worst = Math.max(worst, Math.abs(at(0, y, z) - at(n - 1, y, z)))
    expect(worst).toBeLessThan(60)
    // The remap lifts the low end on purpose (Schneider 2015): the committed
    // 128-cube spans 110..247. Coverage thresholds it later.
    const body = Array.from({ length: n ** 3 }, (_, i) => v[i * 4]!)
    expect(Math.min(...body)).toBeLessThan(150)
    expect(Math.max(...body)).toBeGreaterThan(200)
    for (const channel of [1, 2, 3]) expect(new Set(Array.from({ length: n ** 3 }, (_, i) => v[i * 4 + channel]!)).size).toBeGreaterThan(32)
  })
  it('builds a deterministic, signed, tileable curl field', () => {
    const n = 32
    const curl = buildCurl(n, 9)
    expect(curl.length).toBe(n * n * 2)
    expect(buildCurl(n, 9)).toEqual(curl)
    expect(buildCurl(n, 10)).not.toEqual(curl)
    const at = (x: number, y: number, c: number) => curl[(y * n + x) * 2 + c]!
    let worst = 0
    for (let i = 0; i < n; i++) for (const c of [0, 1]) {
      worst = Math.max(worst, Math.abs(at(0, i, c) - at(n - 1, i, c)), Math.abs(at(i, 0, c) - at(i, n - 1, c)))
    }
    expect(worst).toBeLessThan(110)
    expect(Math.min(...curl)).toBeLessThan(80)
    expect(Math.max(...curl)).toBeGreaterThan(175)
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
  'shape.bin.gz': 'db3f0d914ecd9bc1e58e2f2a355b140550856a63be60c0bf7d0a74df0630930c',
  'detail.bin.gz': 'f77f343e6dd4b465041bf73f25baff1b2ab04ca6d34f2b9f366e59e54c15d044',
  'curl.bin.gz': '24a66985d15abe3d1005d76c245477221460a780260b239bce741f9e0054c970',
  'weather.bin.gz': '4573e61f664e243b687f2ec4450acf7a01aa5e720c93b434178c2497491eaa71',
}
describe('the committed noise', () => {
  it('has the size the loader expects and the hashes the build produced', () => {
    expect(loadShape().length).toBe(shapeByteLength())
    expect(loadDetail().length).toBe(detailByteLength())
    expect(loadCurl().length).toBe(curlByteLength())
    expect(loadWeather().length).toBe(weatherByteLength())
    expect(SHAPE_SIZE).toBe(128)
    expect(DETAIL_SIZE).toBe(64)
    expect(CURL_SIZE).toBe(128)
    expect(WEATHER_SIZE).toBe(512)
    for (const [name, path] of [
      ['shape.bin.gz', shapePath()], ['detail.bin.gz', detailPath()], ['curl.bin.gz', curlPath()], ['weather.bin.gz', weatherPath()],
    ] as const) {
      expect(createHash('sha256').update(readFileSync(path)).digest('hex'), name).toBe(COMMITTED_SHA256[name])
    }
  })
})
