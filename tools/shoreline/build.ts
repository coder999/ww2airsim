import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runBlenderScript } from '../models/blender/run.js'
import { loadTerrainHeader, loadTerrainLevel } from '../terrain/load.js'
import { buildShoreGeometry, SHORE_SOURCE_LEVEL, terrainGrid } from './geometry.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const cacheDir = resolve(root, 'tools/shoreline/cache')
const output = resolve(root, 'content/scenery/beaches.glb')
const metadataPath = resolve(root, 'content/scenery/beaches.json')
const inputPath = resolve(cacheDir, 'beaches-input.json')
const script = resolve(root, 'tools/shoreline/beaches.py')

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i < 0) return undefined
  const value = process.argv[i + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

function boundsFromArgs(): Bounds | undefined {
  const raw = option('--bounds')
  if (raw === undefined) return undefined
  const n = raw.split(',').map(Number)
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) throw new Error('--bounds must be minX,maxX,minZ,maxZ')
  const [minX, maxX, minZ, maxZ] = n as [number, number, number, number]
  if (!(minX < maxX && minZ < maxZ)) throw new Error('--bounds minima must be below maxima')
  return { minX, maxX, minZ, maxZ }
}

const header = loadTerrainHeader()
const heights = loadTerrainLevel(SHORE_SOURCE_LEVEL, header)
const shore = buildShoreGeometry(terrainGrid(header, SHORE_SOURCE_LEVEL, heights), boundsFromArgs())
if (shore.lines.length === 0) throw new Error('shoreline: contour produced no retained lines')

mkdirSync(cacheDir, { recursive: true })
writeFileSync(inputPath, JSON.stringify(shore))
runBlenderScript(script, output, ['--input', inputPath])

const sourceBytes = Buffer.from(heights.buffer, heights.byteOffset, heights.byteLength)
const metadata = {
  version: 1,
  sourceLevel: shore.sourceLevel,
  sourceStepM: shore.sourceStepM,
  sourceBytes: sourceBytes.length,
  lines: shore.lines.length,
  closedLines: shore.lines.filter((line) => line.closed).length,
  points: shore.lines.reduce((sum, line) => sum + line.points.length, 0),
  perimeterM: Math.round(shore.lines.reduce((sum, line) => sum + line.perimeterM, 0)),
  glbBytes: readFileSync(output).length,
  lanes: shore.lanes,
}
writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
if (!process.argv.includes('--keep-input')) rmSync(inputPath, { force: true })
console.log(JSON.stringify(metadata, null, 2))

