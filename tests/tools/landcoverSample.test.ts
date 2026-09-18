import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE_DIR, COVER_BOX, tileFileName, tileIdsFor } from '../../tools/landcover/fetch.js'
import { CLASS, channelOf, openCoverSource } from '../../tools/landcover/sample.js'

describe('WorldCover classes map to the four shipped channels', () => {
  it('applies the one 1944 correction and nothing else', () => {
    expect(channelOf(CLASS.tree)).toBe('tree')
    expect(channelOf(CLASS.mangrove)).toBe('mangrove')
    expect(channelOf(CLASS.crop)).toBe('crop')
    // Master spec section 4's known compromise: towns sat in paddy country.
    expect(channelOf(CLASS.built)).toBe('crop')
    for (const cls of [CLASS.grass, CLASS.shrub, CLASS.bare]) expect(channelOf(cls)).toBe('open')
    for (const cls of [CLASS.water, CLASS.wetland, CLASS.snow, CLASS.moss, 0]) expect(channelOf(cls)).toBe('water')
  })
})

const paths = tileIdsFor(COVER_BOX).map(id => join(CACHE_DIR, tileFileName(id)))
const haveSource = paths.every(p => existsSync(p))
if (!haveSource) {
  console.warn(`[landcoverSample.test.ts] ${CACHE_DIR} lacks the WorldCover tiles -- the source checks are SKIPPED. Run \`npx tsx tools/landcover/fetch.ts\` to enable them.`)
}

describe.skipIf(!haveSource)('the sampler against the Earth', () => {
  it('reads the landmarks measured on 2026-09-17 from the 10 m tiles', async () => {
    const source = await openCoverSource(paths, COVER_BOX)
    const around = (lat: number, lon: number, halfM = 100) => {
      const d = halfM / 111000
      return source.fractions({ latMin: lat - d, latMax: lat + d, lonMin: lon - d, lonMax: lon + d })
    }
    // Mt Nacolod, an inland peak: tree 100 %.
    expect(around(10.450846, 125.096068).tree).toBeGreaterThan(0.95)
    // Leyte Gulf: water 100 %, every land channel 0.
    const gulf = around(10.75, 125.25)
    expect(gulf.water).toBeGreaterThan(0.99)
    expect(gulf.tree + gulf.crop + gulf.mangrove + gulf.open).toBeLessThan(0.01)
    // Dagami plain, the Leyte Valley: crop 86 %.
    expect(around(11.06, 124.9).crop).toBeGreaterThan(0.75)
    // Mangrove shore on San Juanico Strait: mangrove 100 %.
    expect(around(11.289, 125.077).mangrove).toBeGreaterThan(0.95)
    // Tacloban airfield: grass 64 %, built 33 % -> open ~0.64, crop ~0.36 after the correction, no trees.
    const strip = around(11.228, 125.028)
    expect(strip.tree).toBeLessThan(0.05)
    expect(strip.open).toBeGreaterThan(0.5)
    expect(strip.crop).toBeGreaterThan(0.25)
  }, 120_000)

  it('crosses the tile seam at 126 E without a gap', async () => {
    const source = await openCoverSource(paths, COVER_BOX)
    // A rectangle straddling the seam in open sea east of Samar: still all water, no NaN.
    const f = source.fractions({ latMin: 11.0, latMax: 11.01, lonMin: 125.995, lonMax: 126.005 })
    expect(f.water).toBeGreaterThan(0.99)
    expect(Number.isFinite(f.tree)).toBe(true)
  }, 120_000)
})
