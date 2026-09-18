import coverHeader from '../../../content/landcover/header.json' with { type: 'json' }
import { COVER_URL } from '../content.js'
import { coverByteLength, parseCoverHeader } from './cover.js'

export const COVER_HEADER = parseCoverHeader(coverHeader)

/**
 * Fetches and inflates the land-cover raster. `DecompressionStream` is in
 * every browser this game runs in (WebGPU implies Chromium 113+), and in
 * node 18+, which is what lets the unit test exercise this exact path.
 * The length check mirrors terrain/load.ts's decodeLevel: a truncated or
 * mis-built file fails loudly here, not as a green island.
 */
export async function loadCover(fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const res = await fetchImpl(COVER_URL)
  if (!res.ok || res.body === null) {
    throw new Error(`Failed to fetch land cover (${COVER_URL}): ${res.status} ${res.statusText}`)
  }
  const inflated = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  const data = new Uint8Array(inflated)
  const expected = coverByteLength(COVER_HEADER)
  if (data.length !== expected) throw new Error(`land cover inflates to ${data.length} bytes; expected ${expected}`)
  return data
}
