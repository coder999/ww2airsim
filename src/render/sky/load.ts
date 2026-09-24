import { COVERAGE_NOISE_URL, DETAIL_NOISE_URL, SHAPE_NOISE_URL } from '../content.js'
import { coverageByteLength, detailByteLength, shapeByteLength } from './noise.js'
import { inflateIfGzipped } from '../gunzip.js'

export type SkyNoise = { readonly shape: Uint8Array; readonly detail: Uint8Array; readonly coverage: Uint8Array }

/** Fetches and inflates all three volumes; the length check makes a
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
  const [shape, detail, coverage] = await Promise.all([
    one(SHAPE_NOISE_URL, shapeByteLength()),
    one(DETAIL_NOISE_URL, detailByteLength()),
    one(COVERAGE_NOISE_URL, coverageByteLength()),
  ])
  return { shape, detail, coverage }
}
