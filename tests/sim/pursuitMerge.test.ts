import { describe, expect, it } from 'vitest'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../../src/sim/ai/pilot.js'
import { length, sub } from '../../src/sim/math/vec3.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { flyGunneryBot, withNoiseCursor } from './gunneryBot.js'

/**
 * Air Combat (`pursuit-range`) and Air Combat: Veteran (`pursuit-range-
 * veteran`) start as a head-on merge, 2026-09-25. The old start -- a veteran
 * 500 m astern, 5 m/s faster, already inside its own gun range -- gave the
 * shootdown spike's scripted player no firing envelope in 64 of 64 runs; it
 * survives, frozen, as tests/fixtures/scenarios/pursuit-tail-chase.json for
 * the Plan 7 AI tests that measure against it.
 *
 * "A firing chance" is measured with a scripted player flying the shipped,
 * harmonized reticle (`gunneryBot.ts`): the pursuer's center within 2 degrees
 * of the reticle inside 400 m. Eight noise cursors per scenario, so the sweep
 * samples the AI's own control noise.
 */

const CURSORS = [0, 7919, 15838, 23757, 31676, 39595, 47514, 55433]

describe.each([
  ['pursuit-range', GREEN_SKILL],
  ['pursuit-range-veteran', VETERAN_SKILL],
] as const)('%s: a head-on merge', (id, skill) => {
  const bundle = loadScenarioBundle(id)

  it('starts about 2.5 km apart, nose to nose, closing, at the same altitude', () => {
    const world = worldFromScenario(bundle, null)
    const player = world.aircraft.find((a) => a.id === world.player)!
    const pursuer = world.aircraft.find((a) => a.id === 'pursuer-1')!
    expect(pursuer.pilot?.skill).toEqual(skill)
    const range = length(sub(pursuer.state.position, player.state.position))
    expect(range).toBeGreaterThan(2400)
    expect(range).toBeLessThan(2600)
    expect(Math.abs(pursuer.state.position.y - player.state.position.y)).toBeLessThan(50)
    // Closing: the range rate is negative, and near the two speeds summed.
    const rel = sub(pursuer.state.position, player.state.position)
    const closing = (rel.x * (pursuer.state.velocity.x - player.state.velocity.x) +
      rel.z * (pursuer.state.velocity.z - player.state.velocity.z)) / range
    expect(closing).toBeLessThan(-240)
  })

  it('gives a player aiming with the reticle a firing chance in every run, inside 15 s', () => {
    const runs = CURSORS.map((c) => flyGunneryBot(withNoiseCursor(worldFromScenario(bundle, null), c), 'pursuer-1', 30))
    for (const [i, r] of runs.entries()) {
      expect(r.firstChanceS, `cursor ${CURSORS[i]}`).not.toBeNull()
      expect(r.firstChanceS!, `cursor ${CURSORS[i]}`).toBeLessThan(15)
    }
    // Measured 2026-09-25: green 7/8 kills, veteran 8/8, all but one at the
    // first merge (8.5-9.3 s). Re-measured 2026-09-26 at 7c Task 10: green
    // 7/8, veteran 7/8 (kills 9.05-9.52 s). pursuit-range-veteran's motion
    // digest is unchanged from 7c Task 6 through Task 10, so the veteran's
    // drift came at or before Task 6. Asserted as a floor, not tuned to the
    // count.
    expect(runs.filter((r) => r.killS !== null).length).toBeGreaterThanOrEqual(6)
  })
})
