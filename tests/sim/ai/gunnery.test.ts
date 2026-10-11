import { describe, expect, it } from 'vitest'
import { duel, type Geometry, type Skill } from '../../../tools/ai/duel.js'

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
 * the numbers below, re-measured since (round 2, E4). Not pinned: green
 * against green, where most of the fight is both pilots in Break and Extend.
 * Before E4 those fights ran as slow as 16 mph, stalled; E4's stall guard
 * keeps them flying, but neither green converts.
 *
 * Damage stages (2026-10-09): a duel is decided when an airplane catches fire
 * (`tools/ai/duel.ts`), and a hit engine now sputters. That unpinned green
 * against green crossing, the last green-green row: 2 of 8 with the engine
 * cutting out disabled, 0 of 8 with it (same harness, same day; every other
 * row is unchanged). The sputtering target's pulsing thrust spoils a green's
 * lead, and the row was 2 of 8 to begin with. Mark's call whether it stays so.
 */
const CURSORS_8 = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => k * 7919)
// Damage stages round 2 (Mark, 2026-10-09): fighters 4x tougher, so about three good bursts set one
// alight. Re-measured at 8 cursors (tools/ai/duel.ts), kills before -> after, mean time to kill:
//   head-on  v-g 4 -> 3 (115 -> 127 s), v-v 3 -> 2 (115 -> 139 s), g-g 1 -> 0
//   tail     v-g 8 -> 5 (51 -> 75 s),   v-v 1 -> 1 (107 -> 108 s), g-g 0 -> 0
//   crossing v-g 5 -> 5 (49 -> 64 s),   v-v 5 -> 2 (71 -> 97 s),   g-g 0 -> 0
// 27 of 72 duels resolved before, 18 after. Green against green resolves in none, so it stays out.
// E4 (2026-10-10; handoff docs/handoff/2026-10-10-e4-ai-fixes.md): the stall guard, lift-vector lead
// pursuit for the veteran against a turning target, the rudder limit and the attack run's longer latch.
// Re-measured at 8 cursors after the merge with the Escort mission, kills round 2 -> E4 (mean time to kill after):
//   head-on  v-g 3 -> 8 (100 s), v-v 2 -> 4 (116 s)
//   tail     v-g 5 -> 6 (117 s), v-v 1 -> 7 (99 s)
//   crossing v-g 5 -> 8 (80 s),  v-v 2 -> 3 (150 s)
// 18 of 72 resolved before, 36 after. Green against green still resolves in none.
const ROWS: readonly (readonly [Geometry, Skill, Skill, readonly number[], number])[] = [
  // geometry, a, b, cursors, kills, measured 2026-10-10 (E4)
  ['head-on', 'veteran', 'green', CURSORS_8, 8],
  ['head-on', 'veteran', 'veteran', CURSORS_8, 4],
  ['tail', 'veteran', 'green', CURSORS_8, 6],
  ['tail', 'veteran', 'veteran', CURSORS_8, 7],
  ['crossing', 'veteran', 'green', CURSORS_8, 8],
  ['crossing', 'veteran', 'veteran', CURSORS_8, 3],
]

describe('E1: AI duels resolve by kills', () => {
  it.each(ROWS)('%s, %s v %s: enough end in a kill within 180 s', (geometry, a, b, cursors, kills) => {
    const runs = cursors.map((c) => duel(geometry, a, b, c))
    expect(runs.filter((r) => r.killer !== null).length, JSON.stringify(runs)).toBeGreaterThanOrEqual(kills)
  }, 120_000)
})
