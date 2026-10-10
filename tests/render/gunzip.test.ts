import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { inflateIfGzipped } from '../../src/render/gunzip.js'
import { loadSkyNoise } from '../../src/render/sky/load.js'
import { loadCover } from '../../src/render/landcover/load.js'
import { COVER_URL, CUMULUS_VOLUME_URL, CURL_NOISE_URL, WEATHER_MAP_URL, DETAIL_NOISE_URL, SHAPE_NOISE_URL } from '../../src/render/content.js'
import { cumulusPath, curlPath, weatherPath, detailPath, shapePath, loadShape } from '../../tools/sky/load.js'
import { coverPath } from '../../tools/landcover/load.js'
import { loadTerrainProgressively } from '../../src/render/terrain/load.js'
import { loadTerrainLevel, terrainLevelPath } from '../../tools/terrain/load.js'

/** The terrain level a URL names, or null (gzipped since L1.1a, 2026-10-10). */
const terrainPath = (url: string): string | null => {
  const m = /\/content\/terrain\/L(\d+)\.bin\.gz$/.exec(url)
  return m === null ? null : terrainLevelPath(Number(m[1]))
}

/** A server that, like Vite's, inflates a `.gz` before handing it over. */
const inflatingServer: typeof fetch = async (input) => {
  const url = String(input)
  const path = url.endsWith(SHAPE_NOISE_URL) ? shapePath()
    : url.endsWith(DETAIL_NOISE_URL) ? detailPath()
    : url.endsWith(CURL_NOISE_URL) ? curlPath()
    : url.endsWith(WEATHER_MAP_URL) ? weatherPath()
    : url.endsWith(CUMULUS_VOLUME_URL) ? cumulusPath()
    : url.endsWith(COVER_URL) ? coverPath()
    : terrainPath(url)
  if (path === null) return new Response(null, { status: 404 })
  return new Response(gunzipSync(readFileSync(path)), { status: 200, headers: { 'content-encoding': 'gzip' } })
}
/** A server that, like nginx, sends the bytes as they are on disk. */
const rawServer: typeof fetch = async (input) => {
  const url = String(input)
  const path = url.endsWith(SHAPE_NOISE_URL) ? shapePath()
    : url.endsWith(DETAIL_NOISE_URL) ? detailPath()
    : url.endsWith(CURL_NOISE_URL) ? curlPath()
    : url.endsWith(WEATHER_MAP_URL) ? weatherPath()
    : url.endsWith(CUMULUS_VOLUME_URL) ? cumulusPath()
    : url.endsWith(COVER_URL) ? coverPath()
    : terrainPath(url)
  if (path === null) return new Response(null, { status: 404 })
  return new Response(readFileSync(path), { status: 200 })
}

/** Byte equality without toEqual's per-element diff, which spent about 110 s on
 *  these multi-megabyte volumes (measured 2026-10-08) to say the same thing. */
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b))

describe('inflateIfGzipped (2026-09-19)', () => {
  it('inflates gzip bytes and passes anything else through untouched', async () => {
    const raw = readFileSync(shapePath())
    expect(sameBytes(await inflateIfGzipped(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)), loadShape())).toBe(true)
    const plain = new Uint8Array([190, 187, 1, 2, 3])
    expect(await inflateIfGzipped(plain.buffer)).toEqual(plain)
  }, 120_000)
  it('loads the sky noise and the land cover from BOTH kinds of server', async () => {
    const viaInflating = await loadSkyNoise(inflatingServer)
    const viaRaw = await loadSkyNoise(rawServer)
    for (const volume of ['shape', 'detail', 'curl', 'weather', 'cumulus'] as const) {
      expect(sameBytes(viaInflating[volume], viaRaw[volume]), volume).toBe(true)
    }
    // The dev server has inflated the land cover before every session since
    // 2026-09-18, and the old loader failed on it with a console warning.
    expect(sameBytes(await loadCover(inflatingServer), await loadCover(rawServer))).toBe(true)
  }, 120_000)
  it('loads the terrain levels from BOTH kinds of server, to the samples Node reads', async () => {
    // L1.1a (2026-10-10). Down to L2 only, to keep the file cheap: L1 and L0
    // take the same path at 4 and 16 times the bytes.
    const levels = (fetchImpl: typeof fetch) => {
      const out = new Map<number, Int16Array>()
      return loadTerrainProgressively((level, data) => out.set(level, data), 2, fetchImpl).then(() => out)
    }
    const viaInflating = await levels(inflatingServer)
    const viaRaw = await levels(rawServer)
    expect(viaRaw.size).toBeGreaterThan(5)
    for (const [level, data] of viaRaw) {
      const node = new Uint8Array(loadTerrainLevel(level).buffer)
      expect(sameBytes(new Uint8Array(data.buffer), node), `L${level} raw`).toBe(true)
      expect(sameBytes(new Uint8Array(viaInflating.get(level)!.buffer), node), `L${level} inflated`).toBe(true)
    }
  }, 120_000)
})
