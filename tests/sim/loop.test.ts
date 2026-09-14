import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { advance, createWorld, MAX_STEPS_PER_FRAME, type Assist } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT, step, airspeed } from '../../src/sim/flight/model.js'
import type { Controls } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { ROLLING_DESCENT_CONTROLS, type GoldenTrajectory } from '../../tools/golden/record.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const level = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }
const start = () =>
  createWorld(f6f, createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) }), level)

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
    const r = advance(start(), DT / 2)
    expect(r.stepsRun).toBe(0)
    expect(r.droppedSteps).toBe(0)
    expect(r.alpha).toBeCloseTo(0.5, 10)
    expect(r.world.aircraft.tick).toBe(0)
  })

  it('runs exactly one step for exactly one step of time', () => {
    const r = advance(start(), DT)
    expect(r.stepsRun).toBe(1)
    expect(r.world.aircraft.tick).toBe(1)
    expect(r.alpha).toBeCloseTo(0, 9)
  })

  it('keeps the remainder rather than losing or double-counting it', () => {
    // 2.5 steps of time -> 2 steps run, half a step banked.
    const r = advance(start(), DT * 2.5)
    expect(r.stepsRun).toBe(2)
    expect(r.alpha).toBeCloseTo(0.5, 9)
    // alpha is an interpolation factor (Tasks 4 and 13 consume it as a
    // fraction of a step); a negative value would be extrapolation.
    expect(r.alpha).toBeGreaterThanOrEqual(0)
    expect(r.alpha).toBeLessThan(1)
    // Feeding the remaining half a step now completes the third.
    const r2 = advance(r.world, DT * 0.5)
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
    const r = advance(start(), DT * (2 - 9.99e-7))
    expect(r.stepsRun).toBe(2)
    expect(r.alpha).toBeGreaterThanOrEqual(0)
    expect(r.alpha).toBeLessThan(1)
  })

  it('advances ticks monotonically by one per step', () => {
    let w = start()
    const ticks: number[] = []
    for (let i = 0; i < 10; i++) {
      const r = advance(w, DT)
      w = r.world
      ticks.push(w.aircraft.tick)
    }
    expect(ticks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('exposes the previous tick for interpolation, and holds it on a no-step call', () => {
    const r = advance(start(), DT * 2)
    expect(r.world.previous.tick).toBe(1)
    expect(r.world.aircraft.tick).toBe(2)
    const held = advance(r.world, DT / 4)
    expect(held.world.previous.tick).toBe(1)
    expect(held.world.aircraft.tick).toBe(2)
  })

  it('caps the steps one call may run, and counts what it discarded', () => {
    // 20 steps of time owed; the cap is 5.
    const r = advance(start(), DT * 20)
    expect(r.stepsRun).toBe(MAX_STEPS_PER_FRAME)
    expect(r.droppedSteps).toBe(20 - MAX_STEPS_PER_FRAME)
    expect(r.world.aircraft.tick).toBe(MAX_STEPS_PER_FRAME)
  })

  it('does not spiral: a persistently overlong frame never accumulates debt', () => {
    // This is the property the cap exists for. Without it, the accumulator
    // grows without bound and every later call runs the cap again forever.
    let w = start()
    for (let i = 0; i < 5; i++) w = advance(w, DT * 50).world
    const r = advance(w, DT)
    expect(r.stepsRun).toBe(1)
    expect(r.droppedSteps).toBe(0)
  })

  it('ignores a non-finite or negative elapsed time instead of poisoning the clock', () => {
    // requestAnimationFrame deltas go strange across a tab suspend.
    for (const bad of [NaN, Infinity, -1]) {
      const r = advance(start(), bad)
      expect(r.stepsRun).toBe(0)
      expect(r.droppedSteps).toBe(0)
      expect(Number.isFinite(r.alpha)).toBe(true)
    }
  })

  it('reports the honest step count for a realistic 2-second stall', () => {
    const r = advance(start(), 2)
    expect(r.stepsRun).toBe(5)
    expect(r.droppedSteps).toBe(115) // 2s / DT = 120 owed, cap 5, 115 discarded
  })

  it('keeps alpha and accumulatorSeconds in range, and droppedSteps finite and integral, for hostile elapsed inputs', () => {
    // Round 1 fixed droppedSteps for Number.MAX_VALUE by clamping `owed`
    // after the fact, which left `alpha` at Infinity and `accumulatorSeconds`
    // at 1.7977e308 for that same input -- both outside their documented
    // ranges, and both poisoned into every later `advance` call on that
    // world. This is the test whose absence let that regression through:
    // it pins all three outputs together, not just the one that was reported.
    for (const elapsedSeconds of [Number.MAX_VALUE, 1e20, 1e6, 2, DT * (2 - 9.99e-7)]) {
      const r = advance(start(), elapsedSeconds)
      expect(r.alpha).toBeGreaterThanOrEqual(0)
      expect(r.alpha).toBeLessThan(1)
      expect(r.world.accumulatorSeconds).toBeGreaterThanOrEqual(0)
      expect(r.world.accumulatorSeconds).toBeLessThan(DT)
      expect(Number.isFinite(r.droppedSteps)).toBe(true)
      expect(Number.isInteger(r.droppedSteps)).toBe(true)
    }
  })

  it('runs the stepper it is given, once per step', () => {
    // Development builds pass stepChecked so Plan 1's invariants run in the
    // browser; production passes step. The caller chooses, so sim/ carries
    // no build flag.
    const spy = vi.fn(step)
    const r = advance(start(), DT * 3, spy)
    expect(r.stepsRun).toBe(3)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  describe('the injected assist (Plan 3 Task 1: the seam, no assist behaviour yet)', () => {
    // Plan 3's design put the assist call inside the fixed-step loop
    // specifically so it runs at DT and not at frame rate (open item 5 is the
    // bug that already exists in this codebase for NOT doing that on the
    // input ramp). A `vi.fn` counting calls against `stepsRun` is exactly the
    // existing "runs the stepper it is given, once per step" test's shape,
    // reused here for the assist. Proved to fail: temporarily hoisting the
    // `assist(...)` call in src/sim/loop.ts to above the `for` loop (so it
    // runs once per `advance` call on `world.aircraft` instead of once per
    // step on `current`) makes this test's expectation of 3 calls see 1
    // instead, and it fails.
    it('runs once per fixed step, not once per advance() call', () => {
      const spy = vi.fn<Assist<undefined>>((_state, _spec, raw, _dt, memory) => ({
        controls: raw,
        memory,
      }))
      const r = advance(start(), DT * 3, step, spy)
      expect(r.stepsRun).toBe(3)
      expect(spy).toHaveBeenCalledTimes(3)
    })

    it('runs before the stepper on every step, not after', () => {
      // Order matters: an assist that saw the stepper's OUTPUT rather than
      // its input would be reacting to next tick's state a tick early. Two
      // spies pushing onto one shared array is the only way to observe
      // interleaving rather than just counts. Proved to fail: swapping the
      // two lines inside src/sim/loop.ts's step loop (stepper before assist)
      // turns this into ['stepper', 'assist', 'stepper', 'assist'] and the
      // `toEqual` below fails.
      const order: string[] = []
      const spyAssist: Assist<undefined> = (_state, _spec, raw, _dt, memory) => {
        order.push('assist')
        return { controls: raw, memory }
      }
      const spyStepper = vi.fn<typeof step>((spec, state, controls, ctx) => {
        order.push('stepper')
        return step(spec, state, controls, ctx)
      })
      advance(start(), DT * 2, spyStepper, spyAssist)
      expect(order).toEqual(['assist', 'stepper', 'assist', 'stepper'])
    })

    it('is fed the pilot\'s raw command, the state entering that step, and the fixed DT -- not the frame\'s elapsed time', () => {
      const calls: Array<{ tick: number; raw: Controls; dt: number }> = []
      const spy: Assist<undefined> = (state, _spec, raw, dt, memory) => {
        calls.push({ tick: state.tick, raw, dt })
        return { controls: raw, memory }
      }
      const pitchUp = { ...level, pitch: 1 }
      // An elapsed time that is NOT a whole multiple of DT, so a bug that fed
      // the assist `elapsedSeconds` (or `elapsedSeconds / stepsRun`) instead
      // of the fixed step would show up as `dt !== DT` below.
      advance({ ...start(), controls: pitchUp }, DT * 2.5, step, spy)
      expect(calls).toHaveLength(2)
      expect(calls[0]!.tick).toBe(0) // state entering the first step: tick 0
      expect(calls[1]!.tick).toBe(1) // state entering the second step: tick 1
      for (const c of calls) {
        expect(c.dt).toBe(DT)
        expect(c.raw).toEqual(pitchUp)
      }
    })

    it('defaults to a no-op, so callers written before Plan 3 are unaffected', () => {
      // Every other test in this file calls `advance` without an assist
      // argument at all; this pins the specific claim that the default
      // behaves as identity, rather than relying on the rest of the suite
      // merely happening not to notice a difference.
      const withDefault = advance(start(), DT * 3)
      const withExplicitIdentity = advance(start(), DT * 3, step, (_s, _sp, raw, _dt, memory) => ({
        controls: raw,
        memory,
      }))
      expect(withDefault.world.aircraft).toEqual(withExplicitIdentity.world.aircraft)
    })
  })

  it('steps with the controls the world carries, and hands them back for the next call', () => {
    // Whole-branch review, I-5: `controls` moved out of `advance`'s parameter
    // list into `World`, so Plan 5's N-entity AI adds a field rather than a
    // parameter at every call site. Two things have to hold for that move to
    // be behaviour-preserving, and neither was covered before: the stepper
    // must read the world's controls (a stale capture would leave the
    // aeroplane flying the previous command forever), and the returned world
    // must still carry them, or the next `advance` would fly neutral.
    const w = start()
    const pitchUp = advance({ ...w, controls: { ...level, pitch: 1 } }, DT * 5)
    const neutral = advance(w, DT * 5)
    const noseY = (s: { attitude: { x: number; y: number; z: number; w: number } }) =>
      qRotate(s.attitude, v3(1, 0, 0)).y
    expect(noseY(pitchUp.world.aircraft)).toBeGreaterThan(noseY(neutral.world.aircraft))
    expect(pitchUp.world.controls.pitch).toBe(1)
    expect(neutral.world.controls).toEqual(level)
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
    advance(w, DT * 3)
    expect(JSON.stringify(w)).toBe(before)
  })
})

describe('advance with the default (identity) assist, driven through the golden manoeuvre', () => {
  // Plan 3 Task 1's second required test: proves the seam added to `advance`
  // is behaviourally inert. `tools/golden/record.ts`'s `recordTrajectory`
  // calls `step` directly and never goes through `advance`, so it cannot see
  // this change at all -- it would pass unmodified no matter what Task 1 did
  // to `loop.ts`. This test closes that gap by driving the exact same
  // manoeuvre (`ROLLING_DESCENT_CONTROLS`, the same initial state) through
  // `advance` one fixed step at a time instead, with no assist argument
  // passed (so the production default, `identityAssist`, is what runs), and
  // checks the result against the same golden file.
  //
  // The comparison is EXACT equality, not a tolerance: calling
  // `advance(world, DT)` with `world.controls` set to this tick's command
  // runs `identityAssist` (which returns `raw` unchanged) and then `step`
  // with precisely the same arguments, in the same order, that
  // `recordTrajectory` passes to `step` directly -- the same floating-point
  // operations in the same order produce the same bits. A tolerance here
  // would hide exactly the kind of bug this test exists to catch (the assist
  // silently perturbing the command by even one ULP).
  //
  // Proved to fail: temporarily changing `identityAssist` in src/sim/loop.ts
  // to `(_s, _sp, raw) => ({ ...raw, pitch: raw.pitch + 1e-6 })` makes this
  // test fail at tick 0 (position mismatch on the order of 1e-4 m by the
  // first checkpoint), while every other test in this file still passes --
  // isolating the failure to this test, as intended.
  it('matches the recorded checkpoints tick-for-tick', () => {
    const golden = JSON.parse(
      readFileSync(new URL('./golden/f6f-rolling-descent.golden.json', import.meta.url), 'utf8'),
    ) as GoldenTrajectory
    const steps = golden.checkpoints[golden.checkpoints.length - 1]!.tick + 1

    let world = createWorld(
      f6f,
      createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), fuelKg: 400 }),
      ROLLING_DESCENT_CONTROLS(0),
    )
    const checkpoints: GoldenTrajectory['checkpoints'] = []
    for (let tick = 0; tick < steps; tick++) {
      world = { ...world, controls: ROLLING_DESCENT_CONTROLS(tick) }
      world = advance(world, DT).world
      if (tick % 300 === 0 || tick === steps - 1) {
        const s = world.aircraft
        checkpoints.push({
          tick,
          position: [s.position.x, s.position.y, s.position.z],
          speed: airspeed(s),
        })
      }
    }
    expect(checkpoints).toEqual(golden.checkpoints)
  })
})
