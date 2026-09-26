import { CUMULUS_VOLUME_URL, CURL_NOISE_URL, WEATHER_MAP_URL, DETAIL_NOISE_URL, SHAPE_NOISE_URL } from '../content.js'
import { cumulusByteLength, curlByteLength, weatherByteLength, detailByteLength, shapeByteLength } from './noise.js'
import { inflateIfGzipped } from '../gunzip.js'

export type SkyNoise = { readonly shape: Uint8Array; readonly detail: Uint8Array; readonly curl: Uint8Array; readonly weather: Uint8Array; readonly cumulus: Uint8Array }

/** Fetches and inflates the two volumes and the weather map; the length check makes a
 *  truncated or mis-built file fail here rather than as a sky full of
 *  garbage. Same gunzip path as landcover/load.ts (inflate only if the
 *  server did not), so the Node test runs the production code against the
 *  files on disk. */
export async function loadSkyNoise(fetchImpl: typeof fetch = fetch): Promise<SkyNoise> {
  const one = async (url: string, expected: number): Promise<Uint8Array> => {
    const res = await fetchImpl(url)
    if (!res.ok || res.body === null) throw new Error(`Failed to fetch cloud noise (${url}): ${res.status} ${res.statusText}`)
    const data = await inflateIfGzipped(await res.arrayBuffer())
    if (data.length !== expected) throw new Error(`${url} inflates to ${data.length} bytes; expected ${expected}`)
    return data
  }
  const [shape, detail, curl, weather, cumulus] = await Promise.all([
    one(SHAPE_NOISE_URL, shapeByteLength()),
    one(DETAIL_NOISE_URL, detailByteLength()),
    one(CURL_NOISE_URL, curlByteLength()),
    one(WEATHER_MAP_URL, weatherByteLength()),
    one(CUMULUS_VOLUME_URL, cumulusByteLength()),
  ])
  return { shape, detail, curl, weather, cumulus }
}
