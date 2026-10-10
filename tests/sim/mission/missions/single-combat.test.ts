/**
 * Single Combat, flown headless (F2 plan, docs/superpowers/plans/2026-10-09-f2-single-combat-scramble.md).
 *
 * Tuning notes, 2026-10-09: the player starts 8 km (5 mi) east of a veteran
 * Ki-84 whose pilot targets him, both at 3,000 m and closing head-on over
 * Leyte Gulf, wind 4 m/s from 000 (straight down Tacloban's
 * runway, because `fieldApproach` lands off-field in any crosswind). Measured:
 * a player who just flies on at 80% throttle with the stick centered is shot
 * down at 130.0 s (the Frank's first rounds at 120.9 s), after a head-on
 * pass, an extension and a lead-pursuit run; at full throttle he lasts to
 * 239.0 s. The pin brackets the 80% case, [115, 145] s, so a change that
 * disarms the opponent or leaves him harmless fails here.
 */
import { describe, it, expect } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import type { World } from '../../../../src/sim/loop.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { isDoomed } from '../../../../src/sim/damage/model.js'
import { destroyNow, fieldApproach, hold, levelAt, stepsWithControls, terrainOrSkip } from '../fly.js'

const KILLED_S: readonly [number, number] = [115, 145]
const TALLY = "Tacloban tower: single bandit, a Frank, five miles west, angels ten. He's yours."
const SPLASH = 'Tacloban tower: splash one Frank. Come on home.'
const ON_START = levelAt({ x: -14666, z: -47605 }, 3000, 120, 270)

const terrain = terrainOrSkip()
const duel = (): World<undefined> => worldFromScenario(loadScenarioBundle('single-combat'), terrain)

describe('Single Combat content', () => {
  it('one veteran Ki-84 targets the player, 8 km (5 mi) away at the same altitude', () => {
    const { scenario } = loadScenarioBundle('single-combat')
    const [me, frank] = scenario.aircraft
    expect(frank).toMatchObject({ id: 'frank-1', spec: 'ki-84-frank', pilot: { target: 'f6f-1', skill: 'veteran' } })
    if (!('airborneAt' in me!) || !('airborneAt' in frank!)) throw new Error('both start airborne')
    const a = me.airborneAt.position, b = frank.airborneAt.position
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeCloseTo(8000, -2)
    expect(a[1]).toBe(b[1])
  })
})

describe.skipIf(terrain === null)('Single Combat, headless', () => {
  it(`the veteran is dangerous: a player who just flies on is shot down in [${KILLED_S}] s`, () => {
    let w = duel()
    // Shot down: on fire or destroyed outright (damage stages, 2026-10-09).
    while (w.tick < ticksFor(KILLED_S[1]) && !isDoomed(w.combat.aircraft[w.player]!.damage)) w = stepsWithControls(w, 1, { throttle: 0.8 })
    expect(radioMessages(w.mission!)[0]).toMatchObject({ text: TALLY, tick: ticksFor(1) })
    const killed = w.combat.aircraft[w.player]!.damage
    expect(killed.attacker).toBe('frank-1')
    expect((killed.burningSince ?? killed.destroyedAt)! / 60).toBeGreaterThanOrEqual(KILLED_S[0])
  })

  it('success: the Frank goes down, the tower call, recover at Tacloban, badge', () => {
    let w = hold(duel(), ON_START, ticksFor(10))
    w = hold(destroyNow(w, ['frank-1']), ON_START, 1)
    expect(progressOf(w, 'bandit').status).toBe('complete')
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(SPLASH)
    w = fieldApproach(w, 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: { id: 'single-combat' }, reasons: [] })
  })

  it('landing with the Frank still up earns no badge', () => {
    const w = fieldApproach(hold(duel(), ON_START, ticksFor(5)), 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Frank: incomplete', 'Recover: incomplete'] })
  })
})
