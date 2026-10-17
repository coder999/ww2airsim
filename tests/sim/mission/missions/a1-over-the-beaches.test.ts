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
import { sceneOf, MILE_M, bearingDeg, bundleOf, worldOf } from './f10aKit.js'
import { skipScene } from '../../../../src/sim/scene/preroll.js'

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

const logTick = (w: World<undefined>, pred: (e: NonNullable<World<undefined>['mission']>['log'][number]) => boolean): number | undefined => w.mission!.log.find(pred)?.tick
const completedTick = (w: World<undefined>, id: string): number | undefined => logTick(w, (e) => e.kind === 'objective' && e.id === id && e.status === 'complete')
/** Over the anchorage's north edge (away from the screen's AA, which would otherwise kill escorts the pinned player draws seaward), high enough (5,000 m) to be outside the escort's 3 km engagement range: present, never firing. */
const STATION = levelAt({ x: ANCHORAGE.x, z: ANCHORAGE.z - 5500 }, 5000, 110, 90)
const a1 = (): World<undefined> => worldOf(ID, 'A1', terrain)
const pinTo = (w: World<undefined>, s: number): World<undefined> => hold(w, STATION, Math.max(0, ticksFor(s) - w.tick))

describe.skipIf(terrain === null)('A1 tuning (F10A C4), measured 2026-10-17', () => {
  it('no auto-complete: with the player on station and not firing, the raid sinks a transport, the escort never leaves, and the window closes only on the 780 s timer', () => {
    let w = hold(a1(), STATION, ticksFor(60))
    expect(completedTick(w, 'up')).toBeDefined() // the pinned player left the deck: the launch objective is the airborne-from-Essex test
    w = pinTo(w, 700)
    expect(progressOf(w, 'contact').status).toBe('complete')
    expect(progressOf(w, 'transports').status).toBe('active') // 700 s in, the AI alone has not closed it
    const lost = MARUS.filter((m) => w.combat.ships[m]!.destroyedTick !== null)
    expect(lost.length).toBeGreaterThanOrEqual(1) // the raid is real: Bettys torpedo the anchorage
    expect(lost.length).toBeLessThanOrEqual(2) // and four Bettys and two Vals cannot do more (header)
    const escorts = ['zero-1', 'zero-2', 'zero-3', 'zero-4'].filter((z) => w.combat.aircraft[z]!.damage.destroyedAt == null)
    expect(escorts.length).toBeGreaterThanOrEqual(3) // the screen stands seaward, out of AA reach of the anchorage
    w = pinTo(w, 790)
    expect(completedTick(w, 'transports') ?? progressOf(w, 'transports').status).toBe(lost.length <= 1 ? ticksFor(780) : 'failed')
  }, 120_000)

  it('the bombers reach release range between 5:00 and 6:00 (arrive), well after the player can be there', () => {
    let w = pinTo(a1(), 400)
    const t = completedTick(w, 'release-range')!
    expect(t / 60).toBeGreaterThan(300)
    expect(t / 60).toBeLessThan(360)
    expect(completedTick(w, 'contact')! / 60).toBeLessThan(5) // the player is on station before the first bomber is in range
    w = advance(w, DT).world
    expect(radioMessages(w.mission!).some((e) => /Essex CIC/.test(e.text))).toBe(true)
  }, 120_000)
})

describe.skipIf(terrain === null)('A1 headless sortie (F10A C5)', () => {
  /** A real launch from the Essex, then the pinned station until the raid has been dealt with. */
  const launched = (): World<undefined> => {
    const w = deckRun(a1(), { flaps: true })
    expect(progressOf(w, 'up').status).toBe('complete')
    return w
  }

  it('success: launch, reach the transports, two bombers down before release, the raid gone, a trap aboard the Essex earns the badge and latches the script', () => {
    let w = pinTo(launched(), 100)
    expect(progressOf(w, 'contact').status).toBe('complete')
    w = destroyNow(w, ['betty-1', 'betty-2'])
    w = advance(w, DT).world
    expect(progressOf(w, 'bombers').status).toBe('complete')
    expect(progressOf(w, 'transports').status).toBe('inactive') // the window opens when the first bomber is in release range
    w = pinTo(w, 340)
    expect(progressOf(w, 'transports').status).toBe('active')
    w = advance(destroyNow(w, RAID), DT).world
    expect(progressOf(w, 'transports').status).toBe('complete')
    expect(progressOf(w, 'home').status).toBe('active')
    w = carrierApproach(w, 'cv-1')
    expect(playerAircraft(w).impact).toBeNull()
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'over-the-beaches', name: 'Over the Beaches' }, reasons: [] })
    expect(out.objectives.find((o) => o.id === 'bombers')!.final).toBe('complete')
    expect(w.mission!.latched).toBe(true) // Decision 13
  }, 180_000)

  it('success without the secondary: the bombers get through to release range, the badge still stands', () => {
    let w = pinTo(launched(), 340)
    expect(progressOf(w, 'bombers').status).toBe('failed')
    w = advance(destroyNow(w, RAID), DT).world
    w = carrierApproach(w, 'cv-1')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', reasons: [] })
  }, 180_000)

  it('failure: two transports lost fails the objective by name and a trap earns no badge', () => {
    let w = pinTo(launched(), 340)
    w = advance(destroyNow(w, ['maru-1', 'maru-2']), DT).world
    expect(progressOf(w, 'transports').status).toBe('failed')
    expect(progressOf(w, 'home').status).toBe('inactive') // the landing never counts
    w = carrierApproach(destroyNow(w, RAID), 'cv-1')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({
      result: 'no-badge', badge: null, reasons: ['Keep the transports afloat: failed', 'Land at any friendly base: incomplete'],
    })
    expect(w.mission!.latched).toBeUndefined() // a landing that does not qualify leaves the script running
  }, 180_000)

  it('edge: a trap while the raid is still over the transports leaves the window open and earns no badge', () => {
    let w = pinTo(launched(), 340)
    w = carrierApproach(w, 'cv-1')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out.result).toBe('no-badge')
    // a standing `protect` that has not failed reads complete; what blocks the badge is the landing, which only counts once the window has closed
    expect(out.reasons).toEqual(['Land at any friendly base: incomplete'])
    expect(progressOf(w, 'transports').status).toBe('active')
  }, 180_000)

  it('edge: three transports lost reads the same as two (the objective already failed)', () => {
    let w = pinTo(launched(), 340)
    w = advance(destroyNow(w, ['maru-1', 'maru-2', 'maru-3']), DT).world
    expect(progressOf(w, 'transports').status).toBe('failed')
  }, 180_000)

  it('edge: every bomber shot down before release range still opens the window (no deadlock: the bombers-down trigger completes the range gate)', () => {
    let w = pinTo(launched(), 100)
    w = advance(destroyNow(w, BOMBERS), DT).world
    expect(progressOf(w, 'bombers').status).toBe('complete')
    expect(progressOf(w, 'release-range').status).toBe('complete')
    w = advance(advance(w, DT).world, DT).world
    // the escort is still 20 km out at 100 s, so with every bomber down the raid is gone from the anchorage at once: nothing left to defend against
    expect(progressOf(w, 'transports').status).toBe('complete')
    expect(progressOf(w, 'home').status).toBe('active')
    w = carrierApproach(w, 'cv-1')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', reasons: [] })
  }, 180_000)

  it('edge: the 780 s timer closes the window with the escort still alive, and the transports then count as defended', () => {
    let w = pinTo(hold(launched(), STATION, 1), 790)
    const alive = ['zero-1', 'zero-2', 'zero-3', 'zero-4'].some((z) => w.combat.aircraft[z]!.damage.destroyedAt == null)
    expect(alive).toBe(true)
    const lost = MARUS.filter((m) => w.combat.ships[m]!.destroyedTick !== null).length
    expect(progressOf(w, 'transports').status).toBe(lost <= 1 ? 'complete' : 'failed')
  }, 180_000)
})

describe('A1 opening scene (F10A C7; the chapter scene contract itself is enrolled by tests/sim/scene/content.test.ts)', () => {
  it('is 18 s (F3 section 6), lands the camera 15-40 m behind the player on the Essex deck, and hands the player over held', () => {
    const scene = sceneOf('a1-opening')
    expect(scene).toMatchObject({ chapter: 'A1', kind: 'opening', durationS: 18, handoff: { player: 'held' }, world: { scenario: ID } })
    const w = skipScene(worldOf(ID, 'A1', null), scene)
    const p = playerAircraft(w).state.position
    const eye = scene.camera.at(-1)!
    const behind = Math.hypot(eye.position[0] - p.x, eye.position[2] - p.z)
    expect(behind).toBeGreaterThan(15)
    expect(behind).toBeLessThan(40)
    // looking along the Essex's heading (342): yaw = 90 - compass heading
    expect(((eye.yawDeg - (90 - 342)) % 360 + 540) % 360 - 180).toBeCloseTo(0, -1)
    expect(scene.cues.filter((c) => c.order.kind === 'message').length).toBeGreaterThanOrEqual(3)
  })
})
