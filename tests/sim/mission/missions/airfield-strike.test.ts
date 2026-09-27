/**
 * Airfield Strike, flown headless (spec §4.2, §5; M3 Task 5).
 *
 * Tuning notes (M3-R9), 2026-09-27:
 *
 * - **The defenders' spawn, (-31629, 1500, -20479) and (-31429, 1500,
 *   -20279), heading 000 at 110 m/s.** 4 km north of Dulag's runway center
 *   (-31629, -16479), at 1,500 m, pointed north at a striker arriving from
 *   Tacloban (-29666, -47605; 31.2 km away, bearing 184 from Tacloban to
 *   Dulag), with the wingman 200 m east and 200 m astern. The plan's draft
 *   had z = -12479 / -12279: in this world north is -z, so that was 4 km
 *   SOUTH of Dulag (35.2 km from Tacloban), behind the field and pointed
 *   away from the threat. Moved by 8,000 m of z, the sign of the offset,
 *   and nothing else; the first content test below pins "north of Dulag".
 * - **The scramble ring, 8,000 m around Dulag's runway center.** Unchanged
 *   from the plan. Its north edge is 23.1 km from Tacloban, so neither the
 *   take-off nor a Tacloban approach enters it (the failure run pins that
 *   the defenders never spawn), and the defenders spawn 4 km inside it,
 *   ahead of the striker.
 * - **The AAA batteries, dulag-aaa-1 at (-60, 0) and dulag-aaa-2 at
 *   (-100, -350) in Dulag's frame.** Unmoved. Measured on land at every
 *   footprint corner: at L1 12.93 m and 10.69 m, at L0 11.27 m and 10.12 m
 *   (`tests/sim/weapons/structures.test.ts` pins it).
 * - **Wind 3 m/s from 000.** A headwind for both runways (heading 000);
 *   `fieldApproach` lands on the centerline at Tacloban and Dulag in it
 *   (fly.ts, measured 2026-09-27).
 */
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadAirfield, loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft } from '../../../../src/sim/loop.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { storesFromLoadout } from '../../../../src/sim/weapons/stores.js'
import { radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { deckRun, destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'

const DULAG = { x: -31629, z: -16479 }
const HANGARS = ['dulag-hangar-1', 'dulag-hangar-2']
const DEFENDERS = ['defender-1', 'defender-2']
const SCRAMBLE = 'Strike lead: bandits scrambling off Dulag!'
const EGRESS = 'Strike lead: hangars are down. Head home to Tacloban.'
/** Staged: 7 km north of Dulag, inside the 8 km ring, at 1,500 m, southbound. */
const IN_RING = levelAt({ x: DULAG.x, z: DULAG.z - 7000 }, 1500, 120, 180)
/** The take-off, from `runwayCenter`, flaps up, to 300 m over the runway. */
const TAKEOFF = { flaps: false, climbToM: 300 } as const

describe('Airfield Strike content', () => {
  it('the defenders spawn north of Dulag (toward Tacloban), inside the scramble ring', () => {
    const { scenario } = loadScenarioBundle('airfield-strike')
    const ring = scenario.triggers!.find((t) => t.id === 'scramble')!.when
    expect(ring).toEqual({ enters: { point: DULAG, radiusM: 8000 } })
    const group = scenario.heldGroups!.find((g) => g.id === 'defenders')!
    expect(group.aircraft ?? []).toHaveLength(2)
    for (const a of group.aircraft ?? []) {
      if (!('airborneAt' in a)) throw new Error(`${a.id} is not airborneAt`)
      const [x, , z] = a.airborneAt.position
      expect(z).toBeLessThan(DULAG.z) // north is -z
      expect(Math.hypot(x - DULAG.x, z - DULAG.z)).toBeLessThan(8000)
    }
  })

  it('real weapons can meet the primary: two AN-M65s, each at least 90 damage, raze both hangars', () => {
    // GAMEPLAY.md: "One bomb ... razes a 120-HP hangar". This guards against
    // a content edit that makes the primary impossible with the bombs aboard.
    const f6f = loadAircraftSpec('f6f-hellcat')
    const stores = storesFromLoadout(f6f, 'bombs')
    const bomb = f6f.stores!.types[f6f.stores!.racks[0]!.store]!
    const hangars = loadAirfield('dulag').buildings.filter((b) => b.tags?.includes('dulag-hangars'))
    expect(hangars.map((b) => b.id)).toEqual(HANGARS)
    expect(bomb.kind).toBe('bomb')
    expect(bomb.damage).toBeGreaterThanOrEqual(90)
    expect(stores.bombs).toBeGreaterThanOrEqual(hangars.length)
    for (const h of hangars) expect(h.hp).toBeLessThanOrEqual(bomb.damage)
  })
})

const terrain = terrainOrSkip()

describe.skipIf(terrain === null)('Airfield Strike, headless (spec §5)', () => {
  it('success: take off, scramble, hangars down, recover at Tacloban, badge; the AAA is a bonus', () => {
    let w = worldFromScenario(loadScenarioBundle('airfield-strike'), terrain)
    w = deckRun(w, TAKEOFF)
    expect(progressOf(w, 'up').status).toBe('complete')
    expect(w.mission!.log.some((e) => e.kind === 'spawn')).toBe(false)
    expect(w.aircraft.some((a) => DEFENDERS.includes(a.id))).toBe(false)

    // One tick inside the ring: the spawn is logged on the tick that
    // advance produced, the same tick as the trigger.
    w = hold(w, IN_RING, 1)
    const spawn = w.mission!.log.find((e) => e.kind === 'spawn')
    expect(spawn).toMatchObject({ kind: 'spawn', group: 'defenders', tick: w.tick })
    expect(w.mission!.log.find((e) => e.kind === 'trigger' && e.id === 'scramble')?.tick).toBe(w.tick)
    for (const id of DEFENDERS) {
      const d = w.aircraft.find((a) => a.id === id)!
      expect(d.pilot).toBeTruthy()
      expect(sideOf(w, d)).toBe('axis')
    }
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(SCRAMBLE)

    w = hold(destroyNow(w, HANGARS), IN_RING, 2)
    expect(progressOf(w, 'hangars').status).toBe('complete')
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(EGRESS)

    w = destroyNow(w, DEFENDERS) // staging: keeps them off the approach
    w = fieldApproach(w, 'tacloban')
    expect(playerAircraft(w).impact).toBeNull()
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'airfield-strike' }, reasons: [] })
    expect(out.objectives.find((o) => o.id === 'flak')).toMatchObject({ priority: 'secondary', final: 'incomplete' })
  })

  it('failure: recovering at Tacloban with nothing destroyed earns no badge', () => {
    let w = worldFromScenario(loadScenarioBundle('airfield-strike'), terrain)
    w = deckRun(w, TAKEOFF)
    w = fieldApproach(w, 'tacloban')
    expect(w.mission!.log.some((e) => e.kind === 'spawn')).toBe(false) // never near Dulag
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Hangars: incomplete', 'Recover: incomplete'] })
  })

  it('failure (Review Focus 5): landing at Dulag with the hangars down is not a recovery (M3-R6)', () => {
    let w = worldFromScenario(loadScenarioBundle('airfield-strike'), terrain)
    w = deckRun(w, TAKEOFF)
    // Staged as the success run is: into the ring, so the defenders spawn,
    // then shot down, so they are not on the approach to Dulag.
    w = hold(w, IN_RING, 1)
    w = hold(destroyNow(destroyNow(w, HANGARS), DEFENDERS), IN_RING, 2)
    expect(progressOf(w, 'hangars').status).toBe('complete')
    w = fieldApproach(w, 'dulag')
    expect(recoveryOf(w)).toMatchObject({ kind: 'landed', at: { id: 'dulag' } })
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Recover: incomplete'] })
  })
})
