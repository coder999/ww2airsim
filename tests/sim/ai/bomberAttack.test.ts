import { describe, expect, it } from 'vitest'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { applyDifficulty } from '../../../src/sim/difficulty.js'
import { isDestroyed } from '../../../src/sim/mission/step.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'
import { hold, levelAt } from '../mission/fly.js'

/**
 * Fighters on a bomber formation flying straight and level: the Escort
 * mission's interceptors with the escort held far away, no terrain (the
 * mission's own test, `tests/sim/mission/missions/escort.test.ts`, flies it
 * over terrain). Four B-17s at 3,000 m; four Zeros, `zero-1` the veteran, from
 * 800 m above.
 *
 * Why it exists (E4, 2026-10-10): E4's first cut flew veteran lead pursuit on
 * the lift vector at any target. Against these level bombers it dove `zero-1`
 * under them to 70 m/s with no hits in its first pass, and the Zeros downed no
 * B-17 at all. Measured on this world at 300 s, Normal: that cut, `zero-1` 0
 * hits and no bomber lost by 600 s; with the lift vector kept for a turning
 * target (`pursuitSteering`), 200 hits and two B-17s down by 300 s, all four
 * by 600 s.
 */
const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 120, 90)
const BOMBERS = ['fort-1', 'fort-2', 'fort-3', 'fort-4']

describe('fighters on a level bomber formation (E4)', () => {
  it('unescorted, the Zeros\' veteran lands its first pass and two B-17s are down within 300 s', () => {
    const w = hold(applyDifficulty(worldFromScenario(loadScenarioBundle('escort'), null), 'normal'), FAR, 300 * 60)
    expect(w.combat.aircraft['zero-1']!.hits).toBeGreaterThanOrEqual(100)
    expect(BOMBERS.filter((id) => isDestroyed(w, id)).length).toBeGreaterThanOrEqual(2)
  }, 60_000)
})
