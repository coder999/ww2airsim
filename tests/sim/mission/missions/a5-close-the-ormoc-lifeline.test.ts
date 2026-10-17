/**
 * A5 Close the Ormoc Lifeline (F10B plan, F3 section 4): an escort. The player is not the striker: four Avengers drop the torpedoes, and the badge
 * is whether they live to do it and to rally. The scenario plays in the `buildup` window on the campaign path (F3 section 5, 11 November).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { skipScene } from '../../../../src/sim/scene/preroll.js'
import { parseScene } from '../../../../src/sim/scene/schema.js'
import { loadScenarioBundle, loadSite } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { advance, playerAircraft, withAircraftState, type World } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { applyDifficulty, DIFFICULTIES, type Difficulty } from '../../../../src/sim/difficulty.js'
import { isDestroyed } from '../../../../src/sim/mission/step.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { assertLoopOverWater } from '../../../../src/sim/world/ships.js'
import { heightAt } from '../../../../src/sim/world/terrain.js'
import { destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'

const A5 = 'a5-close-the-ormoc-lifeline'
const BUILDUP = { tacloban: 'buildup', dulag: 'buildup', buri: 'buildup', bayug: 'buildup' } as const
const TBMS = ['tbm-1', 'tbm-2', 'tbm-3', 'tbm-4']
const terrain = terrainOrSkip()
/** The aircraft that are not parked: the sites add their own parked dressing (a few at each field), which is not part of the chapter's population. */
const flying = (w: World<undefined>) => w.aircraft.filter((a) => !a.parked)

describe('A5 content', () => {
  const bundle = loadScenarioBundle(A5, BUILDUP)
  const { scenario } = bundle
  const w: World<undefined> = worldFromScenario(bundle, null)

  it('the player and one F6F wingman start with four Avengers, in broken cloud at 1030', () => {
    expect(playerAircraft(w).spec.id).toBe('f6f-hellcat')
    expect(flying(w).map((a) => a.id)).toEqual(['f6f-1', 'f6f-2', ...TBMS])
    expect(w.aircraft.filter((a) => a.spec.id === 'tbm-3-avenger').map((a) => a.id)).toEqual(TBMS)
    for (const a of flying(w)) expect(sideOf(w, a), a.id).toBe('allied')
    expect(scenario.aircraft.find((a) => a.id === 'f6f-2')!.pilot).toMatchObject({ leader: 'f6f-1', slot: 1 })
    expect(scenario.weather.timeOfDay).toBe(10.5)
    expect(scenario.weather.clouds![0]!.coverage).toBeGreaterThanOrEqual(0.5) // broken
  })

  it('enemy: four A6M2 and two Ki-43, held; ships: the Essex, three Type B Marus, a Kagero and a Shiratsuyu; peak 12 aircraft and six ships', () => {
    const held = Object.fromEntries(scenario.heldGroups!.map((g) => [g.id, g.aircraft!.map((a) => a.spec)]))
    expect(held).toEqual({ scouts: ['ki-43-oscar', 'ki-43-oscar'], cap: ['a6m2-zero', 'a6m2-zero', 'a6m2-zero', 'a6m2-zero'] })
    expect(scenario.ships.map((s) => [s.id, s.spec])).toEqual([
      ['essex-1', 'essex-cv'], ['maru-1', 'type-b-maru'], ['maru-2', 'type-b-maru'], ['maru-3', 'type-b-maru'], ['kagero-1', 'kagero-dd'], ['shiratsuyu-1', 'shiratsuyu-dd'],
    ])
    expect(scenario.population).toEqual({ airborne: 12, ships: 6 })
    expect(w.ships.filter((s) => sideOf(w, s) === 'axis').map((s) => s.id)).toEqual(['maru-1', 'maru-2', 'maru-3', 'kagero-1', 'shiratsuyu-1'])
  })

  it('the badge path: hold the escort station on the Avengers, three release, three clear the convoy (the rally circle) with at most one lost through 8 minutes, land; the escort kill is the secondary', () => {
    const o = scenario.objectives!
    expect(o.filter((x) => x.priority === 'primary').map((x) => [x.id, x.kind])).toEqual([
      ['station', 'hold'], ['release', 'released'], ['rally', 'arrive'], ['tbms', 'protect'], ['home', 'land'],
    ])
    expect(o.find((x) => x.id === 'station')).toMatchObject({ relativeTo: 'tbms', resetOnExit: true })
    expect(o.find((x) => x.id === 'release')).toMatchObject({ store: 'torpedo', count: 3, after: 'station' })
    expect(o.find((x) => x.id === 'rally')).toMatchObject({ count: 3, after: 'release' })
    expect(o.find((x) => x.id === 'tbms')).toMatchObject({ maxLost: 1, until: { at: 480 } })
    expect(o.find((x) => x.id === 'home')).toMatchObject({ suggestedRecovery: true, at: 'essex-1', after: 'rally' })
    expect(o.find((x) => x.priority === 'secondary')).toMatchObject({ kind: 'destroy', targets: ['escorts'], count: 1, fresh: true, after: 'release' })
    expect(scenario.freezeOnSuccess).toBe(true)
  })

  it('the enemy fighters are held until the escort is under way, once each', () => {
    for (const [group, at] of [['scouts', 50], ['cap', 90]] as const) {
      const t = scenario.triggers!.find((x) => x.then.some((a) => 'spawn' in a && a.spawn === group))!
      expect(t.when).toEqual({ at })
    }
    expect(w.aircraft.some((a) => /^(oscar|zero)/.test(a.id))).toBe(false)
  })
})

/**
 * C3, the placement pass. INVENTED figures, each against its F3 limit. The start is the F8C ridge point (the highest terrain on the Ormoc-to-beaches
 * line); the convoy is in the SOUTH-EAST of Ormoc Bay, where there is water close to a field, not off the pier (F8C's figure, which cost the recovery 27 s).
 */
describe('A5 placement (invented figures, each against its F3 limit)', () => {
  const bundle = loadScenarioBundle(A5, BUILDUP)
  const w = worldFromScenario(bundle, null)
  const at = (id: string) => (w.aircraft.find((a) => a.id === id) ?? w.ships.find((s) => s.id === id))!.state.position
  const between = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
  const BAYUG = loadSite('bayug')
  const pier = { x: -75727, z: -22748 }

  it('F3: the convoy is inside 12 mi of the start; first action (the Avengers at the convoy) in 2-3 min at the formation\'s 85 m/s is not claimed, it is 3 min 9 s: the figure is reported', () => {
    const km = between(at('f6f-1'), at('maru-2')) / 1000
    expect(km).toBeLessThan(12 * 1.609344)
    expect(km / 85 * 1000).toBeGreaterThan(150) // about 189 s: nearer than F3's "5-6 min to the convoy", declared in the handoff
    expect(km / 85 * 1000).toBeLessThan(420) // inside the mission-fit ceiling
  })
  it('the convoy is 11 km from the Ormoc pier and steams toward it at 10 kt; its route is water the whole way (assertLoopOverWater on the real terrain)', () => {
    expect(between(at('maru-2'), pier) / 1000).toBeGreaterThan(8)
    expect(between(at('maru-2'), pier) / 1000).toBeLessThan(12 * 1.609344)
    for (const s of bundle.scenario.ships.filter((x) => x.side === undefined)) expect(s.speedMps, s.id).toBeLessThanOrEqual(6)
    if (terrain === null) return
    for (const s of bundle.scenario.ships) {
      if (s.id === 'essex-1') continue
      expect(() => assertLoopOverWater(s.id, { waypoints: s.waypoints.map(([x, z]) => ({ x, z })), speedMps: s.speedMps }, terrain), s.id).not.toThrow()
    }
  })
  it('the rally circle is centred on the convoy (9 km): the AI cannot be steered after its torpedo run, so the gate is where it stays; Bayug, the nearest field, is within 30 km', () => {
    const gate = (bundle.scenario.objectives!.find((o) => o.id === 'rally') as { zone: { point: { x: number; z: number }; radiusM: number } }).zone
    const bay = { x: BAYUG.base.runway.center.x, z: BAYUG.base.runway.center.z }
    // Bayug's own site frame is the world (it has none to convert): its runway centre is the content's
    const toGate = between(at('maru-2'), gate.point)
    const gateToBay = between(gate.point, { x: -45100, z: -20700 })
    expect(bay).toBeDefined()
    expect(toGate).toBeLessThan(15000)
    expect(toGate + gateToBay).toBeLessThan(between(at('maru-2'), { x: -45100, z: -20700 }) * 1.02) // on the way, not a detour
  })
  it.skipIf(terrain === null)('the start is above the crest it is read from: 780 m of ridge under a formation at 1,700 m', () => {
    const p = at('f6f-1')
    expect(heightAt(terrain!, p.x, p.z)).toBeGreaterThan(700)
    expect(playerAircraft(w).state.position.y - heightAt(terrain!, p.x, p.z)).toBeGreaterThan(500)
  })
  it('the Essex is where F8C put the carrier trap (13.5 mi east of the beaches) and is the suggested recovery, 69 km from the convoy: a far second choice to the fields', () => {
    expect(between(at('essex-1'), at('maru-2')) / 1000).toBeGreaterThan(60)
  })
  it('it also loads with no site windows (a Dev or picker launch): the fields are then axis-held and the Essex the only recovery', () => {
    const bare = worldFromScenario(loadScenarioBundle(A5), null)
    expect(flying(bare).map((a) => a.id)).toEqual(['f6f-1', 'f6f-2', ...TBMS])
  })
})

// ---------------------------------------------------------------- C4/C5: flown headless

const a5 = (d: Difficulty = 'normal'): World<undefined> => applyDifficulty(worldFromScenario(loadScenarioBundle(A5, BUILDUP), terrain), d)
const FAR = levelAt({ x: -20000, z: -60000 }, 3000, 120, 90)
const fighters = (w: World<undefined>): string[] => w.aircraft.filter((a) => /^(oscar|zero)/.test(a.id) && !isDestroyed(w, a.id)).map((a) => a.id)
const lost = (w: World<undefined>): number => TBMS.filter((id) => isDestroyed(w, id)).length

/**
 * One tick of the idealized escort: the player held 300 m behind and 100 m above the centroid of the living Avengers, level, on their heading
 * (headless tests cannot fly the player's guns; this puts him where an escort is, so `hold relativeTo` is satisfied for real). `kill` is the escort's
 * work: every enemy fighter is shot down once it has been in the air for `killAfterS` (the Escort test does the same with its Zeros).
 */
function flyOn(w: World<undefined>, born: Record<string, number>, mode: 'escorted' | 'unescorted', killAfterS = 20): World<undefined> {
  let world = w
  if (mode === 'escorted') {
    const live = world.aircraft.filter((a) => TBMS.includes(a.id) && !isDestroyed(world, a.id))
    const n = Math.max(1, live.length)
    const c = live.length === 0 ? { x: -65000, z: -27000, y: 1700, vx: 0, vz: 85 } : {
      x: live.reduce((q, a) => q + a.state.position.x, 0) / n, z: live.reduce((q, a) => q + a.state.position.z, 0) / n, y: live.reduce((q, a) => q + a.state.position.y, 0) / n,
      vx: live[0]!.state.velocity.x, vz: live[0]!.state.velocity.z,
    }
    const sp = Math.hypot(c.vx, c.vz) || 85
    const ux = c.vx / sp, uz = c.vz / sp
    world = withAircraftState(world, world.player, { ...levelAt({ x: c.x - ux * 300, z: c.z - uz * 300 }, c.y + 100, Math.max(60, sp), (Math.atan2(ux, -uz) * 180) / Math.PI), tick: world.tick })
    for (const id of fighters(world)) {
      born[id] ??= world.tick
      if (world.tick - born[id]! >= killAfterS * 60) world = destroyNow(world, [id])
    }
  } else {
    world = withAircraftState(world, world.player, { ...FAR, tick: world.tick })
  }
  return advance(world, DT).world
}
const run = (w: World<undefined>, seconds: number, mode: 'escorted' | 'unescorted', born: Record<string, number> = {}): World<undefined> => {
  let world = w
  for (let i = 0; i < seconds * 60; i++) world = flyOn(world, born, mode)
  return world
}
const WIN_S = 490 // the protect window closes at 480 s

describe.skipIf(terrain === null)('A5, flown headless', () => {
  it.each(DIFFICULTIES)('escorted at %s (the fighters shot down 20 s after they appear): the strike releases, three or four Avengers clear the convoy, none or one is lost; the window closes complete', (d) => {
    const w = run(a5(d), WIN_S, 'escorted')
    expect(progressOf(w, 'station').status).toBe('complete')
    expect(progressOf(w, 'release')).toMatchObject({ status: 'complete' })
    expect(progressOf(w, 'release').count).toBeGreaterThanOrEqual(3)
    expect(progressOf(w, 'rally').status).toBe('complete')
    expect(lost(w)).toBeLessThanOrEqual(1)
    expect(progressOf(w, 'tbms').status).toBe('complete')
  }, 120_000)

  it.each(DIFFICULTIES)('unescorted at %s (the player held far away): the strike is not made as ordered; at the combat difficulties the Avengers are lost and the escort objective fails', (d) => {
    const w = run(a5(d), 520, 'unescorted')
    expect(progressOf(w, 'station').status).toBe('active') // the station is relative to the Avengers: nobody is in it
    expect(progressOf(w, 'release').status).toBe('inactive')
    if (d === 'easy') expect(lost(w)).toBeGreaterThanOrEqual(1)
    else {
      expect(lost(w)).toBeGreaterThan(1)
      expect(progressOf(w, 'tbms').status).toBe('failed')
    }
    // no release by the player means no victory by default: the convoy lives (the Avengers' own torpedoes are not the player's)
    expect(w.mission!.latched).toBeUndefined()
  }, 120_000)

  it('success: escorted through the strike, then a flown landing at Bayug (any friendly base counts): badge, latched', () => {
    let w = run(a5(), WIN_S, 'escorted')
    w = hold(w, levelAt({ x: -45100, z: -20700 }, 800, 70, 90), 3)
    w = fieldApproach(w, 'bayug')
    expect(progressOf(w, 'home').status).toBe('complete')
    expect(w.mission!.latched).toBe(true)
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: { id: 'close-the-ormoc-lifeline' }, reasons: [] })
  }, 120_000)

  it('failure: unescorted, he lands anyway: no badge, and the Avengers are the reason', () => {
    let w = run(a5('normal'), 520, 'unescorted')
    w = hold(w, levelAt({ x: -45100, z: -20700 }, 800, 70, 90), 3)
    w = fieldApproach(w, 'bayug')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out.result).toBe('no-badge')
    expect(out.reasons).toContain('Avengers: failed')
  }, 120_000)

  it('the secondary: an escort sunk or silenced after the release counts; one lost before it does not', () => {
    const early = destroyNow(a5(), ['kagero-1'])
    let w = run(early, 20, 'escorted')
    expect(progressOf(w, 'escort-down').status).toBe('inactive')
    w = run(w, WIN_S, 'escorted')
    expect(progressOf(w, 'release').status).toBe('complete')
    expect(progressOf(w, 'escort-down').status).toBe('active') // the destroyer that died before the release is not counted: `fresh`
    w = destroyNow(w, ['shiratsuyu-1'])
    w = run(w, 1, 'escorted')
    expect(progressOf(w, 'escort-down').status).toBe('complete')
  }, 120_000)

  it('the escort station follows the Avengers: held in it the station completes in 45 s; leaving it resets the clock', () => {
    let w = a5()
    const born = {}
    for (let i = 0; i < 30 * 60; i++) w = flyOn(w, born, 'escorted')
    expect(progressOf(w, 'station').heldTicks).toBeGreaterThan(0)
    expect(progressOf(w, 'station').status).toBe('active')
    w = hold(w, FAR, 2) // away: the clock zeroes
    expect(progressOf(w, 'station').heldTicks).toBe(0)
    for (let i = 0; i < 50 * 60; i++) w = flyOn(w, born, 'escorted')
    expect(progressOf(w, 'station').status).toBe('complete')
  }, 120_000)
})

describe('A5 opening (a5-opening, 12 s)', () => {
  const scene = parseScene(JSON.parse(readFileSync('content/scenes/a5-opening.json', 'utf8')) as unknown)
  it('plays on A5\'s own scenario: the Avengers form up over the ridge, the convoy is called, the player is told his station; the mission clock starts at the handoff', () => {
    expect(scene).toMatchObject({ id: 'a5-opening', chapter: 'A5', kind: 'opening', durationS: 12, handoff: { player: 'ai' } })
    expect(scene.world.scenario).toBe(A5)
    const before = worldFromScenario(loadScenarioBundle(A5, BUILDUP), null)
    const after = skipScene(before, scene)
    expect(after.mission!.clockOriginTick).toBe(after.tick)
    expect(after.mission!.spawned).toEqual([]) // the scene spawns no enemy: they come at 50 s of the flight
    for (const id of TBMS) expect(isDestroyed(after, id)).toBe(false)
  })
  it('the first camera key is within 1 km of the formation and the last is behind the player\'s Hellcat', () => {
    const p = worldFromScenario(loadScenarioBundle(A5, BUILDUP), null).aircraft.find((a) => a.id === 'f6f-1')!.state.position
    expect(Math.hypot(scene.camera[0]!.position[0] - p.x, scene.camera[0]!.position[2] - p.z)).toBeLessThan(1500)
    expect(Math.hypot(scene.camera.at(-1)!.position[0] - p.x, scene.camera.at(-1)!.position[2] - p.z)).toBeLessThan(2000)
  })
})
