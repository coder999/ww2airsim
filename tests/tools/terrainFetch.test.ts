import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureTileInto, ensureAllTilesInto, TileNotFoundError } from '../../tools/terrain/fetch.js'

// Only renameSync is wrapped (defaulting to the real implementation), so one
// test below can force the write-succeeded-but-rename-failed case -- the
// only way, given TileFetcher's atomic resolve-or-reject shape, that a
// `.part` file can exist on disk when the catch block runs. Every other
// test in this file (and fetch.ts's own use of node:fs, which resolves
// through the same mocked module) is unaffected.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})

const tmp = () => mkdtempSync(join(tmpdir(), 'ww2-terrain-'))
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

describe('the source tile cache', () => {
  it('downloads a tile that is missing', async () => {
    const dir = tmp(); dirs.push(dir)
    const fetcher = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const path = await ensureTileInto({ lat: 10, lon: 125 }, dir, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(Array.from(readFileSync(path))).toEqual([1, 2, 3])
  })

  it('does not re-download a tile it already has', async () => {
    const dir = tmp(); dirs.push(dir)
    const fetcher = vi.fn(async () => new Uint8Array([1, 2, 3]))
    await ensureTileInto({ lat: 10, lon: 125 }, dir, fetcher)
    await ensureTileInto({ lat: 10, lon: 125 }, dir, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('leaves nothing behind that a later run would mistake for a cached tile', async () => {
    // The failure this prevents: a download interrupted half way leaves a
    // short file, the next run sees a file and skips, and the pipeline builds
    // terrain out of a truncated tile -- which does not throw, it produces a
    // plausible-looking wrong world.
    const dir = tmp(); dirs.push(dir)
    const fetcher = vi.fn(async () => { throw new Error('connection reset') })
    await expect(ensureTileInto({ lat: 10, lon: 125 }, dir, fetcher)).rejects.toThrow('connection reset')
    expect(existsSync(join(dir, 'Copernicus_DSM_COG_10_N10_00_E125_00_DEM.tif'))).toBe(false)
    expect(existsSync(join(dir, 'Copernicus_DSM_COG_10_N10_00_E125_00_DEM.tif.part'))).toBe(false)
  })

  it('treats a zero-byte cached file as absent', async () => {
    const dir = tmp(); dirs.push(dir)
    writeFileSync(join(dir, 'Copernicus_DSM_COG_10_N10_00_E125_00_DEM.tif'), '')
    const fetcher = vi.fn(async () => new Uint8Array([9]))
    await ensureTileInto({ lat: 10, lon: 125 }, dir, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('cleans up a .part file even when the write succeeded and only the rename failed', async () => {
    // The "connection reset" test above throws before writeFileSync ever
    // runs (TileFetcher resolves whole or rejects, no partial bytes), so it
    // never actually puts a `.part` file on disk to clean up -- proven by
    // deleting the rmSync cleanup line and re-running: that test still
    // passes. The only way this codebase can leave a real `.part` file
    // behind is a successful write followed by a failed rename, so that is
    // what this test forces.
    const dir = tmp(); dirs.push(dir)
    const fetcher = vi.fn(async () => new Uint8Array([1, 2, 3]))
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw new Error('EXDEV: cross-device link not permitted (simulated)')
    })
    await expect(ensureTileInto({ lat: 10, lon: 125 }, dir, fetcher)).rejects.toThrow('EXDEV')
    expect(existsSync(join(dir, 'Copernicus_DSM_COG_10_N10_00_E125_00_DEM.tif'))).toBe(false)
    expect(existsSync(join(dir, 'Copernicus_DSM_COG_10_N10_00_E125_00_DEM.tif.part'))).toBe(false)
  })
})

describe('the batch fetch and its open-ocean gap', () => {
  // Discovered running the real Step 5 fetch 2026-09-13: the 200 km world's
  // nine-tile bounding box includes N11/E126 (Philippine Sea), which the
  // bucket does not publish at all -- 404, confirmed against
  // copernicus-dem-30m.s3.amazonaws.com/readme.html: "ocean areas do not
  // have tiles, there one can assume height values equal to zero." That is
  // not a download failure to retry, so the batch must not abort on it, and
  // must still abort on a real one (a reset, a 500, a typo'd URL).
  const halfExtentM = 50_000 // -> 4 tiles (checked against tilesCovering directly), small enough to keep the test fast

  it('skips a tile the bucket 404s on and returns the rest', async () => {
    const dir = tmp(); dirs.push(dir)
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('N11_00_E125_00')) throw new TileNotFoundError(url)
      return new Uint8Array([1])
    })
    const paths = await ensureAllTilesInto(halfExtentM, dir, fetcher)
    expect(paths).toHaveLength(3)
    expect(paths.some((p) => p.includes('N11_00_E125_00'))).toBe(false)
  })

  it('still aborts the batch on a non-404 failure', async () => {
    const dir = tmp(); dirs.push(dir)
    const fetcher = vi.fn(async () => { throw new Error('connection reset') })
    await expect(ensureAllTilesInto(halfExtentM, dir, fetcher)).rejects.toThrow('connection reset')
  })

  // A renamed bucket path or a typo in tileUrl 404s on EVERY tile, which the
  // skip-and-continue rule above turns into a normal return of an empty list
  // -- indistinguishable, downstream, from a world that is legitimately all
  // open ocean, and the seed of a silently sea-level world. Zero is the one
  // threshold here that is not an invented constant, so it is the one the
  // batch refuses to return.
  it('refuses to return an empty cache when every single tile 404s', async () => {
    const dir = tmp(); dirs.push(dir)
    const fetcher = vi.fn(async (url: string) => { throw new TileNotFoundError(url) })
    await expect(ensureAllTilesInto(halfExtentM, dir, fetcher)).rejects.toThrow(/0 of 4 tiles/)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})
