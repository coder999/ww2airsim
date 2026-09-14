import terrainHeader from '../../../content/terrain/header.json' with { type: 'json' }
import { FINEST_FETCHED_LEVEL, terrainLevelUrl } from '../content.js'
import { parseTerrainHeader, samplesAtLevel } from '../../sim/world/schema.js'

/**
 * The browser side of `tools/terrain/load.ts`: the same bytes, fetched
 * instead of read, and validated against the same header schema so the two
 * paths cannot disagree about what a level is.
 *
 * The header is imported rather than fetched. It is 152 bytes, Vite inlines
 * a JSON import into the bundle, and `src/render/terrain/lod.ts` already
 * does exactly this -- so the mesh's grid sizes and the LOD's world extent
 * come from one copy of one file, and there is no "the header 404'd" state
 * to design a failure screen for.
 */
export const TERRAIN_HEADER = parseTerrainHeader(terrainHeader)

/**
 * Decode one pyramid level from its on-disk bytes: int16 decimetres,
 * little-endian, row-major, row 0 = NORTH edge, column 0 = WEST edge
 * (`tools/terrain/resample.ts`'s orientation, restated at every boundary it
 * crosses because a mirrored world looks like plausible terrain rather than
 * like a bug).
 *
 * `expectedSamples` is the grid EDGE, not the sample count. A buffer of any
 * other length is rejected rather than decoded into whatever square it
 * happens to fit: a short or stale level read as a smaller grid is silently
 * misindexed and draws as terrain with a torn edge, which reads as a shader
 * bug and not as bad content (spec §9's "fail loudly", and the same check
 * `loadTerrainLevel` makes on the Node side).
 *
 * Read through a `DataView` with an explicit `littleEndian: true` rather
 * than as a zero-copy `new Int16Array(bytes)`, which would be the host's
 * endianness and would silently byte-swap every sample on a big-endian
 * machine. `tools/terrain/load.ts` solves the same problem by probing the
 * host and swapping; this states it in the read itself, which needs no
 * second copy of the probe in a tree that must stay browser-loadable. The
 * cost is one call per sample -- 350k calls for the whole committed
 * pyramid, measured at a few milliseconds, against a 526 KB network fetch.
 */
export function decodeLevel(bytes: ArrayBuffer, expectedSamples: number): Int16Array {
  const expectedBytes = expectedSamples * expectedSamples * 2
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(
      `terrain level has length ${bytes.byteLength} bytes; ` +
        `${expectedSamples}x${expectedSamples} int16 samples is ${expectedBytes} bytes`,
    )
  }
  const view = new DataView(bytes)
  const out = new Int16Array(expectedSamples * expectedSamples)
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getInt16(i * 2, true)
  }
  return out
}

/**
 * Fetch every committed pyramid level, coarsest first, handing each to
 * `onLevel` as it lands.
 *
 * Coarsest first is the whole point: L12 is 18 bytes and L11 is 50, so the
 * world has its shape before the first frame is drawn, and each finer level
 * replaces it in place (design §10, "the aeroplane flies over recognisable
 * terrain within ~100 KB" -- L12..L6 together are 44 KB). L4, the finest
 * committed level, is 526 KB and arrives last.
 *
 * Sequentially rather than in parallel, awaiting each: the ordering above is
 * the requirement, and nine concurrent fetches resolving in arrival order
 * would let L4 overwrite L5 and then be overwritten BY L5 on a slow link --
 * the coarse level would win, permanently, and look exactly like a mip
 * selection bug. The cost is nine round-trips instead of one; the whole
 * pyramid is 703 KB.
 *
 * A level that will not load throws. Carrying on would leave the aeroplane
 * over a sea with no islands in it, which is indistinguishable from the
 * game working (spec §9).
 */
export async function loadTerrainProgressively(
  onLevel: (level: number, data: Int16Array) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (let level = TERRAIN_HEADER.levels - 1; level >= FINEST_FETCHED_LEVEL; level--) {
    const url = terrainLevelUrl(level)
    const res = await fetchImpl(url)
    if (!res.ok) {
      throw new Error(`Failed to fetch terrain level ${level} (${url}): ${res.status} ${res.statusText}`)
    }
    onLevel(level, decodeLevel(await res.arrayBuffer(), samplesAtLevel(TERRAIN_HEADER, level)))
  }
}
