import { fromFile } from 'geotiff'
import { CLASS } from './sample.js'
import type { LatLonBox } from './fetch.js'

/** WorldCover ships COG overviews; 20 m is one level below the 10 m base.
 *  The box is 200 km square, so the stitched mask is about 10,000 square —
 *  100 MB as a Uint8Array, which node holds without complaint. */
export const OVERVIEW_METRES = 20

/** No-data. Beyond the tiles' coverage the product writes 0, and everything
 *  beyond coverage in this box is open ocean. */
const NO_DATA = 0

/** Sea is CONNECTED water, not the water class: WorldCover calls Lake Danao
 *  (about 600 m up) and every river `water`, and setting those to sea level
 *  would dig a 600 m hole and hand the simulation a lake it thinks is ocean.
 *  Design spec §6, "Sea-connectivity first". Four-connected, from every
 *  boundary pixel inward, over an explicit queue rather than recursion —
 *  10,000² would blow the stack. */
export function floodSeaFromBoundary(classes: Uint8Array, width: number, height: number): Uint8Array {
  const sea = new Uint8Array(width * height)
  const floodable = (i: number): boolean => classes[i] === CLASS.water || classes[i] === NO_DATA
  // Int32Array ring buffer: one slot per pixel is enough, since a pixel is
  // enqueued only on the transition 0 -> 1.
  const queue = new Int32Array(width * height)
  let head = 0, tail = 0
  const push = (i: number): void => {
    if (sea[i] === 1 || !floodable(i)) return
    sea[i] = 1
    queue[tail++] = i
  }
  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (head < tail) {
    const i = queue[head++]!
    const x = i % width
    const y = (i - x) / width
    if (x > 0) push(i - 1)
    if (x < width - 1) push(i + 1)
    if (y > 0) push(i - width)
    if (y < height - 1) push(i + width)
  }
  return sea
}

export type SeaMask = {
  /** Fraction of the rectangle's pixels that are connected sea, 0..1. */
  seaFraction(box: LatLonBox): number
}

/** Pixels per degree at the overview resolution. WorldCover tiles are 3° of
 *  latitude at 12,000 px/deg at 10 m, so 6,000 px/deg at 20 m. */
const PIXELS_PER_DEGREE = 6_000

export async function openSeaMask(paths: readonly string[], box: LatLonBox): Promise<SeaMask> {
  const north = Math.ceil(box.latMax * PIXELS_PER_DEGREE) / PIXELS_PER_DEGREE
  const west = Math.floor(box.lonMin * PIXELS_PER_DEGREE) / PIXELS_PER_DEGREE
  const width = Math.ceil((box.lonMax - west) * PIXELS_PER_DEGREE)
  const height = Math.ceil((north - box.latMin) * PIXELS_PER_DEGREE)
  const classes = new Uint8Array(width * height)

  for (const path of paths) {
    const tiff = await fromFile(path)
    // Index 0 is the 10 m base; the first overview is 20 m. Assert rather
    // than assume: a product without overviews must fail loudly here, not
    // silently read the base and use four times the memory.
    const count = await tiff.getImageCount()
    if (count < 2) throw new Error(`${path} has ${count} image(s); expected a base plus overviews`)
    const image = await tiff.getImage(1)
    const [originLon, originLat] = image.getOrigin() as [number, number]
    const w = image.getWidth(), h = image.getHeight()
    const degreesPerPixel = 1 / PIXELS_PER_DEGREE
    const raster = await image.readRasters({ interleave: true })
    const data = raster as unknown as Uint8Array
    for (let r = 0; r < h; r++) {
      const lat = originLat - (r + 0.5) * degreesPerPixel
      const destRow = Math.floor((north - lat) * PIXELS_PER_DEGREE)
      if (destRow < 0 || destRow >= height) continue
      for (let c = 0; c < w; c++) {
        const lon = originLon + (c + 0.5) * degreesPerPixel
        const destCol = Math.floor((lon - west) * PIXELS_PER_DEGREE)
        if (destCol < 0 || destCol >= width) continue
        classes[destRow * width + destCol] = data[r * w + c]!
      }
    }
  }

  const sea = floodSeaFromBoundary(classes, width, height)

  return {
    seaFraction(rect: LatLonBox): number {
      const rowMin = Math.max(0, Math.floor((north - rect.latMax) * PIXELS_PER_DEGREE))
      const rowMax = Math.min(height - 1, Math.ceil((north - rect.latMin) * PIXELS_PER_DEGREE))
      const colMin = Math.max(0, Math.floor((rect.lonMin - west) * PIXELS_PER_DEGREE))
      const colMax = Math.min(width - 1, Math.ceil((rect.lonMax - west) * PIXELS_PER_DEGREE))
      if (rowMax < rowMin || colMax < colMin) return 1
      let total = 0, wet = 0
      for (let r = rowMin; r <= rowMax; r++) {
        for (let c = colMin; c <= colMax; c++) {
          total++
          wet += sea[r * width + c]!
        }
      }
      return total === 0 ? 1 : wet / total
    },
  }
}
