import { fromFile } from 'geotiff'
import { CLASS } from './sample.js'
import type { LatLonBox } from './fetch.js'

/** WorldCover ships COG overviews; 20 m is one level below the 10 m base.
 *  The box is 200 km square, so the stitched mask is about 10,000 pixels
 *  square: `classes` and the returned `sea` mask are each ~100 MB as a
 *  Uint8Array, live at the same time. `openSeaMask` windows each tile's
 *  read to the box's overlap (see below) rather than reading the whole
 *  18,000 x 18,000 overview (324 MB per tile), and the flood's queue is a
 *  growable ring buffer bounded by the frontier rather than a fixed
 *  width * height allocation (400 MB preallocated is what a naive queue
 *  would cost here). Measured 2026-09-18 against the shipped two-tile
 *  COVER_BOX with process.memoryUsage() around the openSeaMask call: RSS
 *  rose by about 310 MB (heapUsed barely moved -- these typed arrays live
 *  in Node's external/arrayBuffers accounting, not the JS heap, so
 *  heapUsed alone understates this the same way the old 100 MB claim did).
 *  See task-1-report.md for the full readings. */
export const OVERVIEW_METRES = 20

/** No-data. Beyond the tiles' coverage the product writes 0, and everything
 *  beyond coverage in this box is open ocean. */
const NO_DATA = 0

/** A growable FIFO queue of pixel indices, backed by a ring buffer that
 *  doubles on overflow. A flood fill only ever needs to hold its current
 *  frontier, not every pixel it will eventually visit: for a real
 *  coastline the frontier tracks the shoreline's length, not the box's
 *  area, so this stays far smaller in practice than a queue preallocated
 *  to width * height entries (400 MB for the shipped 10,000-square box). */
function makeQueue(initialCapacity: number): { push(i: number): void; shift(): number; readonly length: number } {
  let buf = new Int32Array(initialCapacity)
  let head = 0, tail = 0, size = 0
  const grow = (): void => {
    const next = new Int32Array(buf.length * 2)
    for (let k = 0; k < size; k++) next[k] = buf[(head + k) % buf.length]!
    buf = next
    head = 0
    tail = size
  }
  return {
    push(i: number): void {
      if (size === buf.length) grow()
      buf[tail] = i
      tail = (tail + 1) % buf.length
      size++
    },
    shift(): number {
      const v = buf[head]!
      head = (head + 1) % buf.length
      size--
      return v
    },
    get length(): number { return size },
  }
}

/** Sea is CONNECTED water, not the water class: WorldCover calls Lake Danao
 *  (about 600 m up) and every river `water`, and setting those to sea level
 *  would dig a 600 m hole and hand the simulation a lake it thinks is ocean.
 *  Design spec §6, "Sea-connectivity first". Four-connected, from every
 *  boundary pixel inward, over an explicit queue rather than recursion —
 *  10,000² would blow the stack. */
export function floodSeaFromBoundary(classes: Uint8Array, width: number, height: number): Uint8Array {
  const sea = new Uint8Array(width * height)
  const floodable = (i: number): boolean => classes[i] === CLASS.water || classes[i] === NO_DATA
  const queue = makeQueue(1024)
  const push = (i: number): void => {
    if (sea[i] === 1 || !floodable(i)) return
    sea[i] = 1
    queue.push(i)
  }
  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (queue.length > 0) {
    const i = queue.shift()
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

/** Pixels per degree at the 10 m base, used only to validate the base
 *  image's own dimensions (sample.ts:53-56 does the same check when it
 *  reads that image directly). */
const BASE_PIXELS_PER_DEGREE = 12_000

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
    const base = await tiff.getImage(0)
    const baseWidth = base.getWidth(), baseHeight = base.getHeight()
    if (baseWidth !== 3 * BASE_PIXELS_PER_DEGREE || baseHeight !== 3 * BASE_PIXELS_PER_DEGREE) {
      throw new Error(`${path}: base is ${baseWidth}x${baseHeight}, expected ${3 * BASE_PIXELS_PER_DEGREE} square`)
    }
    const image = await tiff.getImage(1)
    const imgWidth = image.getWidth(), imgHeight = image.getHeight()
    // WorldCover tiles are 3 degrees square at 12,000 px/deg (10 m), so
    // the 20 m overview should be exactly half that per side. A mismatch
    // means PIXELS_PER_DEGREE below would silently mis-georeference this
    // tile -- the quietly-wrong-coastline failure this task exists to
    // prevent -- so fail loudly instead, mirroring sample.ts:53-56.
    if (imgWidth !== 3 * PIXELS_PER_DEGREE || imgHeight !== 3 * PIXELS_PER_DEGREE) {
      throw new Error(`${path}: overview is ${imgWidth}x${imgHeight}, expected ${3 * PIXELS_PER_DEGREE} square`)
    }
    // The overview IFD carries no GeoKeys of its own in this product --
    // verified 2026-09-18 on both cached tiles, image.getOrigin() throws
    // "does not have an affine transformation" -- which is the ordinary
    // COG convention: an internal overview covers the same geographic
    // extent as the base, just at coarser pixels, so only the base needs
    // georeferencing tags. Read the origin from the base image; the pixel
    // spacing is already fixed by PIXELS_PER_DEGREE, validated above.
    const [originLon, originLat] = base.getOrigin() as [number, number]
    const degreesPerPixel = 1 / PIXELS_PER_DEGREE

    // Window the read to the box's overlap with this tile, the way
    // sample.ts does at 10 m (sample.ts:59-65): reading the whole
    // 18,000 x 18,000 overview (324 MB) for a ~200 km sliver of a 3
    // degree tile would put an order of magnitude more than needed on
    // the heap.
    const x0 = Math.max(0, Math.floor((box.lonMin - originLon) * PIXELS_PER_DEGREE))
    const x1 = Math.min(imgWidth, Math.ceil((box.lonMax - originLon) * PIXELS_PER_DEGREE))
    const y0 = Math.max(0, Math.floor((originLat - box.latMax) * PIXELS_PER_DEGREE))
    const y1 = Math.min(imgHeight, Math.ceil((originLat - box.latMin) * PIXELS_PER_DEGREE))
    if (x1 <= x0 || y1 <= y0) continue

    const [raster] = await image.readRasters({ window: [x0, y0, x1, y1] }) as unknown as [Uint8Array]
    if (!(raster instanceof Uint8Array)) throw new Error(`${path}: expected a uint8 raster`)
    const w = x1 - x0, h = y1 - y0

    for (let r = 0; r < h; r++) {
      const lat = originLat - (y0 + r + 0.5) * degreesPerPixel
      const destRow = Math.floor((north - lat) * PIXELS_PER_DEGREE)
      if (destRow < 0 || destRow >= height) continue
      for (let c = 0; c < w; c++) {
        const lon = originLon + (x0 + c + 0.5) * degreesPerPixel
        const destCol = Math.floor((lon - west) * PIXELS_PER_DEGREE)
        if (destCol < 0 || destCol >= width) continue
        classes[destRow * width + destCol] = raster[r * w + c]!
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
