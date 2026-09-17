import { describe, it, expect } from 'vitest'
import { controlsFromKeys, NEUTRAL, RAMP_SECONDS, THROTTLE_SECONDS } from '../../src/input/keyboard.js'

const DT = 1 / 60
const keys = (...k: string[]) => new Set(k)
/** Run `seconds` of held input and return where the axes ended up. */
const hold = (held: string[], seconds: number, from = NEUTRAL) => {
  let c = from
  for (let t = 0; t < seconds; t += DT) c = controlsFromKeys(keys(...held), DT, c)
  return c
}

describe('controlsFromKeys', () => {
  it('ramps rather than snapping to full deflection', () => {
    // The decision that shapes feel: a key is binary, a stick is not. One
    // frame of "pull back" must not command full nose-up.
    const oneFrame = controlsFromKeys(keys('ArrowDown'), DT, NEUTRAL)
    expect(oneFrame.pitch).toBeGreaterThan(0)
    expect(oneFrame.pitch).toBeLessThan(0.1)
  })

  it('reaches full deflection after the ramp time', () => {
    expect(hold(['ArrowDown'], RAMP_SECONDS * 1.2).pitch).toBeCloseTo(1, 3)
  })

  it('never exceeds the axis limits however long a key is held', () => {
    const c = hold(['ArrowDown', 'ArrowRight'], RAMP_SECONDS * 5)
    expect(c.pitch).toBeLessThanOrEqual(1)
    expect(c.roll).toBeLessThanOrEqual(1)
  })

  it('springs back to centre on release', () => {
    const deflected = hold(['ArrowDown'], RAMP_SECONDS)
    let c = deflected
    for (let t = 0; t < RAMP_SECONDS * 1.2; t += DT) c = controlsFromKeys(keys(), DT, c)
    expect(c.pitch).toBeCloseTo(0, 3)
  })

  it('is symmetric: opposite keys ramp at the same rate', () => {
    const up = hold(['ArrowDown'], RAMP_SECONDS / 2).pitch
    const down = hold(['ArrowUp'], RAMP_SECONDS / 2).pitch
    expect(up).toBeCloseTo(-down, 9)
  })

  it('cancels to centre when both keys on an axis are held', () => {
    const c = hold(['ArrowLeft', 'ArrowRight'], RAMP_SECONDS)
    expect(c.roll).toBeCloseTo(0, 6)
  })

  it('holds throttle where it is left rather than springing back', () => {
    // Throttle is a lever, not a stick: releasing the key must not close it.
    const open = hold(['Equal'], RAMP_SECONDS / 2)
    expect(open.throttle).toBeGreaterThan(0)
    let c = open
    for (let t = 0; t < RAMP_SECONDS; t += DT) c = controlsFromKeys(keys(), DT, c)
    expect(c.throttle).toBeCloseTo(open.throttle, 9)
  })

  it('clamps throttle to [0,1]', () => {
    // Held past the full SWEEP time, not the stick ramp time: the constants
    // differ, and five ramp times is only 88% of the sweep.
    const full = hold(['Equal'], THROTTLE_SECONDS * 1.5)
    expect(full.throttle).toBe(1)
    // `Minus`, not `KeyZ`: Z became yaw-left on 2026-09-17 when throttle moved
    // to `=` and `-` exclusively.
    expect(hold(['Minus'], THROTTLE_SECONDS * 1.5).throttle).toBe(0)
    expect(hold(['Minus'], THROTTLE_SECONDS * 1.5, full).throttle).toBe(0)
  })

  it('produces finite output for a nonsense dt', () => {
    // rAF deltas go strange across a tab suspend; input must not poison the
    // control vector, which would put a NaN straight into the integrator.
    for (const bad of [NaN, Infinity, -1]) {
      const c = controlsFromKeys(keys('ArrowDown'), bad, NEUTRAL)
      expect(Number.isFinite(c.pitch + c.roll + c.yaw + c.throttle)).toBe(true)
    }
  })
})

describe('control sign conventions (review 2026-09-13)', () => {
  // A mutation sweep found that swapping rollLeft with rollRight, or yawLeft
  // with yawRight, left the whole 335-test suite green. Only pitch had a
  // direction assertion; roll appeared solely in a limit check and a
  // both-keys-cancel check, both sign-blind, and yaw was never exercised at
  // all. Inverted roll is C-1's defect moved from the instrument to the stick,
  // and it is the one a pilot would notice first.
  //
  // Controls' documented convention (src/sim/flight/state.ts): positive pitch
  // is nose up, positive roll is right roll, positive yaw is nose right.
  const held = (code: string, seconds = 1) =>
    controlsFromKeys(new Set([code]), seconds, NEUTRAL)

  it('rolls right on the right-hand keys and left on the left-hand ones', () => {
    for (const code of ['ArrowRight', 'KeyD']) expect(held(code).roll).toBeGreaterThan(0)
    for (const code of ['ArrowLeft', 'KeyA']) expect(held(code).roll).toBeLessThan(0)
  })

  it('yaws the nose right on E and left on Q', () => {
    expect(held('KeyX').yaw).toBeGreaterThan(0)
    expect(held('KeyZ').yaw).toBeLessThan(0)
  })

  it('pitches the nose up on the back-stick keys', () => {
    // Pull back to climb: ArrowDown and S are the back-stick, as bindings.ts
    // says. Pinned here too so all three axes are guarded in one place.
    for (const code of ['ArrowDown', 'KeyS']) expect(held(code).pitch).toBeGreaterThan(0)
    for (const code of ['ArrowUp', 'KeyW']) expect(held(code).pitch).toBeLessThan(0)
  })
})
