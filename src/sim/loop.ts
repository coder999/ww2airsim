import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { DT, step } from './flight/model.js'

/**
 * The simulation's clock: the per-step context type, and the fixed-step
 * accumulator that decides when a step happens.
 *
 * `SimContext` exists because `step`'s signature is what every later plan has
 * to extend: terrain height queries, deck contact, a threaded RNG, a wind
 * vector. As a parameter list that is a change to every call site; as one
 * object it is a change to one interface (Plan 1 whole-branch review, highest
 * -risk structural finding).
 *
 * It carries `dt` and `tick` and NOTHING ELSE on purpose. The same review
 * flagged `speedOfSoundAt` as an export with no consumer; speculative
 * `wind`/`terrain`/`rng` fields would repeat exactly that. Later plans add a
 * field when they have a consumer for it.
 */
export interface SimContext {
  /** Seconds this step advances. Always `DT` in production; tests vary it. */
  readonly dt: number
  /** Monotonic simulation tick this step produces. Starts at 0. */
  readonly tick: number
}

/**
 * The most steps one `advance` call may run.
 *
 * Without a cap, a frame that runs long owes more steps next frame, which makes
 * that frame longer still: the accumulator grows without bound and the game
 * locks up. Five steps is 83 ms of simulated time, comfortably more than any
 * healthy frame and far short of a freeze.
 */
export const MAX_STEPS_PER_FRAME = 5

/**
 * Tolerance, in steps, when counting whole steps owed. Half a step banked
 * plus half a step fed sums to 0.9999999999999998 steps in IEEE doubles
 * (measured 2026-09-12, Node 22), and a bare floor would owe zero and carry
 * a whole step of debt into the next frame. A millionth of a step is far
 * below anything a frame delta resolves and far above the rounding error.
 */
const STEP_EPSILON = 1e-6

/**
 * The most one call's `elapsedSeconds` is allowed to bank, seconds.
 *
 * A tab suspend or a debugger pause can hand `advance` an enormous delta.
 * Without this, an enormous-but-finite `elapsedSeconds` (e.g.
 * `Number.MAX_VALUE`) survives into `banked / DT`, which can itself overflow
 * to `Infinity` (measured 2026-09-12, Node 22). That poisons everything
 * downstream: `owed` becomes non-finite, `alpha` can come back `Infinity`
 * instead of in `[0, 1)`, and `accumulatorSeconds` can come back outside its
 * documented `[0, DT)` range and ride, poisoned, into every later `advance`
 * call on that world. Guarding at the input rather than clamping `owed`
 * afterward keeps every downstream field consistent by construction, rather
 * than requiring a second special case for each one individually.
 *
 * 60 seconds is comfortably beyond any real animation-frame stall (a tab
 * backgrounded for a few seconds, a GC pause, a debugger break) while being
 * astronomically far from where division by DT could overflow -- at this
 * bound, `banked / DT` is at most ~3600, nowhere near a double's range.
 * `MAX_STEPS_PER_FRAME` discards the excess regardless of how the input is
 * bounded, so this constant only decides how large `droppedSteps` can
 * honestly get for a delta that long, not whether the cap fires.
 */
const MAX_ELAPSED_SECONDS = 60

/** The function that integrates one tick: `step` in production, `stepChecked`
 *  in development builds. Chosen by the caller, so `sim/` carries no build flag. */
export type Stepper = typeof step

export interface World {
  /** The aeroplane's coefficient set. Here, not in `advance`'s parameter
   *  list: the design has later plans add fields to World precisely so
   *  that `advance`'s signature never grows. */
  readonly spec: AircraftSpec
  readonly aircraft: AircraftState
  /** The tick before `aircraft`. Equal to it until the first step runs. */
  readonly previous: AircraftState
  /** Unspent time, always in [0, DT). */
  readonly accumulatorSeconds: number
}

export interface AdvanceResult {
  readonly world: World
  /** Whole steps actually run, 0..MAX_STEPS_PER_FRAME. */
  readonly stepsRun: number
  /**
   * Steps owed but discarded to break a spiral. Non-zero means simulated time
   * was skipped, so this session is NOT reproducible from (seed, input log) --
   * master spec §3's replay guarantee. A replay asserts this stayed zero.
   */
  readonly droppedSteps: number
  /** Remainder as a fraction of a step: the renderer's interpolation factor. */
  readonly alpha: number
}

export const createWorld = (spec: AircraftSpec, aircraft: AircraftState): World => ({
  spec,
  aircraft,
  previous: aircraft,
  accumulatorSeconds: 0,
})

export function advance(
  world: World,
  controls: Controls,
  elapsedSeconds: number,
  stepper: Stepper = step,
): AdvanceResult {
  // A tab suspend, a debugger pause or a clock adjustment can hand us a delta
  // that is negative or not a number; banking either would poison the
  // accumulator permanently, so those are dropped here. A delta that is
  // positive and finite but enormous is instead clamped to
  // MAX_ELAPSED_SECONDS -- see that constant for why clamping the input,
  // rather than anything computed from it, is what keeps `owed`, `alpha`
  // and `accumulatorSeconds` all well-formed together.
  const elapsed =
    Number.isFinite(elapsedSeconds) && elapsedSeconds > 0
      ? Math.min(elapsedSeconds, MAX_ELAPSED_SECONDS)
      : 0

  let banked = world.accumulatorSeconds + elapsed
  const owed = Math.floor(banked / DT + STEP_EPSILON)
  const stepsRun = Math.min(owed, MAX_STEPS_PER_FRAME)
  const droppedSteps = owed - stepsRun

  let current = world.aircraft
  let previous = world.previous
  for (let i = 0; i < stepsRun; i++) {
    previous = current
    current = stepper(world.spec, current, controls, { dt: DT, tick: current.tick + 1 })
  }

  // Discarded steps have their time discarded with them; otherwise the debt
  // survives into the next call and the cap achieves nothing.
  banked -= owed * DT
  if (banked < 0) banked = 0 // the epsilon can leave a rounding-sized negative

  return {
    world: { spec: world.spec, aircraft: current, previous, accumulatorSeconds: banked },
    stepsRun,
    droppedSteps,
    alpha: banked / DT,
  }
}
