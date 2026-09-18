import { describe, expect, it } from 'vitest'
import { reshapeCoast, SHORE_BASE_DM, SHORE_RISE_DM } from '../../tools/terrain/coast.js'

const grid = { samples: 3, halfExtentM: 100 }

describe('reshapeCoast', () => {
  it('flattens a majority-sea cell to zero whatever the DEM said', () => {
    const out = reshapeCoast(Int16Array.from([50, 0, 0, 0, 0, 0, 0, 0, 0]), () => 0.5, grid)
    expect(out[0]).toBe(0)
  })

  it('leaves land above sea level exactly alone', () => {
    const out = reshapeCoast(Int16Array.from([9150, 0, 0, 0, 0, 0, 0, 0, 0]), () => 0, grid)
    expect(out[0]).toBe(9150)
  })

  it('lifts the DEM zero-elevation land the ocean used to draw over', () => {
    // w = 0 is fully dry: 0.3 + 1.5 = 1.8 m = 18 dm.
    expect(reshapeCoast(new Int16Array(9), () => 0, grid)[0]).toBe(SHORE_BASE_DM + SHORE_RISE_DM)
    // w just under the half: 0.3 + 1.5 * (1 - 0.49) = 0.3 + 1.5 * 0.51 = 1.065 m = 10.65 dm -> 11 dm (rounded).
    expect(reshapeCoast(new Int16Array(9), () => 0.49, grid)[0]).toBe(11)
  })

  it('never writes a negative height, which the anti-mirror argument rests on', () => {
    // Strongly negative cell at col 0 with w = 0 reaches shore-lift
    // Expected: round(3 + 15 * (1 - 0)) = 18 dm. An exact assertion catches if
    // the formula ever starts reading h.
    const finest = Int16Array.from([-100, 0, 0, 0, 0, 0, 0, 0, 0])
    const out = reshapeCoast(finest, () => 0, grid)
    expect(out[0]).toBe(18)
    // Verify no values are negative (the anti-mirror argument)
    expect([...out].every((h) => h >= 0)).toBe(true)
  })

  it('passes the sea fraction its own column and row, not a flipped pair', () => {
    // Only (col 2, row 0) is sea. A transposed call would zero (0, 2).
    const finest = Int16Array.from([70, 70, 70, 70, 70, 70, 70, 70, 70])
    const out = reshapeCoast(finest, (col, row) => (col === 2 && row === 0 ? 1 : 0), grid)
    expect(out[2]).toBe(0)
    expect(out[2 * 3 + 0]).toBe(70)
  })
})
