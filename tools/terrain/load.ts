// Node-side reader for the built terrain: the twin of tools/content/load.ts,
// and for the same reason (Finding I1) -- `node:fs` and `import.meta.url` must
// not be reachable from `src/sim/`, which has to load in a browser. The browser
// path fetches these same files and parses them with `src/sim/world/schema.ts`,
// which this module also uses, so the two paths cannot disagree about the
// header's shape.
//
// `loadTerrainField` is deliberately NOT here: it returns `TerrainField`, a
// type Task 7 defines, and a task may not depend on a type from a later one.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseTerrainHeader, samplesAtLevel, type TerrainHeader } from '../../src/sim/world/schema.js'

/** `content/terrain/`, resolved relative to this file rather than
 *  `process.cwd()`, so a test run from any directory reads the same bytes. */
export const TERRAIN_DIR = fileURLToPath(new URL('../../content/terrain/', import.meta.url))

/** `content/terrain/tiles/`, the gitignored half of the output (see
 *  `.gitignore`'s `/content/terrain/tiles/` rule). */
export const TILES_DIR = fileURLToPath(new URL('../../content/terrain/tiles/', import.meta.url))

/**
 * The coarsest level that is NOT committed. Levels 0-3 are 134 MB, 33.6 MB,
 * 8.4 MB and 2.1 MB respectively (n^2 * 2 bytes for n = 8193, 4097, 2049,
 * 1025); levels 4-12 together are 703,154 bytes, which is what a fresh clone
 * gets as its offline fallback (spec §10 / task-6-brief step 3's "~703 KB").
 * L3 at 2.1 MB is the first level that is an order of magnitude past that
 * budget, so the split sits here.
 */
export const FIRST_COMMITTED_LEVEL = 4

/** Absolute path of a level's `.bin`. Levels below `FIRST_COMMITTED_LEVEL`
 *  live in the gitignored `tiles/` subdirectory; the rest are committed
 *  alongside `header.json`. */
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
 * Read one pyramid level as int16 decimetres, row-major, row 0 = NORTH edge,
 * column 0 = WEST edge (the orientation `resample.ts` and `mips.ts` establish;
 * a mirrored world looks like plausible terrain rather than like a bug, so it
 * is restated at every boundary it crosses).
 *
 * The file's length is checked against the header rather than trusted: a
 * truncated or stale level would otherwise be read as a valid grid of the
 * wrong size and silently misindexed, which is spec §9's "fail loudly"
 * case -- the terrain equivalent of the NaN that teleports the aeroplane.
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
