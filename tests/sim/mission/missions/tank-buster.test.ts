import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../../../tools/content/load.js'
import { advance } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { storesFromLoadout } from '../../../../src/sim/weapons/stores.js'
import { progressOf } from '../fixture.js'
import { destroyNow, fieldApproach, terrainOrSkip } from '../fly.js'

const TANKS = ['tank-1', 'tank-2', 'tank-3', 'tank-4', 'tank-5', 'tank-6']

describe('Tank Buster content', () => {
  it('makes strafing deliberate, one rocket insufficient, and a direct bomb decisive', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    const stores = storesFromLoadout(f6f, 'both')
    const types = f6f.stores!.types
    const bomb = types[f6f.stores!.racks[0]!.store]!
    const rocket = types[f6f.stores!.rails[0]!.store]!
    expect(stores.bombs).toBe(2)
    expect(stores.rockets).toBe(6)
    expect(f6f.combat!.roundDamage).toBe(4)
    expect(48 / f6f.combat!.roundDamage).toBe(12)
    expect(rocket.damage).toBeLessThan(48)
    expect(bomb.damage).toBeGreaterThanOrEqual(48)
  })
})

const terrain = terrainOrSkip()

describe.skipIf(terrain === null)('Tank Buster, headless', () => {
  it('success: four tanks destroyed and recovery at Tacloban earn the badge; two tanks remain as the secondary', () => {
    let world = worldFromScenario(loadScenarioBundle('tank-buster'), terrain, 'both')
    world = advance(destroyNow(world, TANKS.slice(0, 4)), DT).world
    expect(progressOf(world, 'armor')).toMatchObject({ status: 'complete', count: 4 })
    expect(progressOf(world, 'column')).toMatchObject({ status: 'active', count: 4 })
    world = fieldApproach(world, 'tacloban')
    const outcome = missionOutcome(world.mission!, recoveryOf(world)!)
    expect(outcome).toMatchObject({ result: 'success', badge: { id: 'tank-buster' }, reasons: [] })
    expect(outcome.objectives.find((o) => o.id === 'column')).toMatchObject({ priority: 'secondary', final: 'incomplete' })
  })

  it('failure: three tanks and a safe recovery do not earn the badge', () => {
    let world = worldFromScenario(loadScenarioBundle('tank-buster'), terrain, 'both')
    world = advance(destroyNow(world, TANKS.slice(0, 3)), DT).world
    world = fieldApproach(world, 'tacloban')
    expect(missionOutcome(world.mission!, recoveryOf(world)!)).toMatchObject({
      result: 'no-badge', badge: null, reasons: ['Break the tank column: incomplete', 'Recover at Tacloban: incomplete'],
    })
  })
})
