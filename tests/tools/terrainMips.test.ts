import { describe, it, expect } from 'vitest'
import { halve, buildPyramid } from '../../tools/terrain/mips.js'
import { parseTerrainHeader, samplesAtLevel } from '../../src/sim/world/schema.js'

describe('the mip pyramid', () => {
  it('halves 2^k+1 to 2^(k-1)+1 with no dangling row', () => {
    expect(halve(new Int16Array(5 * 5), 5).length).toBe(3 * 3)
    expect(buildPyramid(new Int16Array(9 * 9), 9).map((l) => Math.sqrt(l.length))).toEqual([9, 5, 3])
  })

  it('averages the four corners of each cell', () => {
    // 3x3 of [0 10 20 / 30 40 50 / 60 70 80] halves to the four corner means.
    const src = Int16Array.from([0, 10, 20, 30, 40, 50, 60, 70, 80])
    expect(Array.from(halve(src, 3))).toEqual([20, 30, 50, 60])
  })

  it('preserves a constant exactly, at every level', () => {
    // Rounding that drifts downhill shows up here as a world that sinks a
    // decimetre per level -- 12 decimetres by the top, which is a visible
    // step at the LOD boundary and nowhere else.
    const flat = new Int16Array(9 * 9).fill(-137)
    for (const level of buildPyramid(flat, 9)) expect(level.every((v) => v === -137)).toBe(true)
  })

  it('rounds half away from zero, the same way in both directions', () => {
    // Index [1], not [0]: out[0] = (1+2+1+1)/4 = 1.25, not a tie, and
    // correctly rounds to 1 either way. The array's genuine halfway tie is
    // at out[1] = (2+2+1+1)/4 = 1.5 -> 2 (and -6/4 = -1.5 -> -2). Verified
    // by the coordinator's ruling 2026-09-14 after a brute-force search
    // proved [0] can never be a tie for this array under any general
    // halving algorithm consistent with the corners test above -- do not
    // "fix" this back to [0].
    expect(Array.from(halve(Int16Array.from([1, 2, 2, 1, 1, 1, 1, 1, 1]), 3))[1]).toBe(2)
    expect(Array.from(halve(Int16Array.from([-1, -2, -2, -1, -1, -1, -1, -1, -1]), 3))[1]).toBe(-2)
  })

  it('reproduces a linear ramp exactly at interior samples (pins the tent filter)', () => {
    // 5x5 where value depends only on column: src(r,c) = 10*c. Every value
    // assertion elsewhere in this file is at n=3, where every output sample
    // is a boundary sample and several incompatible generalisations (block
    // average, tent filter, ...) happen to agree -- this is the interior
    // case (n=5) that separates them. The mirrored edge output averages
    // fine columns 0 and 1 (mean 5); the interior output is a genuine [1,2,1]
    // tent over fine columns 1,2,3 = (10+40+30)/4 = 20, exact because a tent
    // reproduces a linear ramp exactly; the far mirrored edge averages fine
    // columns 3 and 4 (mean 35). Rows are constant, so the row-axis pass of
    // the (separable) tent changes nothing.
    const src = new Int16Array(5 * 5)
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) src[r * 5 + c] = 10 * c
    const out = halve(src, 5)
    expect(Array.from(out)).toEqual([5, 20, 35, 5, 20, 35, 5, 20, 35])
  })
})

describe('the terrain header', () => {
  it('rejects a header whose level count disagrees with its grid', () => {
    // Schema validation at the boundary is a correctness requirement here, not
    // hygiene: master spec S9's point is that malformed content does not
    // throw, it produces a NaN that teleports the aeroplane.
    expect(() =>
      parseTerrainHeader({
        centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
        finestSamples: 8193, levels: 99, encoding: 'int16-decimetres',
      }),
    ).toThrow()
  })

  it('reports each level size', () => {
    const h = parseTerrainHeader({
      centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
      finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
    })
    expect(samplesAtLevel(h, 0)).toBe(8193)
    expect(samplesAtLevel(h, 4)).toBe(513)
    expect(samplesAtLevel(h, 12)).toBe(3)
  })
})
