import { fromFile } from 'geotiff'
import type { LatLonBox } from './fetch.js'

/** WorldCover 2021 v200 class codes (ESA product user manual, table 2). */
export const CLASS = {
  tree: 10, shrub: 20, grass: 30, crop: 40, built: 50, bare: 60,
  snow: 70, water: 80, wetland: 90, mangrove: 95, moss: 100,
} as const

export type Fractions = { tree: number; crop: number; mangrove: number; open: number; water: number }

/**
 * The only place that knows class numbers. `built` becomes `crop`: master
 * spec section 4's known compromise, the one 1944 correction. Everything
 * that is not land cover a pilot can read from the air -- water, wetland,
 * snow, moss, no-data -- is `water`, which the shipped raster carries as
 * the remainder of the four land channels.
 */
export function channelOf(cls: number): keyof Fractions {
  switch (cls) {
    case CLASS.tree: return 'tree'
    case CLASS.mangrove: return 'mangrove'
    case CLASS.crop: case CLASS.built: return 'crop'
    case CLASS.grass: case CLASS.shrub: case CLASS.bare: return 'open'
    default: return 'water'
  }
}

/** Pixels per degree at 10 m: WorldCover tiles are 36,000 x 36,000. */
const PIXELS_PER_DEGREE = 12_000

type Window = {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
  /** Lat/lon of the window's north-west pixel corner. */
  readonly north: number
  readonly west: number
}

export type CoverSource = { fractions(box: LatLonBox): Fractions }

/**
 * Reads, once, the part of each tile inside `box` at full 10 m resolution.
 * For the shipped box that is about 470 MB of uint8 across the two tiles,
 * held for the build's few seconds; the terrain build holds 415 MB of
 * float32 the same way. Reading by window keeps a 1.3 GB tile off the heap.
 */
export async function openCoverSource(paths: readonly string[], box: LatLonBox): Promise<CoverSource> {
  const windows: Window[] = []
  for (const path of paths) {
    const tiff = await fromFile(path)
    const image = await tiff.getImage(0)
    const [originLon, originLat] = image.getOrigin() as [number, number]
    const width = image.getWidth(), height = image.getHeight()
    if (width !== 3 * PIXELS_PER_DEGREE || height !== 3 * PIXELS_PER_DEGREE) {
      throw new Error(`${path}: ${width}x${height}, expected ${3 * PIXELS_PER_DEGREE} square`)
    }
    const x0 = Math.max(0, Math.floor((box.lonMin - originLon) * PIXELS_PER_DEGREE))
    const x1 = Math.min(width, Math.ceil((box.lonMax - originLon) * PIXELS_PER_DEGREE))
    const y0 = Math.max(0, Math.floor((originLat - box.latMax) * PIXELS_PER_DEGREE))
    const y1 = Math.min(height, Math.ceil((originLat - box.latMin) * PIXELS_PER_DEGREE))
    if (x1 <= x0 || y1 <= y0) continue
    const [raster] = await image.readRasters({ window: [x0, y0, x1, y1] }) as unknown as [Uint8Array]
    if (!(raster instanceof Uint8Array)) throw new Error(`${path}: expected a uint8 raster`)
    windows.push({
      data: raster, width: x1 - x0, height: y1 - y0,
      north: originLat - y0 / PIXELS_PER_DEGREE, west: originLon + x0 / PIXELS_PER_DEGREE,
    })
  }
  if (windows.length === 0) throw new Error('no WorldCover tile overlaps the box')

  return {
    fractions(q: LatLonBox): Fractions {
      const counts: Fractions = { tree: 0, crop: 0, mangrove: 0, open: 0, water: 0 }
      let total = 0
      for (const w of windows) {
        const c0 = Math.max(0, Math.floor((q.lonMin - w.west) * PIXELS_PER_DEGREE))
        const c1 = Math.min(w.width, Math.ceil((q.lonMax - w.west) * PIXELS_PER_DEGREE))
        const r0 = Math.max(0, Math.floor((w.north - q.latMax) * PIXELS_PER_DEGREE))
        const r1 = Math.min(w.height, Math.ceil((w.north - q.latMin) * PIXELS_PER_DEGREE))
        for (let r = r0; r < r1; r++) {
          const row = r * w.width
          for (let c = c0; c < c1; c++) {
            counts[channelOf(w.data[row + c]!)]++
            total++
          }
        }
      }
      // A rectangle entirely outside every window is open ocean beyond
      // WorldCover's coverage: water, the same convention as no-data.
      if (total === 0) return { tree: 0, crop: 0, mangrove: 0, open: 0, water: 1 }
      return {
        tree: counts.tree / total, crop: counts.crop / total, mangrove: counts.mangrove / total,
        open: counts.open / total, water: counts.water / total,
      }
    },
  }
}
