import { describe, expect, it } from 'vitest'
import {
  COVER_CHANNELS, COVER_SAMPLES, coverByteLength, coverFractionsAt, coverIndex, dequantize, parseCoverHeader, quantize,
} from '../../src/render/landcover/cover.js'

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
