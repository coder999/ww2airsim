import { describe, expect, it } from 'vitest'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import { flyGunneryBot, withNoiseCursor } from './gunneryBot.js'

/**
 * An AI Zero against the scripted F6F player, from `pursuit-range`'s
 * head-on start (test fixture only; nothing ships it, and the player-facing
 * scenario is Z3's zero-range.json). It exists so the AI plans after Z2 (7c
 * onward) have a real Zero to measure against, instead of the synthetic
 * variant 7c's spec planned for.
 *
 * Floors, not tuned counts. Measured 2026-09-25 with a draft Zero (no fade,
 * no cutout, no gun types): a firing chance at 8.6 s in 8/8 runs, and 6/8
 * kills at 8 hits each. Re-measured in Task 7 (2026-09-25, the finished Zero:
 * fade, cutout and gun types): a firing chance at 8.63-8.65 s in 8/8 runs,
 * 8/8 kills at 9.07-9.57 s, 8 hits each, and the AI Zero fired 0 rounds
 * (0 hits) in every run -- the pursuer-never-fires open item the gunnery
 * handoff hands to 7c, not a Zero property.
 *
 * 7c (2026-09-25): the AI Zero no longer cuts its own engine. At HEAD it
 * pushed negative g through 176 ticks (2.9 s) of the approach, and with the
 * engine starved the bot killed it 8/8. With 7c's 0 g floor its engine keeps
 * running, and the bot kills it at the merge in 2 of 8 runs (measured with
 * the prototype envelope). The floor is lowered to 1, which is ruling R9,
 * Open for Mark item 2.
 */
const CURSORS = [0, 7919, 15838, 23757, 31676, 39595, 47514, 55433]

describe('zero-merge: F6F player against an AI Zero, head-on', () => {
  const bundle = loadFixtureScenarioBundle('zero-merge')

  it('flies the Zero as the pursuer', () => {
    const world = worldFromScenario(bundle, null)
    expect(world.aircraft.find((a) => a.id === 'pursuer-1')!.spec.id).toBe('a6m2-zero')
  })

  it('gives a player aiming with the reticle a firing chance in every run, inside 15 s', () => {
    const runs = CURSORS.map((c) => flyGunneryBot(withNoiseCursor(worldFromScenario(bundle, null), c), 'pursuer-1', 30))
    for (const [i, r] of runs.entries()) {
      expect(r.firstChanceS, `cursor ${CURSORS[i]}`).not.toBeNull()
      expect(r.firstChanceS!, `cursor ${CURSORS[i]}`).toBeLessThan(15)
      expect(Number.isFinite(r.opponentShots) && Number.isFinite(r.opponentHits)).toBe(true)
    }
    console.log('zero-merge runs', JSON.stringify(runs))
    expect(runs.filter((r) => r.killS !== null).length).toBeGreaterThanOrEqual(1)
  })
})
