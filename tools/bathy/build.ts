import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { toGeodetic } from '../../src/sim/world/projection.js'
import { parseOceanHeader, type OceanHeader } from '../../src/render/ocean/schema.js'
import { CACHE_DIR, fetchSubset, parseSubset, subsetWindow, terrainBox, type Subset } from './fetch.js'

/** GEBCO's source rows run south to north; coordinates are cell centres. */
export function sampleSubset(source: Subset, latDeg: number, lonDeg: number): number {
  const y = (latDeg - source.latitudes[0]!) * 240
  const x = (lonDeg - source.longitudes[0]!) * 240
  const { latCount, lonCount } = source.window
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > lonCount - 1 || y > latCount - 1) {
    throw new Error('bathy: requested point is outside source coverage')
  }
  const col = Math.min(Math.floor(x), lonCount - 2)
  const row = Math.min(Math.floor(y), latCount - 2)
  const fx = x - col
  const fy = y - row
  const at = (dx: number, dy: number) => source.elevations[(row + dy) * lonCount + col + dx]!
  return (1 - fy) * ((1 - fx) * at(0, 0) + fx * at(1, 0)) +
    fy * ((1 - fx) * at(0, 1) + fx * at(1, 1))
}

/** Output int16 METRES, LE, row-major; row 0 NORTH, column 0 WEST. */
export function buildDepth(source: Subset, rawHeader: OceanHeader): Uint8Array {
  const header = parseOceanHeader(rawHeader)
  // Checks the fixed projection centre before resampling any bytes.
  subsetWindow(header, 4)
  const { samples, halfExtentM } = header
  const bytes = new Uint8Array(samples * samples * 2)
  const view = new DataView(bytes.buffer)
  for (let row = 0; row < samples; row++) for (let col = 0; col < samples; col++) {
    const x = -halfExtentM + col * 2 * halfExtentM / (samples - 1)
    const z = halfExtentM - row * 2 * halfExtentM / (samples - 1)
    const { latDeg, lonDeg } = toGeodetic(x, z)
    const metres = Math.round(sampleSubset(source, latDeg, lonDeg))
    if (!Number.isFinite(metres) || metres <= -32768 || metres >= 32767) {
      throw new Error(`bathy: elevation ${metres} cannot be encoded without saturation`)
    }
    view.setInt16((row * samples + col) * 2, metres, true)
  }
  return bytes
}

async function build(): Promise<void> {
  const started = performance.now()
  const box = terrainBox()
  const source = parseSubset(readFileSync(await fetchSubset(CACHE_DIR), 'utf8'), subsetWindow(box, 4))
  const terrain = JSON.parse(readFileSync(new URL('../../content/terrain/header.json', import.meta.url), 'utf8')) as { finestSamples: number }
  // Match terrain L4 exactly; no independent posting or world extent.
  const header = parseOceanHeader({ ...box, samples: (terrain.finestSamples - 1) / 16 + 1, encoding: 'int16-metres' })
  const bytes = buildDepth(source, header)
  const out = new URL('../../content/ocean/', import.meta.url)
  mkdirSync(out, { recursive: true })
  writeFileSync(new URL('depth.bin', out), bytes)
  writeFileSync(new URL('header.json', out), JSON.stringify(header, null, 2) + '\n')
  console.log(`bathy: wrote ${bytes.length} bytes in ${Math.round(performance.now() - started)} ms`)
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().catch((err: unknown) => { console.error(err); process.exitCode = 1 })
}
