import { describe, expect, it } from 'vitest'
import { loadScenario, loadScenarioBundle } from '../../../../tools/content/load.js'
import { parseScenario, worldFromScenario, type Scenario } from '../../../../src/sim/scenario.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'
import type { World } from '../../../../src/sim/loop.js'
import { airborne } from '../../../../src/sim/ai/airborne.js'
import { decksOf } from '../../../../src/sim/world/deck.js'
import { isDestroyed } from '../../../../src/sim/mission/step.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { deckRun, destroyNow, fieldApproach, hold, levelAt, terrainOrSkip } from '../fly.js'

/**
 * A6 Battle for the Airfields (F10E, plan 2026-10-17-f10e-finales-a6-j6; content: F3 section 4). P-38L, dawn, 6-7 December, the finale.
 * The contract half: the locked populations (F3 section 2: 24 airborne including the player, 10 ships, at most 16 close), the objective graph,
 * the chapter's window. The flown half is below it.
 */
const ID = 'a6-battle-for-the-airfields'
const bundle = () => loadScenarioBundle(ID, windowsForChapter('A6'))
const specOf = (s: Scenario) => (e: { spec: string }) => e.spec

describe('A6 content: the locked finale populations (F3 sections 2 and 4)', () => {
  const scenario = loadScenario(ID)
  const held = scenario.heldGroups ?? []
  const everyAircraft = [...scenario.aircraft, ...held.flatMap((g) => g.aircraft ?? [])]

  it('is the finale population: 6 allied and 18 Japanese airborne (4 Ki-57, 4 Ki-43, 4 A6M2, 3 Ki-21, 3 G4M), 24 in all', () => {
    const bySpec = (side: 'allied' | 'axis') => everyAircraft.filter((a) => (a.side ?? (a.id === scenario.player ? 'allied' : 'axis')) === side)
      .reduce<Record<string, number>>((m, a) => ({ ...m, [a.spec]: (m[a.spec] ?? 0) + 1 }), {})
    expect(bySpec('allied')).toEqual({ 'p-38-lightning': 6 })
    expect(bySpec('axis')).toEqual({ 'ki-57-ii-topsy': 4, 'ki-43-oscar': 4, 'a6m2-zero': 4, 'ki-21-sally': 3, 'g4m-betty': 3 })
    expect(everyAircraft).toHaveLength(24)
    expect(scenario.population).toEqual({ airborne: 24, ships: 10, close: 16 })
  })

  it('has ten allied ships (one Essex, one Pennsylvania, one Cleveland, two Fletchers, five Type B Marus)', () => {
    const ships = [...scenario.ships, ...held.flatMap((g) => g.ships ?? [])]
    expect(ships.map(specOf(scenario)).sort()).toEqual(['cleveland-cl', 'essex-cv', 'fletcher-dd', 'fletcher-dd', 'pennsylvania-bb', 'type-b-maru', 'type-b-maru', 'type-b-maru', 'type-b-maru', 'type-b-maru'])
    expect(ships.every((s) => s.side === 'allied')).toBe(true)
  })

  it('has the locked ground sets (allied 4 M4 and 6 CCKW; Japanese 4 Type 97 and 6 Type 94) and at most ten powered vehicles moving', () => {
    const vehicles = [...scenario.vehicles, ...held.flatMap((g) => g.vehicles ?? [])]
    const count = (side: 'allied' | 'axis') => vehicles.filter((v) => (v.side ?? 'axis') === side).reduce<Record<string, number>>((m, v) => ({ ...m, [v.spec]: (m[v.spec] ?? 0) + 1 }), {})
    expect(count('allied')).toEqual({ 'm4-sherman': 4, 'gmc-cckw-353': 6 })
    expect(count('axis')).toEqual({ 'type97-chi-ha': 4, 'type94-cargo-truck': 6 })
    expect(vehicles.filter((v) => v.speedMps > 0).length).toBeLessThanOrEqual(10)
  })

  it('has a close set of 14: the player, five P-38s, four Ki-43s and four A6M2s; the ten bombers and transports are not in it', () => {
    const close = everyAircraft.filter((a) => (a.tags ?? []).includes('close'))
    expect(close).toHaveLength(14)
    expect(close.map((a) => a.spec).sort()).toEqual([...Array(6).fill('p-38-lightning'), ...Array(4).fill('ki-43-oscar'), ...Array(4).fill('a6m2-zero')].sort())
    const attackers = everyAircraft.filter((a) => (a.tags ?? []).includes('attackers'))
    expect(attackers.map((a) => a.spec).sort()).toEqual([...Array(4).fill('ki-57-ii-topsy'), ...Array(3).fill('ki-21-sally'), ...Array(3).fill('g4m-betty')].sort())
    expect(attackers.some((a) => (a.tags ?? []).includes('close'))).toBe(false)
  })

  it('holds the ten attackers in route groups until they are needed, and the validator refuses one aircraft over the cap', () => {
    const attackerGroups = held.filter((g) => (g.aircraft ?? []).some((a) => (a.tags ?? []).includes('attackers')))
    expect(attackerGroups.length).toBeGreaterThanOrEqual(2)
    const over = structuredClone(scenario) as unknown as { heldGroups: { aircraft: Record<string, unknown>[] }[] }
    const group = over.heldGroups.find((g) => g.aircraft.some((a) => (a.tags as string[] | undefined)?.includes('attackers')))!
    group.aircraft.push({ ...group.aircraft[0]!, id: 'one-too-many' })
    expect(() => parseScenario(over)).toThrow(/25 aircraft can be airborne at once, over the declared 24/)
    const wide = structuredClone(scenario) as unknown as { population: { close: number } }
    wide.population.close = 13
    expect(() => parseScenario(wide)).toThrow(/14 aircraft can be in the close set at once, over the declared 13/)
  })
})

describe('A6 content: the chapter and its graph', () => {
  const scenario = loadScenario(ID)
  it('plays in the endgame window on every site, as a P-38L Captain finale at dawn', () => {
    expect(new Set(Object.values(windowsForChapter('A6')))).toEqual(new Set(['endgame']))
    expect(scenario.weather.timeOfDay).toBeGreaterThanOrEqual(5.5)
    expect(scenario.weather.timeOfDay).toBeLessThan(7)
    expect(scenario.freezeOnSuccess).toBe(true)
    expect(scenario.badge).toEqual({ id: 'battle-for-the-airfields', name: 'Battle for the Airfields' })
  })
  it('follows the F3 graph: takeoff, prevent release (5 of 10), keep two of three fields through the relief timer, destroy six lodgment vehicles, land at Tacloban, Bayug or Buri', () => {
    const o = (id: string) => scenario.objectives!.find((x) => x.id === id)!
    expect(o('up')).toMatchObject({ kind: 'takeoff', from: 'tacloban', priority: 'primary' })
    expect(o('stop')).toMatchObject({ kind: 'preventRelease', targets: ['attackers'], count: 5, priority: 'primary', after: 'up' })
    expect(o('fields')).toMatchObject({ kind: 'field', airfields: ['buri', 'bayug', 'san-pablo'], min: 2, keep: true, serviceable: true, priority: 'primary' })
    expect(o('fields').until).toBeDefined()
    expect(o('lodgment')).toMatchObject({ kind: 'destroy', targets: ['lodgment'], count: 6, priority: 'primary', after: 'fields' })
    expect(o('home')).toMatchObject({ kind: 'atLeast', n: 1, priority: 'primary' })
    expect((o('home') as { of: string[] }).of).toHaveLength(3)
    for (const id of ['tacloban', 'bayug', 'buri']) expect(o(`land-${id}`)).toMatchObject({ kind: 'land', at: id, priority: 'secondary', requires: { serviceable: [id] } })
    expect(o('all-fields')).toMatchObject({ kind: 'field', priority: 'secondary', airfields: ['buri', 'bayug', 'san-pablo'], keep: true })
  })
})

/**
 * The flown half. The player is held 120 km away (`FAR`) wherever a test needs the AI to play alone, as scramble.test.ts does.
 * Measured 2026-10-17 (passive player, 700 s): the three G4Ms die to the fleet's AAA at about 380 s (so three of the ten are stopped by the ships, not
 * the player: five are needed); the Ki-21s release at Buri about 400 s and put no bomb within a field structure's blast radius; the sweep and the
 * A6M2 flight are shot down by the five P-38s and Tacloban's AAA. See the handoff.
 */
const terrain = terrainOrSkip()
const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 120, 90)
const fresh = (): World<undefined> => worldFromScenario(loadScenarioBundle(ID, windowsForChapter('A6')), terrain, 'both')
const IDS = {
  attackers: ['ki57-1', 'ki57-2', 'ki57-3', 'ki57-4', 'ki21-1', 'ki21-2', 'ki21-3', 'g4m-1', 'g4m-2', 'g4m-3'],
  lodgment: ['chiha-1', 'chiha-2', 'chiha-3', 'chiha-4', 'truck-1', 'truck-2', 'truck-3', 'truck-4', 'truck-5', 'truck-6'],
}
const STOP5 = ['g4m-1', 'g4m-2', 'g4m-3', 'ki57-1', 'ki57-2']
const RELIEF_S = 540

/** Takes off for real, lets the groups spawn, stops five attackers, holds the player out of it until the relief timer has run. Built once; worlds are immutable. */
let memo: World<undefined> | null = null
const afterRelief = (): World<undefined> => memo ??= (() => {
  let w = deckRun(fresh(), { flaps: false, climbToM: 300 })
  w = hold(w, FAR, ticksFor(50) - w.tick)
  w = destroyNow(w, STOP5)
  return hold(w, FAR, ticksFor(RELIEF_S + 5) - w.tick)
})()
const statuses = (w: World<undefined>) => Object.fromEntries(w.mission!.objectives.map((o, i) => [o.id, w.mission!.progress[i]!.status]))

describe.skipIf(terrain === null)('A6, headless: the AI alone cannot win it', () => {
  it('a passive player: the finale never exceeds 24 aircraft in the air, 10 ships or 10 moving vehicles, and no primary but the field order completes', () => {
    let w = fresh()
    let peakAir = 0
    let peakMoving = 0
    while (w.tick < ticksFor(RELIEF_S + 20)) {
      w = hold(w, FAR, 60)
      peakAir = Math.max(peakAir, w.aircraft.filter((a) => !isDestroyed(w as never, a.id) && airborne(a, w.terrain, decksOf(w.ships))).length - 1) // the held player is airborne too: counted below
      peakMoving = Math.max(peakMoving, w.vehicles.filter((v) => v.orders.speedMps > 0 && !isDestroyed(w as never, v.id)).length)
    }
    expect(peakAir + 1).toBeLessThanOrEqual(24)
    expect(w.ships).toHaveLength(10)
    expect(peakMoving).toBeLessThanOrEqual(10)
    const s = statuses(w)
    expect(progressOf(w, 'stop').count).toBeLessThan(5) // the fleet kills the Bettys; that is 3 of the 5 and no more
    expect(s).toMatchObject({ stop: 'active', fields: 'complete', lodgment: 'active', home: 'inactive' })
  }, 600000)

  it('the first contact is inside the F3 limit: a sweep fighter is within 12 km of the player\'s start two minutes in', () => {
    let w = fresh()
    const start = w.aircraft.find((a) => a.id === 'p38-1')!.state.position
    w = hold(w, FAR, ticksFor(115))
    const near = Math.min(...w.aircraft.filter((a) => a.id.startsWith('ki43-')).map((a) => Math.hypot(a.state.position.x - start.x, a.state.position.z - start.z)))
    expect(near).toBeLessThan(12000)
  })
})

describe.skipIf(terrain === null)('A6, headless: success, failure and the edge paths', () => {
  it('success: take off, five attackers stopped, the relief timer held, six lodgment vehicles destroyed, land at Tacloban: the badge, and the script freezes', () => {
    let w = afterRelief()
    expect(statuses(w)).toMatchObject({ up: 'complete', stop: 'complete', fields: 'complete', lodgment: 'active' })
    expect(w.vehicles.filter((v) => v.id.startsWith('m4-') || v.id.startsWith('cckw-')).length).toBe(10) // the relief column spawned when the field order completed
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain('Army: the relief column is moving out of Dulag. Hit the lodgment before it reaches the fields.')
    w = hold(destroyNow(w, IDS.lodgment.slice(0, 6)), FAR, 2)
    expect(statuses(w)).toMatchObject({ lodgment: 'complete', home: 'active' })
    w = fieldApproach(w, 'tacloban')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'battle-for-the-airfields' }, reasons: [] })
    expect(w.mission!.latched).toBe(true)
    expect(out.objectives.find((o) => o.id === 'all-fields')).toMatchObject({ priority: 'secondary', final: 'complete' })
  }, 600000)

  it('failure: five of six lodgment vehicles is no badge, the recovery stays asleep, and four stopped attackers are not five', () => {
    let w = afterRelief()
    w = hold(destroyNow(w, IDS.lodgment.slice(0, 5)), FAR, 2)
    expect(statuses(w)).toMatchObject({ lodgment: 'active', home: 'inactive' })
    w = fieldApproach(w, 'tacloban')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({
      result: 'no-badge', badge: null, reasons: ['Destroy the lodgment: incomplete', 'Land at Tacloban, Bayug or Buri: incomplete'],
    })
    let early = deckRun(fresh(), { flaps: false, climbToM: 300 })
    early = hold(early, FAR, ticksFor(50) - early.tick)
    expect(progressOf(hold(destroyNow(early, STOP5.slice(0, 4)), FAR, 2), 'stop')).toMatchObject({ status: 'active', count: 4 })
    expect(progressOf(hold(destroyNow(early, STOP5), FAR, 2), 'stop')).toMatchObject({ status: 'complete', count: 5 })
  }, 600000)

  it('six releases fail the raid objective at that tick, and a bomber that released then died is not a stop', () => {
    let w = afterRelief()
    expect(progressOf(w, 'stop').status).toBe('complete') // five already stopped: nothing can undo it
    let early = deckRun(fresh(), { flaps: false, climbToM: 300 })
    early = hold(early, FAR, ticksFor(50) - early.tick)
    const dropped = (x: World<undefined>, ids: string[]): World<undefined> => ({ ...x, combat: { ...x.combat, aircraft: { ...x.combat.aircraft, ...Object.fromEntries(ids.map((id) => [id, { ...x.combat.aircraft[id]!, bombsDropped: 1 }])) } } })
    early = hold(dropped(early, IDS.attackers.slice(0, 5)), FAR, 2)
    expect(progressOf(early, 'stop').status).toBe('active') // five of ten released, five could still be stopped
    early = hold(destroyNow(early, [IDS.attackers[0]!]), FAR, 2)
    expect(progressOf(early, 'stop')).toMatchObject({ status: 'active', count: 0 }) // died after releasing: not a stop
    early = hold(dropped(early, [IDS.attackers[5]!]), FAR, 2)
    expect(progressOf(early, 'stop').status).toBe('failed')
    expect(radioMessages(early.mission!).map((e) => e.text)).toContain('Break the raid before it releases: failed')
  }, 600000)

  it('the field order: one field lost is survivable; the second lost fails it at that tick, and the lodgment phase never wakes', () => {
    let w = deckRun(fresh(), { flaps: false, climbToM: 300 })
    w = hold(w, FAR, ticksFor(50) - w.tick)
    const buri = ['buri-hangar-n', 'buri-radio-station'] // two of Buri's four named structures: below 0.6 alive
    const bayug = ['bayug-hangar-1', 'bayug-fuel-farm'] // two of Bayug's three
    w = hold(destroyNow(w, buri.slice(0, 1)), FAR, 2)
    expect(progressOf(w, 'fields').status).toBe('active')
    w = hold(destroyNow(w, buri.slice(1)), FAR, 2) // Buri is gone, Bayug and San Pablo stand: still two of three
    expect(progressOf(w, 'fields')).toMatchObject({ status: 'active', count: 2 })
    const before = w.tick
    w = hold(destroyNow(w, bayug), FAR, 1)
    expect(progressOf(w, 'fields')).toMatchObject({ status: 'failed', count: 1 })
    expect(w.mission!.log.find((e) => e.kind === 'objective' && e.id === 'fields' && e.status === 'failed')!.tick).toBe(before + 1)
    w = hold(w, FAR, ticksFor(RELIEF_S + 5) - w.tick)
    expect(statuses(w)).toMatchObject({ fields: 'failed', lodgment: 'inactive', home: 'inactive' })
    expect(w.vehicles.some((v) => v.id.startsWith('m4-'))).toBe(false) // no relief column: its trigger is the field order's completion
  }, 600000)

  it('a field lost after the relief timer is not a failure: the window had closed', () => {
    let w = afterRelief()
    w = hold(destroyNow(w, ['buri-hangar-n', 'buri-radio-station', 'bayug-hangar-1', 'bayug-fuel-farm']), FAR, 3)
    expect(progressOf(w, 'fields').status).toBe('complete')
    expect(missionOutcome(w.mission!, { kind: 'killed' }).objectives.find((o) => o.id === 'all-fields')!.final).toBe('failed') // the secondary reads the state at debrief
  }, 600000)

  it('only Tacloban, Bayug or Buri count: a landing at Dulag is a friendly base but not the finale\'s recovery; Bayug is accepted', () => {
    let dulag = afterRelief()
    dulag = hold(destroyNow(dulag, IDS.lodgment.slice(0, 6)), FAR, 2)
    dulag = fieldApproach(dulag, 'dulag')
    expect(missionOutcome(dulag.mission!, recoveryOf(dulag)!)).toMatchObject({ result: 'no-badge', reasons: ['Land at Tacloban, Bayug or Buri: incomplete'] })
    let bayug = afterRelief()
    bayug = hold(destroyNow(bayug, IDS.lodgment.slice(0, 6)), FAR, 2)
    bayug = fieldApproach(bayug, 'bayug')
    expect(missionOutcome(bayug.mission!, recoveryOf(bayug)!)).toMatchObject({ result: 'success', reasons: [] })
  }, 600000)

  it('a landing before the lodgment is destroyed counts for nothing (the recovery objectives are asleep)', () => {
    let w = afterRelief()
    w = fieldApproach(w, 'tacloban')
    expect(statuses(w)).toMatchObject({ lodgment: 'active', home: 'inactive', 'land-tacloban': 'inactive' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!).result).toBe('no-badge')
    expect(w.mission!.latched).toBeUndefined()
  }, 600000)
})
