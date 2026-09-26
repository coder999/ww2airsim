import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildCurl, buildShape, createPermutation, perlinTileable, remap, worleyTileable } from '../../tools/sky/noise.js'
import { buildWeather } from '../../tools/sky/weather.js'
import { curlPath, detailPath, shapePath, weatherPath, loadCumulus, loadCurl, loadDetail, loadShape, loadWeather } from '../../tools/sky/load.js'
import {
  CURL_SIZE, DETAIL_SIZE, SHAPE_SIZE, WEATHER_CELL_REACH, WEATHER_CELL_SPACING_M, WEATHER_FEATURE_STEPS, WEATHER_RADIUS_M, WEATHER_SIZE, cumulusByteLength, curlByteLength, detailByteLength, shapeByteLength, weatherByteLength,
} from '../../src/render/sky/noise.js'

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
  it('is deterministic: two RGBA planes, winner then runner-up', () => {
    expect(map.length).toBe(n * n * 8)
    expect(buildWeather(n, 5, tile)).toEqual(map)
    expect(buildWeather(n, 6, tile)).not.toEqual(map)
  })
  it('tiles: opposite edges are neighbours, not a seam', () => {
    let worst = 0
    for (let y = 0; y < n; y++) worst = Math.max(worst, Math.abs(at(0, y, 0) - at(n - 1, y, 0)), Math.abs(at(y, 0, 0) - at(y, n - 1, 0)))
    // One 188 m texel of a 330 m+ bump: well under the full range.
    expect(worst).toBeLessThan(140)
  })
  it('decodes one centre per cloud: every texel of a cloud names the same feature point', () => {
    // The shader's decode (cloudField.ts), in f32: the centre is the texel's
    // grid cell minus the reach, plus G/B in 1/51-cell steps. A cloud whose
    // texels disagreed would be cut into texel-sized blocks, the defect of
    // the first 2026-09-25 GPU capture.
    const cells = Math.round(tile / WEATHER_CELL_SPACING_M), cellM = tile / cells
    const f = Math.fround
    const centres = new Map<string, Set<string>>()
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const gx = Math.floor(f(f(2 * x + 1) * cells) / (2 * n)), gz = Math.floor(f(f(2 * y + 1) * cells) / (2 * n))
      const cx = f(f((gx - WEATHER_CELL_REACH) * cellM) + f(at(x, y, 1) * f(cellM / WEATHER_FEATURE_STEPS)))
      const cz = f(f((gz - WEATHER_CELL_REACH) * cellM) + f(at(x, y, 2) * f(cellM / WEATHER_FEATURE_STEPS)))
      // Modulo the tile: a cloud straddling the edge is one cloud.
      const key = `${((cx % tile) + tile) % tile | 0},${((cz % tile) + tile) % tile | 0}`
      const seen = centres.get(key) ?? new Set<string>()
      seen.add(`${at(x, y, 0)},${at(x, y, 3)}`)
      centres.set(key, seen)
      // The centre lies within reach of the texel, never across the tile.
      const px = (x + 0.5) * (tile / n), pz = (y + 0.5) * (tile / n)
      expect(Math.hypot(px - cx, pz - cz)).toBeLessThan(2 * WEATHER_RADIUS_M[1] + cellM)
    }
    // Each decoded centre carries one strength and one radius: it is one cloud.
    for (const seen of centres.values()) expect(seen.size).toBe(1)
    expect(centres.size).toBeGreaterThan(cells * cells * 0.5)
    expect(centres.size).toBeLessThanOrEqual(cells * cells)
  })
  it('spreads strength and radius across the clouds', () => {
    const r = Array.from({ length: n * n }, (_, i) => map[i * 4]!)
    const a = Array.from({ length: n * n }, (_, i) => map[i * 4 + 3]!)
    expect(Math.max(...r)).toBeGreaterThan(200)
    expect(Math.max(...r) - Math.min(...r)).toBeGreaterThan(100)
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(150)
  })
})

const COMMITTED_SHA256: Readonly<Record<string, string>> = {
  // Paste from `sha256sum content/sky/*.gz` after `npm run sky:build`; the
  // commit that changes these says what moved and why.
  'shape.bin.gz': 'db3f0d914ecd9bc1e58e2f2a355b140550856a63be60c0bf7d0a74df0630930c',
  'detail.bin.gz': 'f77f343e6dd4b465041bf73f25baff1b2ab04ca6d34f2b9f366e59e54c15d044',
  'curl.bin.gz': '24a66985d15abe3d1005d76c245477221460a780260b239bce741f9e0054c970',
  'weather.bin.gz': '3e514822e809731d1479f2007ef541f127de2b6f941ab9f3bdb231048b836af3',
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
    expect(WEATHER_SIZE).toBe(1024)
    for (const [name, path] of [
      ['shape.bin.gz', shapePath()], ['detail.bin.gz', detailPath()], ['curl.bin.gz', curlPath()], ['weather.bin.gz', weatherPath()],
    ] as const) {
      expect(createHash('sha256').update(readFileSync(path)).digest('hex'), name).toBe(COMMITTED_SHA256[name])
    }
  })
  it('holds the cumulus volume tools/sky/cumulus.py builds', () => {
    // Pinned on the INFLATED bytes: Python's gzip wrapper is not the one the
    // TypeScript build uses, so the .gz hash would move with zlib versions.
    // Paste from `zcat content/sky/cumulus.bin.gz | sha256sum` after
    // `python3 tools/sky/cumulus.py`.
    const raw = loadCumulus()
    expect(raw.length).toBe(cumulusByteLength())
    expect(createHash('sha256').update(raw).digest('hex')).toBe('305ab474550270210f67b28fc8339b4aefeaf82482c60944639dd5e8352f4dcf')
  })
})
