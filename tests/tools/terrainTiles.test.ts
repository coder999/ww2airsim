import { describe, it, expect } from 'vitest'
import { tilesCovering, tileUrl, tileFileName } from '../../tools/terrain/tiles.js'

describe('source tile coverage', () => {
  it('covers the whole 200 km world with the nine tiles around Leyte', () => {
    const ids = tilesCovering(100e3)
    expect(ids).toHaveLength(9)
    expect(ids.map((t) => `N${t.lat}E${t.lon}`).sort()).toEqual(
      ['N10E124', 'N10E125', 'N10E126', 'N11E124', 'N11E125', 'N11E126', 'N9E124', 'N9E125', 'N9E126'].sort(),
    )
  })

  it('grows the set when the world does, rather than silently clipping it', () => {
    // A guard against the off-by-one that leaves a missing tile as a cliff of
    // sea-level at the world edge -- which looks like terrain data being
    // wrong, not like a tile list being short. Also guard that interior tiles
    // are not silently omitted: the set must be contiguous across its bounds,
    // and the bounds themselves must be correct.
    const ids = tilesCovering(200e3)
    expect(ids.length).toBeGreaterThan(9)

    const lats = ids.map((t) => t.lat)
    const lons = ids.map((t) => t.lon)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)

    // Expected bounds for 400 km box (200 km half-extent) centred on 10.8 N, 125.3 E:
    // Box extends ±1.8 degrees, so roughly 9-12.6 N and 123.5-127.1 E. Tile indices
    // are floor(degrees), giving N8-N12, E123-E127 (5×5 grid). Computed via azimuthal
    // equidistant projection at S4 / master spec.
    expect(minLat).toBe(8)
    expect(maxLat).toBe(12)
    expect(minLon).toBe(123)
    expect(maxLon).toBe(127)

    // Verify every integer tile in the bounding box is present (catches interior holes).
    const seen = new Set(ids.map((t) => `${t.lat},${t.lon}`))
    for (let lat = minLat; lat <= maxLat; lat++) {
      for (let lon = minLon; lon <= maxLon; lon++) {
        expect(seen.has(`${lat},${lon}`)).toBe(true)
      }
    }
  })

  it('builds the exact Copernicus name and URL for a tile', () => {
    // Pinned against the real object, confirmed reachable 2026-09-13.
    const id = { lat: 10, lon: 125 }
    expect(tileFileName(id)).toBe('Copernicus_DSM_COG_10_N10_00_E125_00_DEM.tif')
    expect(tileUrl(id)).toBe(
      'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N10_00_E125_00_DEM/' +
        'Copernicus_DSM_COG_10_N10_00_E125_00_DEM.tif',
    )
  })
})
