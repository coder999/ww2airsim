import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { toLocal } from '../../src/sim/world/projection.js'
import { coverByteLength, coverFractionsAt } from '../../src/render/landcover/cover.js'
import { buildCover, coverHeaderPath, coverPath, loadCover, loadCoverHeader } from '../../tools/landcover/build.js'
import type { CoverSource } from '../../tools/landcover/sample.js'

describe('buildCover', () => {
  it('samples each cell over its own footprint and quantises', () => {
    // A synthetic source: tree everywhere north of the equator line z = 0,
    // crop everywhere south. The cell at the north-west corner is row 0.
    const source: CoverSource = {
      fractions: (box) => {
        const lat = (box.latMin + box.latMax) / 2
        return lat > 10.8 ? { tree: 1, crop: 0, mangrove: 0, open: 0, water: 0 } : { tree: 0, crop: 1, mangrove: 0, open: 0, water: 0 }
      },
    }
    const data = buildCover(source, 9)
    expect(data.length).toBe(9 * 9 * 4)
    expect([...data.subarray(0, 4)]).toEqual([255, 0, 0, 0])       // row 0, north: tree
    expect([...data.subarray(8 * 9 * 4, 8 * 9 * 4 + 4)]).toEqual([0, 255, 0, 0])  // row 8, south: crop
  })
})

const COMMITTED_SHA256: Readonly<Record<string, string>> = {
  // Regenerate with `npm run landcover:build` and paste from `sha256sum
  // content/landcover/*`; the commit that changes these says what moved.
  'header.json': 'c17d4b0a66ebf0995733fa84c9b390c9d8c48d8364ee6e69ecdb2c3fae7821ef',
  'cover.bin.gz': '5b08d4b415be448a4d35de690fda9dbe91eb78ba7b3acf192e567943b7e7fbe1',
}
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('the committed land cover', () => {
  const header = loadCoverHeader()
  const data = loadCover()
  const at = (lat: number, lon: number) => {
    const p = toLocal(lat, lon)
    return coverFractionsAt(data, header, p.x, p.z)
  }

  it('is byte-for-byte the pinned build', () => {
    expect({ 'header.json': sha256(coverHeaderPath()), 'cover.bin.gz': sha256(coverPath()) }).toEqual(COMMITTED_SHA256)
    expect(data.length).toBe(coverByteLength(header))
  })

  it('agrees with the Earth at the landmarks measured on 2026-09-17', () => {
    // These are 195 m cells, so the thresholds are looser than the 200 m
    // windows in landcoverSample.test.ts; a cell straddles what a window
    // centres on. The DIRECTION of every assertion is the point.
    expect(at(10.450846, 125.096068).tree).toBeGreaterThan(0.85)          // Mt Nacolod
    const gulf = at(10.75, 125.25)                                          // Leyte Gulf
    expect(gulf.tree + gulf.crop + gulf.mangrove + gulf.open).toBe(0)
    expect(at(11.06, 124.9).crop).toBeGreaterThan(0.6)                      // Dagami plain
    expect(at(11.289, 125.077).mangrove).toBeGreaterThan(0.5)               // San Juanico shore
    const strip = at(11.228, 125.028)                                        // Tacloban airfield
    expect(strip.tree).toBeLessThan(0.2)
    expect(strip.open + strip.crop).toBeGreaterThan(0.6)
  })
})
