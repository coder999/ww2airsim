// tests/render/ocean/beaufort.test.ts
import { describe, expect, it } from 'vitest'
import { BEAUFORT_MAX, BEAUFORT_MIN, beaufortFromWindMps, windSpeedMps, wmoWaveHeightM } from '../../../src/render/ocean/beaufort.js'
import { DEFAULT_BEAUFORT, seaStateFor } from '../../../src/render/ocean/weather.js'

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

describe('beaufortFromWindMps (Plan 8)', () => {
  it('picks the nearest force by representative speed, so 15 kn is force 4, the shipped default', () => {
    expect(beaufortFromWindMps(0)).toBe(0)
    expect(beaufortFromWindMps(7.717)).toBe(4)
    expect(beaufortFromWindMps(9.4)).toBe(5)
    expect(beaufortFromWindMps(12.3)).toBe(6)
    expect(beaufortFromWindMps(100)).toBe(12)
    expect(() => beaufortFromWindMps(NaN)).toThrow()
    expect(() => beaufortFromWindMps(-1)).toThrow()
  })
})

describe('seaStateFor (Plan 8 fix round 1)', () => {
  it('keeps the development sea for a calm scenario rather than going flat, but otherwise follows the wind, and an override always wins', () => {
    expect(seaStateFor(0, undefined)).toBe(DEFAULT_BEAUFORT)
    expect(seaStateFor(7.717, undefined)).toBe(4)
    expect(seaStateFor(12.3, undefined)).toBe(6)
    expect(seaStateFor(0, 6)).toBe(6)
  })
})
