/**
 * Airfield Strike, flown headless (spec §4.2, §5; M3 Task 5).
 *
 * Tuning notes (M3-R9), 2026-09-27:
 *
 * - **The defenders, 7h Task 4, 2026-09-28.** Two Zeros parked on Dulag's
 *   runway at local (0, 650) and (0, 750), unchocked, `takeoff: true`; they
 *   spawn on the scramble trigger and roll. (Was: airborne 4 km north at
 *   1,500 m, which is what Mark saw fail: they appeared mid-air.) Measured
 *   against a striker 7,900 m out at 400 m, 100 m/s: airborne at 50 s and
 *   60 s, both engage, defender-1 first fires at 61.7 s from 507 m. No
 *   knob beyond the spots needed turning. RF1 and RF5 pin the run and the
 *   climb-out.
 * - **The scramble ring, 8,000 m around Dulag's runway center.** Unchanged
 *   from the plan. Its north edge is 23.1 km from Tacloban, so neither the
 *   take-off nor a Tacloban approach enters it (the failure run pins that
 *   the defenders never spawn).
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
import { TAKEOFF_CLIMB_DEG, ZERO_TAKEOFF_RUN_M } from '../../../../src/sim/ai/takeoff.js'
import { advance, aircraftById, playerAircraft, withAircraftState } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { length, sub } from '../../../../src/sim/math/vec3.js'
import { localToWorld, runwayHeadingRad, type Airfield } from '../../../../src/sim/world/airfields.js'
import { heightAt } from '../../../../src/sim/world/terrain.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { storesFromLoadout } from '../../../../src/sim/weapons/stores.js'
import { radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { deckRun, destroyNow, fieldApproach, hold, levelAt, settledAll, terrainOrSkip } from '../fly.js'

const DULAG = { x: -31629, z: -16479 }
const HANGARS = ['dulag-hangar-1', 'dulag-hangar-2']
const DEFENDERS = ['defender-1', 'defender-2']
const SCRAMBLE = 'Strike lead: bandits scrambling off Dulag!'
const EGRESS = 'Strike lead: hangars are down. Head home to Tacloban.'
/** Staged: 7 km north of Dulag, inside the 8 km ring, at 1,500 m, southbound. */
const IN_RING = levelAt({ x: DULAG.x, z: DULAG.z - 7000 }, 1500, 120, 180)
/** The take-off, from `runwayCenter`, flaps up, to 300 m over the runway. */
const TAKEOFF = { flaps: false, climbToM: 300 } as const
/** RF5: how far the ground may rise above the climb path, meters (none). */
const RF5_CLEARANCE_M = 0
/**
 * The regression's striker: 7,900 m north of Dulag (inside the ring, so the
 * scramble fires on the first tick), level at 400 m, southbound at 100 m/s.
 * Pinned only on the first tick; it flies its own state after that.
 */
const STRIKER = levelAt({ x: DULAG.x, z: DULAG.z - 7900 }, 400, 100, 180)
/** The regression's horizon, seconds. */
const REGRESSION_S = 120

describe('Airfield Strike content', () => {
  it('the scramble ring is 8,000 m around Dulag\'s runway center', () => {
    const { scenario } = loadScenarioBundle('airfield-strike')
    const ring = scenario.triggers!.find((t) => t.id === 'scramble')!.when
    expect(ring).toEqual({ enters: { point: DULAG, radiusM: 8000 } })
    const field = loadAirfield('dulag')
    expect(field.runway.center).toMatchObject(DULAG)
  })

  it('the defenders are Zeros parked on Dulag\'s runway and scramble on takeoff', () => {
    const { scenario } = loadScenarioBundle('airfield-strike')
    const group = scenario.heldGroups!.find((g) => g.id === 'defenders')!
    expect(group.aircraft ?? []).toHaveLength(2)
    for (const a of group.aircraft ?? []) {
      expect(a.spec).toBe('a6m2-zero')
      if (!('parkedAt' in a) || !('airfield' in a.parkedAt)) throw new Error(`${a.id} is not parked on an airfield`)
      expect(a.parkedAt.airfield).toBe('dulag')
      expect(a.chocked).toBe(false)
      expect(a.pilot?.takeoff).toBe(true)
    }
  })

  it('each takeoff spot leaves 1.5x the measured Zero takeoff run ahead of it (RF1)', () => {
    const field = loadAirfield('dulag')
    const spots = defenderSpots()
    expect(spots).toHaveLength(2)
    for (const s of spots) {
      const w = localToWorld(field, s.x, s.z)
      const e = runwayEnd(field)
      const h = runwayHeadingRad(field)
      const ahead = (e.x - w.x) * Math.sin(h) + (e.z - w.z) * -Math.cos(h)
      expect(ahead).toBeGreaterThanOrEqual(1.5 * ZERO_TAKEOFF_RUN_M)
      expect(ahead).toBeLessThanOrEqual(field.runway.lengthM) // on the strip, not behind it
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
  it('the ground for 5 km past the runway end stays under the 10 degree climb path (RF5)', () => {
    // The safety floor is off until TAKEOFF_DONE_M, so a hill on the
    // climb-out is a crash nothing catches. The path is drawn from the
    // runway end at the end's ground height, which is conservative: the
    // Zero is off the ground ZERO_TAKEOFF_RUN_M after its spot.
    const field = loadAirfield('dulag')
    const e = runwayEnd(field)
    const h = runwayHeadingRad(field)
    const baseM = heightAt(terrain!, e.x, e.z)
    const slope = Math.tan((TAKEOFF_CLIMB_DEG * Math.PI) / 180)
    for (let d = 0; d <= 5000; d += 100) {
      const groundM = heightAt(terrain!, e.x + Math.sin(h) * d, e.z - Math.cos(h) * d)
      expect(groundM, `${d} m past the end`).toBeLessThanOrEqual(baseM + slope * d + RF5_CLEARANCE_M)
    }
  })

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

  it('the scrambled defenders take off, engage the striker and fire (regression, 2026-09-28)', () => {
    let w = settledAll(worldFromScenario(loadScenarioBundle('airfield-strike'), terrain))
    const start = STRIKER
    const engaged = new Set<string>(), fired = new Set<string>()
    const upS: Record<string, number> = {}
    let firstFire: { s: number, id: string, rangeM: number, strikerZ: number } | null = null
    for (let i = 0; i < REGRESSION_S * 60; i++) {
      const p = i === 0 ? start : aircraftById(w, w.player)!.state
      w = withAircraftState(w, w.player, { ...p, tick: w.tick })
      w = advance(w, DT).world
      const player = aircraftById(w, w.player)!
      for (const id of DEFENDERS) {
        const d = aircraftById(w, id)
        if (d === undefined) continue
        if (d.pilot!.decision.mode === 'engage' && d.pilot!.decision.targetId === w.player) engaged.add(id)
        if (d.controls.fire === true) {
          fired.add(id)
          firstFire ??= { s: w.tick * DT, id, rangeM: length(sub(d.state.position, player.state.position)), strikerZ: player.state.position.z }
        }
        if (d.pilot!.decision.mode !== 'takeoff' && upS[id] === undefined) upS[id] = w.tick * DT
      }
    }
    for (const id of DEFENDERS) expect(upS[id], id).toBeLessThan(75)
    expect([...engaged].sort()).toEqual(DEFENDERS)
    expect(fired.size).toBeGreaterThan(0)
  }, 180000)
})

/** The defenders' runway-local spots, from the scenario. */
function defenderSpots(): { readonly x: number; readonly z: number }[] {
  const { scenario } = loadScenarioBundle('airfield-strike')
  const group = scenario.heldGroups!.find((g) => g.id === 'defenders')!
  return (group.aircraft ?? []).map((a) => {
    if (!('parkedAt' in a) || !('airfield' in a.parkedAt) || typeof a.parkedAt.spot !== 'object') {
      throw new Error(`${a.id} has no runway-local spot`)
    }
    return a.parkedAt.spot
  })
}

/** The departure end of the runway (heading h points along (sin h, -cos h)). */
function runwayEnd(field: Airfield): { readonly x: number; readonly z: number } {
  const h = runwayHeadingRad(field)
  const half = field.runway.lengthM / 2
  return { x: field.runway.center.x + Math.sin(h) * half, z: field.runway.center.z - Math.cos(h) * half }
}
