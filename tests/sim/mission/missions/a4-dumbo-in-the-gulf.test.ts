/**
 * A4 Dumbo in the Gulf (F10B plan, F3 section 4): C1, the content contract. Written red, before the scenario existed.
 * The scenario plays in the Jinamoc `buildup` window (F3 section 5: the anchorage, its lamps and the rescue launch are there late Oct-Nov).
 */
import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft, withAircraftState, type World } from '../../../../src/sim/loop.js'
import { skipScene } from '../../../../src/sim/scene/preroll.js'
import { parseScene } from '../../../../src/sim/scene/schema.js'
import { readFileSync } from 'node:fs'
import { applyDifficulty, DIFFICULTIES, type Difficulty } from '../../../../src/sim/difficulty.js'
import { radioMessages, ticksFor } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { destroyNow, hold, levelAt, stageDitch, stepsWithControls, terrainOrSkip } from '../fly.js'
import { approachTouching, restState, waterTakeoff } from '../waterFly.js'

const A4 = 'a4-dumbo-in-the-gulf'
const BUILDUP = { jinamoc: 'buildup' } as const
const YD = 0.9144

describe('A4 content', () => {
  const bundle = loadScenarioBundle(A4, BUILDUP)
  const { scenario } = bundle
  const w = worldFromScenario(bundle, null)

  it('the PBY-5A starts afloat at the San Pedro Bay anchorage, at night, with the anchorage declared as a recovery circle', () => {
    expect(playerAircraft(w).spec.id).toBe('pby-5a-catalina')
    expect(scenario.aircraft.find((a) => a.id === scenario.player)).toHaveProperty('afloatAt')
    expect(scenario.weather.timeOfDay).toBe(21)
    expect(scenario.anchorages).toHaveLength(1)
    expect(scenario.sites).toEqual(['jinamoc'])
  })

  it('one three-person raft group and one separated survivor; the scripted 63-ft launch belongs to the scenario (the site adds a second, stationary one at the ramp)', () => {
    const rafts = w.vehicles.filter((v) => v.survivors !== undefined)
    expect(rafts.map((v) => [v.id, v.survivors])).toEqual([['raft-1', 3], ['survivor-1', 1]])
    expect(w.vehicles.find((v) => v.id === 'launch-1')?.spec.id).toBe('usaaf-63ft-rescue-boat')
    expect(w.vehicles.find((v) => v.id === 'jinamoc-veh-launch')?.spec.id).toBe('usaaf-63ft-rescue-boat')
  })

  it('peak air population is three: the PBY and the two Ki-43s, who are held and do not exist at the start', () => {
    expect(scenario.population).toEqual({ airborne: 3, ships: 0 })
    // the site adds a moored PBY (`jinamoc-bu-pby-1`, dressing at a buoy, not airborne), which is not counted
    expect(w.aircraft.map((a) => a.id).filter((id) => !id.startsWith('jinamoc-'))).toEqual(['pby-1'])
    const recon = scenario.heldGroups!.find((g) => g.id === 'recon')!
    expect(recon.aircraft!.map((a) => a.spec)).toEqual(['ki-43-oscar', 'ki-43-oscar'])
  })

  it('the badge path: takeoff, search area, flare, a landing within 150 yd, a pickup of three, the return; the survivor is the secondary', () => {
    const o = scenario.objectives!
    expect(o.filter((x) => x.priority === 'primary').map((x) => x.kind)).toEqual(['takeoff', 'reach', 'state', 'landedNear', 'pickup', 'land'])
    expect(o.find((x) => x.kind === 'landedNear')).toMatchObject({ entity: 'raft-1', radiusM: expect.closeTo(150 * YD, 1) })
    expect(o.find((x) => x.id === 'pickup')).toMatchObject({ raft: 'raft-1', survivors: 3, withinM: expect.closeTo(100 * 0.3048, 1), dwellS: 20 })
    expect(o.find((x) => x.priority === 'secondary')).toMatchObject({ kind: 'pickup', raft: 'survivor-1', survivors: 1, after: 'pickup' })
    expect(scenario.freezeOnSuccess).toBe(true)
  })

  it('the Ki-43s spawn once, when the first pickup completes, and not earlier', () => {
    const t = scenario.triggers!.find((x) => x.then.some((a) => 'spawn' in a && a.spawn === 'recon'))!
    expect(t.when).toEqual({ completed: 'pickup' })
  })
})

const MI = 1609.344
const near = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.hypot(a.x - b.x, a.z - b.z)

/**
 * C3, the placement pass. Every figure below is INVENTED (F3 gives A4 no geometry; the F8C mission-fit row said so) and each is held to the F3 limit it meets.
 * The anchorage start is the site's buoy-2 (150, -20 in the site frame) moved 60 m seaward to (190, -20): the terrain cell at the buoy is 0.15 m high, which the sim calls LAND (water is a height at or below 0), and the Catalina crashed on it at tick 31 (found 2026-10-17); the search area is the mission-fit row's first-action point.
 */
describe('A4 placement (invented figures, each against its F3 limit)', () => {
  const bundle = loadScenarioBundle(A4, BUILDUP)
  const w = worldFromScenario(bundle, null)
  const start = playerAircraft(w).state.position
  const search = bundle.scenario.objectives!.find((o) => o.id === 'search')! as { point: { x: number; z: number }; radiusM: number }
  const raft = w.vehicles.find((v) => v.id === 'raft-1')!.state.position
  const survivor = w.vehicles.find((v) => v.id === 'survivor-1')!.state.position
  const anchorage = bundle.scenario.anchorages![0]!

  it('F3: the search area lies inside 10 mi of the anchorage (its far edge, not just its centre)', () => {
    expect(near(start, search.point) + search.radiusM).toBeLessThan(10 * MI)
  })
  it('F3: the raft is inside the search area and inside 10 mi of the anchorage; the separated survivor is inside it too, a short taxi (under 500 m) from the raft', () => {
    expect(near(raft, search.point)).toBeLessThan(search.radiusM)
    expect(near(start, raft)).toBeLessThan(10 * MI)
    expect(near(survivor, search.point)).toBeLessThan(search.radiusM)
    expect(near(raft, survivor)).toBeLessThan(500)
    expect(near(raft, survivor)).toBeGreaterThan(137.16 + 30.48) // not inside the first pickup's own radius
  })
  it('the raft is outside the flare sighting radius at the search area\'s edge, so the pilot has to look for it, and outside the anchorage circle (a landing there is not a recovery)', () => {
    const flare = bundle.scenario.objectives!.find((o) => o.id === 'flare')! as { near: { radiusM: number } }
    expect(near(raft, search.point) + search.radiusM).toBeGreaterThan(flare.near.radiusM)
    expect(near({ x: anchorage.position[0], z: anchorage.position[1] }, raft)).toBeGreaterThan(anchorage.radiusM)
    // and the PBY starts inside the circle, moored 10 m from the buoy, so a return to its mooring is a friendly stop
    expect(near({ x: anchorage.position[0], z: anchorage.position[1] }, start)).toBeLessThan(anchorage.radiusM)
  })
  it('the raft flare burns at the raft, and the survivor lamp at the survivor; the anchorage lamps are the site\'s (at least four)', () => {
    const lights = bundle.scenario.lights!
    expect(lights.find((l) => l.id === 'raft-flare')!.at).toMatchObject({ x: raft.x, z: raft.z })
    expect(lights.find((l) => l.id === 'survivor-lamp')!.at).toMatchObject({ x: survivor.x, z: survivor.z })
    expect(lights.filter((l) => l.id.startsWith('jinamoc-lamp')).length).toBeGreaterThanOrEqual(4)
    expect(lights.filter((l) => l.kind === 'flare').length).toBeLessThanOrEqual(4) // LIGHT_CAPS.flares
  })
  it('the Ki-43 pass keeps beyond the ingress engage range (3 km) of the raft and the survivor, so it is dressing unless the PBY goes to it', () => {
    const route = (bundle.scenario.heldGroups![0]!.aircraft![0]!.pilot!.ingress!.route)
    for (const p of route) {
      expect(near(p, raft), `waypoint ${p.x},${p.z} to the raft`).toBeGreaterThan(3000)
      expect(near(p, survivor)).toBeGreaterThan(3000)
    }
  })
  it('it also loads with no site windows at all (a Dev or picker launch before the campaign names one): the anchorage is just water then', () => {
    const bare = worldFromScenario(loadScenarioBundle(A4), null)
    expect(playerAircraft(bare).state.position.x).toBeCloseTo(start.x, 3)
    expect(bare.vehicles.map((v) => v.id)).toEqual(['raft-1', 'survivor-1', 'launch-1'])
  })
})

// ---------------------------------------------------------------- C4/C5: flown headless

const terrain = terrainOrSkip()
const a4 = (d: Difficulty = 'normal'): World<undefined> => applyDifficulty(worldFromScenario(loadScenarioBundle(A4, BUILDUP), terrain), d)
const T = loadScenarioBundle(A4, BUILDUP).scenario
const V = Object.fromEntries(T.vehicles.map((v) => [v.id, { x: v.waypoints[0]![0], z: v.waypoints[0]![1] }]))
const RAFT = V['raft-1']!
const SURVIVOR = V['survivor-1']!
const SEARCH = (T.objectives!.find((o) => o.id === 'search') as { point: { x: number; z: number } }).point
const ANCHORAGE = { x: T.anchorages![0]!.position[0], z: T.anchorages![0]!.position[1] }
const heading = (deg: number) => ({ x: Math.sin((deg * Math.PI) / 180), z: -Math.cos((deg * Math.PI) / 180) })
const msgs = (w: World<undefined>): string[] => radioMessages(w.mission!).map((e) => e.text)
const idle = { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: false, flapDown: true } as const

/** The takeoff, flown for real from the mooring (the Catalina's own water run), and the legs to the raft, staged (taxiing and cruise are not under test). */
function airborneAtRaft(w0: World<undefined>): World<undefined> {
  let w = waterTakeoff(w0)
  expect(progressOf(w, 'takeoff').status).toBe('complete')
  // The F8C mission-fit row ESTIMATES 60 s for the water takeoff; the Catalina's own run is measured here (2026-10-17: 41 s to a 10 m latch).
  const lifted = w.mission!.log.find((e) => e.kind === 'objective' && e.id === 'takeoff')!.tick
  expect(lifted, 'ticks to the airborne latch').toBeLessThan(ticksFor(60))
  w = hold(w, levelAt(SEARCH, 150, 55, 135), 3)
  expect(progressOf(w, 'search').status).toBe('complete')
  // 2.8 km north-west of the raft, out of the 3 km sighting radius until one more tick brings it in
  w = hold(w, levelAt({ x: RAFT.x - 2800 * heading(135).x, z: RAFT.z - 2800 * heading(135).z }, 150, 55, 135), 3)
  expect(progressOf(w, 'flare').status).toBe('complete')
  return w
}

/** A real water landing into the wind (from 315, so heading 315), the touchdown within 40 m of `offsetM` short of the raft. */
function landNearRaft(w: World<undefined>, offsetM: number): World<undefined> {
  const d = heading(315)
  return approachTouching(w, RAFT.x - d.x * offsetM, RAFT.z - d.z * offsetM, 315).world
}

/** Taxi staged (the pilot rolled out past the raft and came back): at rest 20 m east of the raft, heading into the wind, then 25 s of real idling on the water. */
function takeThemAboard(w: World<undefined>, at: { x: number; z: number } = RAFT): World<undefined> {
  let world = withAircraftState(w, w.player, restState(w, at.x + 20, at.z, 315))
  world = stepsWithControls(world, ticksFor(25), idle)
  return world
}

describe.skipIf(terrain === null)('A4, flown headless', () => {
  it('nothing completes by itself: five minutes at the mooring with the engines idle changes no objective', () => {
    const w = stepsWithControls(a4(), ticksFor(300), idle)
    expect(w.mission!.progress.map((p) => p.status)).toEqual(['active', 'inactive', 'inactive', 'inactive', 'inactive', 'inactive', 'inactive'])
    expect(w.mission!.spawned).toEqual([])
  })

  it('success: takeoff, the area, the flare, a flown landing 100 yd from the raft, three aboard in 20 s, a flown return: badge', () => {
    let w = airborneAtRaft(a4())
    expect(w.mission!.spawned).toEqual([])
    w = landNearRaft(w, 100 * 0.9144)
    expect(progressOf(w, 'touchdown').status).toBe('complete')
    expect(w.mission!.log.filter((e) => e.kind === 'landing')).toHaveLength(1)
    expect(w.mission!.log.find((e) => e.kind === 'landing')).toMatchObject({ advanced: 'touchdown', intermediate: true, base: null })
    w = takeThemAboard(w)
    expect(progressOf(w, 'pickup')).toMatchObject({ status: 'complete', count: 3 })
    expect(w.mission!.spawned).toEqual(['recon'])
    expect(msgs(w).some((m) => m.startsWith('Dumbo: Three aboard'))).toBe(true)
    expect(w.aircraft.filter((a) => a.id.startsWith('oscar-'))).toHaveLength(2)
    // the way home: a real takeoff from the raft's water and a real landing into the anchorage
    w = waterTakeoff(w)
    const d = heading(315)
    w = approachTouching(w, ANCHORAGE.x - d.x * 700, ANCHORAGE.z - d.z * 700, 315).world
    expect(progressOf(w, 'home').status).toBe('complete')
    expect(w.mission!.latched).toBe(true)
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: { id: 'dumbo-in-the-gulf' }, reasons: [] })
    // Continue Sortie (Decision 13): the script is frozen, so another two minutes change no objective and spawn nothing
    const progress = JSON.stringify(w.mission!.progress)
    const later = stepsWithControls(w, ticksFor(120), idle)
    expect(JSON.stringify(later.mission!.progress)).toBe(progress)
    expect(later.mission!.spawned).toEqual(['recon'])
  }, 120_000)

  it('a ditching before the pickup earns no badge', () => {
    let w = airborneAtRaft(a4())
    const at = { x: RAFT.x - 3000, z: RAFT.z - 3000 }
    w = stageDitch(w, at)
    for (let i = 0; i < 600 && playerAircraft(w).impact === null; i++) w = stepsWithControls(w, 1, { throttle: 0 })
    expect(['ditched', 'destroyed']).toContain(playerAircraft(w).impact?.kind)
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out.result).toBe('no-badge')
    expect(out.badge).toBeNull()
    expect(['Ditched', 'Killed']).toContain(out.reasons[0])
    expect(progressOf(w, 'pickup').status).toBe('inactive')
  })

  it('failure mid-graph: the raft is lost before the survivors are aboard; he flies home anyway: no badge, the lost pickup is the reason', () => {
    let w = airborneAtRaft(a4())
    w = landNearRaft(w, 100 * 0.9144)
    w = destroyNow(w, ['raft-1'])
    w = takeThemAboard(w)
    expect(progressOf(w, 'pickup').status).toBe('failed')
    expect(w.mission!.spawned).toEqual([]) // the pass is for a pickup that never happened
    w = waterTakeoff(w)
    const d = heading(315)
    w = approachTouching(w, ANCHORAGE.x - d.x * 700, ANCHORAGE.z - d.z * 700, 315).world
    // a stop at the anchorage is a friendly base; the badge is still out of reach
    expect(w.mission!.log.filter((e) => e.kind === 'landing').at(-1)).toMatchObject({ base: { kind: 'anchorage' } })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({
      result: 'no-badge', badge: null, reasons: ['Take three survivors aboard: failed', 'Return to the anchorage: incomplete'],
    })
  }, 120_000)

  it('home without the survivors: a landing at the anchorage after the flight out is a stop but not a badge', () => {
    let w = waterTakeoff(a4())
    w = hold(w, levelAt(ANCHORAGE, 150, 55, 315), 3)
    const d = heading(315)
    w = approachTouching(w, ANCHORAGE.x - d.x * 700, ANCHORAGE.z - d.z * 700, 315).world
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out.result).toBe('no-badge')
    expect(out.reasons[0]).toBe('Enter the search area: incomplete')
  }, 120_000)

  it('a landing 200 yd off the raft does not count and does not end the sortie: he takes off, tries again, and the second one does', () => {
    let w = airborneAtRaft(a4())
    w = landNearRaft(w, 200 * 0.9144)
    expect(progressOf(w, 'touchdown').status).toBe('active')
    expect(w.mission!.log.filter((e) => e.kind === 'landing').at(-1)).toMatchObject({ advanced: 'touchdown', intermediate: true })
    w = hold(waterTakeoff(w), levelAt({ x: RAFT.x - 2800 * heading(315).x, z: RAFT.z - 2800 * heading(315).z }, 150, 55, 315), 3)
    w = landNearRaft(w, 100 * 0.9144)
    expect(progressOf(w, 'touchdown').status).toBe('complete')
  }, 120_000)

  it('the separated survivor is the secondary: taken aboard after the raft, one man; the badge does not wait for him and the debrief shows him done when he is', () => {
    let w = takeThemAboard(landNearRaft(airborneAtRaft(a4()), 100 * 0.9144))
    expect(progressOf(w, 'pickup').status).toBe('complete')
    expect(progressOf(w, 'survivor').status).toBe('active')
    w = takeThemAboard(w, SURVIVOR)
    expect(progressOf(w, 'survivor')).toMatchObject({ status: 'complete', count: 1 })
    expect(msgs(w).some((m) => m.startsWith('Dumbo: The fourth man'))).toBe(true)
    w = waterTakeoff(w)
    const d = heading(315)
    w = approachTouching(w, ANCHORAGE.x - d.x * 700, ANCHORAGE.z - d.z * 700, 315).world
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', reasons: [] })
    expect(out.objectives.find((o) => o.id === 'survivor')).toMatchObject({ priority: 'secondary', final: 'complete' })
  }, 120_000)

  it('the survivors are not picked up by a low pass at the raft at 60 m/s', () => {
    let w = airborneAtRaft(a4())
    w = landNearRaft(w, 100 * 0.9144)
    // he has landed, as the graph wants; now he flies over the raft at speed instead of staying: no dwell builds in ten seconds of it
    const pass = hold(w, levelAt({ x: RAFT.x, z: RAFT.z }, 10, 60, 315), 600)
    expect(progressOf(pass, 'pickup')).toMatchObject({ status: 'active', heldTicks: 0 })
  })
})

describe('A4 opening (a4-opening, 18 s)', () => {
  const scene = parseScene(JSON.parse(readFileSync('content/scenes/a4-opening.json', 'utf8')) as unknown)
  it('plays on A4\'s own scenario: lamps and the moored Catalina, the survivor report, the launch casts off, the player is handed a held, afloat Catalina', () => {
    expect(scene).toMatchObject({ id: 'a4-opening', chapter: 'A4', kind: 'opening', durationS: 18, handoff: { player: 'held' } })
    expect(scene.world.scenario).toBe(A4)
    expect(scene.cues.filter((c) => c.order.kind === 'message').length).toBeGreaterThanOrEqual(2)
    expect(scene.cues.find((c) => c.order.kind === 'order')).toMatchObject({ t: 7, order: { entity: 'launch-1' } })
    // A vehicle placed at speed 0 is never restarted by a scene's `course` order (stepVehicle's at-rest shortcut: found 2026-10-17), so launch-1 is placed
    // creeping at 0.01 m/s, and the cue's first waypoint is the one it is already past.
    expect(loadScenarioBundle(A4).scenario.vehicles.find((v) => v.id === 'launch-1')).toMatchObject({ speedMps: 0.01 })
    // headless, in the buildup window (the generic scene test runs it in pre-invasion, with no lamps): the launch has left its mooring, the Catalina has not
    const before = worldFromScenario(loadScenarioBundle(A4, BUILDUP), null)
    const after = skipScene(before, scene)
    const launch = (w: World<undefined>) => w.vehicles.find((v) => v.id === 'launch-1')!.state.position
    expect(Math.hypot(launch(after).x - launch(before).x, launch(after).z - launch(before).z)).toBeGreaterThan(40)
    expect(after.mission!.clockOriginTick).toBe(after.tick) // the mission clock starts at the handoff, so the radio tasking is heard after the scene
    // the lamps the camera looks at are there in this window: at least four
    expect(loadScenarioBundle(A4, BUILDUP).scenario.lights!.filter((l) => l.id.startsWith('jinamoc-lamp')).length).toBeGreaterThanOrEqual(4)
  })
  it.skipIf(terrain === null)('with the real sea under it the held Catalina rides at its mooring through the 18 s (a world with no terrain has no water: it would fall)', () => {
    const before = worldFromScenario(loadScenarioBundle(A4, BUILDUP), terrain)
    const after = skipScene(before, scene)
    const at = (w: World<undefined>) => playerAircraft(w).state.position
    expect(Math.hypot(at(after).x - at(before).x, at(after).z - at(before).z)).toBeLessThan(15)
    expect(playerAircraft(after).impact).toBeNull()
  })
  it('every camera key is over the water or the anchorage (within 400 m of the mooring) and above the waterline', () => {
    const mooring = { x: -27500, z: -46040 }
    for (const k of scene.camera) {
      expect(Math.hypot(k.position[0] - mooring.x, k.position[2] - mooring.z), `t=${k.t}`).toBeLessThan(400)
      expect(k.position[1], `t=${k.t}`).toBeGreaterThan(2)
    }
  })
})
