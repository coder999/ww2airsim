import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadSkyNoise } from '../../src/render/sky/load.js'
import { WEATHER_MAP_URL, DETAIL_NOISE_URL, SHAPE_NOISE_URL } from '../../src/render/content.js'
import { weatherPath, detailPath, loadWeather, loadDetail, loadShape, shapePath } from '../../tools/sky/load.js'

const fromDisk: typeof fetch = async (input) => {
  const url = String(input)
  const path = url.endsWith(SHAPE_NOISE_URL) ? shapePath()
    : url.endsWith(DETAIL_NOISE_URL) ? detailPath()
    : url.endsWith(WEATHER_MAP_URL) ? weatherPath()
    : null
  if (path === null) return new Response(null, { status: 404, statusText: 'not a sky file' })
  return new Response(readFileSync(path), { status: 200 })
}

describe('loadSkyNoise (Plan 16a, extended in 16d)', () => {
  it('inflates the committed volumes through the production path and agrees with the Node loader', async () => {
    const noise = await loadSkyNoise(fromDisk)
    expect(noise.shape).toEqual(loadShape())
    expect(noise.detail).toEqual(loadDetail())
    expect(noise.weather).toEqual(loadWeather())
  })
  it('refuses a missing file loudly', async () => {
    await expect(loadSkyNoise(async () => new Response(null, { status: 404, statusText: 'gone' }))).rejects.toThrow(/404/)
  })
})
