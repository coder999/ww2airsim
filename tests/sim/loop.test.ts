import { describe, it, expect, vi } from 'vitest'
import { advance, createWorld, MAX_STEPS_PER_FRAME } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT, step } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const level = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }
const start = () => createWorld(f6f, createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) }))

// Recursively freezes an object graph so any in-place write throws (this
// file is an ES module, hence always strict mode) instead of silently
// succeeding or succeeding-but-round-tripping-identically through JSON.
function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

describe('advance', () => {
  it('runs no steps when less than one step of time has elapsed', () => {
    const r = advance(start(), level, DT / 2)
    expect(r.stepsRun).toBe(0)
    expect(r.droppedSteps).toBe(0)
    expect(r.alpha).toBeCloseTo(0.5, 10)
    expect(r.world.aircraft.tick).toBe(0)
  })

  it('runs exactly one step for exactly one step of time', () => {
    const r = advance(start(), level, DT)
    expect(r.stepsRun).toBe(1)
    expect(r.world.aircraft.tick).toBe(1)
    expect(r.alpha).toBeCloseTo(0, 9)
  })

  it('keeps the remainder rather than losing or double-counting it', () => {
    // 2.5 steps of time -> 2 steps run, half a step banked.
    const r = advance(start(), level, DT * 2.5)
    expect(r.stepsRun).toBe(2)
    expect(r.alpha).toBeCloseTo(0.5, 9)
    // alpha is an interpolation factor (Tasks 4 and 13 consume it as a
    // fraction of a step); a negative value would be extrapolation.
    expect(r.alpha).toBeGreaterThanOrEqual(0)
    expect(r.alpha).toBeLessThan(1)
    // Feeding the remaining half a step now completes the third.
    const r2 = advance(r.world, level, DT * 0.5)
    expect(r2.stepsRun).toBe(1)
    expect(r2.world.aircraft.tick).toBe(3)
  })

  it('keeps alpha in [0, 1) on the epsilon path with an adversarially short delta', () => {
    // DT * (2 - 9.99e-7) makes banked/DT land at 2 - 9.99e-7: STEP_EPSILON
    // (1e-6) pushes the floor up to the 2nd step that is genuinely owed, but
    // subtracting owed * DT from banked then goes slightly negative -- measured
    // (2026-09-12, Node 22, with the :118 clamp disabled) banked = -1.665e-8
    // seconds, i.e. alpha = banked / DT = -9.99e-7 -- before the clamp. Without
    // it this surfaces as a negative alpha, i.e. extrapolation.
    const r = advance(start(), level, DT * (2 - 9.99e-7))
    expect(r.stepsRun).toBe(2)
    expect(r.alpha).toBeGreaterThanOrEqual(0)
    expect(r.alpha).toBeLessThan(1)
  })

  it('advances ticks monotonically by one per step', () => {
    let w = start()
    const ticks: number[] = []
    for (let i = 0; i < 10; i++) {
      const r = advance(w, level, DT)
      w = r.world
      ticks.push(w.aircraft.tick)
    }
    expect(ticks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('exposes the previous tick for interpolation, and holds it on a no-step call', () => {
    const r = advance(start(), level, DT * 2)
    expect(r.world.previous.tick).toBe(1)
    expect(r.world.aircraft.tick).toBe(2)
    const held = advance(r.world, level, DT / 4)
    expect(held.world.previous.tick).toBe(1)
    expect(held.world.aircraft.tick).toBe(2)
  })

  it('caps the steps one call may run, and counts what it discarded', () => {
    // 20 steps of time owed; the cap is 5.
    const r = advance(start(), level, DT * 20)
    expect(r.stepsRun).toBe(MAX_STEPS_PER_FRAME)
    expect(r.droppedSteps).toBe(20 - MAX_STEPS_PER_FRAME)
    expect(r.world.aircraft.tick).toBe(MAX_STEPS_PER_FRAME)
  })

  it('does not spiral: a persistently overlong frame never accumulates debt', () => {
    // This is the property the cap exists for. Without it, the accumulator
    // grows without bound and every later call runs the cap again forever.
    let w = start()
    for (let i = 0; i < 5; i++) w = advance(w, level, DT * 50).world
    const r = advance(w, level, DT)
    expect(r.stepsRun).toBe(1)
    expect(r.droppedSteps).toBe(0)
  })

  it('ignores a non-finite or negative elapsed time instead of poisoning the clock', () => {
    // requestAnimationFrame deltas go strange across a tab suspend.
    for (const bad of [NaN, Infinity, -1]) {
      const r = advance(start(), level, bad)
      expect(r.stepsRun).toBe(0)
      expect(r.droppedSteps).toBe(0)
      expect(Number.isFinite(r.alpha)).toBe(true)
    }
  })

  it('runs the stepper it is given, once per step', () => {
    // Development builds pass stepChecked so Plan 1's invariants run in the
    // browser; production passes step. The caller chooses, so sim/ carries
    // no build flag.
    const spy = vi.fn(step)
    const r = advance(start(), level, DT * 3, spy)
    expect(r.stepsRun).toBe(3)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('is pure: the world passed in is not mutated', () => {
    const w = start()
    // JSON.stringify is value-based and misses a mutation that round-trips to
    // the same JSON shape (position.x = -0, or a write of NaN/Infinity to a
    // field the comparison doesn't distinguish). Freezing every object this
    // module could write through makes any in-place write throw in strict
    // mode instead, regardless of what value it writes.
    deepFreeze(w)
    const before = JSON.stringify(w)
    advance(w, level, DT * 3)
    expect(JSON.stringify(w)).toBe(before)
  })
})
