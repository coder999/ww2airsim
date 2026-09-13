import { describe, it, expect } from 'vitest'
import { nextFrameState, initialFrameState } from '../../src/render/frame.js'
import { airspeed } from '../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const start = () =>
  initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))

describe('nextFrameState', () => {
  it('advances the simulation and produces an eye transform', () => {
    const f = nextFrameState(start(), 1 / 60, keys())
    expect(f.world.aircraft.tick).toBe(1)
    expect(Number.isFinite(f.eye.position.x)).toBe(true)
  })

  it('routes held keys into the control vector the sim consumes', () => {
    let f = start()
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('ArrowDown'))
    expect(f.controls.pitch).toBeGreaterThan(0.5)
  })

  it('cycles camera mode on a key edge, not on every frame it is held', () => {
    // Held for a second, a per-frame toggle would cycle 60 times and land
    // somewhere arbitrary.
    let f = start()
    const first = f.cameraMode
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).not.toBe(first)
    const afterHold = f.cameraMode
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).toBe(afterHold)
    f = nextFrameState(f, 1 / 60, keys())
    f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).not.toBe(afterHold)
  })

  it('survives a long stalled frame without spiralling or going non-finite', () => {
    let f = start()
    f = nextFrameState(f, 2.0, keys())
    expect(f.droppedSteps).toBeGreaterThan(0)
    expect(Number.isFinite(f.world.aircraft.position.y)).toBe(true)
    const after = nextFrameState(f, 1 / 60, keys())
    expect(after.stepsRun).toBe(1)
  })

  it('flies: throttle reaches the engine, so full power ends faster than idle', () => {
    // Starting at 120 m/s, position moves forward whatever the throttle does,
    // so distance alone proves nothing. Airspeed after five seconds does.
    let open = start()
    let idle = start()
    for (let i = 0; i < 300; i++) {
      open = nextFrameState(open, 1 / 60, keys('ShiftLeft'))
      idle = nextFrameState(idle, 1 / 60, keys())
    }
    expect(airspeed(open.world.aircraft)).toBeGreaterThan(airspeed(idle.world.aircraft) + 5)
  })
})
