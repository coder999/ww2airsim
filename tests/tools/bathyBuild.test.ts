import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toGeodetic } from '../../src/sim/world/projection.js'
import { parseOceanHeader } from '../../src/render/ocean/schema.js'
import { sampleSubset, buildDepth } from '../../tools/bathy/build.js'
import { parseSubset, subsetWindow, terrainBox, CACHE_DIR, fetchSubset } from '../../tools/bathy/fetch.js'

const readBuilt = () => {
  const header = parseOceanHeader(JSON.parse(readFileSync('content/ocean/header.json', 'utf8')))
  const bytes = readFileSync('content/ocean/depth.bin')
  return { header, bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) }
}

describe('the committed ocean depth grid', () => {
  it('shares terrain geometry and preserves the full trench depth in integer metres', () => {
    const { header, bytes, view } = readBuilt()
    expect(header).toEqual({ ...terrainBox(), samples: 513, encoding: 'int16-metres' })
    expect(bytes.length).toBe(513 * 513 * 2)
    expect(view.getInt16((256 * 513 + 256) * 2, true)).toBe(-125)
    let minimum = Infinity
    let maximum = -Infinity
    for (let i = 0; i < 513 * 513; i++) {
      const v = view.getInt16(i * 2, true)
      minimum = Math.min(minimum, v)
      maximum = Math.max(maximum, v)
    }
    expect(minimum).toBeLessThan(-7000)
    expect(minimum).toBeGreaterThan(-32768)
    expect(maximum).toBeGreaterThan(1000)
    expect(maximum).toBeLessThan(32767)
  })

  it('has Leyte high ground to the west and deep water to the east', () => {
    const { view } = readBuilt()
    const at = (x: number, z: number) => view.getInt16(
      (Math.round((z + 100000) / 200000 * 512) * 513 + Math.round((x + 100000) / 200000 * 512)) * 2, true)
    expect(at(0, -80000)).toBeGreaterThan(0)
    expect(at(0, 80000)).toBeLessThan(-1000)
    expect(at(-53125, -23828)).toBeGreaterThan(500)
    expect(at(90000, 0)).toBeLessThan(-4000)
  })
})

it('rejects unknown keys, nonfinite values, wrong encoding and invalid sample grids', () => {
  const header = { ...terrainBox(), samples: 513, encoding: 'int16-metres' }
  for (const override of [{ typo: true }, { samples: 512 }, { halfExtentM: Infinity }, { encoding: 'int16-decimetres' }]) {
    expect(() => parseOceanHeader({ ...header, ...override })).toThrow()
  }
})

// This is a cached-source audit, not a network-dependent CI test.
import { existsSync, readdirSync } from 'node:fs'
const cached = existsSync(CACHE_DIR) && readdirSync(CACHE_DIR).some((name) => name.endsWith('.ascii'))
it.skipIf(!cached)('matches independent geographic interpolation at spread grid points', async () => {
  const source = parseSubset(readFileSync(await fetchSubset(CACHE_DIR), 'utf8'), subsetWindow(terrainBox(), 4))
  const { view } = readBuilt()
  for (const [row, col] of [[30, 70], [100, 400], [256, 256], [400, 100], [480, 480]]) {
    const { latDeg, lonDeg } = toGeodetic(-100000 + col! * 200000 / 512, -100000 + row! * 200000 / 512)
    // Independent cell selection against the returned maps, not the build's
    // index formula. Compare the interpolation before its <=0 land clamp.
    const y = source.latitudes.findIndex((v) => v > latDeg) - 1
    const x = source.longitudes.findIndex((v) => v > lonDeg) - 1
    const fx = (lonDeg - source.longitudes[x]!) / (source.longitudes[x + 1]! - source.longitudes[x]!)
    const fy = (latDeg - source.latitudes[y]!) / (source.latitudes[y + 1]! - source.latitudes[y]!)
    const at = (dx: number, dy: number) => source.elevations[(y + dy) * source.window.lonCount + x + dx]!
    const expected = (1 - fy) * ((1 - fx) * at(0, 0) + fx * at(1, 0)) + fy * ((1 - fx) * at(0, 1) + fx * at(1, 1))
    expect(Math.abs(view.getInt16((row! * 513 + col!) * 2, true) - expected)).toBeLessThanOrEqual(0.50001)
  }
})

it('samples an asymmetric source correctly and refuses missing coverage', () => {
  const source = {
    window: { latStart: 24000, latCount: 2, lonStart: 72000, lonCount: 2 },
    latitudes: [10.002083333333333, 10.00625],
    longitudes: [120.00208333333333, 120.00625],
    elevations: new Int16Array([-100, -200, -300, 400]),
  }
  expect(sampleSubset(source, 10.004166666666666, 120.00416666666666)).toBeCloseTo(-50, 5)
  expect(() => sampleSubset(source, 0, 0)).toThrow(/coverage/)
  expect(() => buildDepth(source, { ...terrainBox(), samples: 3, encoding: 'int16-metres' })).toThrow(/coverage/)
})
