import { describe, it, expect } from 'vitest'
import { assistFor, DEFAULT_ASSIST_SETTINGS } from '../../src/assists/index.js'
import { advance, createWorld, playerAircraft, type Stepper, type World } from '../../src/sim/loop.js'
import { createState, step, DT } from '../../src/sim/flight/model.js'
import type { AircraftState, Controls } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

/** Nose north (-z), the same parked attitude `tests/sim/wind.test.ts` uses. */
const north = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)

const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.6 }

/**
 * `advance` with a stepper that records what the assist stack commanded, and
 * the state the stack was handed. The commanded controls are not otherwise
 * observable: `AircraftEntity.controls` is the PILOT's input, and the
 * assisted vector lives only between `assist` and `stepper` inside
 * `stepAircraftEntity`. Passing a spy `Stepper` reads it at exactly that
 * seam, in production's own call order, rather than reimplementing the loop.
 */
function flyRecording(world: World<undefined>, steps: number): {
  commanded: Controls[]
  seenStates: AircraftState[]
  world: World<undefined>
} {
  const commanded: Controls[] = []
  const seenStates: AircraftState[] = []
  const spy: Stepper = (spec, state, controls, ctx) => {
    commanded.push(controls)
    return step(spec, state, controls, ctx)
  }
  const assist = assistFor(DEFAULT_ASSIST_SETTINGS)
  let w = world
  for (let i = 0; i < steps; i++) {
    w = advance(w, DT, spy, (state, spec, raw, dt, memory) => {
      seenStates.push(state)
      return assist(state, spec, raw, dt, memory)
    }).world
  }
  return { commanded, seenStates, world: w }
}

describe('the assists read the airflow, not the ground track (Plan 8 review, item 1)', () => {
  it('leaves the rudder alone for a coordinated airplane in a 15 m/s crosswind', () => {
    // Coordinated by construction: the air velocity is exactly along the nose
    // (60 m/s north), so the wing sees no sideslip at all. The GROUND velocity
    // is that plus the crosswind, which is what `autoRudder` used to read --
    // 14 degrees of apparent sideslip, and at `autoRudderGainPerDeg` 0.1 a
    // rudder command pegged at the clamp, every tick, for the whole flight.
    const wind = v3(15, 0, 0)
    const airRelative = v3(0, 0, -60)
    const state = createState({
      position: v3(0, 2000, 0),
      velocity: v3(airRelative.x + wind.x, 0, airRelative.z + wind.z),
      attitude: north,
    })
    const world: World<undefined> = { ...createWorld(f6f, state, NEUTRAL), wind }

    const { commanded } = flyRecording(world, 10)
    expect(commanded).toHaveLength(10)
    for (const c of commanded) {
      expect(Math.abs(c.yaw)).toBeLessThan(0.1)
    }
  })

  it('still corrects a real slip in the same crosswind', () => {
    // The same crosswind, but the airplane genuinely crabbed 15 degrees off
    // its airflow: the assist must still see that and push the rudder. This
    // is what stops the fix above from being "the assist is now inert".
    const wind = v3(15, 0, 0)
    const slipped = v3(Math.sin(0.26) * 60, 0, -Math.cos(0.26) * 60)
    const state = createState({
      position: v3(0, 2000, 0),
      velocity: v3(slipped.x + wind.x, 0, slipped.z + wind.z),
      attitude: north,
    })
    const world: World<undefined> = { ...createWorld(f6f, state, NEUTRAL), wind }
    const { commanded } = flyRecording(world, 1)
    expect(Math.abs(commanded[0]!.yaw)).toBeGreaterThan(0.5)
  })

  it('hands the assist the entity state ITSELF when the air is calm', () => {
    // Reference identity, not equality: the calm path must allocate nothing
    // and change no bit, which is the property the golden trajectory's
    // exact-equality case depends on.
    const state = createState({ position: v3(0, 2000, 0), velocity: v3(0, 0, -60), attitude: north })
    const world = createWorld(f6f, state, NEUTRAL)
    expect(world.wind).toBeNull()
    const before = playerAircraft(world).state
    const { seenStates } = flyRecording(world, 1)
    expect(seenStates[0]).toBe(before)
  })
})
