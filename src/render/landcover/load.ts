import coverHeader from '../../../content/landcover/header.json' with { type: 'json' }
import { COVER_URL } from '../content.js'
import { coverByteLength, parseCoverHeader, type CoverHeader } from './cover.js'
import { TERRAIN_HEADER } from '../terrain/load.js'

export const COVER_HEADER = parseCoverHeader(coverHeader)

/**
 * `parseCoverHeader` (cover.ts) only checks the raster's own shape -- it
 * cannot know the sim grid without importing `tools/` or coupling a
 * browser-safe module to the terrain, which is exactly what `cover.ts`'s own
 * doc comment rules out. So the cross-check lives here instead, one level
 * up, against the terrain's own committed header, which is generated from
 * the same `WORLD_CENTRE`/`GRID` constants (`tools/terrain/resample.ts`) as
 * the cover raster's build (`tools/landcover/build.ts`) and already ships
 * alongside it. Without this, a land-cover raster rebuilt on a different
 * centre or extent would load and paint silently misaligned (whole-branch
 * review, 2026-09-18) -- `parseCoverHeader`'s schema has no way to catch
 * that, because a header describing the wrong box is still a
 * perfectly-shaped header.
 *
 * `src/render/terrain/load.ts` has no import of anything under
 * `landcover/`, so importing it here does not cycle; it is already pulled
 * into the same bundle by `main.ts` and is imported by several node-run
 * tests (`terrainLoad.test.ts`, `scenery.test.ts`) with no DOM or GPU
 * involved, so pulling its one pure `TERRAIN_HEADER` constant in here adds
 * no new runtime dependency the app did not already have.
 */
export function assertSameBoxAsTerrain(
  cover: CoverHeader,
  terrain: Pick<typeof TERRAIN_HEADER, 'centreLatDeg' | 'centreLonDeg' | 'halfExtentM'>,
): void {
  if (
    cover.centreLatDeg !== terrain.centreLatDeg ||
    cover.centreLonDeg !== terrain.centreLonDeg ||
    cover.halfExtentM !== terrain.halfExtentM
  ) {
    throw new Error(
      `land cover header describes a different box than the terrain: cover centre ` +
        `(${cover.centreLatDeg}, ${cover.centreLonDeg}) half-extent ${cover.halfExtentM} m vs terrain centre ` +
        `(${terrain.centreLatDeg}, ${terrain.centreLonDeg}) half-extent ${terrain.halfExtentM} m`,
    )
  }
}
assertSameBoxAsTerrain(COVER_HEADER, TERRAIN_HEADER)

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
