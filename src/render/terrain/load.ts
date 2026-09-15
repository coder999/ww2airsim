import terrainHeader from '../../../content/terrain/header.json' with { type: 'json' }
import { FINEST_FETCHED_LEVEL, terrainLevelUrl } from '../content.js'
import { parseTerrainHeader, samplesAtLevel } from '../../sim/world/schema.js'
import { createTerrainField, type TerrainField } from '../../sim/world/terrain.js'
import { LOD } from './lod.js'

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
 * The coarsest level anything actually draws, and therefore the coarsest
 * level worth asking the network for.
 *
 * `ring k samples mip k` (mesh.ts's `sampleLevelsForRing`), and the coarsest
 * ring is `LOD.rings - 1 = 7`, which morphs toward mip 8. Levels 9-12 exist
 * in the pyramid -- `tools/terrain/mips.ts` builds down to 3x3 -- but no ring
 * can ever sample them, so fetching them cost four serial round-trips before
 * anything could appear and bought nothing (review 2026-09-14, M5).
 *
 * Derived from `LOD.rings` rather than written as an 8, and
 * tests/render/terrainLoad.test.ts asserts the set of levels fetched is
 * exactly the set of levels the rings sample -- so raising `rings` cannot
 * leave the renderer asking for a level it never fetched.
 */
const COARSEST_FETCHED_LEVEL = Math.min(LOD.rings, TERRAIN_HEADER.levels - 1)

/**
 * The pyramid level the PHYSICS gets, out of the levels the renderer loads.
 *
 * Returns a `TerrainField` for that one level and `null` for every other, so
 * `main.ts` can hand every decoded level to the mesh and only this one to
 * `World.terrain`.
 *
 * The finest fetched level, and deliberately not "whatever arrived most
 * recently": levels land coarsest-first, and a coarse level is not merely
 * blurry, it is a heightfield whose peaks have been averaged DOWN and whose
 * valleys have been averaged UP. `advance` records the first impact and never
 * overwrites it (loop.ts's `impact` field), so a coarse field that puts
 * ground above the aeroplane for half a second would stick a crash on the
 * flight permanently. The mesh can afford a wrong-but-improving surface; the
 * physics cannot. It is also the level `tests/sim/soak.test.ts` and
 * `tests/sim/terrainContact.test.ts` already exercise
 * (`FIRST_COMMITTED_LEVEL`), so the app flies over the ground those tests
 * measured rather than a different one.
 *
 * Cost: the decoded `Int16Array` is retained for the life of the process --
 * 526 KB at level 4 -- alongside the mesh's own float copy of the same
 * samples. Sharing the array rather than copying it is safe because nothing
 * downstream writes to it (`heightAt` only reads).
 */
export function physicsFieldFor(level: number, data: Int16Array): TerrainField | null {
  if (level !== FINEST_FETCHED_LEVEL) return null
  return createTerrainField(TERRAIN_HEADER, level, data)
}

/**
 * Fetch every pyramid level the renderer can draw, coarsest first, handing
 * each to `onLevel` as it lands.
 *
 * Coarsest first is the whole point: the coarse levels are tiny (L8 is 2,178
 * bytes, L7 8,450) so the far field has its shape almost immediately, and
 * each finer level lands in its own texture for the rings that read it
 * (design §10, "the aeroplane flies over recognisable terrain within ~100
 * KB" -- L8..L6 together are 43,910 bytes). L4, the finest, is 526,338 of the
 * 702,346 bytes fetched and arrives last, which is why the ground near the
 * aeroplane fills in after the horizon does.
 *
 * Sequentially rather than in parallel, awaiting each: the ordering above is
 * the requirement, and five concurrent fetches resolving in arrival order
 * would let L4 land and then be overwritten BY L5 on a slow link -- the
 * coarse level would win, permanently, and look exactly like a mip selection
 * bug. The cost is five round-trips instead of one.
 *
 * A level that will not load throws. Carrying on would leave the aeroplane
 * over a sea with no islands in it, which is indistinguishable from the
 * game working (spec §9).
 */
export async function loadTerrainProgressively(
  onLevel: (level: number, data: Int16Array) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (let level = COARSEST_FETCHED_LEVEL; level >= FINEST_FETCHED_LEVEL; level--) {
    const url = terrainLevelUrl(level)
    const res = await fetchImpl(url)
    if (!res.ok) {
      throw new Error(`Failed to fetch terrain level ${level} (${url}): ${res.status} ${res.statusText}`)
    }
    onLevel(level, decodeLevel(await res.arrayBuffer(), samplesAtLevel(TERRAIN_HEADER, level)))
  }
}
