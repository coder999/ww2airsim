// tests/render/ocean/beaufort.test.ts
import { describe, expect, it } from 'vitest'
import { BEAUFORT_MAX, BEAUFORT_MIN, windSpeedMps, wmoWaveHeightM } from '../../../src/render/ocean/beaufort.js'

describe('the Beaufort scale', () => {
  it('is monotonic in wind speed across the whole scale', () => {
    for (let b = BEAUFORT_MIN; b < BEAUFORT_MAX; b++) {
      expect(windSpeedMps(b + 1)).toBeGreaterThan(windSpeedMps(b))
    }
  })

  it('is calm at 0', () => {
    expect(windSpeedMps(0)).toBe(0)
    expect(wmoWaveHeightM(0)).toBe(0)
  })

  // Spot values from the cited WMO table, not the whole table restated --
  // the table itself is the code.
  it('puts force 4 at 6.7 m/s and 1.0 m of sea', () => {
    expect(windSpeedMps(4)).toBeCloseTo(6.7, 2)
    expect(wmoWaveHeightM(4)).toBeCloseTo(1.0, 2)
  })

  it('rejects a force outside the scale rather than clamping it', () => {
    // Clamping would make `?beaufort=99` render as force 12 and look like a
    // working feature. Same rule as spawn.ts's throw-on-unparseable.
    expect(() => windSpeedMps(13)).toThrow(/0 and 12/)
    expect(() => windSpeedMps(-1)).toThrow(/0 and 12/)
    expect(() => windSpeedMps(4.5)).toThrow(/integer/)
    expect(() => windSpeedMps(Number.NaN)).toThrow()
  })
})
