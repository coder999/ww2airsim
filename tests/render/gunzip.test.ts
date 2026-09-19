import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { inflateIfGzipped } from '../../src/render/gunzip.js'
import { loadSkyNoise } from '../../src/render/sky/load.js'
import { loadCover } from '../../src/render/landcover/load.js'
import { COVER_URL, DETAIL_NOISE_URL, SHAPE_NOISE_URL } from '../../src/render/content.js'
import { detailPath, shapePath, loadShape } from '../../tools/sky/load.js'
import { coverPath } from '../../tools/landcover/load.js'

/** A server that, like Vite's, inflates a `.gz` before handing it over. */
const inflatingServer: typeof fetch = async (input) => {
  const url = String(input)
  const path = url.endsWith(SHAPE_NOISE_URL) ? shapePath() : url.endsWith(DETAIL_NOISE_URL) ? detailPath() : url.endsWith(COVER_URL) ? coverPath() : null
  if (path === null) return new Response(null, { status: 404 })
  return new Response(gunzipSync(readFileSync(path)), { status: 200, headers: { 'content-encoding': 'gzip' } })
}
/** A server that, like nginx, sends the bytes as they are on disk. */
const rawServer: typeof fetch = async (input) => {
  const url = String(input)
  const path = url.endsWith(SHAPE_NOISE_URL) ? shapePath() : url.endsWith(DETAIL_NOISE_URL) ? detailPath() : url.endsWith(COVER_URL) ? coverPath() : null
  if (path === null) return new Response(null, { status: 404 })
  return new Response(readFileSync(path), { status: 200 })
}

describe('inflateIfGzipped (2026-09-19)', () => {
  it('inflates gzip bytes and passes anything else through untouched', async () => {
    const raw = readFileSync(shapePath())
    expect(await inflateIfGzipped(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))).toEqual(loadShape())
    const plain = new Uint8Array([190, 187, 1, 2, 3])
    expect(await inflateIfGzipped(plain.buffer)).toEqual(plain)
  })
  it('loads the sky noise and the land cover from BOTH kinds of server', async () => {
    const viaInflating = await loadSkyNoise(inflatingServer)
    const viaRaw = await loadSkyNoise(rawServer)
    expect(viaInflating.shape).toEqual(viaRaw.shape)
    expect(viaInflating.detail).toEqual(viaRaw.detail)
    // The dev server has inflated the land cover before every session since
    // 2026-09-18, and the old loader failed on it with a console warning.
    expect(await loadCover(inflatingServer)).toEqual(await loadCover(rawServer))
  })
})
