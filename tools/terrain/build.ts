// The terrain build CLI: `npm run terrain:build`.
//
// Everything it calls is already built and unit-tested against synthetic data
// (tiles.ts, fetch.ts, resample.ts, mips.ts). This file is the one place the
// real Copernicus GLO-30 rasters meet that machinery, so its whole job is
// (a) turning eight cached COGs into one `SourceSampler` and (b) writing the
// pyramid out. It reimplements none of the filtering.
//
// Output layout, per spec §10 and task-6-brief step 2:
//   content/terrain/header.json   committed
//   content/terrain/L4..L12.bin   committed (703,154 bytes total)
//   content/terrain/tiles/L0..L3.bin   gitignored (178 MB)
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fromFile } from 'geotiff'
import { ensureAllTiles } from './fetch.js'
import { tileFileName } from './tiles.js'
import { resample, GRID, type SourceSampler } from './resample.js'
import { buildPyramid } from './mips.js'
import {
  FIRST_COMMITTED_LEVEL,
  TERRAIN_DIR,
  TILES_DIR,
  swapToLittleEndianIfNeeded,
  terrainHeaderPath,
  terrainLevelPath,
} from './load.js'
import { WORLD_CENTRE } from '../../src/sim/world/projection.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'

/** Postings per degree in Copernicus GLO-30: 1 arcsecond sampling, so a
 *  1°x1° tile is 3600 x 3600. Asserted against each tile's own width below
 *  rather than assumed, because a tile of another size would otherwise be
 *  indexed as if it were this one. */
const POSTINGS_PER_DEGREE = 3600

/**
 * One tile's whole raster, plus the two facts needed to index it.
 *
 * `GTRasterTypeGeoKey` is 2 (RasterPixelIsPoint) on these files -- read off
 * `Copernicus_DSM_COG_10_N11_00_E125_00_DEM.tif` with geotiff's
 * `getGeoKeys()` on 2026-09-14 -- so sample (col, row) is a POINT at
 * lon = tile.lon + col/3600, lat = tile.lat + 1 - row/3600, not the centre of
 * an area. The distinction is half a posting, 15 m; it is recorded because
 * getting it wrong is a systematic offset that looks like nothing at all.
 */
type Tile = {
  readonly lat: number
  readonly lon: number
  readonly heights: Float32Array
}

/** Key a tile by its integer south-west corner. A single number so the
 *  inner loop's lookup is not a string concatenation 268 million times over
 *  (four bilinear taps x 67 million grid samples). Longitude spans exactly
 *  360 integers, so multiplying latitude by 360 cannot collide. */
const tileKey = (lat: number, lon: number): number => lat * 360 + lon

/**
 * Build one sampler over all the cached tiles.
 *
 * Reads each tile's full raster once (3600^2 float32 = 51.8 MB each, 415 MB
 * for eight) rather than windowing per sample: 67 million grid points through
 * per-sample windowed reads would each decode a 1024x1024 COG block.
 *
 * A lat/lon whose 1°x1° cell has NO cached tile reads as 0. That is not a
 * fallback invented here -- it is the dataset's own documented convention for
 * the cells it omits: the bucket's readme.html says "ocean areas do not have
 * tiles, there one can assume height values equal to zero", and exactly one of
 * the nine cells this world touches (N11/E126, open Philippine Sea) is such a
 * cell (ASSETS.md, "Known dataset gap, not a bug"). So `ensureAllTiles`
 * returns EIGHT paths for nine cells, and the sampler must not be indexed by
 * position in that array.
 */
export async function sourceSampler(paths: readonly string[]): Promise<SourceSampler> {
  const tiles = new Map<number, Tile>()

  for (const path of paths) {
    const tiff = await fromFile(path)
    const image = await tiff.getImage(0)
    const [originLon, originLat] = image.getOrigin()
    const width = image.getWidth()
    const height = image.getHeight()

    // The tile's own georeferencing decides where it goes, not its filename --
    // but the two must agree, or the cache holds a tile that is not the tile it
    // is named after (a mis-set cache entry would otherwise be resampled into
    // the wrong corner of the world and look like plausible terrain).
    const lon = Math.round(originLon!)
    const lat = Math.round(originLat!) - 1 // origin is the NORTH-west corner
    const expected = tileFileName({ lat, lon })
    if (!path.endsWith(expected)) {
      throw new Error(`${path}: georeferenced origin ${originLat},${originLon} names tile ${expected}`)
    }
    if (width !== POSTINGS_PER_DEGREE || height !== POSTINGS_PER_DEGREE) {
      throw new Error(`${path}: ${width}x${height}, expected ${POSTINGS_PER_DEGREE}x${POSTINGS_PER_DEGREE}`)
    }

    const [raster] = await image.readRasters()
    if (!(raster instanceof Float32Array)) {
      throw new Error(`${path}: expected a float32 raster, got ${String(raster?.constructor.name)}`)
    }
    tiles.set(tileKey(lat, lon), { lat, lon, heights: raster })
  }

  /**
   * Height at one source posting, addressed in a single world-wide posting
   * grid rather than per tile: `gc` counts postings east from lon 0, `gr`
   * counts postings north from lat 0. Doing it globally is what makes the
   * bilinear tap below cross a tile seam correctly -- the alternative,
   * clamping at each tile's edge, would duplicate a row of postings along
   * every seam and produce a faint 1°-spaced grid of ridges.
   */
  const postingAt = (gc: number, gr: number): number => {
    const lon = Math.floor(gc / POSTINGS_PER_DEGREE)
    // Row 0 of a tile is its NORTH edge, so the posting at exactly lat = N
    // belongs to the tile whose north edge it is, i.e. tile N-1. Hence ceil-1
    // here where the longitude above uses floor.
    const lat = Math.ceil(gr / POSTINGS_PER_DEGREE) - 1
    const tile = tiles.get(tileKey(lat, lon))
    if (tile === undefined) return 0 // open ocean; see the doc comment above
    const col = gc - lon * POSTINGS_PER_DEGREE
    const row = (lat + 1) * POSTINGS_PER_DEGREE - gr
    return tile.heights[row * POSTINGS_PER_DEGREE + col]!
  }

  return (latDeg: number, lonDeg: number): number => {
    const fc = lonDeg * POSTINGS_PER_DEGREE
    const fr = latDeg * POSTINGS_PER_DEGREE
    const gc = Math.floor(fc)
    const gr = Math.floor(fr)
    const fx = fc - gc
    const fy = fr - gr
    // gr is the SOUTH neighbour (latitude increases with gr), so `fy` weights
    // the northern pair.
    const south = postingAt(gc, gr) * (1 - fx) + postingAt(gc + 1, gr) * fx
    const north = postingAt(gc, gr + 1) * (1 - fx) + postingAt(gc + 1, gr + 1) * fx
    return south * (1 - fy) + north * fy
  }
}

function writeLevel(level: number, data: Int16Array): number {
  const bytes = new Uint8Array(
    swapToLittleEndianIfNeeded(data).buffer,
    data.byteOffset,
    data.byteLength,
  )
  writeFileSync(terrainLevelPath(level), bytes)
  return bytes.byteLength
}

/** Elapsed seconds since an `process.hrtime.bigint()` mark, to one decimal.
 *  `Date.now()` would read the wall clock, which eslint.config.js's
 *  no-restricted-properties bans across `tools/**` for determinism's sake;
 *  a monotonic interval is not a clock reading and is only ever printed. */
const secondsSince = (mark: bigint): string =>
  (Number(process.hrtime.bigint() - mark) / 1e9).toFixed(1)

export async function main(): Promise<void> {
  const started = process.hrtime.bigint()
  mkdirSync(TERRAIN_DIR, { recursive: true })
  mkdirSync(TILES_DIR, { recursive: true })

  const paths = await ensureAllTiles(GRID.halfExtentM)
  console.log(`source tiles: ${paths.length}`)

  const sampleStarted = process.hrtime.bigint()
  const sample = await sourceSampler(paths)
  console.log(`rasters read in ${secondsSince(sampleStarted)} s`)

  const resampleStarted = process.hrtime.bigint()
  const finest = resample(sample)
  console.log(`resampled ${GRID.samples}x${GRID.samples} in ${secondsSince(resampleStarted)} s`)

  const pyramid = buildPyramid(finest, GRID.samples)

  // The header is parsed by the same schema the game will parse it with,
  // before it is written. A header that could not be loaded back is a build
  // failure, not a content bug discovered at runtime.
  const header = parseTerrainHeader({
    centreLatDeg: WORLD_CENTRE.latDeg,
    centreLonDeg: WORLD_CENTRE.lonDeg,
    halfExtentM: GRID.halfExtentM,
    finestSamples: GRID.samples,
    levels: pyramid.length,
    encoding: 'int16-decimetres',
  })
  writeFileSync(terrainHeaderPath(), `${JSON.stringify(header, null, 2)}\n`)

  let committedBytes = 0
  let totalBytes = 0
  for (let level = 0; level < pyramid.length; level++) {
    const written = writeLevel(level, pyramid[level]!)
    totalBytes += written
    if (level >= FIRST_COMMITTED_LEVEL) committedBytes += written
  }

  console.log(
    `wrote ${pyramid.length} levels, ${totalBytes} bytes total, ` +
    `${committedBytes} bytes committed (L${FIRST_COMMITTED_LEVEL}..L${pyramid.length - 1})`,
  )
  console.log(`total ${secondsSince(started)} s`)
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
