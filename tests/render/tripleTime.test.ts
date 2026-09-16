import { describe, it, expect } from 'vitest'
import {
  initialFrameState,
  nextFrameState,
  TRIPLE_TIME_SCALE,
  type FrameState,
} from '../../src/render/frame.js'
import { MAX_STEPS_PER_FRAME } from '../../src/sim/loop.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { timeScaleLabel } from '../../src/render/timeBadge.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const start = () =>
  initialFrameState(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) }))

const FRAME = 1 / 60

describe('triple time (T)', () => {
  it('starts at real time', () => {
    expect(start().timeScale).toBe(1)
  })

  it('toggles on the key edge, not on every frame the key is held', () => {
    // The same defect the camera cycle and the three assist toggles each guard
    // against: held for a second, a per-frame toggle flips sixty times and
    // lands wherever the frame count left it.
    let f = start()
    for (let i = 0; i < 60; i++) f = nextFrameState(f, FRAME, keys('KeyT'))
    expect(f.timeScale).toBe(TRIPLE_TIME_SCALE)

    for (let i = 0; i < 60; i++) f = nextFrameState(f, FRAME, keys('KeyT'))
    expect(f.timeScale).toBe(TRIPLE_TIME_SCALE)

    f = nextFrameState(f, FRAME, keys())
    f = nextFrameState(f, FRAME, keys('KeyT'))
    expect(f.timeScale).toBe(1)
  })

  it('runs three simulation steps for one real frame', () => {
    // The whole feature, measured where it actually happens: the fixed-step
    // accumulator, not a multiplier sitting in the renderer.
    let f = start()
    f = nextFrameState(f, FRAME, keys('KeyT'))
    const before = f.world.aircraft.tick
    f = nextFrameState(f, FRAME, keys())
    expect(f.world.aircraft.tick - before).toBe(3)
    expect(f.stepsRun).toBe(3)
  })

  it('compresses the frame the key is pressed on, not the one after it', () => {
    // A scale that took effect one frame late would leave a tick of simulated
    // time belonging to neither setting. Asserted because `nextFrameState`
    // reads the toggle before it builds the delta, which is easy to undo.
    const f = nextFrameState(start(), FRAME, keys('KeyT'))
    expect(f.stepsRun).toBe(TRIPLE_TIME_SCALE)
  })

  it('advances the same simulated time as three real-time frames do', () => {
    // A stronger claim than the tick count above: compressed time must be the
    // ordinary simulation played faster, not a different trajectory. Same
    // spawn, same neutral controls, three ticks either way -- so the states
    // have to agree exactly, not merely approximately. The scale is set
    // directly rather than by pressing `T`, because the pressing frame is
    // itself compressed (the case above) and would put the two runs a tick
    // apart before the comparison began.
    let fast: FrameState = { ...start(), timeScale: TRIPLE_TIME_SCALE }
    fast = nextFrameState(fast, FRAME, keys())

    let real = start()
    for (let i = 0; i < 3; i++) real = nextFrameState(real, FRAME, keys())

    expect(fast.world.aircraft.tick).toBe(real.world.aircraft.tick)
    expect(fast.world.aircraft.position).toEqual(real.world.aircraft.position)
    expect(fast.world.aircraft.velocity).toEqual(real.world.aircraft.velocity)
  })

  it('ramps the controls in simulated seconds, so the aeroplane does not feel sluggish', () => {
    // `controlsFromKeys` ramps toward full deflection over RAMP_SECONDS. Left
    // on real seconds, a compressed frame would fly three times as far for the
    // same stick movement -- the aeroplane would answer a third as willingly
    // exactly when there is most sky going past. Scaling the ramp makes 3x a
    // faithful fast-forward: identical response per simulated second.
    let fast = nextFrameState(start(), FRAME, keys('KeyT'))
    fast = nextFrameState(fast, FRAME, keys('ArrowDown'))

    let real = start()
    real = nextFrameState(real, FRAME * TRIPLE_TIME_SCALE, keys('ArrowDown'))

    expect(fast.controls.pitch).toBeCloseTo(real.controls.pitch, 12)
    expect(fast.controls.pitch).toBeGreaterThan(0)
  })

  it('pans the pilot head at real speed, which does not belong to simulated time', () => {
    // Look-around is the pilot turning to look, not part of the flight being
    // fast-forwarded. A head that snapped round three times as fast in wall
    // clock would be unusable precisely when the view matters most.
    let fast = nextFrameState(start(), FRAME, keys('KeyT'))
    fast = nextFrameState(fast, FRAME, keys('Numpad4'))

    let real = start()
    real = nextFrameState(real, FRAME, keys('Numpad4'))

    expect(fast.timeScale).toBe(TRIPLE_TIME_SCALE)
    expect(fast.look.yawRad).toBeCloseTo(real.look.yawRad, 12)
    expect(fast.look.yawRad).not.toBe(0)
  })

  it('degrades to less than 3x on a slow frame rather than chasing its own tail', () => {
    // MAX_STEPS_PER_FRAME is deliberately left alone: the cap exists so that a
    // long frame cannot owe more work than it can do and make itself longer
    // still, and raising it under compression would re-open that spiral
    // exactly when frames are already long. At 30 fps, 3x owes six steps and
    // gets five, so compression lands near 2.5x and `droppedSteps` says so.
    let f = nextFrameState(start(), FRAME, keys('KeyT'))
    f = nextFrameState(f, 1 / 30, keys())

    expect(f.stepsRun).toBe(MAX_STEPS_PER_FRAME)
    expect(f.droppedSteps).toBe(1)
  })
})

describe('the compression badge', () => {
  it('says nothing at real time', () => {
    expect(timeScaleLabel(1)).toBeNull()
  })

  it('names the compression while it is running', () => {
    expect(timeScaleLabel(TRIPLE_TIME_SCALE)).toBe('3× TIME')
  })
})
