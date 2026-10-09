import { describe, expect, it } from 'vitest'
import { duel, type Geometry, type Skill } from '../../../tools/ai/duel.js'
import { CURSORS_4 } from '../../../tools/ai/replica.js'

/**
 * E1, gunnery honesty: AI-vs-AI fights end in kills. Two F6Fs each target the
 * other (tools/ai/duel.ts), 180 s, through production `advance`, at the four
 * spec §3.1 noise cursors.
 *
 * Before E1 (measured 2026-10-09, same harness): 1 kill in 36 duels across
 * every geometry and skill pairing, 1 hit per 150 rounds. The causes, fixed
 * in pursuit.ts: the lead used the target's velocity, not the relative one,
 * and ignored drag and drop; and the velocity controller tracked a turning
 * target's solution 3.4-5 deg behind the nose, outside the veteran's 1.8 deg
 * gun cone, so it rarely fired. The green rows are not here: green does not
 * fine-track (GREEN_SKILL.gunTracking 0, so the 7d bar holds) and killed a
 * maneuvering green in 1 of 24 duels (2026-10-09, 8 cursors). Veteran against
 * green head-on is not here either: the pair spend the fight in Break and
 * Extend, as slow as 80 mph, which is the decision layer's (Track E item 4), not
 * gunnery.
 */
const ROWS: readonly (readonly [Geometry, Skill, Skill, number])[] = [
  // geometry, a, b, kills of 4, measured 2026-10-09 (each row 0 of 4 before E1)
  ['head-on', 'veteran', 'veteran', 4],
  ['tail', 'veteran', 'veteran', 2],
  ['crossing', 'veteran', 'veteran', 3],
  ['tail', 'veteran', 'green', 4],
  ['crossing', 'veteran', 'green', 4],
]

describe('E1: AI duels resolve by kills', () => {
  it.each(ROWS)('%s, %s v %s: at least %i of 4 end in a kill within 180 s', (geometry, a, b, kills) => {
    const runs = CURSORS_4.map((c) => duel(geometry, a, b, c))
    expect(runs.filter((r) => r.killer !== null).length, JSON.stringify(runs)).toBeGreaterThanOrEqual(kills)
  }, 60_000)

  it('a veteran on a green\'s tail kills it, every time, inside 25 s', () => {
    // Measured 2026-10-09: 21.5, 21.7, 20.2 and 21.3 s at the four cursors.
    for (const c of CURSORS_4) {
      const r = duel('tail', 'veteran', 'green', c)
      expect(r.killer, `cursor ${c}`).toBe('a')
      expect(r.killS!).toBeLessThan(25)
    }
  }, 60_000)
})
