import { describe, it, expect } from 'vitest'
import { createTerrainField, heightAt, SEA_LEVEL_M } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'

const header = parseTerrainHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
  finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
})

/** A 3x3 field spanning the whole world: one sample every 100 km. */
const field = (values: readonly number[]) =>
  createTerrainField(header, 12, Int16Array.from(values))

describe('heightAt', () => {
  it('is exact at a sample point', () => {
    const f = field([0, 0, 0, 0, 1000, 0, 0, 0, 0]) // 100 m at the centre
    expect(heightAt(f, 0, 0)).toBeCloseTo(100, 9)
  })

  it('interpolates linearly between samples', () => {
    const f = field([0, 0, 0, 0, 1000, 2000, 0, 0, 0]) // centre 100 m, east 200 m
    expect(heightAt(f, 50e3, 0)).toBeCloseTo(150, 6)
  })

  it('reads north as +z, matching the grid the pipeline wrote', () => {
    // Row 0 is the NORTH edge (Task 4). A field that reads it as south is
    // mirrored, and every other test here would still pass.
    const f = field([0, 5000, 0, 0, 0, 0, 0, 0, 0]) // 500 m at north-centre
    expect(heightAt(f, 0, 100e3)).toBeCloseTo(500, 6)
    expect(heightAt(f, 0, -100e3)).toBeCloseTo(0, 6)
  })

  it('returns sea level outside the world instead of NaN or a throw', () => {
    const f = field([100, 100, 100, 100, 100, 100, 100, 100, 100])
    const outside: ReadonlyArray<readonly [number, number]> = [
      [200e3, 0], [-200e3, 0], [0, 200e3], [0, -200e3], [1e9, 1e9],
    ]
    for (const [x, z] of outside) {
      expect(heightAt(f, x, z)).toBe(SEA_LEVEL_M)
    }
  })

  it('never returns NaN, for any input at all', () => {
    // Including the inputs a broken flight model can produce. Master spec S9:
    // a NaN in the integrator teleports the aeroplane silently.
    const f = field([0, 100, 200, 300, 400, 500, 600, 700, 800])
    for (const v of [NaN, Infinity, -Infinity, 0, -0, 1e308]) {
      expect(Number.isNaN(heightAt(f, v, 0))).toBe(false)
      expect(Number.isNaN(heightAt(f, 0, v))).toBe(false)
    }
  })
})
