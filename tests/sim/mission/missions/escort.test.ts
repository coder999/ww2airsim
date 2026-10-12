/**
 * Escort, flown headless (Escort plan, docs/superpowers/plans/2026-10-10-escort-mission.md).
 *
 * Content measurements, 2026-10-10 (this file re-derives each on every run):
 * - Four veteran B-17s in one finger-four start over the gulf at 3,000 m (about 10,000 ft) and 90 m/s, turn
 *   about 105 degrees at a turn point west of Tacloban, and level-bomb Dulag's hangars from the north. Their
 *   first bomb falls at about 416 s ("seven minutes" in the opening call).
 * - Aimed at the runway center (an airfield destination without `aim`), the 32 bombs fell on the strip and
 *   both hangars, 146 m off its centerline, stood: so the leader aims at the hangars' middle.
 * - Four Zeros (a veteran leader, three green wingmen) spawn at 60 s about 15 miles off, on an ingress route to
 *   the turn point. Unescorted (the player held far away), the drawing-fitted Zero guns (2026-10-11)
 *   shot down 1 bomber at Recruit and more than 1 at Veteran and Ace: Recruit is survivable by design;
 *   at the two combat difficulties the mission still needs its escort.
 */
import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft, type World } from '../../../../src/sim/loop.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { applyDifficulty, DIFFICULTIES, type Difficulty } from '../../../../src/sim/difficulty.js'
import { stationErrorM } from '../../../../src/sim/ai/formation.js'
import { isDestroyed } from '../../../../src/sim/mission/step.js'
import { radioMessages, ticksFor } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'

const BOMBERS = ['fort-1', 'fort-2', 'fort-3', 'fort-4']
const ZEROS = ['zero-1', 'zero-2', 'zero-3', 'zero-4']
const HANGARS = ['dulag-hangar-1', 'dulag-hangar-2']
const DULAG = { x: -31629, z: -16479 }
const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 120, 90)
const BOMBS_AWAY = 'Bomber lead: bombs away, hangars burning. Thanks for the ride, little friend.'
const LOST_TWO = "Bomber lead: we've lost two ships."
/** The first bomb falls at about 416 s; this leaves the train and its fall. */
const STRIKE_DONE_S = 480

const terrain = terrainOrSkip()
const escort = (d: Difficulty = 'normal', t = terrain): World<undefined> => applyDifficulty(worldFromScenario(loadScenarioBundle('escort'), t), d)
const lost = (w: World<undefined>): number => BOMBERS.filter((id) => isDestroyed(w, id)).length

describe('Escort content', () => {
  it('four allied B-17s on one level-bombing leader, aimed at the middle of Dulag\'s hangars; four axis Zeros held for 60 s', () => {
    const bundle = loadScenarioBundle('escort')
    const { scenario } = bundle
    const w = worldFromScenario(bundle, null)
    expect(playerAircraft(w).spec.id).toBe('f6f-hellcat')
    const bombers = scenario.aircraft.filter((a) => a.tags?.includes('bombers'))
    expect(bombers.map((a) => [a.id, a.spec])).toEqual(BOMBERS.map((id) => [id, 'b-17-flying-fortress']))
    for (const a of bombers) expect(sideOf(w, a)).toBe('allied')
    for (const a of bombers.slice(1)) expect(a.pilot?.leader).toBe('fort-1')
    const lead = w.aircraft.find((a) => a.id === 'fort-1')!.pilot!.ingress!
    expect(lead.attack).toBe('level-bomb')
    const hangars = w.structures.filter((s) => HANGARS.includes(s.id))
    expect(hangars).toHaveLength(2)
    expect(lead.destination).toMatchObject({
      kind: 'point', side: 'axis',
      x: expect.closeTo((hangars[0]!.position.x + hangars[1]!.position.x) / 2, 6),
      z: expect.closeTo((hangars[0]!.position.z + hangars[1]!.position.z) / 2, 6),
    })
    // Every wingman is armed with the leader (E3's `armedForAttack`).
    for (const id of BOMBERS) expect(w.combat.aircraft[id]!.stores.bombs, id).toBe(8)
    const zeros = scenario.heldGroups!.find((g) => g.id === 'intercept')!.aircraft!
    expect(zeros.map((a) => a.spec)).toEqual(ZEROS.map(() => 'a6m2-zero'))
    expect(scenario.triggers!.find((t) => t.then.some((a) => 'spawn' in a && a.spawn === 'intercept'))!.when).toEqual({ at: 60 })
    expect(scenario.objectives!.find((o) => o.id === 'bombers')).toMatchObject({ kind: 'protect', maxLost: 1, priority: 'primary' })
  })

  it('the bombers start about fifteen miles from Dulag, as the briefing says', () => {
    const p = worldFromScenario(loadScenarioBundle('escort'), null).aircraft.find((a) => a.id === 'fort-1')!.state.position
    const miles = Math.hypot(DULAG.x - p.x, DULAG.z - p.z) / 1609.344
    expect(miles).toBeGreaterThan(13.5)
    expect(miles).toBeLessThan(15.5)
  })
})

describe.skipIf(terrain === null)('Escort, headless', () => {
  it.each(DIFFICULTIES)('unescorted at %s: the Zeros remain dangerous at the selected difficulty', (d) => {
    let w = escort(d)
    while (w.tick < ticksFor(600) && progressOf(w, 'bombers').status !== 'failed') w = hold(w, FAR, 60)
    if (d === 'easy') {
      expect(lost(w)).toBeGreaterThanOrEqual(1)
      return
    }
    expect(lost(w)).toBeGreaterThan(1)
    expect(progressOf(w, 'bombers').status).toBe('failed')
    w = hold(w, FAR, 1)
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(LOST_TWO)
  }, 60_000)

  it.each(DIFFICULTIES)('escorted at %s (the Zeros shot down as they arrive): the formation turns onto the run in formation, bombs, and both hangars go down', (d) => {
    let w = hold(escort(d), FAR, ticksFor(61))
    w = destroyNow(w, ZEROS)
    let slowest = Infinity, worst = 0
    while (w.tick < ticksFor(STRIKE_DONE_S)) {
      w = hold(w, FAR, 1)
      const lead = w.aircraft.find((a) => a.id === 'fort-1')!
      for (const id of BOMBERS.slice(1)) {
        const a = w.aircraft.find((x) => x.id === id)!
        const v = a.state.velocity
        slowest = Math.min(slowest, Math.hypot(v.x, v.y, v.z) / a.spec.reference.stallSpeedMps)
        // Station is kept until the train: after it, E2's egress turns are the leader's alone.
        if ((w.combat.aircraft['fort-1']!.bombsDropped ?? 0) === 0) worst = Math.max(worst, stationErrorM(a, lead, a.pilot!.formation!.slot))
      }
    }
    expect(slowest, 'slowest wingman, x stall').toBeGreaterThan(1.3)
    expect(worst, 'worst station error before the drop, m').toBeLessThan(60)
    for (const id of BOMBERS) expect(w.combat.aircraft[id]!.bombsDropped, id).toBe(8)
    expect(HANGARS.filter((id) => w.combat.structures[id]!.destroyedTick !== null)).toEqual(HANGARS)
    expect(progressOf(w, 'strike').status).toBe('complete')
    expect(lost(w)).toBe(0)
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(BOMBS_AWAY)
  })

  it('success: the Zeros down, the hangars bombed, every bomber home free, recover at Tacloban: badge', () => {
    let w = hold(escort(), FAR, ticksFor(61))
    w = hold(destroyNow(w, ZEROS), FAR, ticksFor(STRIKE_DONE_S) - w.tick)
    expect(progressOf(w, 'zeros').status).toBe('complete')
    expect(progressOf(w, 'strike').status).toBe('complete')
    w = fieldApproach(w, 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: { id: 'escort', name: 'Escort' }, reasons: [] })
  })

  it('failure: two bombers lost, the strike still flown, he lands: no badge, the losses are the only reason', () => {
    let w = hold(escort(), FAR, ticksFor(61))
    w = destroyNow(destroyNow(w, ZEROS), ['fort-3', 'fort-4'], 'zero-1')
    w = hold(w, FAR, ticksFor(STRIKE_DONE_S) - w.tick)
    expect(progressOf(w, 'bombers').status).toBe('failed')
    expect(progressOf(w, 'strike').status).toBe('complete')
    w = fieldApproach(w, 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Bombers: failed'] })
  })
})
