import { describe, expect, it } from 'vitest'
import { advance, aircraftById, playerAircraft, withAircraftState, withControls } from '../../../src/sim/loop.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { groundTruthTerrain } from '../../pilot/rangePass.js'

/**
 * The point of the Range Test: a sitting duck can be shot, damaged and downed.
 * The player is placed 220 m astern of the first Japanese airplane, going the
 * same way at the same speed, nose on it, and holds the trigger.
 */
const terrain = groundTruthTerrain()
const world0 = worldFromScenario(loadScenarioBundle('range-test'), terrain)
const DUCK = 'duck-a6m2-zero'

function astern(w: typeof world0): typeof world0 {
  const duck = aircraftById(w, DUCK)!
  const v = duck.state.velocity
  const speed = Math.hypot(v.x, v.z)
  const heading = Math.atan2(v.z, v.x)
  const me = playerAircraft(w)
  const placed = withAircraftState(w, w.player, {
    ...me.state,
    position: v3(duck.state.position.x - Math.cos(heading) * 220, duck.state.position.y + 4, duck.state.position.z - Math.sin(heading) * 220),
    velocity: v3(v.x * 1.05, 0, v.z * 1.05),
    attitude: qFromAxisAngle(v3(0, 1, 0), -heading),
    bodyRates: v3(0, 0, 0),
    fuelKg: me.spec.mass.fuelCapacityKg,
  })
  void speed
  return withControls(placed, w.player, { ...me.controls, fire: true, throttle: 0.8 })
}

describe('the Range Test sitting ducks can be shot', () => {
  it('a burst from astern hits the duck and damages it, and the duck never fights back', () => {
    let w = astern(world0)
    const startHits = w.combat.aircraft[w.player]!.hits
    for (let i = 0; i < 8 * 60; i++) w = advance(w, 1 / 60).world
    const duck = w.combat.aircraft[DUCK]!
    expect(w.combat.aircraft[w.player]!.hits - startHits, 'rounds that landed').toBeGreaterThan(0)
    expect(duck.damage.structure, 'the duck is damaged').toBeLessThan(1)
    expect(duck.shots, 'a sitting duck fires nothing').toBe(0)
  })
})
