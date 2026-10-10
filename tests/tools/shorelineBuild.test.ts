import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { modelIO } from '../../tools/models/document.js'
import { HAVE_BLENDER, runBlenderScript } from '../../tools/models/blender/run.js'
import { buildShoreGeometry, SHORE_SOURCE_LEVEL, terrainGrid } from '../../tools/shoreline/geometry.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'

const dir = mkdtempSync(resolve(tmpdir(), 'ww2airsim-shoreline-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const committed = readFileSync('content/scenery/beaches.glb')
const metadata = JSON.parse(readFileSync('content/scenery/beaches.json', 'utf8')) as {
  lines: number
  points: number
  glbBytes: number
}

describe('curved beach asset', () => {
  it('is the measured tiled Blender ribbon, with only the two shared roles', async () => {
    expect(metadata.lines).toBeGreaterThan(100)
    expect(metadata.points).toBeGreaterThan(10_000)
    expect(metadata.glbBytes).toBe(committed.length)
    const doc = await modelIO().readBinary(new Uint8Array(committed))
    const root = doc.getRoot()
    expect(root.listScenes()).toHaveLength(1)
    expect(root.listMaterials().map((m) => m.getName()).sort()).toEqual(['ShoreSand', 'ShoreSurf'])
    const primitives = root.listMeshes().flatMap((m) => m.listPrimitives())
    expect(primitives.length).toBeGreaterThan(3)
    let triangles = 0, vertices = 0
    for (const primitive of primitives) {
      const position = primitive.getAttribute('POSITION')
      const indices = primitive.getIndices()
      expect(position).not.toBeNull()
      expect(indices).not.toBeNull()
      triangles += indices!.getCount() / 3
      vertices += position!.getCount()
      for (let i = 0; i < position!.getCount(); i++) {
        expect(position!.getElement(i, [0, 0, 0]).every(Number.isFinite)).toBe(true)
      }
    }
    expect(triangles).toBeGreaterThan(metadata.points * 5)
    expect(vertices).toBeLessThan(triangles * 1.1)
  })

  it.skipIf(!HAVE_BLENDER)('rebuilds byte-identically with the pinned Blender', () => {
    const header = loadTerrainHeader()
    const shore = buildShoreGeometry(terrainGrid(header, SHORE_SOURCE_LEVEL, loadTerrainLevel(SHORE_SOURCE_LEVEL, header)))
    const input = resolve(dir, 'shore.json')
    const output = resolve(dir, 'beaches.glb')
    writeFileSync(input, JSON.stringify(shore))
    runBlenderScript('tools/shoreline/beaches.py', output, ['--input', input])
    expect(Buffer.from(readFileSync(output)).equals(committed)).toBe(true)
  }, 300_000)
})
