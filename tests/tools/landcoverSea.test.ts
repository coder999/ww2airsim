import { describe, expect, it } from 'vitest'
import { floodSeaFromBoundary } from '../../tools/landcover/sea.js'

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
