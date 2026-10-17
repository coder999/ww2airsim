import { describe, expect, it } from 'vitest'
import { loadScenario, loadScenarioBundle } from '../../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../../src/sim/scenario.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'
import type { World } from '../../../../src/sim/loop.js'
import { airborne } from '../../../../src/sim/ai/airborne.js'
import { decksOf } from '../../../../src/sim/world/deck.js'
import { isDestroyed } from '../../../../src/sim/mission/step.js'
import { fieldState } from '../../../../src/sim/mission/fields.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import type { ParachutistEntity } from '../../../../src/sim/bailout.js'
import { progressOf } from '../fixture.js'
import { deckRun, destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'

/**
 * J6 Operation Te-Go (F10E; content: F3 section 4). Ki-43-IIb or A6M2, dawn, 7 December, ALTERNATE HISTORY. The contract half.
 */
const ID = 'j6-operation-te-go'
const bundle = () => loadScenarioBundle(ID, windowsForChapter('J6'))

describe('J6 content: the locked finale populations (F3 sections 2 and 4)', () => {
  const scenario = loadScenario(ID)
  const held = scenario.heldGroups ?? []
  const everyAircraft = [...scenario.aircraft, ...held.flatMap((g) => g.aircraft ?? [])]
  const sideOfPlane = (a: { id: string; side?: string | undefined }) => a.side ?? (a.id === scenario.player ? 'allied' : 'axis')

  it('builds', () => { expect(() => worldFromScenario(bundle(), null)).not.toThrow() })

  it('is the finale population: 20 Japanese (the player, 3 more Ki-43, 4 A6M2, 4 Ki-21, 4 G4M, 4 Ki-57) and 4 American P-38s, 24 in all', () => {
    const count = (side: string) => everyAircraft.filter((a) => sideOfPlane(a) === side).reduce<Record<string, number>>((m, a) => ({ ...m, [a.spec]: (m[a.spec] ?? 0) + 1 }), {})
    expect(count('axis')).toEqual({ 'ki-43-oscar': 4, 'a6m2-zero': 4, 'ki-21-sally': 4, 'g4m-betty': 4, 'ki-57-ii-topsy': 4 })
    expect(count('allied')).toEqual({ 'p-38-lightning': 4 })
    expect(everyAircraft.find((a) => a.id === scenario.player)!.side).toBe('axis')
    expect(everyAircraft).toHaveLength(24)
    expect(scenario.population).toEqual({ airborne: 24, ships: 10, close: 16 })
  })

  it('has a close set of 12 (the player, three Ki-43, four A6M2, four P-38) and the twelve bombers and transports outside it', () => {
    const close = everyAircraft.filter((a) => (a.tags ?? []).includes('close'))
    expect(close).toHaveLength(12)
    expect(close.map((a) => a.spec).sort()).toEqual([...Array(4).fill('ki-43-oscar'), ...Array(4).fill('a6m2-zero'), ...Array(4).fill('p-38-lightning')].sort())
    expect(everyAircraft.filter((a) => (a.tags ?? []).includes('bombers')).map((a) => a.spec).sort()).toEqual([...Array(4).fill('g4m-betty'), ...Array(4).fill('ki-21-sally'), ...Array(4).fill('ki-57-ii-topsy')].sort())
  })

  it('has ten American ships and the locked ground sets (Japanese 4 Type 97, 6 Type 94, 2 Type 95; American 4 M4, 6 CCKW, 2 Willys), at most ten moving', () => {
    expect(scenario.ships.map((s) => s.spec).sort()).toEqual(['cleveland-cl', 'essex-cv', 'fletcher-dd', 'fletcher-dd', 'pennsylvania-bb', 'type-b-maru', 'type-b-maru', 'type-b-maru', 'type-b-maru', 'type-b-maru'])
    expect(scenario.ships.every((s) => s.side === 'allied')).toBe(true)
    const count = (side: string) => scenario.vehicles.filter((v) => (v.side ?? 'axis') === side).reduce<Record<string, number>>((m, v) => ({ ...m, [v.spec]: (m[v.spec] ?? 0) + 1 }), {})
    expect(count('axis')).toEqual({ 'type97-chi-ha': 4, 'type94-cargo-truck': 6, 'type95-kurogane': 2 })
    expect(count('allied')).toEqual({ 'm4-sherman': 4, 'gmc-cckw-353': 6, 'willys-mb-jeep': 2 })
    expect(scenario.vehicles.filter((v) => v.speedMps > 0).length).toBeLessThanOrEqual(10)
  })

  it('the validator refuses one aircraft over the cap', () => {
    const over = structuredClone(scenario) as unknown as { heldGroups: { aircraft?: Record<string, unknown>[] }[] }
    const group = over.heldGroups.find((g) => g.aircraft !== undefined)!
    group.aircraft!.push({ ...group.aircraft![0]!, id: 'one-too-many' })
    expect(() => parseScenario(over)).toThrow(/25 aircraft can be airborne at once, over the declared 24/)
  })
})

describe('J6 content: the chapter, its alternate-history honesty and its graph', () => {
  const scenario = loadScenario(ID)
  const o = (id: string) => scenario.objectives!.find((x) => x.id === id)!
  it('plays in the j6-alternate window on every site, at dawn, and says in its briefing and its history that it is alternate history', () => {
    expect(new Set(Object.values(windowsForChapter('J6')))).toEqual(new Set(['j6-alternate']))
    expect(scenario.weather.timeOfDay).toBeGreaterThanOrEqual(5.5)
    expect(scenario.weather.timeOfDay).toBeLessThan(7)
    expect(scenario.freezeOnSuccess).toBe(true)
    expect(scenario.briefing!.situation).toMatch(/^ALTERNATE HISTORY\./)
    expect(scenario.history!.text).toMatch(/ALTERNATE HISTORY/)
    expect(scenario.history!.text).toMatch(/never happened/)
    expect(scenario.badge).toEqual({ id: 'operation-te-go', name: 'Operation Te-Go' })
  })
  it('follows the F3 graph: escort the Sallys through release, two Topsy drops, break the response, Buri and Bayug to Japanese control, hold them through the timer, land at Buri or Bayug', () => {
    expect(o('escort')).toMatchObject({ kind: 'hold', relativeTo: 'sally', after: 'up' })
    expect(o('release')).toMatchObject({ kind: 'released', targets: ['sally'], count: 2, after: 'escort' })
    expect(o('drops')).toMatchObject({ kind: 'drop', targets: ['topsy'], count: 2, after: 'release' })
    expect(o('response')).toMatchObject({ kind: 'destroy', targets: ['response'] })
    expect(o('secure')).toMatchObject({ kind: 'atLeast', n: 2, of: ['drops', 'response'] })
    expect(o('flip')).toMatchObject({ kind: 'field', airfields: ['buri', 'bayug'], heldBy: 'player', after: 'secure' })
    expect(o('hold-fields')).toMatchObject({ kind: 'field', keep: true, heldBy: 'player', after: 'flip' })
    expect(o('hold-fields').until).toBeDefined()
    expect(o('home')).toMatchObject({ kind: 'atLeast', n: 1, of: ['land-buri', 'land-bayug'], after: 'hold-fields' })
    expect(o('san-pablo')).toMatchObject({ priority: 'secondary', kind: 'field', heldBy: 'player' })
    expect(o('both-serviceable')).toMatchObject({ priority: 'secondary', kind: 'field', keep: true })
  })
})

/**
 * The flown half. Measured 2026-10-17 (passive player held 120 km away, 700 s): the four Sallys release over Tacloban at about 340 s and fly on; the four
 * Bettys die to the fleet's AAA at about 380 s; the four Topsys drop their sticks over San Pablo at about 410 s; the four P-38s raze Buri's field (two of
 * its four named structures) by about 300 s and shoot down the whole Zero flight by 500 s. Nothing past `escort` completes without the player: the chain
 * waits on his station-keeping. The alternate-history field flip is mission state over a window that already draws the fields Japanese (the handoff says so).
 */
const terrain = terrainOrSkip()
const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 120, 90)
const fresh = (): World<undefined> => worldFromScenario(loadScenarioBundle(ID, windowsForChapter('J6')), terrain)
const SP = { x: -39930, z: -20590 }
const LIGHTNINGS = ['lightning-1', 'lightning-2', 'lightning-3', 'lightning-4']
const statuses = (w: World<undefined>) => Object.fromEntries(w.mission!.objectives.map((o, i) => [o.id, w.mission!.progress[i]!.status]))
const landedMen = (source: string, n: number): ParachutistEntity[] => Array.from({ length: n }, (_, i) => {
  const at = { x: SP.x + 40 * i, y: 100, z: SP.z }
  const state = { tick: 1, position: at, velocity: { x: 0, y: 0, z: 0 }, phase: 'down' as const, phaseStartedTick: 1, lowAltitude: false, contact: { tick: 1, position: at, surface: 'land' as const, verticalSpeedMps: -5 }, outcome: null }
  return { id: `staged:${source}:${i}`, sourceAircraft: source, side: 'axis' as const, recoverySeed: 0, recoveryEnvironment: { daylight: 1, visibility: 1, weather: 0, seaState: 0 }, recovery: null, state, previous: state, kind: 'trooper' as const, release: { airspeedMps: 85, groundSpeedMps: 85, altitudeM: 1500, headingDeg: 95 } }
})
const withDropped = (w: World<undefined>, ids: string[]): World<undefined> => ({ ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, ...Object.fromEntries(ids.map((id) => [id, { ...w.combat.aircraft[id]!, bombsDropped: 1 }])) } } })
/** The player alongside the lead Sally for `seconds`: the escort station. */
const escortFor = (w: World<undefined>, seconds: number): World<undefined> => {
  let world = w
  for (let i = 0; i < ticksFor(seconds); i++) {
    const lead = world.aircraft.find((a) => a.id.startsWith('sally-') && !isDestroyed(world as never, a.id))!.state.position
    world = hold(world, levelAt({ x: lead.x + 300, z: lead.z }, lead.y + 80, 89, 24), 1)
  }
  return world
}
const takeoff = (): World<undefined> => {
  let w = deckRun(fresh(), { flaps: false, climbToM: 300 })
  return hold(w, FAR, ticksFor(80) - w.tick)
}
/** Takes off, lets the response spawn and shoots it down, escorts the Sallys, stages their release and two landed Topsy sticks: the flip has happened. */
let memo: World<undefined> | null = null
const flipped = (): World<undefined> => memo ??= (() => {
  let w = destroyNow(takeoff(), LIGHTNINGS)
  w = escortFor(w, 62)
  w = withDropped(w, ['sally-1', 'sally-2'])
  w = hold(w, FAR, 2)
  w = { ...w, parachutists: [...(w.parachutists ?? []), ...landedMen('topsy-1', 6), ...landedMen('topsy-2', 6)] }
  return hold(w, FAR, 3)
})()

describe.skipIf(terrain === null)('J6, headless: the AI alone cannot win it', () => {
  it('a passive player: never more than 24 aircraft in the air, 10 ships or 10 moving vehicles, and nothing past the escort station completes', () => {
    let w = fresh()
    let peakAir = 0
    let peakMoving = 0
    while (w.tick < ticksFor(560)) {
      w = hold(w, FAR, 60)
      peakAir = Math.max(peakAir, w.aircraft.filter((a) => !isDestroyed(w as never, a.id) && airborne(a, w.terrain, decksOf(w.ships))).length)
      peakMoving = Math.max(peakMoving, w.vehicles.filter((v) => v.orders.speedMps > 0 && !isDestroyed(w as never, v.id)).length)
    }
    expect(peakAir).toBeLessThanOrEqual(24)
    expect(w.ships).toHaveLength(10)
    expect(peakMoving).toBeLessThanOrEqual(10)
    expect(statuses(w)).toMatchObject({ escort: 'active', release: 'inactive', drops: 'inactive', flip: 'inactive', 'hold-fields': 'inactive', home: 'inactive' })
    expect(w.aircraft.filter((a) => a.id.startsWith('sally-') && (w.combat.aircraft[a.id]?.bombsDropped ?? 0) > 0)).toHaveLength(4) // the bombers go on without him
    expect((w.parachutists ?? []).filter((p) => p.kind === 'trooper').length).toBeGreaterThanOrEqual(6) // a Ki-57 stick came down over San Pablo
  }, 600000)

  it('the Americans own Buri, Bayug and San Pablo until the lodgment is secured: a landing at Buri then is not a recovery', () => {
    const w = fresh()
    for (const f of ['buri', 'bayug', 'san-pablo']) expect(fieldState(w.mission!, w as never, f).side).toBe('axis') // the window draws them Japanese: the trigger has not run yet
    const w1 = hold(w, FAR, 2)
    for (const f of ['buri', 'bayug', 'san-pablo']) expect(fieldState(w1.mission!, w1 as never, f).side, f).toBe('allied')
  })
})

describe.skipIf(terrain === null)('J6, headless: success, failure and the edge paths', () => {
  it('success: escort, two Sally releases, two Topsy sticks landed, the response broken: Buri and Bayug flip, held through the timer, landing at Buri: the badge, and the script freezes', () => {
    let w = flipped()
    expect(statuses(w)).toMatchObject({ up: 'complete', escort: 'complete', release: 'complete', drops: 'complete', response: 'complete', secure: 'complete', flip: 'complete', 'hold-fields': 'active', home: 'inactive' })
    for (const f of ['buri', 'bayug', 'san-pablo']) expect(fieldState(w.mission!, w as never, f).side, f).toBe('axis')
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain('Army: the paratroops hold San Pablo, and Buri and Bayug are ours. Hold them until the relief arrives.')
    w = hold(w, FAR, ticksFor(725) - w.tick)
    expect(statuses(w)).toMatchObject({ 'hold-fields': 'complete', 'land-buri': 'active', home: 'active' })
    w = fieldApproach(w, 'buri')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'operation-te-go' }, reasons: [] })
    expect(w.mission!.latched).toBe(true)
  }, 600000)

  it('failure: landing at Buri before the reinforcement timer has run is no badge, and the recovery objectives are asleep', () => {
    let w = hold(flipped(), FAR, 5)
    expect(statuses(w)).toMatchObject({ 'hold-fields': 'active', home: 'inactive' })
    w = fieldApproach(w, 'buri')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', reasons: ['Land at Buri or Bayug: incomplete'] })
  }, 600000)

  it('failure: with Buri razed the fields cannot flip, and the chain stops at that gate', () => {
    let w = destroyNow(takeoff(), ['buri-hangar-n', 'buri-radio-station']) // two of its four named structures: unserviceable
    w = destroyNow(w, LIGHTNINGS)
    w = escortFor(w, 62)
    w = withDropped(w, ['sally-1', 'sally-2'])
    w = hold(w, FAR, 2)
    w = { ...w, parachutists: [...(w.parachutists ?? []), ...landedMen('topsy-1', 6), ...landedMen('topsy-2', 6)] }
    w = hold(w, FAR, 3)
    expect(statuses(w)).toMatchObject({ secure: 'complete', flip: 'active', 'hold-fields': 'inactive' })
    expect(fieldState(w.mission!, w as never, 'buri')).toMatchObject({ serviceable: false, side: 'axis' })
    w = hold(w, FAR, ticksFor(10))
    expect(statuses(w).flip).toBe('active')
  }, 600000)

  it('the chain needs the escort: a release and two landed sticks with the player away from the bombers wake nothing', () => {
    let w = destroyNow(takeoff(), LIGHTNINGS)
    w = withDropped(w, ['sally-1', 'sally-2'])
    w = { ...w, parachutists: [...(w.parachutists ?? []), ...landedMen('topsy-1', 6), ...landedMen('topsy-2', 6)] }
    w = hold(w, FAR, ticksFor(70))
    expect(statuses(w)).toMatchObject({ escort: 'active', release: 'inactive', drops: 'inactive', secure: 'active', flip: 'inactive' })
  }, 600000)
})
