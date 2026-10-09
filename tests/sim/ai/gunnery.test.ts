import { describe, expect, it } from 'vitest'
import { duel, type Geometry, type Skill } from '../../../tools/ai/duel.js'
import { CURSORS_4 } from '../../../tools/ai/replica.js'

/**
 * E1, gunnery honesty: AI-vs-AI fights end in kills. Two F6Fs each target the
 * other (tools/ai/duel.ts), 180 s, through production `advance`, at the spec
 * §3.1 noise cursors (k * 7919).
 *
 * Before E1 (measured 2026-10-09, same harness): 3 kills in 72 duels at 8
 * cursors, every geometry and skill pairing. The causes, fixed in pursuit.ts:
 * the lead used the target's velocity, not the relative one, and ignored drag
 * and drop; and the velocity controller tracked a turning target's solution
 * 3.4-5 deg behind the nose, outside the veteran's 1.8 deg cone.
 *
 * Mark's retune the same day (veterans toned down, green to hit harder) set
 * the numbers below. Not pinned: veteran against veteran head-on and on the
 * tail (1 of 4 and 0 of 4), and green against green but for the crossing,
 * where most of the fight is both pilots in Break and Extend, as slow as
 * 80 mph. That is the decision layer's (Track E item 4), not gunnery.
 */
const CURSORS_8 = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => k * 7919)
const ROWS: readonly (readonly [Geometry, Skill, Skill, readonly number[], number])[] = [
  // geometry, a, b, cursors, kills, measured 2026-10-09 after the retune
  ['head-on', 'veteran', 'green', CURSORS_4, 3],
  ['tail', 'veteran', 'green', CURSORS_4, 4],
  ['crossing', 'veteran', 'green', CURSORS_4, 3],
  ['crossing', 'veteran', 'veteran', CURSORS_4, 3],
  // Green kills green (0 of 24 before the retune).
  ['crossing', 'green', 'green', CURSORS_8, 2],
]

describe('E1: AI duels resolve by kills', () => {
  it.each(ROWS)('%s, %s v %s: enough end in a kill within 180 s', (geometry, a, b, cursors, kills) => {
    const runs = cursors.map((c) => duel(geometry, a, b, c))
    expect(runs.filter((r) => r.killer !== null).length, JSON.stringify(runs)).toBeGreaterThanOrEqual(kills)
  }, 120_000)
})
