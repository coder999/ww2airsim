import { describe, it, expect } from 'vitest'
import { resample, gridToLocal, DECIMETRE_LIMIT } from '../../tools/terrain/resample.js'
import { toLocal } from '../../src/sim/world/projection.js'

/** A small grid keeps these tests fast; the shipped one is 8193. */
const small = { samples: 257, halfExtentM: 100e3 }

describe('resampling onto the world grid', () => {
  it('lays row 0 along the north edge and column 0 along the west edge', () => {
    // Get this wrong and the world is mirrored -- which looks like plausible
    // terrain, not like a bug, until someone recognises the coastline.
    expect(gridToLocal(0, 0, small)).toEqual({ x: -100e3, z: 100e3 })
    expect(gridToLocal(256, 256, small)).toEqual({ x: 100e3, z: -100e3 })
    expect(gridToLocal(128, 128, small)).toEqual({ x: 0, z: 0 })
  })

  it('reproduces an analytic source at every grid point it samples', () => {
    // The sampler is a known function of POSITION, so this checks the whole
    // chain -- grid indexing, projection, quantisation -- against arithmetic
    // that does not go through any of it.
    const heightM = (lat: number, lon: number) => {
      const { x, z } = toLocal(lat, lon)
      return 100 + x / 1000 + z / 2000
    }
    const out = resample(heightM, small)
    for (const [col, row] of [[0, 0], [128, 128], [200, 37], [256, 256]] as const) {
      const { x, z } = gridToLocal(col, row, small)
      const expected = Math.round((100 + x / 1000 + z / 2000) * 10)
      expect(out[row * small.samples + col]).toBe(expected)
    }
  })

  it('is deterministic to the byte', () => {
    const f = (lat: number, lon: number) => Math.sin(lat) * 300 + Math.cos(lon) * 200
    expect(Buffer.from(resample(f, small).buffer.slice(0))).toEqual(
      Buffer.from(resample(f, small).buffer.slice(0)),
    )
  })

  it('turns a no-data sample into sea level rather than into NaN', () => {
    // A NaN here reaches the integrator, and master spec S9 is explicit about
    // what a NaN does to an airplane.
    const out = resample(() => NaN, small)
    expect(out.every((v) => v === 0)).toBe(true)
  })

  it('refuses a source sample it cannot represent instead of wrapping it', () => {
    expect(() => resample(() => DECIMETRE_LIMIT + 1, small)).toThrow(/range/i)
    expect(() => resample(() => -DECIMETRE_LIMIT - 1, small)).toThrow(/range/i)
  })
})
