import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { DT, step } from './flight/model.js'
import { heightAt, type TerrainField } from './world/terrain.js'
import type { Vec3 } from './math/vec3.js'
import { surfaceAt, contactOutcome, type ContactSurface, type ContactKind } from './contact.js'

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

/**
 * The function that turns the pilot's raw command into what the stepper
 * actually integrates, run once per fixed STEP inside `advance`'s loop below.
 *
 * Plan 3's assists layer (`src/assists/index.ts`'s `applyAssists`) implements
 * this signature, but `sim/` deliberately does not import it: `assists/`
 * depends on `sim/`'s types, and importing it back here would invert that
 * direction and put an assist's tuning inside the layer the master spec
 * requires to stay pure physics (spec §3; whole-branch review precedent --
 * `Stepper` above already establishes "the caller injects the function"
 * as this codebase's way of extending a fixed-step call without sim/
 * depending on whoever wrote the extension). The caller closes over whatever
 * `AssistSettings` it wants and hands `advance` a plain four-argument
 * function; `sim/` only ever sees this shape.
 *
 * Takes `state`, not the World: `applyAssists`'s `state` parameter is the
 * aircraft AT THE START of the step being computed, which inside the loop is
 * `current`, not `world.aircraft` (those differ from the second step of a
 * multi-step frame onward). `raw` is `world.controls`, held constant for
 * every step in one `advance` call, and `dt` is always `DT` here -- an assist
 * that needs to know how much time actually passed must be able to answer
 * that without depending on frame rate (open item 5's whole complaint), and
 * the fixed step is the only quantity in this loop that is not.
 *
 * An assist may need to REMEMBER something across steps -- altitude hold's
 * captured altitude is the first, and "the altitude at some past tick" appears
 * in no other argument here. So the assist is a reducer rather than a plain
 * function: memory in, `{ controls, memory }` out, with the advanced memory
 * stored back into the returned `World`. `M` is a type parameter and `sim/`
 * never looks inside it, which is what lets the memory live in `World` without
 * `sim/` learning anything about assists (spec §3's boundary, and the reason
 * `assists/` can keep importing `sim/` rather than the reverse).
 *
 * Threading it, rather than letting the assist keep a closure over a mutable
 * local (which is what Plan 3 shipped), buys two things a closure cannot:
 *  - a `World` is now a COMPLETE description of the flight. Serialise it,
 *    rebuild it, carry on, and the trajectory is identical -- which a closure
 *    breaks silently, because the captured altitude is not in the object being
 *    saved. `tests/assists/worldMemory.test.ts` measures both halves.
 *  - N airplanes get N memories by construction rather than by every caller
 *    remembering to build one runner each (the combat plan).
 */
export type Assist<M> = (
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  memory: M,
) => AssistResult<M>

/** What an `Assist` hands back: what to fly this step, and what to remember
 *  for the next one. */
export interface AssistResult<M> {
  readonly controls: Controls
  readonly memory: M
}

/** No-op default: hands the stepper exactly what the pilot commanded and
 *  remembers exactly what it was told, so every existing call site and test
 *  that predates Plan 3 is unaffected. */
const identityAssist = <M>(
  _state: AircraftState,
  _spec: AircraftSpec,
  raw: Controls,
  _dt: number,
  memory: M,
): AssistResult<M> => ({ controls: raw, memory })

/**
 * Recorded once, on the first step where the airplane is at or below the
 * ground under it, and never cleared on later steps. `advance` applies no
 * bounce and no rest dynamics to the airplane's position or velocity once
 * this is set -- but it DOES end the flight: the step loop below breaks as
 * soon as this is assigned, and the early return at the top of `advance`
 * means no world that already carries one ever runs another step. `surface`
 * and `kind` below are what Plan 10 adds on top of that stop.
 */
export type Impact = {
  /** `SimContext.tick` of the step that first satisfied the impact test. */
  readonly tick: number
  /** The airplane's position on that step, world metres, +Y up. */
  readonly position: Vec3
  /** `velocity.y` on that step -- negative for a normal descent into terrain,
   *  but not asserted to be: an airplane can be at or below the ground with
   *  a non-negative vertical speed (e.g. it spawned there), and recording the
   *  true value rather than clamping it is what lets a caller tell the two
   *  cases apart later. */
  readonly verticalSpeedMps: number
  /** `heightAt(terrain, position.x, position.z)` at the moment of impact --
   *  captured rather than left for the caller to recompute, since a later
   *  step's ground height at the SAME (x, z) can differ once the airplane
   *  has moved on (a later task's field, not this one's, could even swap the
   *  field itself). */
  readonly groundHeightM: number
  /** Which surface this was, from `groundHeightM` — see `surfaceAt`. */
  readonly surface: ContactSurface
  /** Whether the airplane survived it. Land is always `'destroyed'`: there is
   *  no landing gear yet. See `contactOutcome`. */
  readonly kind: ContactKind
}

export interface World<M = undefined> {
  /** The airplane's coefficient set. Here, not in `advance`'s parameter
   *  list: the design has later plans add fields to World precisely so
   *  that `advance`'s signature never grows. */
  readonly spec: AircraftSpec
  readonly aircraft: AircraftState
  /** The tick before `aircraft`. Equal to it until the first step runs. */
  readonly previous: AircraftState
  /**
   * What the pilot is commanding, held for every step this `advance` runs.
   *
   * Here for the same reason `spec` is, and moved here (whole-branch review,
   * finding I-5) from `advance`'s parameter list, where it was the one
   * remaining counterexample to the rule above. The combat plan's N-entity AI is
   * exactly the change `SimContext` was introduced to avoid having to make at
   * every call site, and it would have hit this parameter; it is ten lines to
   * move now and a rewrite afterwards. The caller sets it by rebuilding the
   * world (see `nextFrameState` in src/render/frame.ts), which keeps `World`
   * immutable and `advance` a pure function of one object.
   *
   * Deliberately still ONE control vector for ONE airplane: generalising
   * `World` to N entities belongs to the combat plan, not this branch.
   */
  readonly controls: Controls
  /**
   * Whatever the injected `Assist` asked to remember, as of the last fixed
   * step run. `sim/` treats this as opaque -- it is carried from step to step
   * and stored back here, never read.
   *
   * In `World` rather than in a closure the caller holds (Plan 3's shape,
   * replaced here) so that this object is the WHOLE flight: a world written
   * to disk and read back flies on identically, where a closure's contents
   * would be silently missing from the save. It also settles the combat plan in
   * advance -- N airplanes are N worlds, or N entity records, each with its
   * own memory field, so two airplanes cannot share one captured altitude
   * even if they share an assist function.
   *
   * "Written to disk and read back" means under a serialiser that preserves
   * this object's actual runtime types, not any serialiser -- `World.terrain`
   * (below) is the field that makes the difference concrete: its
   * `heightsDm` is an `Int16Array`, which `structuredClone` reproduces
   * exactly (verified by `tests/sim/loop.test.ts`'s "survives
   * structuredClone" test -- the same algorithm IndexedDB and `postMessage`
   * use per spec, though nothing here exercises those two). Plain
   * `JSON.stringify`/`JSON.parse` does not: a typed array survives JSON only
   * as an object of numeric-string keys, which fails `instanceof Int16Array`
   * and has no `.length`, so `createTerrainField`'s own validation would
   * reject it on read-back.
   *
   * `undefined` for a world flown with no assist, which is what the default
   * type parameter says.
   */
  readonly assistMemory: M
  /**
   * The ground this world's airplane can hit, or `null` for "no terrain
   * loaded". `sim/` may not import `tools/terrain/load.ts` (Node-only, and a
   * `src/sim/` file must load in a browser -- `.dependency-cruiser.cjs`,
   * `tests/architecture/boundary.test.ts`), so this arrives the same way
   * `Assist` does: the caller injects the value, `sim/` never learns where it
   * came from. `null` here on purpose -- Task 8 puts the FIELD on `World` and
   * the impact CHECK in `advance`; nothing populates a real field yet, which
   * is a later task's job (wiring the renderer). Every existing world and the
   * whole pre-Task-8 test suite, including the golden trajectory, is
   * unaffected: `heightAt` is never called when this is `null`.
   *
   * Carries an `Int16Array` (`TerrainField.heightsDm`), which is exactly the
   * case `assistMemory`'s comment above now qualifies: this field round-trips
   * under `structuredClone` but not under `JSON.stringify`/`JSON.parse` --
   * see that comment for why, and `tests/sim/loop.test.ts` for the pinned
   * assertion.
   */
  readonly terrain: TerrainField | null
  /**
   * Set once `advance` finds the airplane at or below `terrain`'s height
   * under it, and never overwritten afterward -- seeded from `world.impact`
   * at the top of `advance`.
   *
   * In `World`, not a value `advance` merely returns alongside it, for the
   * same completeness reason `assistMemory` is here rather than in a
   * caller's closure (see that field's comment): a world written to disk and
   * read back must still remember that this flight already crashed, not
   * silently re-open the possibility of a second "first" impact.
   */
  readonly impact: Impact | null
  /** Unspent time, always in [0, DT). */
  readonly accumulatorSeconds: number
}

export interface AdvanceResult<M = undefined> {
  readonly world: World<M>
  /** Whole steps actually run, 0..MAX_STEPS_PER_FRAME. */
  readonly stepsRun: number
  /**
   * Steps owed but discarded to break a spiral. Non-zero means simulated time
   * was skipped, so this session is definitely NOT reproducible from
   * (seed, input log) -- master spec §3's replay guarantee.
   *
   * Zero does NOT currently mean the converse (whole-branch review, I-5's
   * sibling I-4; corrected 2026-09-13). It says the fixed-step integrator ran
   * every tick it was owed, and that much is true. But the CONTROLS fed to
   * those ticks are ramped at frame rate, not at DT: `nextFrameState` calls
   * `controlsFromKeys(pressed, elapsedSeconds, prev.controls)` with the
   * animation-frame delta, and that function integrates toward the target over
   * `RAMP_SECONDS`. So 60 Hz and 144 Hz replaying the same key log reach
   * different deflections at the same tick, and diverge, with `droppedSteps`
   * zero throughout.
   *
   * Ruling R18 fixed this comment and deliberately did NOT move the ramp inside
   * the fixed step: that changes control feel, and nobody has flown this yet.
   * The architectural half is an open item in the design doc. It gets harder
   * every plan; no plan uses replay yet.
   */
  readonly droppedSteps: number
  /** Remainder as a fraction of a step: the renderer's interpolation factor. */
  readonly alpha: number
}

/** Overloaded rather than given a defaulted generic parameter: `assistMemory`
 *  has no sensible value to invent for an arbitrary `M`, and writing one
 *  (`undefined as M`) would be a lie the type system then believes. Omitting
 *  it says exactly what it means -- this world is flown with no assist, so
 *  there is nothing to remember. */
export function createWorld(
  spec: AircraftSpec,
  aircraft: AircraftState,
  controls: Controls,
): World<undefined>
export function createWorld<M>(
  spec: AircraftSpec,
  aircraft: AircraftState,
  controls: Controls,
  assistMemory: M,
): World<M>
export function createWorld<M>(
  spec: AircraftSpec,
  aircraft: AircraftState,
  controls: Controls,
  assistMemory?: M,
): World<M | undefined> {
  return {
    spec,
    aircraft,
    previous: aircraft,
    controls,
    assistMemory,
    terrain: null,
    impact: null,
    accumulatorSeconds: 0,
  }
}

export function advance<M>(
  world: World<M>,
  elapsedSeconds: number,
  stepper: Stepper = step,
  assist: Assist<M> = identityAssist,
): AdvanceResult<M> {
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

  // The flight is over: no further simulated time is owed, so `advance`
  // returns the world unchanged and runs no steps. That is not the same as
  // saying nothing about the world can change again -- the caller
  // (`nextFrameState` in src/render/frame.ts) still rebuilds `world` with
  // fresh `controls` every frame and calls `advance` again on that, so
  // `world.controls` keeps changing after the freeze even though `aircraft`,
  // `impact` and `accumulatorSeconds` do not. Returning here rather than
  // letting the loop below run zero times keeps `accumulatorSeconds` exactly
  // as the ending frame left it, so a frozen world handed a thousand frames
  // is bit-identical to one handed a single frame.
  if (world.impact !== null) {
    return { world, stepsRun: 0, droppedSteps: 0, alpha: world.accumulatorSeconds / DT }
  }

  let banked = world.accumulatorSeconds + elapsed
  const owed = Math.floor(banked / DT + STEP_EPSILON)
  const owedSteps = Math.min(owed, MAX_STEPS_PER_FRAME)
  const droppedSteps = owed - owedSteps

  let current = world.aircraft
  let previous = world.previous
  // Advanced once per step alongside `current`, for the same reason the assist
  // itself runs in here: a memory that reacted to `world.aircraft` would be
  // reading a state from the start of the frame, which is stale from the
  // second step onward. Never written back into `world` -- `advance` is pure
  // and its purity is asserted by a deep-frozen world in tests/sim/loop.test.ts.
  let assistMemory = world.assistMemory
  // Seeded from the incoming world, not `null`: an impact already recorded on
  // an earlier `advance` call must survive this one (`World.impact`'s "never
  // overwritten afterward"). Read once, here, rather than through
  // `world.impact` inside the loop below, so the loop's own "impact === null"
  // check is testing this call's progress and not silently re-reading a
  // field that never changes underneath it.
  let impact: Impact | null = world.impact
  // Steps actually executed, as opposed to `owedSteps` above -- the two
  // diverge exactly when the break below fires partway through the loop, and
  // `AdvanceResult.stepsRun` documents itself as steps run, not steps owed.
  let ran = 0
  for (let i = 0; i < owedSteps; i++) {
    previous = current
    // `assist` runs once per fixed STEP, here, and BEFORE `stepper` -- not
    // once per `advance` call and not on `world.controls` directly. Hoisting
    // it above this loop would run it once per frame instead of once per
    // step, at the frame's dt rather than DT, reproducing exactly the
    // frame-rate dependence `AdvanceResult.droppedSteps`'s doc already flags
    // as open item 5's defect for the input ramp. Running it inside means an
    // assist reacting to the airplane's stall margin sees the STATE that
    // margin actually applied to on this tick (`current`, not `world.aircraft`,
    // which is stale from the second step of a multi-step frame onward).
    const assisted = assist(current, world.spec, world.controls, DT, assistMemory)
    assistMemory = assisted.memory
    current = stepper(world.spec, current, assisted.controls, { dt: DT, tick: current.tick + 1 })
    ran++

    // Checked after EVERY step in a multi-step frame, not just the loop's
    // last iteration -- a frame that owes several steps (a stalled tab,
    // `MAX_STEPS_PER_FRAME` up to 5) can cross the ground partway through,
    // and checking only the final `current` would silently skip that tick's
    // impact, moving `impact.tick` and `impact.position` to a later,
    // already-through-the-ground state. `terrain !== null` short-circuits the
    // `heightAt` call entirely on the (overwhelmingly common, pre-Task-8)
    // no-terrain path, and `impact === null` makes the first recorded impact
    // permanent for the rest of this call, matching `World.impact`'s "never
    // overwritten afterward". `<=`, not `<`: `heightAt` is a real number for
    // any finite (x, z), including exactly on the ground, and a strict `<`
    // would let the airplane sit buried at exactly ground level forever
    // with no impact ever recorded (proved to bite in this task's commit).
    // `current.position.y` cannot be NaN here without `stepper` itself
    // already having produced one (spec §9's hazard, and this check does not
    // introduce a new path to it: a NaN position makes this comparison false
    // by IEEE 754 rules, so it is read-only and skips silently rather than
    // fabricating an impact).
    if (impact === null && world.terrain !== null) {
      const groundHeightM = heightAt(world.terrain, current.position.x, current.position.z)
      if (current.position.y <= groundHeightM) {
        const surface = surfaceAt(groundHeightM)
        impact = {
          tick: current.tick,
          position: current.position,
          verticalSpeedMps: current.velocity.y,
          groundHeightM,
          surface,
          kind: contactOutcome(world.spec, current, surface),
        }
        // Stop the frame here. Without this the loop runs its remaining owed
        // steps and the airplane ends up well below the ground it just hit --
        // the impact TICK would be right and the resting position wrong.
        // `previous` follows `current` so the renderer interpolates to exactly
        // the point of contact whatever `alpha` is, the same convention
        // `createWorld` uses before any step has run.
        previous = current
        break
      }
    }
  }

  // Discarded steps have their time discarded with them; otherwise the debt
  // survives into the next call and the cap achieves nothing.
  banked -= owed * DT
  if (banked < 0) banked = 0 // the epsilon can leave a rounding-sized negative

  return {
    world: {
      spec: world.spec,
      aircraft: current,
      previous,
      controls: world.controls,
      assistMemory,
      terrain: world.terrain,
      impact,
      accumulatorSeconds: banked,
    },
    stepsRun: ran,
    droppedSteps,
    alpha: banked / DT,
  }
}
