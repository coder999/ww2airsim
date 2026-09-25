import { advance, createWorldOf, withControls, type AircraftEntity, type Stepper, type World } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { add, scale, sub, v3, type Vec3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { inBody } from '../../src/sim/weapons/geometry.js'

/**
 * Where PRODUCTION rounds actually go: a 1 s burst through `stepCombat`,
 * from a shooter flying level at 120 m/s along body +x, stepped at constant
 * velocity (`cruise`, no flight model) so nothing but the guns and the
 * ballistics decides the answer. Shared by the reticle and the chase pipper
 * tests, so both are pinned against the same measurement rather than against
 * `gunHarmonization`, the function they are both drawn from.
 */

export const SPEED_MPS = 120
export const LEVEL_EAST = qFromAxisAngle(v3(0, 1, 0), 0) // body +x = world +x
export const START = v3(0, 3000, 0)
export const FIRE: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7, fire: true }
export const HOLD: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }

export const cruise: Stepper = (_spec, state, _controls, ctx) =>
  ({ ...state, position: add(state.position, scale(state.velocity, ctx.dt)), tick: ctx.tick })

export const levelStateAt = (position: Vec3): AircraftState =>
  createState({ position, velocity: v3(SPEED_MPS, 0, 0), attitude: LEVEL_EAST })

export const entity = (spec: AircraftSpec, id: string, state: AircraftState): AircraftEntity<undefined> =>
  ({ id, spec, state, previous: state, controls: HOLD, assistMemory: undefined, impact: null, parked: false })

/** The mean, in the shooter's body frame, of where each round of a 1 s burst
 *  crosses body x = `rangeM`. */
export function meanProductionImpact(spec: AircraftSpec, rangeM: number): { mean: Vec3; rounds: number } {
  const shooter = levelStateAt(START)
  let world: World<undefined> = createWorldOf({ aircraft: [entity(spec, 'f6f-1', shooter)], player: 'f6f-1' })
  const last = new Map<number, Vec3>()
  const crossings: Vec3[] = []
  for (let i = 0; i < 90; i++) {
    world = advance(withControls(world, 'f6f-1', i < 60 ? FIRE : HOLD), DT, cruise).world
    const me = world.aircraft[0]!.state
    for (const p of world.combat.projectiles) {
      const body = inBody(me.attitude, sub(p.position, me.position))
      const before = last.get(p.id)
      if (before !== undefined && before.x < rangeM && body.x >= rangeM) {
        crossings.push(add(before, scale(sub(body, before), (rangeM - before.x) / (body.x - before.x))))
      }
      last.set(p.id, body)
    }
  }
  const sum = crossings.reduce((s, c) => add(s, c), v3(0, 0, 0))
  return { mean: scale(sum, 1 / Math.max(1, crossings.length)), rounds: crossings.length }
}
