import { describe, expect, it } from 'vitest'
import { loadScenario, loadScenarioBundle } from '../../../../tools/content/load.js'
import { parseScenario, type Scenario } from '../../../../src/sim/scenario.js'
import { windowsForChapter } from '../../../../src/campaign/worldStates.js'

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
