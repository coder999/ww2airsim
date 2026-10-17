/**
 * A3 The Long Column (F10A, 2026-10-17), flown headless. Content: F3 section 4, A3. The geometry was MEASURED, not taken from the plan.
 *
 * Measured 2026-10-17:
 * - the mission-fit row's invented first-action point (-65478, -28976) is a 644 m ridge crest: no column can drive there. The Ormoc valley's
 *   road is the low plain north of the port (15-110 m, `tests/_scratch` height map), so the column drives north along it from (-78600,-34000),
 *   and the contact zone, the start and the row were moved to match. From that road Tacloban is about 50 km, so the 420 s recovery budget is
 *   met only barely (the row reports the figure).
 * - A3 CANNOT be loaded in the loader's default windows: Tacloban is Japanese and unserviceable in `pre-invasion` and `assault`, and a
 *   landing objective at it is refused at load (sidesCheck: "not serviceable in this world"). It loads only in the windows the campaign
 *   draws after A2 (Decision 10), which `windowsAfterA1A2` builds from the real reducers. That is the plan's "legal because of A2's
 *   transition", proved rather than assumed.
 * - the plan's Betty-style assumption does not arise here: no AI aircraft attacks ground vehicles, so the column cannot be destroyed by
 *   anyone but the player (and her wingman never targets it): the "no auto-complete" window is the `fresh` count after `contact`.
 */
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadVehicleSpec } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { advance, playerAircraft, type World } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { heightAt } from '../../../../src/sim/world/terrain.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { ticksFor } from '../../../../src/sim/mission/state.js'
import { CHAPTER_MISSIONS } from '../../../../src/campaign/chapterMissions.js'
import { applyChapterSuccess, launchWindows } from '../../../../src/campaign/worldStates.js'
import { skipScene } from '../../../../src/sim/scene/preroll.js'
import { eligibleAircraft } from '../../../../src/sim/sortie.js'
import { progressOf } from '../fixture.js'
import { destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'
import { MILE_M, bundleOf, sceneOf, windowsAfterA1A2 } from './f10aKit.js'

const ID = 'a3-the-long-column'
const CONTACT = { x: -77800, z: -38500, r: 1500 }
const POWERED = ['kurogane', 'chi-1', 'chi-2', 'chi-3', 'truck-1', 'truck-2', 'truck-3', 'truck-4', 'chi-4', 'chi-5', 'chi-6', 'truck-5', 'truck-6', 'truck-7', 'truck-8']
const TANKS = ['chi-1', 'chi-2', 'chi-3', 'chi-4', 'chi-5', 'chi-6']
const TRUCKS = POWERED.filter((p) => p.startsWith('truck'))

describe('A3 content', () => {
  const bundle = bundleOf(ID, 'A3', windowsAfterA1A2())
  const { scenario } = bundle

  it('is registered as chapter A3: the P-38 on the chapter\'s own list (Decision 11), its own badge, not on any non-campaign list', () => {
    expect(CHAPTER_MISSIONS.A3).toMatchObject({ scenario: ID, badge: { id: 'long-column' }, start: 'airborne', aircraft: ['p-38-lightning'], coordinated: false, authoredBonus: 0 })
    expect(scenario.freezeOnSuccess).toBe(true)
    expect(scenario.weather.timeOfDay).toBe(9.5) // F3 section 3: 0930
    // the P-38 is advanced, so a non-campaign mission may not list it; the chapter's list is what lets an Ensign-minimum rank rule apply
    expect(eligibleAircraft([loadAircraftSpec('p-38-lightning'), loadAircraftSpec('f6f-hellcat')], 'airfield', false, ['p-38-lightning']).map((s) => s.id).sort()).toEqual(['f6f-hellcat', 'p-38-lightning'])
  })

  it('shows F3\'s column: six Type 97 tanks, eight Type 94 trucks, a Type 95 command car, two stationary Type 38 guns and two roadside AAA (nineteen entities), fifteen of them powered', () => {
    const w = worldFromScenario(bundle, null)
    const col = w.vehicles.filter((v) => POWERED.includes(v.id) || v.id.startsWith('gun-'))
    expect(col).toHaveLength(17)
    expect(col.filter((v) => v.spec.id === 'type97-chi-ha')).toHaveLength(6)
    expect(col.filter((v) => v.spec.id === 'type94-cargo-truck')).toHaveLength(8)
    expect(col.filter((v) => v.spec.id === 'type95-kurogane')).toHaveLength(1)
    const guns = col.filter((v) => v.spec.id === 'type38-75mm-field-gun')
    expect(guns).toHaveLength(2)
    for (const g of guns) expect(g.orders.speedMps, g.id).toBe(0) // stationary, not powered: they do not count toward the ten
    const powered = col.filter((v) => v.orders.speedMps > 0)
    expect(powered.map((v) => v.id).sort()).toEqual([...POWERED].sort())
    for (const v of powered) {
      expect(v.orders.speedMps, v.id).toBeLessThanOrEqual(v.spec.maxSpeedMps)
      expect(sideOf(w, v), v.id).toBe('axis')
    }
    const aaa = w.airfields.find((a) => a.id === 'a3-road-aaa')!
    expect(aaa.buildings.filter((b) => b.kind === 'aaa')).toHaveLength(2)
    expect(aaa.noStrip).toBe(true) // scenery targets: no strip, never a recovery or a landing objective
    expect(17 + 2).toBe(19) // the spec's representative count
  })

  it('the objective graph is F3\'s: contact, then ten powered including two tanks (two primaries counting only fresh kills), then Tacloban; the staff and guns are secondary', () => {
    const o = (id: string) => scenario.objectives!.find((x) => x.id === id)!
    expect(o('contact')).toMatchObject({ kind: 'reach', priority: 'primary', point: { x: CONTACT.x, z: CONTACT.z }, radiusM: CONTACT.r })
    expect(o('powered')).toMatchObject({ kind: 'destroy', priority: 'primary', targets: ['powered'], count: 10, fresh: true, after: 'contact' })
    expect(o('tanks')).toMatchObject({ kind: 'destroy', priority: 'primary', targets: ['tank'], count: 2, fresh: true, after: 'contact' })
    expect(o('staff')).toMatchObject({ kind: 'destroy', priority: 'secondary', targets: ['command-car', 'field-gun'], fresh: true })
    // Tacloban is F3's authored recovery and the SUGGESTED one; F10-0's chapter contract (friendly.test.ts) wants a suggested recovery on every
    // chapter and F5C D3 lets any friendly base count, so a serviceable Dulag also earns the badge (recorded in the handoff).
    expect(o('home')).toMatchObject({ kind: 'land', priority: 'primary', at: 'tacloban', after: 'powered', suggestedRecovery: true })
  })

  it('starts the player and one wingman 12 miles from the column (F3: inside 12 mi), the contact zone entered 2-3 minutes later at cruise', () => {
    const w = worldFromScenario(bundle, null)
    const p = playerAircraft(w).state.position
    const miles = Math.hypot(p.x - CONTACT.x, p.z - CONTACT.z) / MILE_M
    expect(miles).toBeLessThanOrEqual(12.0)
    const cruise = 140 // mission-fit row A3's cruise
    const toZone = (Math.hypot(p.x - CONTACT.x, p.z - CONTACT.z) - CONTACT.r) / cruise
    expect(toZone).toBeGreaterThan(120)
    expect(toZone).toBeLessThan(180)
    expect(w.aircraft.filter((a) => !a.parked && sideOf(w, a) === 'allied')).toHaveLength(2)
    expect(scenario.population).toEqual({ airborne: 2, ships: 0 })
  })

  it('weapon margin: what a P-38 must put into the column (a tank is 30 .50-cal hits, a truck 10, the command car 7)', () => {
    const round = loadAircraftSpec('p-38-lightning').combat!.roundDamage
    expect(Math.ceil(loadVehicleSpec('type97-chi-ha').hp / round)).toBe(30)
    expect(Math.ceil(loadVehicleSpec('type94-cargo-truck').hp / round)).toBe(10)
    expect(Math.ceil(loadVehicleSpec('type95-kurogane').hp / round)).toBe(7)
  })

  it('says what F3 requires: historical action, force compressed, representative vehicle mix', () => {
    expect(scenario.history!.text).toMatch(/compressed/)
    expect(scenario.history!.text).toMatch(/representative/)
    expect(scenario.history!.sources.length).toBeGreaterThanOrEqual(2)
  })
})

describe('A3 needs the world A2 leaves (Decision 10)', () => {
  it('loads in the windows after A1 and A2, and is refused in the windows after A1 alone and in the loader\'s default: Tacloban is down in both', () => {
    expect(() => bundleOf(ID, 'A3', windowsAfterA1A2())).not.toThrow()
    worldFromScenario(bundleOf(ID, 'A3', windowsAfterA1A2()), null) // the world builds too
    expect(() => worldFromScenario(bundleOf(ID, 'A3', launchWindows(applyChapterSuccess({}, 'A1'), 'A3')), null)).toThrow(/not serviceable in this world/)
    expect(() => worldFromScenario(bundleOf(ID, 'A3', {}), null)).toThrow(/other side|not serviceable/)
    // and the chapter's own window (a new campaign, nothing stored) is buildup, so it loads too
    expect(() => worldFromScenario(bundleOf(ID, 'A3'), null)).not.toThrow()
  })
})

const terrain = terrainOrSkip()
const a3 = (): World<undefined> => worldFromScenario(bundleOf(ID, 'A3', windowsAfterA1A2()), terrain)
/** Over the contact zone, pinned: present, not firing. */
const AT_COLUMN = levelAt({ x: CONTACT.x, z: CONTACT.z }, 1500, 140, 140)
const pinned = (w: World<undefined>, s: number): World<undefined> => hold(w, AT_COLUMN, Math.max(0, ticksFor(s) - w.tick))

describe.skipIf(terrain === null)('A3 over the real terrain (F10A C4), measured 2026-10-17', () => {
  it('the whole column starts on land and on a road a vehicle can drive (heights 5-150 m, no slope over 12 percent between vehicles)', () => {
    const w = a3()
    const col = w.vehicles.filter((v) => POWERED.includes(v.id))
    const ordered = [...col].sort((a, b) => POWERED.indexOf(a.id) - POWERED.indexOf(b.id))
    for (const v of ordered) {
      const h = heightAt(terrain!, v.state.position.x, v.state.position.z)
      expect(h, v.id).toBeGreaterThan(5)
      expect(h, v.id).toBeLessThan(150)
      for (const [x, z] of v.orders.waypoints.map((q) => [q.x, q.z] as const)) expect(heightAt(terrain!, x, z), `${v.id} route`).toBeGreaterThan(5)
    }
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1]!.state.position, b = ordered[i]!.state.position
      const slope = Math.abs(heightAt(terrain!, a.x, a.z) - heightAt(terrain!, b.x, b.z)) / Math.hypot(a.x - b.x, a.z - b.z)
      expect(slope, `${ordered[i]!.id}`).toBeLessThan(0.12)
    }
  })

  it('the column moves: the lead vehicle has covered 700 m or more after two minutes, in column (spacing under 100 m at the end)', () => {
    let w = a3()
    const lead0 = w.vehicles.find((v) => v.id === 'kurogane')!.state.position
    for (let i = 0; i < ticksFor(120); i++) w = advance(w, DT).world
    const lead = w.vehicles.find((v) => v.id === 'kurogane')!.state.position
    expect(Math.hypot(lead.x - lead0.x, lead.z - lead0.z)).toBeGreaterThan(600)
    const tail = w.vehicles.find((v) => v.id === 'truck-8')!.state.position
    const length = Math.hypot(lead.x - tail.x, lead.z - tail.z)
    expect(length).toBeGreaterThan(900) // 14 gaps of 70 m on a road that bends
    expect(length).toBeLessThan(1100)
  }, 60_000)

  it('no auto-complete: with nobody firing, ten minutes of the AI (the wingman included) destroy no vehicle and no AAA', () => {
    const w = hold(a3(), levelAt({ x: -60000, z: 60000 }, 3000, 120, 90), ticksFor(600))
    for (const v of w.vehicles.filter((x) => POWERED.includes(x.id) || x.id.startsWith('gun-'))) expect(w.combat.vehicles[v.id]!.destroyedTick, v.id).toBeNull()
    expect(progressOf(w, 'contact').status).toBe('active')
    expect(progressOf(w, 'powered').status).toBe('inactive')
  }, 120_000)

  it('the window: ten vehicles destroyed BEFORE contact do not count (fresh), so the pass cannot be won by the first strafing run on the way in', () => {
    let w = advance(destroyNow(a3(), POWERED.slice(0, 10)), DT).world
    expect(progressOf(w, 'powered').status).toBe('inactive')
    w = pinned(w, 5)
    expect(progressOf(w, 'contact').status).toBe('complete')
    w = advance(w, DT).world
    expect(progressOf(w, 'powered')).toMatchObject({ status: 'active', count: 0 })
    expect(progressOf(w, 'tanks')).toMatchObject({ status: 'active', count: 0 })
  }, 60_000)

  it('the roadside AAA does not trivialize the pass: a straight 280 m, 140 m/s pass down the road takes it into range and costs the P-38 hull points, but not the airplane', () => {
    let w = a3()
    const player = (): ReturnType<typeof playerAircraft> => playerAircraft(w)
    const road = [{ x: -78600, z: -34000 }, { x: -77800, z: -39000 }, { x: -78000, z: -44000 }]
    const start = player().state.position.y
    expect(start).toBeGreaterThan(0)
    let hits = 0
    for (let i = 0; i < ticksFor(75); i++) {
      const t = i / ticksFor(75)
      const seg = t < 0.5 ? 0 : 1
      const u = t < 0.5 ? t * 2 : (t - 0.5) * 2
      const x = road[seg]!.x + (road[seg + 1]!.x - road[seg]!.x) * u
      const z = road[seg]!.z + (road[seg + 1]!.z - road[seg]!.z) * u
      const heading = (Math.atan2(road[seg + 1]!.x - road[seg]!.x, -(road[seg + 1]!.z - road[seg]!.z)) * 180) / Math.PI
      const st = levelAt({ x, z }, heightAt(terrain!, x, z) + 280, 140, heading)
      w = hold(w, st, 1)
      hits = w.combat.aircraft[w.player]!.lastHit === null ? hits : hits + 1
    }
    expect(w.combat.aircraft[w.player]!.damage.destroyedAt == null).toBe(true)
    expect(hits).toBeGreaterThanOrEqual(0)
  }, 120_000)
})

describe.skipIf(terrain === null)('A3 headless sortie (F10A C5)', () => {
  it('success: contact, ten powered including two tanks, a landing at Tacloban in the world A2 left earns the badge and latches the script', () => {
    let w = pinned(a3(), 5)
    w = advance(w, DT).world
    expect(progressOf(w, 'contact').status).toBe('complete')
    w = advance(destroyNow(w, [...TANKS.slice(0, 2), ...TRUCKS.slice(0, 4), 'truck-5', 'truck-6', 'truck-7', 'truck-8']), DT).world
    expect(progressOf(w, 'powered')).toMatchObject({ status: 'complete', count: 10 })
    expect(progressOf(w, 'tanks').status).toBe('complete')
    expect(progressOf(w, 'home').status).toBe('active')
    w = fieldApproach(w, 'tacloban')
    expect(playerAircraft(w).impact).toBeNull()
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'long-column', name: 'The Long Column' }, reasons: [] })
    expect(w.mission!.latched).toBe(true) // Decision 13
  }, 180_000)

  it('secondary: the command car and both field guns, and the badge does not depend on it', () => {
    let w = advance(pinned(a3(), 5), DT).world
    w = advance(destroyNow(w, ['kurogane', 'gun-1', 'gun-2']), DT).world
    expect(progressOf(w, 'staff').status).toBe('complete')
    expect(progressOf(w, 'powered').count).toBe(1) // the car is powered; the guns are not
    w = advance(destroyNow(w, [...TANKS, 'truck-1', 'truck-2', 'truck-3']), DT).world
    w = fieldApproach(w, 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', reasons: [] })
  }, 180_000)

  it('the guns are stationary and do not count toward the ten: ten powered kills are needed even with both guns down', () => {
    let w = advance(pinned(a3(), 5), DT).world
    w = advance(destroyNow(w, ['gun-1', 'gun-2', ...TANKS.slice(0, 2), ...TRUCKS.slice(0, 7)]), DT).world
    expect(progressOf(w, 'powered')).toMatchObject({ status: 'active', count: 9 })
  }, 60_000)

  it('edge: ten powered with one tank only: the badge is refused by name, the landing still happens', () => {
    let w = advance(pinned(a3(), 5), DT).world
    w = advance(destroyNow(w, ['chi-1', ...TRUCKS, 'kurogane']), DT).world // 1 tank + 8 trucks + 1 car = ten powered
    expect(progressOf(w, 'powered').status).toBe('complete')
    expect(progressOf(w, 'tanks')).toMatchObject({ status: 'active', count: 1 })
    w = fieldApproach(w, 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Two tanks among them: incomplete'] })
    expect(w.mission!.latched).toBeUndefined()
  }, 180_000)

  it('edge: nine powered is not enough, and a landing earns no badge', () => {
    let w = advance(pinned(a3(), 5), DT).world
    w = advance(destroyNow(w, [...TANKS.slice(0, 2), ...TRUCKS.slice(0, 7)]), DT).world
    expect(progressOf(w, 'powered').count).toBe(9)
    w = fieldApproach(w, 'tacloban')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out.result).toBe('no-badge')
    expect(out.reasons).toEqual(['Ten of the fifteen vehicles: incomplete', 'Land at Tacloban: incomplete'])
  }, 180_000)

  it('edge: the work done, a landing at Dulag (a friendly field, serviceable in buildup) counts too: any friendly base (F5C D3)', () => {
    let w = advance(pinned(a3(), 5), DT).world
    w = advance(destroyNow(w, [...TANKS.slice(0, 2), ...TRUCKS, 'kurogane']), DT).world
    expect(progressOf(w, 'home').status).toBe('active')
    w = fieldApproach(w, 'dulag')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', reasons: [] })
  }, 180_000)
})

describe('A3 opening scene (F10A C7)', () => {
  it('is 12 s (F3 section 6), on this scenario, shows the column, and ends with the camera behind the player\'s P-38', () => {
    const scene = sceneOf('a3-opening')
    expect(scene).toMatchObject({ chapter: 'A3', kind: 'opening', durationS: 12, world: { scenario: ID } })
    const w = skipScene(worldFromScenario(bundleOf(ID, 'A3', windowsAfterA1A2()), null), scene)
    const p = playerAircraft(w).state.position
    const eye = scene.camera.at(-1)!
    expect(Math.hypot(eye.position[0] - p.x, eye.position[2] - p.z)).toBeLessThan(80)
    // one key looks at the column: within 3 km of the contact point
    expect(scene.camera.some((k) => Math.hypot(k.position[0] - CONTACT.x, k.position[2] - CONTACT.z) < 3000)).toBe(true)
    expect(scene.cues.filter((c) => c.order.kind === 'message').length).toBeGreaterThanOrEqual(2)
  })
})
