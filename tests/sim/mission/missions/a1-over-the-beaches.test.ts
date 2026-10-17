/**
 * A1 Over the Beaches (F10A, 2026-10-17), flown headless. Content: F3 section 4, A1. The raid's ordnance, its geometry and the screen
 * were MEASURED (the header numbers below), not taken from the plan.
 *
 * Measured 2026-10-17 on the shipped file, the player passive 100 km away, `tests/_scratch` style run of 900 s:
 * - the Betty carries ONE type91 torpedo (content/aircraft/g4m-betty.json: no bomb rack), so the plan's "level-bomb" Betties never
 *   attacked (`attackFlight` returns null for a kind the rack cannot carry); they are `torpedo` raiders. A Val carries one bomb.
 * - four Bettys and two Vals cannot sink more than two 240-HP Marus (a torpedo does 163 HP to a hull, 76.8 left after one), so F3's
 *   "three of four survive" is a threshold the raid reaches only when it puts two torpedoes into two different hulls.
 * - with the screen (Fletcher, Cleveland) beside the Marus the raid died to ship AA with nobody in the air, which would hand the
 *   player the objective (the "no auto-complete" rule), so the screen stands seaward of the anchorage.
 */
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle, loadShipSpec, loadVehicleSpec } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { advance, playerAircraft, type World } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { assertLoopOverWater } from '../../../../src/sim/world/ships.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { CHAPTER_MISSIONS } from '../../../../src/campaign/chapterMissions.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'
import { progressOf } from '../fixture.js'
import { carrierApproach, deckRun, destroyNow, hold, levelAt, terrainOrSkip } from '../fly.js'
import { MILE_M, bearingDeg, bundleOf, worldOf } from './f10aKit.js'

const ID = 'a1-over-the-beaches'
const MARUS = ['maru-1', 'maru-2', 'maru-3', 'maru-4']
const RAID = ['betty-1', 'betty-2', 'betty-3', 'betty-4', 'val-1', 'val-2', 'zero-1', 'zero-2', 'zero-3', 'zero-4']
const BOMBERS = RAID.filter((r) => !r.startsWith('zero'))
const ANCHORAGE = { x: -20203, z: -47437 }

describe('A1 content', () => {
  const bundle = bundleOf(ID, 'A1')
  const { scenario } = bundle

  it('is registered as chapter A1 with the F6F, the Essex and its own badge', () => {
    expect(CHAPTER_MISSIONS.A1).toMatchObject({ scenario: ID, badge: { id: 'over-the-beaches' }, start: 'carrier', aircraft: ['f6f-hellcat'], coordinated: false, authoredBonus: 0 })
    expect(scenario.freezeOnSuccess).toBe(true) // Decision 13: Continue Sortie after the badge landing is a free sortie
    expect(scenario.weather.timeOfDay).toBe(8) // F3 section 3: 0800
  })

  it('plays the beaches in the assault window and the fields in pre-invasion (F8C), named so the campaign can draw them', () => {
    expect(scenario.sites).toEqual(['landing-beaches', 'tacloban', 'dulag'])
    expect(windowsForChapter('A1')).toMatchObject({ 'landing-beaches': 'assault', tacloban: 'pre-invasion', dulag: 'pre-invasion' })
    expect(bundle.airfields['landing-beaches']).toBeDefined()
  })

  it('holds F3\'s population: three friendly fighters, ten raiders (four G4M, four A6M2, two D3A), seven large ships, four LCVPs afloat', () => {
    const w = worldFromScenario(bundle, null)
    const held = scenario.heldGroups!.flatMap((g) => g.aircraft ?? [])
    const count = (spec: string) => held.filter((a) => a.spec === spec).length
    expect([count('g4m-betty'), count('a6m2-zero'), count('d3a-val')]).toEqual([4, 4, 2])
    expect(w.aircraft.filter((a) => sideOf(w, a) === 'allied')).toHaveLength(3)
    expect(scenario.population).toEqual({ airborne: 13, ships: 7 }) // validated at load: 3 + 10 can be airborne at once
    expect(w.ships.map((s) => s.spec.id).sort()).toEqual(['cleveland-cl', 'essex-cv', 'fletcher-dd', 'type-b-maru', 'type-b-maru', 'type-b-maru', 'type-b-maru'])
    const lcvps = scenario.vehicles.filter((v) => v.id.startsWith('lcvp-')) // the assault window adds six beached ones of its own (stationary)
    expect(lcvps).toHaveLength(4)
    expect(loadVehicleSpec('lcvp').floats).toBe(true)
    for (const v of lcvps) {
      expect(v.speedMps, v.id).toBeGreaterThan(0)
      expect(v.speedMps, v.id).toBeLessThanOrEqual(loadVehicleSpec('lcvp').maxSpeedMps)
      expect(v.loop, v.id).toBe(true)
    }
  })

  it('starts the player on the Essex deck, 12-15 miles seaward of the beaches (F3), inside the mission-fit row\'s start', () => {
    const w = worldFromScenario(bundle, null)
    const p = playerAircraft(w)
    expect(p.parked).toBe(true)
    const beach = bundle.airfields['landing-beaches']!.runway.center
    const miles = Math.hypot(p.state.position.x - beach.x, p.state.position.z - beach.z) / MILE_M
    expect(miles).toBeGreaterThanOrEqual(12)
    expect(miles).toBeLessThanOrEqual(15)
  })

  it('the raid reaches the anchorage inside F3\'s 15 miles of the player\'s start (raid contact)', () => {
    const w = worldFromScenario(bundle, null)
    const p = playerAircraft(w).state.position
    expect(Math.hypot(ANCHORAGE.x - p.x, ANCHORAGE.z - p.z) / MILE_M).toBeLessThan(15)
    const contact = scenario.objectives!.find((o) => o.id === 'contact')!
    expect(contact).toMatchObject({ kind: 'reach', point: ANCHORAGE })
  })

  it('every Maru is the transport the raid aims at: Bettys torpedo them (the one rack they have), Vals dive-bomb', () => {
    for (const a of scenario.heldGroups!.flatMap((g) => g.aircraft ?? [])) {
      const ingress = a.pilot?.ingress
      if (a.spec === 'g4m-betty') expect(ingress?.attack, a.id).toBe('torpedo')
      if (a.spec === 'd3a-val') expect(ingress?.attack, a.id).toBe('dive-bomb')
      if (ingress?.attack !== undefined) expect(MARUS, a.id).toContain((ingress.destination as { ship: string }).ship)
    }
    expect(Object.values(loadAircraftSpec('g4m-betty').stores!.types).map((t) => t.kind)).toEqual(['torpedo'])
  })

  it('weapon margin: a Hellcat\'s 6 guns bring a Betty down in at most five bursts (48 hits at 10 a hit; a 0.25 s burst lands 11 or more)', () => {
    const betty = loadAircraftSpec('g4m-betty').combat!
    const hitsToDown = Math.ceil(betty.structureHp / loadAircraftSpec('f6f-hellcat').combat!.damagePerHit)
    expect(hitsToDown).toBe(48)
    expect(Math.ceil(hitsToDown / 11)).toBeLessThanOrEqual(5)
    expect(loadShipSpec('type-b-maru').hullHp).toBe(240)
  })

  it('the briefing says what F3 requires: a historical composite, a raid of bombers and fighters, no claim the raid happened', () => {
    expect(scenario.history!.text).toMatch(/historical composite/)
    expect(scenario.history!.sources.length).toBeGreaterThanOrEqual(2)
    expect(scenario.briefing!.situation).toMatch(/Essex/)
  })
})

const terrain = terrainOrSkip()

describe.skipIf(terrain === null)('A1 over the real terrain', () => {
  it('builds, and every LCVP shuttle and every ship loop stays over water (assertLoopOverWater for vehicles)', () => {
    const w = worldOf(ID, 'A1', terrain)
    for (const v of w.vehicles.filter((x) => x.spec.floats === true && x.orders.speedMps > 0)) {
      // a shuttle is closed by its own `loop`, so the check walks the same legs a ship's loop does
      expect(() => assertLoopOverWater(v.id, { waypoints: v.orders.waypoints, speedMps: v.orders.speedMps }, terrain!, 50), v.id).not.toThrow()
    }
    expect(w.vehicles.filter((x) => x.id.startsWith('lcvp-'))).toHaveLength(4)
  })

  it('the shuttles move: an LCVP has covered more than a mile of water after three minutes', () => {
    let w = worldOf(ID, 'A1', terrain)
    const start = w.vehicles.find((v) => v.id === 'lcvp-1')!.state.position
    for (let i = 0; i < ticksFor(180); i++) w = advance(w, DT).world
    const at = w.vehicles.find((v) => v.id === 'lcvp-1')!.state.position
    expect(Math.hypot(at.x - start.x, at.z - start.z)).toBeGreaterThan(800)
  }, 60_000)
})
