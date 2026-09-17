import { describe, it, expect } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import {
  nextFrameState,
  initialFrameState,
  toThreeOrientation,
  worldOffsetFor,
  airframeVisibilityFor,
} from '../../src/render/frame.js'
import { airspeed } from '../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qMul, qNormalize, qRotate } from '../../src/sim/math/quat.js'

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

  it('exposes the interpolated pose strictly between the two most recent ticks', () => {
    // Task 13 review, round 1: `frame.ts` computed this pose and handed it to
    // `cameraTransformFor` but never exposed it, so main.ts had nothing to
    // pose the airframe mesh with and the airplane was never drawn. This
    // pins the fix: `render` must be the genuine interpolated midpoint, not
    // a pass-through of either endpoint.
    let f = start()
    f = nextFrameState(f, 1 / 60, keys()) // exactly one full step: alpha lands at 0
    f = nextFrameState(f, 1 / 60 / 2, keys()) // half a step banked: alpha = 0.5

    const { previous, aircraft } = f.world
    expect(previous.position.x).not.toBeCloseTo(aircraft.position.x, 3)
    const lo = Math.min(previous.position.x, aircraft.position.x)
    const hi = Math.max(previous.position.x, aircraft.position.x)
    expect(f.render.position.x).toBeGreaterThan(lo)
    expect(f.render.position.x).toBeLessThan(hi)
  })
})

describe('toThreeOrientation', () => {
  it('rotates a Three camera to look along the sim forward direction, not 90 degrees off it', () => {
    // Task 13 review, round 1, measured: copying the sim attitude straight
    // into `camera.quaternion` put the camera's forward at 90 degrees from
    // the flight direction, because sim body frame is +X-forward while a
    // Three camera looks down its own local -Z. This checks the fix against
    // Three's own quaternion/vector math, not just this project's qRotate,
    // since the review's finding was that the two agree bit-for-bit and the
    // bug was a missing basis rotation.
    const attitude = qNormalize(
      qMul(qFromAxisAngle(v3(0, 1, 0), 0.4), qFromAxisAngle(v3(0, 0, 1), 0.2)),
    )
    const threeQ = toThreeOrientation(attitude)
    const q = new Quaternion(threeQ.x, threeQ.y, threeQ.z, threeQ.w)
    const threeForward = new Vector3(0, 0, -1).applyQuaternion(q)

    const simForward = qRotate(attitude, v3(1, 0, 0))
    const dot =
      threeForward.x * simForward.x + threeForward.y * simForward.y + threeForward.z * simForward.z
    // dot of two unit vectors within 1 degree of each other exceeds cos(1deg).
    expect(dot).toBeGreaterThan(Math.cos(Math.PI / 180))
  })

  it('leaves an identity attitude looking along the sim forward axis, not out the left wing', () => {
    // A cheaper, exact version of the case above: identity attitude means
    // world-forward is exactly (1,0,0). The bug this guards against left the
    // camera looking along (0,0,-1) instead -- 90 degrees away, dot 0 exactly.
    const threeQ = toThreeOrientation(qNormalize({ x: 0, y: 0, z: 0, w: 1 }))
    const q = new Quaternion(threeQ.x, threeQ.y, threeQ.z, threeQ.w)
    const threeForward = new Vector3(0, 0, -1).applyQuaternion(q)
    expect(threeForward.x).toBeCloseTo(1, 9)
    expect(threeForward.y).toBeCloseTo(0, 9)
    expect(threeForward.z).toBeCloseTo(0, 9)
  })
})

describe('worldOffsetFor', () => {
  it('is the negation of the eye position, not the identity or the eye position itself', () => {
    // Pins the camera-relative convention itself (master spec §4): the world
    // translates by -eye and the camera stays at the origin, rather than the
    // equivalent-looking alternative of moving the camera to the eye. The two
    // render identically today (one aircraft, flat water) and are exactly
    // what this project's own review flagged as diverging once a second
    // reference frame -- terrain, a carrier deck -- exists.
    const offset = worldOffsetFor(v3(120, -40, 7))
    expect(offset).toEqual(v3(-120, 40, -7))
  })
})

describe('airframeVisibilityFor', () => {
  it('hides the airframe in cockpit mode and shows it in chase, in both directions', () => {
    // Both directions, or one of them regresses silently: the external
    // fuselage box would otherwise occlude the panel from inside cockpit
    // mode (see this function's doc comment for the measurement), and a
    // test only checking one mode would miss chase mode losing the
    // airframe just as easily.
    expect(airframeVisibilityFor('cockpit')).toEqual({ cockpitVisible: true, hellcatVisible: false })
    expect(airframeVisibilityFor('chase')).toEqual({ cockpitVisible: false, hellcatVisible: true })
  })
})

it('hands the frame and the world the same controls object', () => {
  // frame.ts documents `FrameState.controls` as "the identical object
  // `world.controls` holds". True, but untested: `nextFrameState` rebuilds
  // `{...prev.world, controls}` from `prev.controls` and never reads
  // `prev.world.controls`, so the render path would keep working while the
  // comment quietly became false (review 2026-09-13).
  const f6f = loadAircraftSpec('f6f-hellcat')
  let f = initialFrameState(f6f, createState({ position: v3(0, 600, 0), velocity: v3(120, 0, 0) }))
  expect(f.controls).toBe(f.world.controls)
  for (const keys of [new Set(['ArrowLeft']), new Set(['ShiftLeft']), new Set<string>()]) {
    f = nextFrameState(f, 1 / 60, keys)
    expect(f.controls).toBe(f.world.controls)
  }
})

describe('gear and brakes', () => {
  it('starts with the gear up, because the default spawn is airborne', () => {
    // `start()` spawns at (0, 1000, 0) -- nowhere near a runway -- and
    // `DEFAULT_SPAWN_POSITION` (src/render/spawn.ts) is likewise 600 m up
    // and 23 km from land, so `initialFrameState` defaults gear UP to match.
    expect(start().gearDown).toBe(false)
  })

  it('toggles the gear on the key edge, not every frame it is held', () => {
    let f = start()
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(true)
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(true)
    f = nextFrameState(f, 1 / 60, keys())
    f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(false)
  })

  it('puts the gear command where the simulation reads it', () => {
    // The Plan 3 defect: a control that never reaches `world.controls` is
    // inert in the browser while every unit test of it still passes.
    const f = nextFrameState(start(), 1 / 60, keys('KeyG'))
    expect(f.world.controls.gearDown).toBe(f.gearDown)
  })

  it('brakes while the key is held and releases when it is not', () => {
    const held = nextFrameState(start(), 1 / 60, keys('KeyB'))
    expect(held.controls.brake).toBeGreaterThan(0)
    expect(nextFrameState(held, 1 / 60, keys()).controls.brake).toBe(0)
  })
})
