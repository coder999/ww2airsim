import { describe, it, expect } from 'vitest'
import { initialFrameState, nextFrameState, withPaused } from '../../src/render/frame.js'
import { pauseLabel } from '../../src/render/pauseBadge.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const start = () =>
  initialFrameState(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) }))
const FRAME = 1 / 60

/** Mark, 2026-09-17: "esc key pauses game". */
describe('pause (Esc)', () => {
  it('starts unpaused', () => {
    expect(start().paused).toBe(false)
  })

  it('toggles on the key edge, not on every frame the key is held', () => {
    let f = start()
    for (let i = 0; i < 60; i++) f = nextFrameState(f, FRAME, keys('Escape'))
    expect(f.paused).toBe(true)
    f = nextFrameState(f, FRAME, keys())
    f = nextFrameState(f, FRAME, keys('Escape'))
    expect(f.paused).toBe(false)
  })

  it('runs no simulation steps while paused, and picks up cleanly on resume', () => {
    let f = start()
    f = nextFrameState(f, FRAME, keys('Escape'))
    const tick = f.world.tick
    for (let i = 0; i < 120; i++) f = nextFrameState(f, FRAME, keys())
    expect(f.world.tick).toBe(tick)
    expect(f.stepsRun).toBe(0)
    expect(f.droppedSteps).toBe(0)
    // No time is owed on resume: the accumulator did not fill while paused,
    // so the first live frame runs one step, not a burst.
    f = nextFrameState(f, FRAME, keys('Escape'))
    f = nextFrameState(f, FRAME, keys())
    expect(f.stepsRun).toBe(1)
  })

  it('freezes the controls too: a key held while paused does not wind the stick up', () => {
    let f = start()
    f = nextFrameState(f, FRAME, keys('Escape'))
    for (let i = 0; i < 60; i++) f = nextFrameState(f, FRAME, keys('ArrowDown', 'Equal'))
    expect(f.controls.pitch).toBe(0)
    expect(f.controls.throttle).toBe(0)
  })

  it('pauses the frame the key is pressed on', () => {
    const f = nextFrameState(start(), FRAME, keys('Escape'))
    expect(f.stepsRun).toBe(0)
  })

  it('can be set directly, for a modal that wants the world held', () => {
    const f = withPaused(start(), true)
    expect(f.paused).toBe(true)
    expect(nextFrameState(f, FRAME, keys()).stepsRun).toBe(0)
    expect(withPaused(f, false).paused).toBe(false)
  })

  it('labels the badge only while paused', () => {
    expect(pauseLabel(false)).toBeNull()
    expect(pauseLabel(true)).toContain('PAUSED')
  })
})
