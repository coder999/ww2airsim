import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync, gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { bakeHorizons } from './horizons.js'

const header = JSON.parse(readFileSync('content/terrain/header.json', 'utf8')) as { halfExtentM: number; finestSamples: number }
const level = 1
const source = gunzipSync(readFileSync(`content/terrain/L${level}.bin.gz`))
const raw = new Int16Array(source.buffer, source.byteOffset, source.length / 2)
const n = (header.finestSamples - 1) / 2 ** level + 1
if (raw.length !== n * n) throw new Error('Unexpected source DEM size')
const heights = Float32Array.from(raw, h => h / 10)
const samples = 1025, directions = 16, reachM = 25000
const out = resolve(process.argv[2] ?? 'content/terrain-lighting')
mkdirSync(out, { recursive: true })
const started = performance.now()
const { horizons, sky } = bakeHorizons({ samples: n, stepM: header.halfExtentM * 2 / (n - 1), heights }, samples, directions, reachM,
  row => console.log(`Horizon rows ${row}/${samples}`))
for (const [name, bytes] of [['horizons', horizons], ['sky', sky]] as const) {
  const compressed = gzipSync(bytes, { level: 9 })
  writeFileSync(resolve(out, `${name}.bin.gz`), compressed)
  console.log(`${name}: ${bytes.length} decoded, ${compressed.length} compressed bytes`)
}
writeFileSync(resolve(out, 'header.json'), JSON.stringify({ version: 1, samples, directions, halfExtentM: header.halfExtentM,
  reachM, sourceLevel: level, sourceSha256: createHash('sha256').update(source).digest('hex'), encoding: 'uint8-angle-half-pi',
  source: 'Copernicus GLO-30; see content/terrain/NOTICE.md' }, null, 2) + '\n')
console.log(`Wrote ${out} in ${((performance.now() - started) / 1000).toFixed(1)} seconds`)
