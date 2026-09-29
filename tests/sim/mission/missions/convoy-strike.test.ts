/**
 * Convoy Strike, flown headless (spec §4.3, §5; M3 Task 6).
 *
 * Tuning notes (M3-R9), 2026-09-27:
 *
 * - **The route, the plan's Measured racetrack**, (-84000, 22000) to
 *   (-73000, -9000) to (-71000, -8000) to (-82000, 23000), with maru-2 and
 *   maru-3 offset (-150, 450) and (-300, 900) and the escort (600, -300).
 *   Unmoved. Re-measured: every loop passes `assertLoopOverWater` at 50 m
 *   at L0 and L1; through 600 s of `stepShip` (sampled every 10 s) the
 *   four ships stay at least 4,600 m from land in 16 directions at both
 *   levels, and they start 38.9-40.4 km from the player.
 * - **4.1 m/s (8 kn).** Under the maru's 6.2 m/s and the Kagero's 18.0 m/s
 *   (the first content test pins both), so the convoy keeps station.
 * - **The spawn, (-64000, 3000, -12000), heading 210 (the plan had 230).**
 *   The position is unmoved: 10.91 N 124.71 E, 2 km inland of Leyte's west
 *   coast, over 82 m of ground with an 844 m peak within 5 km. The plan's
 *   heading 230 (and "Steer two-three-zero") is 19.5 deg off the bearing
 *   to the convoy lead (210.5); flown at 120 m/s it passes 12.6 km from
 *   maru-1 at its closest (303 s). Heading 210 passes 0.6 km from it at
 *   318 s. Heading and radio call changed together; the geometry test
 *   below holds the heading within 10 deg of the bearing and pins the call.
 * - **Wind 5 m/s from 000 (the plan had 060; ruling T4-D5).** `fieldApproach`
 *   stopped 83.7 m off Tacloban's centerline in the 060 crosswind (fly.ts);
 *   a north wind is a headwind for the northbound approach. Clouds and time
 *   of day are the plan's.
 * - **Nothing else needed tuning.** The success run, measured 2026-09-27 at
 *   terrain level `finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)` (L1):
 *   Convoy complete and "two down" at tick 3 (staged), the vector call at
 *   tick 60, landed at Tacloban at tick 7538 (before the 2026-09-28 move of the recovery field to Bayug, which is closer; re-measure).
 */
import { describe, it, expect } from 'vitest'
import { bundleForScenario, loadAircraftSpec, loadScenarioBundle, loadShipSpec } from '../../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft } from '../../../../src/sim/loop.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { stepShip } from '../../../../src/sim/world/ships.js'
import { heightAt, SEA_LEVEL_M } from '../../../../src/sim/world/terrain.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'

const SHIPS = ['maru-1', 'maru-2', 'maru-3', 'escort-1']
const TWO_DOWN = "Strike lead: two down. Home to Bayug when you're dry."
/** Staged over the convoy's first leg at 1,500 m, so the objective pass
 *  after `destroyNow` runs with the player alive and airborne. */
const OVER_CONVOY = levelAt({ x: -80000, z: 12000 }, 1500, 120, 210)
/** Compass bearing, degrees in [0, 360): 0 is north (-z), 90 east (+x). */
const bearingDeg = (from: { x: number; z: number }, to: { x: number; z: number }): number =>
  ((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI + 360) % 360

describe('Convoy Strike content', () => {
  it('three marus tagged convoy and a Kagero escort (M3-R7), all at 4.1 m/s, under every ship\'s maximum (M3-R9)', () => {
    const { scenario } = loadScenarioBundle('convoy-strike')
    expect(scenario.ships.map((s) => [s.id, s.spec, s.tags])).toEqual([
      ['maru-1', 'type-b-maru', ['convoy']],
      ['maru-2', 'type-b-maru', ['convoy']],
      ['maru-3', 'type-b-maru', ['convoy']],
      ['escort-1', 'kagero-dd', ['escort']],
    ])
    for (const s of scenario.ships) {
      expect(s.speedMps).toBe(4.1)
      expect(s.speedMps).toBeLessThan(loadShipSpec(s.spec).maxSpeedMps)
    }
  })

  it('every ship is axis, and a protect objective naming the escort fails the load (M3-R10)', () => {
    const bundle = loadScenarioBundle('convoy-strike')
    const w = worldFromScenario(bundle, null)
    for (const id of SHIPS) expect(sideOf(w, w.ships.find((s) => s.id === id)!)).toBe('axis')
    const patched = parseScenario({
      ...JSON.parse(JSON.stringify(bundle.scenario)),
      objectives: [
        ...bundle.scenario.objectives!,
        { id: 'guard', label: 'Guard', priority: 'secondary', kind: 'protect', targets: ['escort-1'] },
      ],
    })
    expect(() => worldFromScenario(bundleForScenario(patched), null))
      .toThrow(/objective "guard" names "escort-1", which is axis; a protect target must be on the player's side/)
  })

  it('real weapons can meet the primary: one bomb and three rockets sink a maru, and loadout "both" carries two of those', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    const maru = loadShipSpec('type-b-maru')
    const types = f6f.stores!.types
    const bomb = Object.values(types).find((t) => t.kind === 'bomb')!
    const rocket = Object.values(types).find((t) => t.kind === 'rocket')!
    expect(bomb.damage + 3 * rocket.damage).toBeGreaterThanOrEqual(maru.hullHp)
    const mounts = [...f6f.stores!.racks, ...(f6f.stores!.rails ?? [])]
    const count = (kind: string) => mounts.filter((m) => types[m.store]!.kind === kind).length
    expect(count('bomb')).toBeGreaterThanOrEqual(2)
    expect(count('rocket')).toBeGreaterThanOrEqual(6)
    expect(loadScenarioBundle('convoy-strike').scenario.briefing?.loadout).toBe('both')
  })

  it('geometry (M3-R9): the convoy lead is 20-45 km from the player at tick 0, and the vector points at it', () => {
    const w = worldFromScenario(loadScenarioBundle('convoy-strike'), null)
    const p = playerAircraft(w).state.position
    const lead = w.ships.find((s) => s.id === 'maru-1')!.state.position
    const km = Math.hypot(lead.x - p.x, lead.z - p.z) / 1000
    expect(km).toBeGreaterThan(20)
    expect(km).toBeLessThan(45)
    const spawn = loadScenarioBundle('convoy-strike').scenario.aircraft[0]!
    if (!('airborneAt' in spawn)) throw new Error('f6f-1 is not airborneAt')
    const off = Math.abs(((bearingDeg(p, lead) - spawn.airborneAt.headingDeg + 540) % 360) - 180)
    expect(off).toBeLessThan(10)
    const vector = loadScenarioBundle('convoy-strike').scenario.triggers!.find((t) => t.id === 'vector')!
    expect(vector.then).toEqual([{ message: 'Base: convoy of three marus with one destroyer, heading for Ormoc Bay. Steer two-one-zero.' }])
  })
})

const terrain = terrainOrSkip()

describe.skipIf(terrain === null)('Convoy Strike, headless (spec §5)', () => {
  it('builds over real terrain: every ship\'s loop passes assertLoopOverWater', () => {
    expect(() => worldFromScenario(loadScenarioBundle('convoy-strike'), terrain)).not.toThrow()
  })

  it('geometry (M3-R9): after 600 s of stepping, every ship is more than 1 km from land in 8 directions', () => {
    const w = worldFromScenario(loadScenarioBundle('convoy-strike'), terrain)
    for (const ship of w.ships) {
      let st = ship.state
      for (let t = 0; t < ticksFor(600); t++) st = stepShip(ship.spec, st, ship.orders, { dt: DT, tick: t + 1 })
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4
        for (let r = 100; r <= 1000; r += 100) {
          const h = heightAt(terrain!, st.position.x + r * Math.sin(a), st.position.z - r * Math.cos(a))
          expect(h, `${ship.id} at ${r} m on bearing ${k * 45}`).toBeLessThanOrEqual(SEA_LEVEL_M)
        }
      }
    }
  })

  it('success: two marus down, "two down", recover at Bayug, badge; the whole convoy is a bonus', () => {
    let w = worldFromScenario(loadScenarioBundle('convoy-strike'), terrain)
    w = hold(w, OVER_CONVOY, 2)
    expect(progressOf(w, 'sink').status).toBe('active')
    w = hold(destroyNow(w, ['maru-1', 'maru-2']), OVER_CONVOY, 2)
    expect(progressOf(w, 'sink').status).toBe('complete')
    expect(progressOf(w, 'all').status).toBe('active')
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(TWO_DOWN)

    w = fieldApproach(w, 'bayug')
    expect(playerAircraft(w).impact).toBeNull()
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'convoy-strike' }, reasons: [] })
    expect(out.objectives.find((o) => o.id === 'all')).toMatchObject({ priority: 'secondary', final: 'incomplete' })
  })

  it('failure: one maru down, recovering at Bayug earns no badge', () => {
    let w = worldFromScenario(loadScenarioBundle('convoy-strike'), terrain)
    w = hold(destroyNow(w, ['maru-1']), OVER_CONVOY, 2)
    expect(progressOf(w, 'sink').status).toBe('active')
    expect(radioMessages(w.mission!).map((e) => e.text)).not.toContain(TWO_DOWN)
    w = fieldApproach(w, 'bayug')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Convoy: incomplete', 'Recover: incomplete'] })
  })
})
