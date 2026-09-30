import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadSkyNoise } from '../../src/render/sky/load.js'
import { CUMULUS_VOLUME_URL, CURL_NOISE_URL, WEATHER_MAP_URL, DETAIL_NOISE_URL, SHAPE_NOISE_URL } from '../../src/render/content.js'
import { cumulusPath, curlPath, weatherPath, detailPath, loadCumulus, loadCurl, loadWeather, loadDetail, loadShape, shapePath } from '../../tools/sky/load.js'

const fromDisk: typeof fetch = async (input) => {
  const url = String(input)
  const path = url.endsWith(SHAPE_NOISE_URL) ? shapePath()
    : url.endsWith(DETAIL_NOISE_URL) ? detailPath()
    : url.endsWith(CURL_NOISE_URL) ? curlPath()
    : url.endsWith(WEATHER_MAP_URL) ? weatherPath()
    : url.endsWith(CUMULUS_VOLUME_URL) ? cumulusPath()
    : null
  if (path === null) return new Response(null, { status: 404, statusText: 'not a sky file' })
  return new Response(readFileSync(path), { status: 200 })
}

describe('loadSkyNoise (Plan 16a, extended in 16d)', () => {
  it('inflates the committed volumes through the production path and agrees with the Node loader', async () => {
    const noise = await loadSkyNoise(fromDisk)
    // Byte compares, not toEqual's per-element diff: toEqual on the two 8 MB volumes took
    // 30 s each (measured 2026-09-29), 10 ms as bytes.
    const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b))
    expect(same(noise.shape, loadShape()), 'shape').toBe(true)
    expect(same(noise.detail, loadDetail()), 'detail').toBe(true)
    expect(same(noise.curl, loadCurl()), 'curl').toBe(true)
    expect(same(noise.weather, loadWeather()), 'weather').toBe(true)
    expect(same(noise.cumulus, loadCumulus()), 'cumulus').toBe(true)
  })
  it('refuses a missing file loudly', async () => {
    await expect(loadSkyNoise(async () => new Response(null, { status: 404, statusText: 'gone' }))).rejects.toThrow(/404/)
  })
})
