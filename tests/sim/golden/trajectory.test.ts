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
 *
 * Sized to the drift the tolerance actually exists for, not to a round
 * number. Finding I2: these were 1.0 m and 0.1 m/s, eight orders looser than
 * their own justification in `tools/golden/record.ts`, and loose enough that
 * rewriting the integrator from semi-implicit to explicit Euler -- a change
 * of integration SCHEME -- passed with a max checkpoint divergence of 0.807 m
 * against the old 1.0 m.
 *
 * The real margin, measured on this checkout 2026-09-12, node v22.22.1:
 *   - transcendental drift this golden is expected to absorb: on the order of
 *     1e-11 m, from a single Math.sin/cos ULP amplified by the ~23.7x
 *     perturbation response measured in `record.ts`
 *   - the largest divergence actually observed from a legitimate change: the
 *     C1 lift-curve fix rewrote the attached branch as one straight line
 *     instead of a mirrored one, which is algebraically identical but rounds
 *     differently for negative alpha, and moved 11 of 13 checkpoints by at
 *     most 2.27e-13 m and 2.84e-14 m/s
 *   - so POSITION_TOL_M sits ~8 orders above the ULP drift and ~4e9x above
 *     the measured C1 movement
 *
 * Re-applying the explicit-Euler mutation now fails this test (verified
 * 2026-09-12): it trips first at tick 0, by 1.13e-3 m -- only just over the
 * tolerance, because the schemes differ by one dt of acceleration -- and the
 * error accumulates to 0.807 m by tick 3599, 807x POSITION_TOL_M, with a max
 * speed divergence of 7.49e-4 m/s, 75x SPEED_TOL_MPS. The test checks every
 * checkpoint, so the detection does not rest on that first narrow margin.
 */
const POSITION_TOL_M = 1e-3
const SPEED_TOL_MPS = 1e-5

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
