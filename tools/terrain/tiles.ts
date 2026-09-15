import { toGeodetic } from '../../src/sim/world/projection.js'

export type TileId = { readonly lat: number; readonly lon: number }

/** Copernicus GLO-30 tiles are 1 degree squares named by their SOUTH-WEST
 *  corner, so a tile is found with `floor`. The box's perimeter is walked to
 *  establish the latitude and longitude bounds of the projected region, because
 *  the azimuthal equidistant projection is not axis-aligned in lat/lon: an
 *  edge's extreme latitude can fall at its midpoint, not at its endpoints.
 *  Once bounds are known, every integer tile within those bounds is enumerated,
 *  which covers all interior tiles by construction. */
export function tilesCovering(halfExtentM: number): readonly TileId[] {
  const tiles: TileId[] = []
  // Perimeter discretisation: 64 steps across each edge is ample. For the box
  // this world is actually built at -- 200 km, i.e. `resample.ts`'s
  // `GRID.halfExtentM` of 100 km, which is also what the CLI at the bottom of
  // `fetch.ts` passes -- the true maximum latitude departure between an edge
  // and the straight line through its endpoints is 0.00139 degrees (~154 m),
  // measured 2026-09-14 against a 20,000-step walk of the same perimeter.
  // Discretisation error at 64 steps is orders of magnitude below the 1-degree
  // tile size, nowhere near enough to cross a degree boundary. (This comment
  // read "0.005 degrees ... for the 400 km box" until 2026-09-14: 0.00572
  // degrees is the half = 200 km value, quoted for a world twice the size of
  // the one that was built. Conservative in the safe direction, but a
  // statement about a configuration that does not exist.)
  const steps = 64

  // Walk perimeter to find bounds.
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity

  for (let i = 0; i <= steps; i++) {
    const t = -halfExtentM + (2 * halfExtentM * i) / steps
    for (const [x, z] of [[t, -halfExtentM], [t, halfExtentM], [-halfExtentM, t], [halfExtentM, t]] as const) {
      const g = toGeodetic(x, z)
      minLat = Math.min(minLat, g.latDeg)
      maxLat = Math.max(maxLat, g.latDeg)
      minLon = Math.min(minLon, g.lonDeg)
      maxLon = Math.max(maxLon, g.lonDeg)
    }
  }

  // Enumerate all integer tiles in bounds.
  for (let lat = Math.floor(minLat); lat <= Math.floor(maxLat); lat++) {
    for (let lon = Math.floor(minLon); lon <= Math.floor(maxLon); lon++) {
      tiles.push({ lat, lon })
    }
  }

  return tiles
}

const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
const latPart = (lat: number) => `${lat < 0 ? 'S' : 'N'}${pad(lat)}_00`
const lonPart = (lon: number) => `${lon < 0 ? 'W' : 'E'}${String(Math.abs(lon)).padStart(3, '0')}_00`

export function tileFileName(id: TileId): string {
  return `Copernicus_DSM_COG_10_${latPart(id.lat)}_${lonPart(id.lon)}_DEM.tif`
}

export function tileUrl(id: TileId): string {
  const stem = tileFileName(id).replace(/\.tif$/, '')
  return `https://copernicus-dem-30m.s3.amazonaws.com/${stem}/${stem}.tif`
}
