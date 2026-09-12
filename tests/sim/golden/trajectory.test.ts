import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { recordTrajectory, type GoldenTrajectory } from '../../../tools/golden/record.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const GOLDEN_PATH = new URL('./f6f-rolling-descent.golden.json', import.meta.url)

/**
 * Spec §3: assert within tolerance, never exact equality. Math.sin/cos/exp are
 * implementation-approximated and differ across V8 versions, so an exact
 * assertion would break on a Node upgrade for no real reason.
 */
const POSITION_TOL_M = 1.0
const SPEED_TOL_MPS = 0.1

describe('golden trajectory regression', () => {
  it('reproduces the recorded trajectory within tolerance', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenTrajectory
    const actual = recordTrajectory(f6f)

    expect(actual.checkpoints).toHaveLength(golden.checkpoints.length)
    for (const [i, want] of golden.checkpoints.entries()) {
      const got = actual.checkpoints[i]!
      expect(got.tick).toBe(want.tick)
      for (const axis of [0, 1, 2] as const) {
        expect(
          Math.abs(got.position[axis] - want.position[axis]),
          `tick ${want.tick} axis ${axis}: ${got.position[axis]} vs ${want.position[axis]}`,
        ).toBeLessThan(POSITION_TOL_M)
      }
      expect(
        Math.abs(got.speed - want.speed),
        `tick ${want.tick} speed: ${got.speed} vs ${want.speed}`,
      ).toBeLessThan(SPEED_TOL_MPS)
    }
  })

  it('is self-consistent within a single run', () => {
    const a = recordTrajectory(f6f)
    const b = recordTrajectory(f6f)
    expect(a.checkpoints).toEqual(b.checkpoints)
  })

  // `engine` is provenance metadata only -- it records which Node produced
  // this golden, it is not an enforced constraint. This deliberately does
  // NOT assert the golden's engine matches `process.version`: a golden
  // recorded on an older/newer Node is expected to still pass the tolerance
  // checks above (that is the whole point of POSITION_TOL_M/SPEED_TOL_MPS),
  // and asserting equality here would wrongly fail a still-valid golden on
  // a Node upgrade.
  it('records the engine it was generated on', () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as GoldenTrajectory
    expect(golden.engine).toMatch(/^node v\d+/)
  })
})
