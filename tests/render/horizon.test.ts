import { describe, expect, it } from 'vitest'
import { horizonDistanceM, horizonSinkM, OCEAN_EXTENT_M } from '../../src/render/horizon.js'

describe('horizonSinkM', () => {
  // The number in the Plan 4 hand-off, in README.md and in the ocean design:
  // land 80 m lower than the flat sea at 32 km is exactly why the beach was
  // hidden. If this function ever stops producing it, the three documents
  // that quote it have silently become wrong.
  it('reproduces the 80.4 m at 32 km that the hidden-beach ruling is written about', () => {
    expect(horizonSinkM(32_000)).toBeCloseTo(80.4, 1)
  })

  it('is zero at zero distance and grows with the square of it', () => {
    expect(horizonSinkM(0)).toBe(0)
    expect(horizonSinkM(2000) / horizonSinkM(1000)).toBeCloseTo(4, 6)
  })

  it('is even: a sink cannot depend on which side of the camera the sample is', () => {
    expect(horizonSinkM(-5000)).toBe(horizonSinkM(5000))
  })
})

describe('horizonDistanceM', () => {
  // Design §5's table. These are what set OCEAN_EXTENT_M, so they are
  // asserted rather than left in prose.
  it.each([
    [600, 87_400],
    [3_000, 195_500],
    [4_572, 241_400],
    [11_370, 380_600],
  ])('sees %i m -> ~%i m of horizon', (eyeM, expectedM) => {
    expect(horizonDistanceM(eyeM)).toBeCloseTo(expectedM, -2)
  })

  it('is inverted by horizonSinkM: the sink at the horizon is the eye height', () => {
    const eyeM = 3_000
    expect(horizonSinkM(horizonDistanceM(eyeM))).toBeCloseTo(eyeM, 6)
  })
})

describe('OCEAN_EXTENT_M', () => {
  // Design §5: the extent is set by the horizon at the service ceiling, not
  // by the terrain's draw distance. If the grid is shorter than the horizon,
  // the edge of the world is in frame.
  it('reaches past the horizon at the F6F service ceiling', () => {
    expect(OCEAN_EXTENT_M).toBeGreaterThan(horizonDistanceM(11_370))
  })
})
