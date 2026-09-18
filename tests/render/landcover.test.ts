import { describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  COVER_CHANNELS, COVER_SAMPLES, coverByteLength, coverFractionsAt, coverIndex, dequantize, parseCoverHeader, quantize,
} from '../../src/render/landcover/cover.js'
import { assertSameBoxAsTerrain, COVER_HEADER, loadCover } from '../../src/render/landcover/load.js'
import { TERRAIN_HEADER } from '../../src/render/terrain/load.js'
import { COVER_PATH, COVER_URL } from '../../src/render/content.js'

const header = parseCoverHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, samples: COVER_SAMPLES,
  channels: [...COVER_CHANNELS], encoding: 'rgba8-sixteenths',
})

describe('cover raster geometry', () => {
  it('is 1025 square, four bytes a sample, on the terrain grid', () => {
    expect(coverByteLength(header)).toBe(1025 * 1025 * 4)
    // Row 0 is the NORTH edge (z = -half), column 0 the WEST edge (x = -half):
    // tools/terrain/resample.ts's gridToLocal, the frame 29f5319 settled.
    expect(coverIndex(header, -100000, -100000)).toBe(0)
    expect(coverIndex(header, 100000, -100000)).toBe(1024)
    expect(coverIndex(header, -100000, 100000)).toBe(1024 * 1025)
    // Nearest sample: 195.3 m per step, so 97 m east of a sample rounds to it.
    expect(coverIndex(header, -100000 + 97, -100000)).toBe(0)
    expect(coverIndex(header, -100000 + 98, -100000)).toBe(1)
    // Outside the box clamps to the edge rather than reading garbage.
    expect(coverIndex(header, -200000, -200000)).toBe(0)
  })

  it('quantises to sixteenths and back', () => {
    expect(quantize(0)).toBe(0)
    expect(quantize(1)).toBe(255)
    expect(quantize(0.5)).toBe(8 * 17)
    for (let i = 0; i <= 15; i++) expect(dequantize(i * 17)).toBeCloseTo(i / 15, 12)
  })

  it('reads the four channels of a sample', () => {
    const data = new Uint8Array(coverByteLength(header))
    const i = coverIndex(header, 0, 0) * 4
    data[i] = quantize(0.6); data[i + 1] = quantize(0.2); data[i + 2] = quantize(0); data[i + 3] = quantize(0.2)
    expect(coverFractionsAt(data, header, 0, 0)).toEqual({ tree: 0.6, crop: 0.2, mangrove: 0, open: 0.2 })
  })

  it('rejects a header that does not describe this grid', () => {
    expect(() => parseCoverHeader({ ...header, samples: 1024 })).toThrow()
    expect(() => parseCoverHeader({ ...header, encoding: 'png' })).toThrow()
    expect(() => parseCoverHeader({ ...header, channels: ['tree'] })).toThrow()
    expect(() => parseCoverHeader({ ...header, halfExtentM: Infinity })).toThrow()
    expect(() => parseCoverHeader({ ...header, extra: 1 })).toThrow()
  })
})

describe('loadCover', () => {
  it('inflates the gzipped raster and checks its length', async () => {
    const raw = new Uint8Array(coverByteLength(COVER_HEADER))
    raw[4] = 255
    const gz = gzipSync(raw)
    const served: typeof fetch = async () => new Response(gz, { status: 200 })
    const data = await loadCover(served)
    expect(data.length).toBe(raw.length)
    expect(data[4]).toBe(255)
  })

  it('refuses a short body and a failed fetch', async () => {
    const short: typeof fetch = async () => new Response(gzipSync(new Uint8Array(16)), { status: 200 })
    await expect(loadCover(short)).rejects.toThrow(/inflates to 16 bytes/)
    const missing: typeof fetch = async () => new Response(null, { status: 404, statusText: 'Not Found' })
    await expect(loadCover(missing)).rejects.toThrow(/404/)
  })

  it('is addressed like the other content', () => {
    expect(COVER_PATH).toBe('content/landcover/cover.bin.gz')
    expect(COVER_URL.endsWith(COVER_PATH)).toBe(true)
    expect(COVER_HEADER.samples).toBe(COVER_SAMPLES)
  })
})

describe('assertSameBoxAsTerrain', () => {
  it('accepts the committed cover header against the committed terrain header', () => {
    // The two ship separately (`content/landcover/header.json` and
    // `content/terrain/header.json`) but must describe the same box; this is
    // the check that would have caught a raster built for a different centre
    // or extent, which `parseCoverHeader` alone cannot (a header describing
    // the wrong box is still a validly-shaped header). Also exercised simply
    // by importing `load.js` at all, since the module calls this at load
    // time against these same two headers -- if it were going to throw, the
    // whole suite would already be red.
    expect(() => assertSameBoxAsTerrain(COVER_HEADER, TERRAIN_HEADER)).not.toThrow()
  })

  it('refuses a cover header that describes a different box than the terrain', () => {
    const wrongCentre = { ...COVER_HEADER, centreLatDeg: 0 }
    expect(() => assertSameBoxAsTerrain(wrongCentre, TERRAIN_HEADER)).toThrow(/different box/)
    const wrongExtent = { ...COVER_HEADER, halfExtentM: 50_000 }
    expect(() => assertSameBoxAsTerrain(wrongExtent, TERRAIN_HEADER)).toThrow(/different box/)
  })
})
