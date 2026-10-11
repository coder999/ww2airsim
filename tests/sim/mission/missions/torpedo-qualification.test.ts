import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { createState } from '../../../../src/sim/flight/state.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { advance, type World } from '../../../../src/sim/loop.js'
import { v3 } from '../../../../src/sim/math/vec3.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'

const bundle = loadScenarioBundle('torpedo-qualification')
const scenario = bundle.scenario

function qualification(): World<undefined> {
  return worldFromScenario(bundle, null, 'bombs')
}

function stageRelease(w: World<undefined>): World<undefined> {
  const state = createState({
    position: v3(-25666, 150, -47605),
    velocity: v3(80, 0, 0),
    gearFraction: 0,
    bayDoorFraction: 1,
  })
  const aircraft = w.aircraft.map((a) => a.id === w.player
    ? { ...a, state, previous: state, parked: false, controls: { ...a.controls, dropBomb: true } }
    : a)
  const releaseAt = w.mission!.objectives.findIndex((o) => o.id === 'fish-away')
  const progress = w.mission!.progress.map((p, index) => ({
    ...p,
    status: index < releaseAt ? 'complete' as const : index === releaseAt ? 'active' as const : 'inactive' as const,
  }))
  return { ...w, aircraft, mission: { ...w.mission!, progress } }
}

describe('Torpedo Qualification content', () => {
  it('is a production Avenger lesson from takeoff through one torpedo release and recovery', () => {
    expect(scenario.player).toBe('avenger-1')
    expect(scenario.aircraft.find((a) => a.id === scenario.player)?.spec).toBe('tbm-3-avenger')
    expect(scenario.briefing?.loadout).toBe('bombs')
    expect(scenario.objectives?.map((o) => [o.id, o.kind, o.after ?? null])).toEqual([
      ['throttle', 'state', null],
      ['up', 'takeoff', 'throttle'],
      ['gear-up', 'state', 'up'],
      ['range-entry', 'reach', 'gear-up'],
      ['doors-open', 'state', 'range-entry'],
      ['fish-away', 'release', 'doors-open'],
      ['doors-shut', 'state', 'fish-away'],
      ['final', 'reach', 'doors-shut'],
      ['config', 'state', 'final'],
      ['land', 'land', 'config'],
    ])
  })

  it('builds Crow as the allied, stationary, non-damaging practice target', () => {
    const crow = qualification().ships.find((s) => s.id === 'crow-1')!
    expect(crow.spec.id).toBe('crow-amc-20')
    expect(crow.side).toBe('allied')
    expect(crow.orders.speedMps).toBe(0)
    expect(crow.practiceTarget).toBe(true)
  })

  it('completes the attack when the Mk 13 is released, before hit or miss is known', () => {
    const before = stageRelease(qualification())
    const after = advance(before, DT).world
    const releaseAt = after.mission!.objectives.findIndex((o) => o.id === 'fish-away')
    expect(after.combat.aircraft[after.player]!.torpedoesDropped).toBe(1)
    expect(after.combat.projectiles.some((p) => p.kind === 'torpedo')).toBe(true)
    expect(after.mission!.progress[releaseAt]!.status).toBe('complete')
    expect(after.mission!.objectives[releaseAt + 1]!.id).toBe('doors-shut')
    expect(after.mission!.progress[releaseAt + 1]!.status).toBe('active')
    expect(after.combat.ships['crow-1']!.hp).toBe(bundle.shipSpecs['crow-amc-20']!.hullHp)
  })
})
