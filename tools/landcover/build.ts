import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { toGeodetic, WORLD_CENTRE } from '../../src/sim/world/projection.js'
import { COVER_CHANNELS, COVER_SAMPLES, parseCoverHeader, quantize, type CoverHeader } from '../../src/render/landcover/cover.js'
import { GRID, gridToLocal } from '../terrain/resample.js'
import { COVER_BOX, ensureAllTiles } from './fetch.js'
import { openCoverSource, type CoverSource } from './sample.js'
import { COVER_DIR, coverHeaderPath, coverPath } from './load.js'

export { COVER_DIR, coverHeaderPath, coverPath, loadCover, loadCoverHeader } from './load.js'

/**
 * One RGBA sample per grid cell: the fraction of the cell's 10 m pixels in
 * each of tree, crop, mangrove, open, quantised to sixteenths. A cell is
 * the square of one grid step centred on its sample, so cells tile the box
 * with no gaps and no double counting. Row 0 is north, column 0 west.
 */
export function buildCover(source: CoverSource, samples = COVER_SAMPLES): Uint8Array {
  const grid = { samples, halfExtentM: GRID.halfExtentM }
  const half = GRID.halfExtentM / (samples - 1)
  const out = new Uint8Array(samples * samples * COVER_CHANNELS.length)
  for (let row = 0; row < samples; row++) {
    for (let col = 0; col < samples; col++) {
      const { x, z } = gridToLocal(col, row, grid)
      const corners = [toGeodetic(x - half, z - half), toGeodetic(x + half, z - half), toGeodetic(x - half, z + half), toGeodetic(x + half, z + half)]
      const f = source.fractions({
        latMin: Math.min(...corners.map(c => c.latDeg)), latMax: Math.max(...corners.map(c => c.latDeg)),
        lonMin: Math.min(...corners.map(c => c.lonDeg)), lonMax: Math.max(...corners.map(c => c.lonDeg)),
      })
      const i = (row * samples + col) * 4
      out[i] = quantize(f.tree); out[i + 1] = quantize(f.crop); out[i + 2] = quantize(f.mangrove); out[i + 3] = quantize(f.open)
    }
  }
  return out
}

async function main(): Promise<void> {
  const paths = await ensureAllTiles()
  const source = await openCoverSource(paths, COVER_BOX)
  const started = process.hrtime.bigint()
  const data = buildCover(source)
  const header: CoverHeader = parseCoverHeader({
    centreLatDeg: WORLD_CENTRE.latDeg, centreLonDeg: WORLD_CENTRE.lonDeg, halfExtentM: GRID.halfExtentM,
    samples: COVER_SAMPLES, channels: [...COVER_CHANNELS], encoding: 'rgba8-sixteenths',
  })
  mkdirSync(COVER_DIR, { recursive: true })
  writeFileSync(coverHeaderPath(), `${JSON.stringify(header, null, 2)}\n`)
  const gz = gzipSync(data, { level: 9 })
  writeFileSync(coverPath(), gz)
  const elapsedSeconds = (Number(process.hrtime.bigint() - started) / 1e9).toFixed(1)
  console.log(`landcover: ${COVER_SAMPLES}^2 x 4 = ${data.length} bytes raw, ${gz.length} bytes gzipped, ${elapsedSeconds} s`)
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
}
