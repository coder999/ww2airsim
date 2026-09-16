import { describe, it, expect } from 'vitest'
import { advance, createWorld, type World } from '../../src/sim/loop.js'
import {
  assistFor,
  NOT_HOLDING,
  type AltitudeHoldMemory,
  type AssistSettings,
} from '../../src/assists/index.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const spec = loadAircraftSpec('f6f-hellcat')

/** Only altitude hold, because it is the only stage with a memory -- the other
 *  two are pure functions of the current state, so a failure here can only be
 *  about the thing this file exists to test. */
const HOLD_ONLY: AssistSettings = { stallLimiter: false, autoRudder: false, altitudeHold: true }

/** Stick centred, so altitude hold engages and captures on the first step. */
const CENTRED: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }

/**
 * Descending hard when the memory is captured, which is what makes a lost
 * memory VISIBLE: by the time the snapshot is taken the airplane is far below
 * the captured altitude, so anything that re-captures on resume holds a
 * different one from then on. Starting level would let a broken implementation
 * and a correct one agree -- the failure mode this project keeps shipping, and
 * a 6 m/s climb was tried first and only separated them by 2 m (measured
 * 2026-09-13), which is a thin margin to rest a guard on. At 25 m/s down the
 * separation is 14.5 m.
 */
const sinking = (altitudeM: number): AircraftState =>
  createState({
    position: v3(0, altitudeM, 0),
    velocity: v3(130, -25, 0),
    attitude: qIdentity(),
  })

/** Three steps per call, so the memory has to survive both the step loop
 *  inside one `advance` and the boundary between calls. */
const FRAME = DT * 3

function fly(world: World<AltitudeHoldMemory>, frames: number): World<AltitudeHoldMemory> {
  const assist = assistFor(HOLD_ONLY)
  let w = world
  for (let i = 0; i < frames; i++) w = advance(w, FRAME, undefined, assist).world
  return w
}

/** What a save/load, or a replay resumed from a checkpoint, actually does to a
 *  world: everything in it survives, and nothing outside it does. */
const roundTrip = (world: World<AltitudeHoldMemory>): World<AltitudeHoldMemory> =>
  JSON.parse(JSON.stringify(world)) as World<AltitudeHoldMemory>

/**
 * What each test here actually catches, measured by mutating `advance` rather
 * than by reading it (2026-09-13, the four mutations run):
 *
 *  - dropping the memory at the frame boundary, and feeding every step the
 *    frame-start memory instead of the threaded one, are both caught -- by the
 *    second and third tests below, and by three tests in
 *    tests/render/frameAssists.test.ts.
 *  - never threading the memory at all is caught by the second and third, and
 *    NOT by the first: both of its arms then lose the memory identically and
 *    agree. That is worth stating plainly rather than leaving for someone to
 *    rediscover, because it is this project's recurring defect in miniature --
 *    the first test is a real guard against a memory kept OUTSIDE the world
 *    (the closure this replaced), and is no guard at all against a memory that
 *    is never advanced.
 */
describe('assist memory lives in the world', () => {
  it('resumes a serialised world onto the same trajectory as one that never stopped', () => {
    const start = createWorld(spec, sinking(2000), CENTRED, NOT_HOLDING)

    const continuous = fly(start, 300)
    const resumed = fly(roundTrip(fly(start, 40)), 260)

    expect(resumed.aircraft).toEqual(continuous.aircraft)
    expect(resumed.assistMemory).toEqual(continuous.assistMemory)
  })

  it('would not have caught that if the memory were dropped on resume', () => {
    // The assertion above is only worth anything if a world that loses its
    // memory reaches a MEASURABLY different place -- otherwise it would pass
    // against an implementation that never threaded anything. This pins that
    // from the other side: same flight, same everything, except the resumed
    // world re-captures instead of remembering.
    const start = createWorld(spec, sinking(2000), CENTRED, NOT_HOLDING)

    const continuous = fly(start, 300)
    const midpoint = fly(start, 40)
    const forgotten = fly({ ...roundTrip(midpoint), assistMemory: NOT_HOLDING }, 260)

    // Measured 2026-09-13: captured 2000, 1987.8 m at the snapshot, and the
    // two runs end 14.5 m apart. The thresholds sit well inside those figures
    // and enormously outside anything floating-point noise could produce.
    expect(midpoint.assistMemory.heldAltitudeM).toBe(2000)
    expect(midpoint.aircraft.position.y).toBeLessThan(1990)
    expect(Math.abs(forgotten.aircraft.position.y - continuous.aircraft.position.y)).toBeGreaterThan(10)
  })

  it('keeps two airplanes flying through one assist function on their own memories', () => {
    // The combat plan flies many airplanes through one assist. Sharing a captured
    // altitude between them is the failure this shape exists to make
    // impossible, so it gets a test rather than a comment: a `assistFor` that
    // cached the memory in its closure would pass every other test in this
    // suite and fail this one.
    const assist = assistFor(HOLD_ONLY)
    let low = createWorld(spec, sinking(1000), CENTRED, NOT_HOLDING)
    let high = createWorld(spec, sinking(4000), CENTRED, NOT_HOLDING)

    for (let i = 0; i < 100; i++) {
      low = advance(low, FRAME, undefined, assist).world
      high = advance(high, FRAME, undefined, assist).world
    }

    expect(low.assistMemory.heldAltitudeM).toBe(1000)
    expect(high.assistMemory.heldAltitudeM).toBe(4000)
  })
})
