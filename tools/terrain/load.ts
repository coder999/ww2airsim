// Node-side reader for the built terrain: the twin of tools/content/load.ts,
// and for the same reason (Finding I1) -- `node:fs` and `import.meta.url` must
// not be reachable from `src/sim/`, which has to load in a browser. The browser
// path fetches these same files and parses them with `src/sim/world/schema.ts`,
// which this module also uses, so the two paths cannot disagree about the
// header's shape.
//
// `loadTerrainField` is deliberately NOT here: it returns `TerrainField`, a
// type Task 7 defines, and a task may not depend on a type from a later one.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseTerrainHeader, samplesAtLevel, type TerrainHeader } from '../../src/sim/world/schema.js'

/** `content/terrain/`, resolved relative to this file rather than
 *  `process.cwd()`, so a test run from any directory reads the same bytes. */
export const TERRAIN_DIR = fileURLToPath(new URL('../../content/terrain/', import.meta.url))

/** `content/terrain/tiles/`, a gitignored scratch directory
 *  `tools/terrain/build.ts` writes debug artefacts into (e.g. `L6-preview.png`).
 *  Until Task 2 (2026-09-24) it also held the uncommitted L0/L1 mips; both
 *  are committed now (L0 via Git LFS, over GitHub's 100 MB per-file limit),
 *  so nothing `terrainLevelPath` resolves lives here any more -- see
 *  `FIRST_COMMITTED_LEVEL` below. */
export const TILES_DIR = fileURLToPath(new URL('../../content/terrain/tiles/', import.meta.url))

/**
 * The finest level that IS committed -- 0, since Task 2 (2026-09-24)
 * committed L0 and L1 alongside the rest of the pyramid. Levels 0-1 are
 * 134,250,498 and 33,570,818 bytes (n^2 * 2 bytes for n = 8193, 4097);
 * levels 2-12 together are 11,201,206 bytes, dominated by L2's 8.4 MB and
 * L3's 2.1 MB -- 179,022,522 bytes committed in total, nothing left
 * uncommitted below it.
 *
 * Before Task 2, this was 2: moved from 4 to 2 on 2026-09-18, because L4's
 * 391 m spacing meant the axis-aligned blocks and rectangular water strips
 * along the shore WERE the L4 grid, and no rule applied at L4 could remove
 * them (Plan 13c tried moving the shoreline into the DEM at 24 m and letting
 * `buildPyramid` carry it down; `halve` is a [1,2,1] tent filter and does not
 * preserve a binary land/sea boundary, so the before and after frames on the
 * reference GPU were indistinguishable, measured 2026-09-18, net -203 land
 * cells at L4). Shipping L2 at 98 m cut the visible step 4x; shipping L0 at
 * 24 m (this change) cuts it a further ~4x again, though the same
 * axis-aligned-grid argument still applies at whatever the finest shipped
 * level's spacing is -- it is smaller now, not gone.
 */
export const FIRST_COMMITTED_LEVEL = 0

/** Absolute path of a level's `.bin`. Levels below `FIRST_COMMITTED_LEVEL`
 *  would live in the gitignored `tiles/` subdirectory; since that boundary is
 *  now 0, every level is committed alongside `header.json` and this branch is
 *  unreachable in practice -- kept because a future level below L0 (a finer
 *  DEM resample) would still need the split, and because `TILES_DIR` remains
 *  a real, distinct directory (see its own doc comment). */
export function terrainLevelPath(level: number): string {
  const dir = level < FIRST_COMMITTED_LEVEL ? TILES_DIR : TERRAIN_DIR
  return `${dir}L${level}.bin`
}

export function terrainHeaderPath(): string {
  return `${TERRAIN_DIR}header.json`
}

export function loadTerrainHeader(): TerrainHeader {
  const path = terrainHeaderPath()

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read terrain header (${path}): ${message} -- run \`npm run terrain:build\``)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse terrain header (${path}) as JSON: ${message}`)
  }

  return parseTerrainHeader(json)
}

/**
 * Whether `level`'s committed `.bin` is the REAL content, not an unsmudged
 * Git LFS pointer -- the state a checkout gets from a plain
 * `actions/checkout@v5` with no `lfs: true` (or a manual clone before `git
 * lfs pull`). A pointer is ~130 bytes of text (`version https://git-lfs...`);
 * the real file is exactly `samplesAtLevel(header, level) ** 2 * 2` bytes.
 *
 * Only `L0.bin` can actually be a pointer today -- it is the only path
 * `.gitattributes` tracks with `filter=lfs` (`L1.bin` and everything coarser
 * are plain git blobs, always real on any checkout) -- but this takes any
 * level so a caller does not have to know that split.
 *
 * Exists because CI (`ci.yml`, `nightly-soak.yml`) deliberately does NOT set
 * `lfs: true` on its checkout -- that would fetch L0.bin (134 MB) on every
 * push and PR, a real bandwidth cost against GitHub LFS's free 1 GB/month
 * quota, for a check `deploy.yml` (which DOES `lfs: true`, low-frequency,
 * gating an actual release) already makes for real. Tests that need L0's
 * ACTUAL bytes use this to skip with a named reason instead of throwing
 * `loadTerrainLevel`'s length-guard error, which reads exactly like data
 * corruption rather than "this environment did not fetch LFS content" --
 * see `tests/render/terrainLod.test.ts`'s `haveFinestMip`,
 * `tests/tools/terrainBuild.test.ts`'s `haveRealL0`, and
 * `tests/build/dist.test.ts`'s L0 byte-count assertion.
 */
export function hasRealLevelFile(level: number, header: TerrainHeader = loadTerrainHeader()): boolean {
  const path = terrainLevelPath(level)
  if (!existsSync(path)) return false
  const n = samplesAtLevel(header, level)
  return statSync(path).size === n * n * 2
}

/**
 * Read one pyramid level as int16 decimetres, row-major, row 0 = NORTH edge,
 * column 0 = WEST edge (the orientation `resample.ts` and `mips.ts` establish;
 * a mirrored world looks like plausible terrain rather than like a bug, so it
 * is restated at every boundary it crosses).
 *
 * The file's length is checked against the header rather than trusted: a
 * truncated or stale level would otherwise be read as a valid grid of the
 * wrong size and silently misindexed, which is spec §9's "fail loudly"
 * case -- the terrain equivalent of the NaN that teleports the airplane.
 */
export function loadTerrainLevel(level: number, header: TerrainHeader = loadTerrainHeader()): Int16Array {
  if (!Number.isInteger(level) || level < 0 || level >= header.levels) {
    throw new Error(`terrain level ${level} is out of range [0, ${header.levels - 1}]`)
  }
  const path = terrainLevelPath(level)

  let buf: Buffer
  try {
    buf = readFileSync(path)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read terrain level ${level} (${path}): ${message} -- run \`npm run terrain:build\``)
  }

  const n = samplesAtLevel(header, level)
  const expectedBytes = n * n * 2
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `terrain level ${level} (${path}) is ${buf.byteLength} bytes; the header's ` +
      `finestSamples=${header.finestSamples} makes it ${n}x${n}, i.e. ${expectedBytes} bytes`,
    )
  }

  // `.slice()` on the underlying ArrayBuffer copies into a fresh, 2-byte
  // aligned buffer. Constructing the Int16Array over `buf.byteOffset` directly
  // would be zero-copy but throws whenever Node's pooled Buffer allocator hands
  // back an odd offset -- a failure that depends on unrelated allocations
  // earlier in the process, i.e. one that would not reproduce.
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return swapToLittleEndianIfNeeded(new Int16Array(bytes))
}

/**
 * Byte-swap an int16 array in place iff the host is big-endian, so that the
 * on-disk encoding is little-endian everywhere. Used by BOTH the reader above
 * and `build.ts`'s writer, because the int16 swap is its own inverse.
 *
 * Without this, a big-endian host would write a different byte for every
 * sample, and `tests/tools/terrainBuild.test.ts`'s pinned SHA-256 literals --
 * the whole point of which is that the pipeline is byte-reproducible -- would
 * fail for a reason that has nothing to do with the pipeline.
 */
export function swapToLittleEndianIfNeeded(values: Int16Array): Int16Array {
  // Probe the actual representation rather than importing `node:os`'s
  // endianness(): one allocation, no dependency on a string constant. On every
  // machine this project has run on the early return is taken.
  const probe = new Uint8Array(new Uint16Array([1]).buffer)
  if (probe[0] === 1) return values
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
  for (let i = 0; i < bytes.length; i += 2) {
    const a = bytes[i]!
    bytes[i] = bytes[i + 1]!
    bytes[i + 1] = a
  }
  return values
}
