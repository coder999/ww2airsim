import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE_DIR, COVER_BOX, tileFileName, tileIdsFor } from '../../tools/landcover/fetch.js'
import { floodSeaFromBoundary, openSeaMask } from '../../tools/landcover/sea.js'

const W = 80, C = 0, L = 30 // water, no-data, grass

/** Build a w x h class raster from rows of single-letter codes. */
const raster = (rows: readonly string[]): Uint8Array => {
  const out = new Uint8Array(rows.length * rows[0]!.length)
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    out[r * rows[0]!.length + c] = ch === 'w' ? W : ch === '.' ? C : L
  }))
  return out
}

describe('floodSeaFromBoundary', () => {
  it('marks water connected to the boundary as sea', () => {
    const rows = ['wwwww', 'wgggw', 'wgggw', 'wwwww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 4)
    expect(sea[0]).toBe(1)              // corner ocean
    expect(sea[1 * 5 + 1]).toBe(0)      // land
  })

  it('leaves an enclosed lake as land, which is why Lake Danao survives', () => {
    // A water cell ringed by land, not reachable from the boundary.
    const rows = ['wwwww', 'wgggw', 'wgwgw', 'wgggw', 'wwwww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 5)
    expect(sea[2 * 5 + 2]).toBe(0)      // the lake
    expect(sea[0]).toBe(1)              // the ocean
  })

  it('floods through no-data, which is open ocean beyond coverage', () => {
    const rows = ['..www', 'wgggw', 'wwwww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 3)
    expect(sea[0]).toBe(1)
    expect(sea[2]).toBe(1)
  })

  it('does not leak through a land isthmus', () => {
    const rows = ['wwgww', 'wwgww', 'ggggg', 'wwgww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 4)
    expect(sea[0]).toBe(1)              // north-west sea, boundary-seeded
    expect(sea[3 * 5 + 0]).toBe(1)      // south-west sea, its own boundary seed -- not reached through the isthmus
    expect(sea[2 * 5 + 2]).toBe(0)      // the isthmus row blocks the two regions from joining
  })

  it('does not leak into a lake through a diagonal-only neighbor', () => {
    // (1,1) is real sea, reached orthogonally from the north and west
    // boundary. It touches the lake at (2,2) only diagonally -- every
    // orthogonal neighbor of the lake is land. An (incorrectly) 8-connected
    // fill would leak in through that diagonal and flatten the lake to sea
    // level; the correct 4-connected fill must leave it dry.
    const rows = ['wwwww', 'wwggw', 'wgwgw', 'wgggw', 'wwwww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 5)
    expect(sea[1 * 5 + 1]).toBe(1)      // real sea, reached orthogonally
    expect(sea[2 * 5 + 2]).toBe(0)      // the lake stays dry despite touching it diagonally
  })
})

const paths = tileIdsFor(COVER_BOX).map(id => join(CACHE_DIR, tileFileName(id)))
const haveSource = paths.every(p => existsSync(p))
if (!haveSource) {
  console.warn(`[landcoverSea.test.ts] ${CACHE_DIR} lacks the WorldCover tiles -- the source checks are SKIPPED. Run \`npx tsx tools/landcover/fetch.ts\` to enable them.`)
}

// Nothing else in the repo ever calls openSeaMask end to end -- that's how a
// version that crashed on every real tile (the overview has no georeferencing
// tags of its own; see sea.ts's comment on `base.getOrigin()`) sat behind a
// fully green suite. This exercises the whole path: base-origin read, both
// dimension assertions, the windowed overview read, the stitch, the flood.
describe.skipIf(!haveSource)('openSeaMask against the Earth', () => {
  it('tells sea from land from a lake, measured 2026-09-18 against the 20 m overview', async () => {
    const mask = await openSeaMask(paths, COVER_BOX)
    const around = (lat: number, lon: number, halfM = 100) => {
      const d = halfM / 111000
      return { latMin: lat - d, latMax: lat + d, lonMin: lon - d, lonMax: lon + d }
    }
    // Leyte Gulf, open water far from any coast: measured seaFraction 1.0.
    expect(mask.seaFraction(around(10.75, 125.25))).toBeGreaterThan(0.99)
    // Mt Nacolod, an inland peak (see landcoverSample.test.ts): measured
    // seaFraction 0.
    expect(mask.seaFraction(around(10.450846, 125.096068))).toBeLessThan(0.01)
    // Lake Danao, Leyte: 11.07111 N 124.69389 E, a volcanogenic lake at
    // 650 m (en.wikipedia.org/wiki/Lake_Danao_(Leyte), retrieved 2026-09-18)
    // -- exactly the water-tagged-as-sea case this module exists to
    // prevent. openCoverSource confirms the pixels here are 100 % water by
    // class; measured seaFraction is 0 at this box and stayed 0 out to a
    // 500 m half-width, so the flood is stopping at the lake's shore, not
    // leaking past it by chance of box placement.
    expect(mask.seaFraction(around(11.07111, 124.69389))).toBe(0)
  }, 120_000)
})
