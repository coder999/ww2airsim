import { describe, it, expect } from 'vitest'
import type { Airframe } from '../../../src/render/scene/airframe.js'
import type { ShipView } from '../../../src/render/scene/ship.js'
import type { ScenarioEntities } from '../../../src/render/scenarioEntities.js'
import { entityViews } from '../../../src/render/mission/entityViews.js'
import type { World } from '../../../src/sim/loop.js'

/** Plain stand-ins shaped like the one field `entityViews` touches. */
const mesh = <V>(): V => ({ root: { visible: true } }) as unknown as V
const airframe = (): Airframe => mesh<Airframe>()
const ship = (): ShipView => mesh<ShipView>()

type EntityWorld = Pick<World<unknown>, 'aircraft' | 'ships'>
const worldOf = (aircraft: readonly string[], ships: readonly string[]): EntityWorld =>
  ({ aircraft: aircraft.map((id) => ({ id })), ships: ships.map((id) => ({ id })) }) as unknown as EntityWorld

function entities(
  heldAircraft: Readonly<Record<string, Airframe>> = {},
  heldShips: Readonly<Record<string, ShipView>> = {},
): ScenarioEntities {
  const airframes = [airframe(), airframe()]
  return {
    airframes,
    shipHandles: [ship()],
    player: airframes[0]!,
    held: { airframes: new Map(Object.entries(heldAircraft)), ships: new Map(Object.entries(heldShips)) },
  }
}

describe('entityViews (M2 R1)', () => {
  it('is the start arrays, unchanged, when nothing has spawned', () => {
    const heldA = airframe()
    heldA.root.visible = false
    const e = entities({ 'a-1': heldA })
    const v = entityViews(e, worldOf(['p', 'w'], ['s']))
    expect(v.airframes).toEqual(e.airframes)
    expect(v.airframes[0]).toBe(e.airframes[0])
    expect(v.airframes[1]).toBe(e.airframes[1])
    expect(v.shipHandles).toHaveLength(1)
    expect(v.shipHandles[0]).toBe(e.shipHandles[0])
    expect(v.player).toBe(e.player)
    expect(heldA.root.visible).toBe(false)
  })

  it('appends a spawned held mesh at the spawned entity index and shows it', () => {
    const heldA = airframe()
    const heldS = ship()
    heldA.root.visible = false
    heldS.root.visible = false
    const e = entities({ 'a-1': heldA }, { 'hs-1': heldS })
    const v = entityViews(e, worldOf(['p', 'w', 'a-1'], ['s', 'hs-1']))
    expect(v.airframes[2]).toBe(heldA)
    expect(v.shipHandles[1]).toBe(heldS)
    expect(heldA.root.visible).toBe(true)
    expect(heldS.root.visible).toBe(true)
  })

  it('spawn order differs from heldGroups order: meshes follow ids', () => {
    // held 'a-1' (group A, listed first) and 'b-1' (group B); group B's trigger fired first.
    const heldA = airframe()
    const heldB = airframe()
    const e = entities({ 'a-1': heldA, 'b-1': heldB })
    const v = entityViews(e, worldOf(['p', 'w', 'b-1', 'a-1'], ['s']))
    expect(v.airframes[e.airframes.length]).toBe(heldB)
    expect(v.airframes[e.airframes.length + 1]).toBe(heldA)
  })

  it('restart hides spawned meshes again', () => {
    const heldB = airframe()
    const heldS = ship()
    const e = entities({ 'b-1': heldB }, { 'hs-1': heldS })
    entityViews(e, worldOf(['p', 'w', 'b-1'], ['s', 'hs-1']))
    expect(heldB.root.visible).toBe(true)
    expect(heldS.root.visible).toBe(true)
    const v = entityViews(e, worldOf(['p', 'w'], ['s']))
    expect(v.airframes).toHaveLength(2)
    expect(v.shipHandles).toHaveLength(1)
    expect(heldB.root.visible).toBe(false)
    expect(heldS.root.visible).toBe(false)
  })

  it('returns the same arrays for the same entity counts (cache)', () => {
    const e = entities({ 'a-1': airframe() })
    const first = entityViews(e, worldOf(['p', 'w', 'a-1'], ['s']))
    const second = entityViews(e, worldOf(['p', 'w', 'a-1'], ['s']))
    expect(second).toBe(first)
    expect(second.airframes).toBe(first.airframes)
    expect(second.shipHandles).toBe(first.shipHandles)
  })

  it('a ship-only spawn rebuilds even though the aircraft are unchanged (PF11)', () => {
    const heldS = ship()
    heldS.root.visible = false
    const e = entities({}, { 'hs-1': heldS })
    const before = entityViews(e, worldOf(['p', 'w'], ['s']))
    const after = entityViews(e, worldOf(['p', 'w'], ['s', 'hs-1']))
    expect(after).not.toBe(before)
    expect(after.shipHandles[1]).toBe(heldS)
    expect(heldS.root.visible).toBe(true)
  })

  it('the key includes spawned ship ids: a different ship at the same counts rebuilds (PF11)', () => {
    const s1 = ship()
    const s2 = ship()
    const e = entities({}, { 'hs-1': s1, 'hs-2': s2 })
    const first = entityViews(e, worldOf(['p', 'w'], ['s', 'hs-1']))
    const second = entityViews(e, worldOf(['p', 'w'], ['s', 'hs-2']))
    expect(first.shipHandles[1]).toBe(s1)
    expect(second.shipHandles[1]).toBe(s2)
    expect(s1.root.visible).toBe(false)
    expect(s2.root.visible).toBe(true)
  })

  it('throws naming the id when an entity has no mesh', () => {
    const e = entities()
    expect(() => entityViews(e, worldOf(['p', 'w', 'ghost-1'], ['s']))).toThrow('"ghost-1"')
    expect(() => entityViews(e, worldOf(['p', 'w'], ['s', 'ghost-ship']))).toThrow('"ghost-ship"')
  })
})
