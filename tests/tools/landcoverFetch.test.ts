import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COVER_BOX, ensureAllTilesInto, ensureTileInto, tileFileName, tileIdsFor, tileUrl } from '../../tools/landcover/fetch.js'

describe('WorldCover tile ids', () => {
  it('names and addresses a tile the way ESA publishes it', () => {
    expect(tileFileName({ lat: 9, lon: 123 })).toBe('ESA_WorldCover_10m_2021_v200_N09E123_Map.tif')
    expect(tileUrl({ lat: 9, lon: 126 })).toBe(
      'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N09E126_Map.tif',
    )
  })

  it('covers the 200 km box with exactly the two tiles measured on 2026-09-17', () => {
    // The box is 9.9-11.7 N, 124.4-126.2 E; WorldCover tiles are 3 degrees
    // on a side named by their south-west corner. Both were fetched by hand
    // that day (30.9 MB and 2.5 MB) with an anonymous HEAD request.
    expect(COVER_BOX.latMin).toBeCloseTo(9.89, 1)
    expect(COVER_BOX.lonMax).toBeCloseTo(126.22, 1)
    expect(tileIdsFor(COVER_BOX)).toEqual([{ lat: 9, lon: 123 }, { lat: 9, lon: 126 }])
  })

  it('fetches into a .part file and renames only on success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ww2-landcover-'))
    try {
      const calls: string[] = []
      const fake = async (url: string) => { calls.push(url); return new Uint8Array([1, 2, 3]) }
      const path = await ensureTileInto({ lat: 9, lon: 123 }, dir, fake)
      expect(readFileSync(path)).toEqual(Buffer.from([1, 2, 3]))
      expect(existsSync(`${path}.part`)).toBe(false)
      // A second call is a cache hit: no fetch.
      await ensureTileInto({ lat: 9, lon: 123 }, dir, fake)
      expect(calls).toHaveLength(1)
      const failing = async () => { throw new Error('offline') }
      await expect(ensureTileInto({ lat: 9, lon: 126 }, dir, failing)).rejects.toThrow('offline')
      expect(existsSync(join(dir, tileFileName({ lat: 9, lon: 126 }) + '.part'))).toBe(false)
      const all = await ensureAllTilesInto(COVER_BOX, dir, fake)
      expect(all.map(p => p.split('/').pop())).toEqual([tileFileName({ lat: 9, lon: 123 }), tileFileName({ lat: 9, lon: 126 })])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refetches a zero-byte file left by a killed process', async () => {
    // realFetch is not exported and uses the network, so it is not unit-tested.
    const dir = mkdtempSync(join(tmpdir(), 'ww2-landcover-'))
    try {
      const tileId = { lat: 9, lon: 123 }
      const tilePath = join(dir, tileFileName(tileId))
      // Pre-create a zero-byte file (simulating out-of-disk or process kill).
      writeFileSync(tilePath, new Uint8Array())
      const calls: string[] = []
      const fake = async (url: string) => { calls.push(url); return new Uint8Array([9]) }
      // Refetch should occur because size === 0.
      const path = await ensureTileInto(tileId, dir, fake)
      expect(calls).toHaveLength(1)
      expect(readFileSync(path)).toEqual(Buffer.from([9]))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
