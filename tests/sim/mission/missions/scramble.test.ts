/**
 * Scramble, flown headless (F2 plan, docs/superpowers/plans/2026-10-09-f2-single-combat-scramble.md).
 *
 * Tuning notes, 2026-10-09:
 *
 * - **The raid:** four G4M Bettys at 3,000 m (about 10,000 ft) spawn 50 km
 *   (31 mi) northwest of Tacloban's runway center at bearing 315. `raid-1`
 *   flies 7e's ingress pilot to `{ airfield: tacloban }` at 90 m/s; the other
 *   three hold 7f formation slots on it. Two Zeros ride 500 m above in the
 *   same arrangement. The tower's "thirty miles, angels ten" rounds those.
 * - **Measured with a passive player** held 120 km away, wind 4 m/s from
 *   000 (down Tacloban's runway: `fieldApproach` lands off-field in any
 *   crosswind). The first headless test re-derives it on every run: the
 *   formation holds together at about 89 m/s, the first Betty comes inside
 *   5 km of the runway center at 500.1 s, and the raid then orbits the field
 *   about 1.5 km out (7e's arrival). The pin brackets it: [485, 525] s.
 *   A real player takes off and climbs to 10,000 ft in about four minutes,
 *   which meets the raid some 20 km out (an estimate, not measured).
 */
import { describe, it, expect } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import type { World } from '../../../../src/sim/loop.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { deckRun, destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'

const FIELD = { x: -29666, z: -47605 }
const BETTYS = ['raid-1', 'raid-2', 'raid-3', 'raid-4']
const SHIELD_FAILED = 'Keep the raid off: failed'
const BROKEN = "Tacloban tower: raid's broken up. Bring it home."
const BREACH_S: readonly [number, number] = [485, 525]
const TAKEOFF = { flaps: false, climbToM: 300 } as const
const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 120, 90)
/** Climbing out north of the field, the way a real intercept goes. */
const OUTBOUND = levelAt({ x: FIELD.x, z: FIELD.z - 12000 }, 3000, 120, 315)

const terrain = terrainOrSkip()
const scramble = (): World<undefined> => worldFromScenario(loadScenarioBundle('scramble'), terrain)
const nearestBettyM = (w: World<undefined>): number =>
  Math.min(...w.aircraft.filter((a) => BETTYS.includes(a.id)).map((a) => Math.hypot(a.state.position.x - FIELD.x, a.state.position.z - FIELD.z)))

describe('Scramble content', () => {
  it('four Bettys formed on one ingress leader for Tacloban, two Zeros escorting; the shield is 5 km round the runway', () => {
    const { scenario } = loadScenarioBundle('scramble')
    const raid = scenario.aircraft.filter((a) => a.tags?.includes('raid'))
    expect(raid.map((a) => [a.id, a.spec])).toEqual(BETTYS.map((id) => [id, 'g4m-betty']))
    expect(raid[0]!.pilot?.ingress?.destination).toEqual({ airfield: 'tacloban' })
    for (const a of raid.slice(1)) expect(a.pilot?.leader).toBe('raid-1')
    expect(scenario.aircraft.filter((a) => a.tags?.includes('escort')).map((a) => a.spec)).toEqual(['a6m2-zero', 'a6m2-zero'])
    expect(scenario.objectives!.find((o) => o.id === 'shield')).toMatchObject({ kind: 'deny', around: FIELD, radiusM: 5000, label: 'Keep the raid off' })
  })
})

describe.skipIf(terrain === null)('Scramble, headless', () => {
  it(`timing: a passive player; the first Betty breaches 5 km in [${BREACH_S}] s and the shield fails that tick`, () => {
    let w = scramble()
    let breach: number | null = null
    while (w.tick < ticksFor(BREACH_S[1] + 5)) {
      w = hold(w, FAR, 1)
      if (breach === null && nearestBettyM(w) <= 5000) breach = w.tick
    }
    expect(breach).not.toBeNull()
    expect(breach! / 60).toBeGreaterThanOrEqual(BREACH_S[0])
    expect(breach! / 60).toBeLessThanOrEqual(BREACH_S[1])
    expect(progressOf(w, 'shield').status).toBe('failed')
    expect(radioMessages(w.mission!).find((e) => e.text === SHIELD_FAILED)?.tick).toBe(breach)
  })

  it('success: take off, the raid shot down short of the field, the tower call, recover at Tacloban, badge', () => {
    let w = deckRun(scramble(), TAKEOFF)
    expect(progressOf(w, 'up').status).toBe('complete')
    w = hold(w, OUTBOUND, ticksFor(300) - w.tick)
    expect(nearestBettyM(w)).toBeGreaterThan(15000)
    w = hold(destroyNow(w, BETTYS), OUTBOUND, 1)
    expect(progressOf(w, 'raid').status).toBe('complete')
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(BROKEN)
    w = fieldApproach(w, 'tacloban')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'scramble' }, reasons: [] })
  })

  it('failure: a Betty gets inside 5 km; the rest are shot down and he lands: no badge, the breach is the only reason', () => {
    let w = deckRun(scramble(), TAKEOFF)
    while (progressOf(w, 'shield').status !== 'failed' && w.tick < ticksFor(BREACH_S[1])) w = hold(w, FAR, 1)
    expect(progressOf(w, 'shield').status).toBe('failed')
    w = hold(destroyNow(w, BETTYS), FAR, 1)
    w = fieldApproach(w, 'tacloban')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null, reasons: [SHIELD_FAILED] })
  })
})
