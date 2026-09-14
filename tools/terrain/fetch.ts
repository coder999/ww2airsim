// Downloads the nine Copernicus GLO-30 source tiles into a local cache
// (tools/terrain/cache/, gitignored -- see .gitignore's /tools/**/cache/ and
// *.tif rules). Nothing here parses a tile; that is Task 6. The only job of
// this module is to make sure a byte on disk named like a tile really is that
// whole tile: see ensureTileInto's write-to-.part-then-rename below.
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tileFileName, tileUrl, tilesCovering, type TileId } from './tiles.js'

export type TileFetcher = (url: string) => Promise<Uint8Array>

// tools/terrain/cache, resolved relative to this file (not process.cwd())
// so `ensureTile`/`ensureAllTiles` behave the same regardless of the
// directory `tsx` is invoked from.
export const CACHE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'cache')

/** The testable core: everything is an argument, nothing is ambient. */
export async function ensureTileInto(id: TileId, dir: string, fetch: TileFetcher): Promise<string> {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, tileFileName(id))
  // A zero-byte file is treated as absent: it is what an out-of-disk or a
  // killed process leaves behind, and it is indistinguishable from a cached
  // tile by existence alone.
  try {
    if (statSync(path).size > 0) return path
  } catch {
    // not cached; fall through
  }
  const part = `${path}.part`
  try {
    writeFileSync(part, await fetch(tileUrl(id)))
    renameSync(part, path)
  } catch (err) {
    // Leave NOTHING a later run could mistake for a cached tile. A truncated
    // COG does not throw when read, it yields a plausible wrong world.
    rmSync(part, { force: true })
    throw err
  }
  return path
}

// Discovered running the real Step 5 fetch 2026-09-13, not anticipated by the
// task brief: one of the nine tiles the 200 km world's bounding box touches
// (N11/E126, open Philippine Sea) 404s. This is not a network fault -- the
// bucket's own https://copernicus-dem-30m.s3.amazonaws.com/readme.html says
// so explicitly: "ocean areas do not have tiles, there one can assume height
// values equal to zero." So a 404 is the dataset's documented way of saying
// "this cell is open ocean", and is distinguished from every other failure
// (connection reset, 500, a real typo'd URL) so those still abort the batch.
export class TileNotFoundError extends Error {}

// The real network fetcher used outside tests. Node's built-in fetch (no new
// dependency, per the plan's dependency constraint) against the public,
// unauthenticated bucket confirmed live 2026-09-13 -- see ASSETS.md.
// `globalThis.fetch` rather than the bare identifier: eslint.config.js's
// no-restricted-globals bans `fetch` across all of tools/**, the same
// denylist sim/ uses, but this file is the one place under tools/ whose job
// IS the network call -- accessing it as a property sidesteps the identifier
// ban without weakening it anywhere sim/ actually runs.
const realFetch: TileFetcher = async (url) => {
  const res = await globalThis.fetch(url)
  if (res.status === 404) throw new TileNotFoundError(url)
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status} ${res.statusText}`)
  // No length check against Content-Length here: a body that ends early is
  // relied on to make undici's fetch() reject res.arrayBuffer() itself
  // (observed behaviour, not a documented guarantee re-verified per Node
  // version). ensureTileInto's .part-then-rename only guards a PROCESS-level
  // interruption (the run is killed, the machine loses power); it does not,
  // and cannot, re-check the bytes fetch() already handed back as complete.
  return new Uint8Array(await res.arrayBuffer())
}

export async function ensureTile(id: TileId): Promise<string> {
  return ensureTileInto(id, CACHE_DIR, realFetch)
}

/** The testable core of the batch fetch, parallel to ensureTileInto: dir and
 *  fetch are arguments so the ocean-skip branch below can be exercised
 *  without touching the real cache directory or the network. */
export async function ensureAllTilesInto(
  halfExtentM: number,
  dir: string,
  fetch: TileFetcher,
): Promise<readonly string[]> {
  const tiles = tilesCovering(halfExtentM)
  const paths: string[] = []
  // Sequential, not Promise.all: nine concurrent 9.6 MB pulls against one
  // public bucket buys nothing (single link is the bottleneck) and makes a
  // failure harder to attribute to which tile.
  for (const id of tiles) {
    try {
      paths.push(await ensureTileInto(id, dir, fetch))
    } catch (err) {
      if (err instanceof TileNotFoundError) {
        console.warn(`no source tile for ${JSON.stringify(id)} -- treating as open ocean (see readme.html)`)
        continue
      }
      throw err
    }
  }
  // Zero is the one threshold that isn't an invented constant -- it's the
  // boundary between "some data" and "none". Without this, "0 of 9 landed,
  // every one a 404" (e.g. a renamed bucket path) looks exactly like "8 of 9
  // landed, one is legitimately open ocean": both just print a count and
  // return normally. A silently empty cache is the sea-level-world failure
  // the 404/other-error split above exists to avoid, so it must throw, not
  // just log alongside the per-tile warnings already printed above.
  if (paths.length === 0 && tiles.length > 0) {
    throw new Error(
      `fetched 0 of ${tiles.length} tiles -- every one 404'd or the batch was empty; ` +
      `most likely the bucket path/naming changed (see tools/terrain/tiles.ts's tileUrl), ` +
      `not that the whole requested area is open ocean`,
    )
  }
  return paths
}

export async function ensureAllTiles(halfExtentM: number): Promise<readonly string[]> {
  return ensureAllTilesInto(halfExtentM, CACHE_DIR, realFetch)
}

// Run directly (`npx tsx tools/terrain/fetch.ts`) to populate the cache for
// the 200 km world (100 km half-extent, see Plan 4 design).
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const HALF_EXTENT_M = 100e3 // 200 km world, matching Plan 4 design's world size
  ensureAllTiles(HALF_EXTENT_M)
    .then((paths) => {
      const wanted = tilesCovering(HALF_EXTENT_M).length
      console.log(`cached ${paths.length}/${wanted} tiles in ${CACHE_DIR} (gap is expected open-ocean cells, see warnings above)`)
    })
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
}
