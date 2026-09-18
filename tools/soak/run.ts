import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import {
  angleOfAttack,
  clampFinite,
  createState,
  DT,
  isStalled,
  type AircraftState,
  type Controls,
} from '../../src/sim/flight/model.js'
import { isIdleThrottle, specificEnergyAirmass, stepChecked } from '../../src/sim/invariants.js'
import { createRng } from '../../src/sim/rng.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import {
  applyAssistsWithAuthority,
  assistFor,
  type AssistSettings,
} from '../../src/assists/index.js'
import { advance, createWorld, playerAircraft, withControls } from '../../src/sim/loop.js'
import { heightAt, type TerrainField } from '../../src/sim/world/terrain.js'
import { surfaceAt } from '../../src/sim/contact.js'
import { GROUND_CONTACT_TOLERANCE_M, supportedContact } from '../../src/sim/ground.js'

export type SoakResult = {
  failures: string[]
  iterations: number
  /** Total physics steps executed across every iteration (each `stepChecked` call). */
  steps: number
  /** Iterations that ran all 60 simulated seconds without hitting the water. */
  flightsCompleted: number
  /** Steps at which `isStalled` was true -- a behavioural floor so the soak
   *  cannot silently stop exploring the stall regime and still pass. */
  stalledSteps: number
  /** Steps where the assist stack moved the PITCH axis away from the pilot's
   *  own (legal) command -- i.e. where the stall limiter or altitude hold
   *  actually voted. A behavioural floor of the same kind as `stalledSteps`:
   *  without it the assisted arm would still pass with both pitch stages
   *  silently standing down. Measured against the pilot's command CLAMPED into
   *  [-1, 1], so `runStack`'s sanitising of an illegal input is not miscounted
   *  as an assist deciding something. Always 0 on the unassisted arm. */
  assistPitchInterventions: number
    /** Steps where the stack moved the YAW axis, i.e. where auto-rudder voted.
   *  Separate from the pitch count on purpose: auto-rudder corrects on almost
   *  every step (any sideslip at all produces a correction), so a single
   *  combined counter would sit at 100% of steps and could not detect the two
   *  pitch stages going quiet. Always 0 on the unassisted arm. */
  assistYawInterventions: number
}

/** Non-finite and finite-but-out-of-range values injected onto a single
 *  control channel roughly 2% of seconds (Important 11a): these are the
 *  values `clampFinite`'s NaN -> 0 mapping and its [-1,1]/[0,1] clamp exist
 *  to handle (a malformed input event, a bad replay file, ...), and without
 *  this the soak's ordinary draws -- always finite and in-range -- never
 *  reach that code path at all. */
const CHAOTIC_VALUES = [NaN, Infinity, -Infinity, 5, -5] as const

/** How often the assisted arm releases the pitch stick -- see `rollControls`.
 *  A quarter of seconds: high enough that a 60-second flight releases the stick
 *  roughly 15 times, which is what gives altitude hold something to capture and
 *  then fly back to, and low enough that the arm is still mostly manoeuvring. */
const CENTRED_PITCH_CHANCE = 0.25

/**
 * `centredPitchChance` is the fraction of simulated seconds on which the pilot
 * RELEASES the stick -- `pitch` exactly 0, not merely small.
 *
 * It exists because altitude hold's gate is `raw.pitch === 0` (deliberately: a
 * released key ramps to literal 0 in `src/input/keyboard.ts`, see
 * `isPitchCentred`), and a draw from a continuous range never produces one. So
 * with a continuous pitch draw the assisted arm exercised the stall limiter and
 * auto-rudder and NEVER ONCE engaged altitude hold -- measured 2026-09-13, 0 of
 * 550,320 steps. Same shape as the pre-existing `throttle: rng() < 0.2 ? 0 :
 * rng()` above, which forces an exact 0 for the same reason: the interesting
 * branch is at the endpoint, and a continuous draw misses endpoints.
 *
 * `0` on the unassisted arm, and the `> 0` guard SHORT-CIRCUITS so no rng draw
 * is consumed there -- which is what keeps that arm's numbers bit-identical to
 * before this parameter existed (587,040 steps / 99 completions / 46,086
 * stalled steps at seed 1337 x 200, re-measured 2026-09-13 before and after
 * this change). The two arms therefore sample slightly different input
 * distributions, which costs nothing that was ever claimed: they are not
 * comparable flight for flight anyway, because the assists change the
 * trajectory and hence which flights hit the water.
 */
function rollControls(rng: () => number, centredPitchChance: number): Controls {
  const base: Controls = {
    pitch: centredPitchChance > 0 && rng() < centredPitchChance ? 0 : (rng() - 0.5) * 2,
    roll: (rng() - 0.5) * 2,
    yaw: (rng() - 0.5) * 2,
    // Forced to 0 on 20% of seconds, to explore idle-throttle glides -- the
    // one case the energy invariant actually checks -- otherwise drawn from
    // the full [0, 1] range. This branch consumes one rng() draw or two,
    // which is exactly why a failing iteration cannot be replayed by seed
    // and iteration count alone -- see the replay note below.
    throttle: rng() < 0.2 ? 0 : rng(),
  }
  if (rng() < 0.02) {
    const chaotic = CHAOTIC_VALUES[Math.floor(rng() * CHAOTIC_VALUES.length)]!
    switch (Math.floor(rng() * 4)) {
      case 0:
        return { ...base, pitch: chaotic }
      case 1:
        return { ...base, roll: chaotic }
      case 2:
        return { ...base, yaw: chaotic }
      default:
        return { ...base, throttle: chaotic }
    }
  }
  return base
}

/** Random unit attitude (Important 11b): spawn attitude was always
 *  `qIdentity()` before this change, so the soak never exercised a departure
 *  from wings-level, upright spawn -- an arbitrary axis and angle covers the
 *  same attitude sphere the golden trajectory (`tools/golden/record.ts`)
 *  exercises via its rolling manoeuvre, but starting from anywhere on it
 *  rather than always from identity. */
function randomAttitude(rng: () => number) {
  const axis = v3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
  const angle = rng() * 2 * Math.PI
  return qFromAxisAngle(axis, angle)
}

/** Channel-by-channel equality with `Object.is`, so a NaN pitch counts as equal
 *  to a NaN pitch: this is used to decide whether the assist stack CHANGED the
 *  pilot's command, and `NaN !== NaN` would report a change the stack did not
 *  make. */
function sameControls(a: Controls, b: Controls): boolean {
  return (
    Object.is(a.pitch, b.pitch) &&
    Object.is(a.roll, b.roll) &&
    Object.is(a.yaw, b.yaw) &&
    Object.is(a.throttle, b.throttle)
  )
}

/**
 * The pitch-authority invariant, checked on every step of the assisted arm --
 * the same claim `tests/assists/authoritySweep.test.ts` sweeps over constructed
 * states, checked here over states 60 Hz of `step()` actually produced. Neither
 * subsumes the other: the sweep can put the airplane anywhere, including
 * places the flight model never reaches, while this only ever sees reachable
 * states but reaches them through minutes of real integration with the memory
 * threaded the way production threads it.
 *
 * Throws rather than returning a failure string so it lands in the same
 * per-iteration `catch` as an invariant trip, and inherits its replay recipe --
 * one message per flight rather than one per step, which is what makes a
 * genuine breach readable instead of 3,600 copies of itself.
 *
 * The budget is recovered by re-running the stack with the memory the assist
 * has just advanced and used (`assistFor` advances it and then calls
 * `applyAssists` with it, in that order), so this is the same
 * evaluation and not an approximation of it. That is asserted rather than
 * assumed: if the reconstructed command differs from the one actually flown,
 * this throws on that instead, and every claim below would be about the wrong
 * call.
 */
function assertAuthorityHolds(
  spec: AircraftSpec,
  state: AircraftState,
  raw: Controls,
  flown: Controls,
  assists: AssistSettings,
): void {
  const { controls, pitchAuthority: a } = applyAssistsWithAuthority(state, spec, raw, DT, assists)
  if (!sameControls(controls, flown)) {
    throw new Error(
      `assist budget could not be recovered: reconstruction ${JSON.stringify(controls)} ` +
        `is not the flown ${JSON.stringify(flown)}`,
    )
  }
  const bad =
    !(a.lower <= a.upper) ||
    a.lower < -1 ||
    a.upper > 1 ||
    !(flown.pitch >= a.lower && flown.pitch <= a.upper)
  if (bad) {
    throw new Error(
      `assist pitch authority violated: commanded ${flown.pitch} against ${JSON.stringify(a)} ` +
        `from raw ${JSON.stringify(raw)}`,
    )
  }
  // Past 90 degrees of alpha the budget must be the pilot's own command and
  // nothing wider -- the clause the third Critical broke, which the clause
  // above cannot see (a budget of [-1, 1] contains every legal command, so
  // "inside the budget" stays true while the claim itself has gone slack).
  // Same predicate as `src/assists/index.ts`'s `isDeparted`, negated the same
  // way so a NaN alpha counts as departed.
  const legalPitch = clampFinite(raw.pitch, -1, 1)
  if (!(Math.abs(angleOfAttack(state)) < Math.PI / 2) && !(a.lower === legalPitch && a.upper === legalPitch)) {
    throw new Error(
      `departed budget ${JSON.stringify(a)} is not the pilot's own ${legalPitch} at alpha ` +
        `${((angleOfAttack(state) * 180) / Math.PI).toFixed(2)} deg`,
    )
  }
}

/**
 * Randomized soak: throws the airplane around with violent, rapidly-changing
 * control input across the full flight envelope this content file declares
 * (altitude 200 m-9,200 m, speed 30-230 m/s, an initial climb/sink rate up to
 * +-20 m/s and an initial sideslip up to +-20 m/s, and now a random spawn
 * attitude -- Important 11b), and asserts via `stepChecked` that no state
 * ever goes non-finite and that the airmass-frame energy invariant never
 * fires. `stepChecked` is used deliberately rather than the bare `step` --
 * the whole point of this harness is to catch what the invariants catch
 * (Ruling R5: they are not weakened, bypassed or avoided here, and a trip is
 * a finding to report, not a state to steer around).
 *
 * Ruling R8: the outer loop is 60 iterations (one simulated second each), not
 * the brief's `60 * 60` -- that was a transcription error that would have run
 * 43.2M steps per flight (2,160M total) and blown the 30s vitest default
 * timeout by orders of magnitude. 60 outer iterations x 60 inner steps gives
 * 3,600 steps (one minute of simulated flight) per airplane, 720,000 steps
 * total across 200 iterations, before any early water landings.
 *
 * Ruling R29: no wind is passed to `stepChecked` -- it takes no wind
 * parameter, `step()` does not consume wind (a later plan's work), and the
 * energy invariant asserts against still air. The brief's wind vector is
 * dropped entirely, not merely zeroed, so there is nothing here that would
 * silently stop typechecking once wind lands in a later plan.
 *
 * Control inputs are re-rolled every simulated second across the full
 * [-1, 1] range on pitch/roll/yaw (with the chaotic-channel injection above
 * on ~2% of seconds), and throttle is either forced to 0 (20% of seconds) or
 * drawn from the full [0, 1] range otherwise. Reported failures name the
 * iteration, seed-derived spawn altitude and speed, and the underlying
 * invariant's message, plus a working replay recipe (Important 11c):
 * `runSoak(spec, iterations, seed)` is a pure function of its seed (verified
 * by the "reproducible from its seed" test), but the RNG is shared across
 * iterations and the number of draws a single iteration consumes varies (the
 * `throttle: rng() < 0.2 ? 0 : rng()` branch above draws one value or two,
 * the chaotic-injection check draws one value for its own 2% gate and, only
 * when that gate fires, two more (the chaotic value and the channel
 * selector) for three total, and an early water hit truncates a flight's
 * draws entirely) -- so iteration N cannot be replayed
 * in isolation with a fresh `createRng(seed)` at iteration 0. The only
 * faithful replay is to run every iteration up to and including the failing
 * one from the same seed, i.e. `runSoak(spec, N + 1, seed)`, then inspect
 * iteration N (the last one run).
 *
 * THE ASSISTS ARM (`assists`, default `null`). Passing an `AssistSettings`
 * runs the identical harness with the assist stack in front of `stepChecked`,
 * once per step, through `assistFor` -- the same pairing production
 * uses (`src/render/frame.ts` -> `advance` -> the injected assist). Without it
 * the shipped default configuration, three interacting stages all switched on,
 * had no randomised long-horizon coverage at all: every assist test flies one
 * hand-picked trajectory, and this harness drove the model with no assist.
 *
 * Why a parameter here rather than a second harness or a helper in the test.
 * `tools/` is not `sim/`, so the `sim-must-not-import-assists` rule (named, and
 * probed in tests/architecture/boundary.test.ts) does not apply to this file --
 * it already imports `src/sim` and the content loader, and it is the stand-in
 * for the call chain the renderer builds. A second `runAssistedSoak` would have
 * to copy the 60x60 loop, the water check, the chaotic injection and the replay
 * machinery, and the two copies would drift apart on the first change to the
 * input distribution; putting the loop in the test file would do the same with
 * less review. One loop, one input distribution, one difference between the
 * arms: whether the command goes through the stack.
 *
 * The arms are NOT comparable flight for flight, and that is expected rather
 * than a limitation to work around: the assists change the trajectory, so a
 * flight that hits the water in one arm survives in the other, which changes
 * how many rng draws each iteration consumes. Each arm therefore has its own
 * measured floors (see tests/sim/soak.test.ts), and the unassisted arm's
 * numbers are byte-identical to before this parameter existed -- no assist is
 * constructed and no extra rng draw is taken on that path.
 *
 * The chaotic injections (NaN, +-Infinity, +-5) reach the STACK on this arm
 * instead of reaching `step` raw, and the stack sanitises the pitch channel
 * (see `runStack`), which is the point: that clamp is production code on the
 * production path and this is the only randomised test that exercises it.
 *
 * The water check (`position.y <= 0`) runs once per simulated second, not
 * once per physics step, so a flight can descend well past sea level within
 * that second before the break fires (a measured example reached -208 m).
 * `densityAt` is then evaluated at a negative altitude for the remaining
 * steps of that second -- this is harmless (still finite, just unphysical
 * for those few steps) and arguably useful robustness exploration in its own
 * right, not a bug to fix.
 */
export function runSoak(
  spec: AircraftSpec,
  iterations: number,
  seed: number,
  assists: AssistSettings | null = null,
): SoakResult {
  const rng = createRng(seed)
  const failures: string[] = []
  let steps = 0
  let flightsCompleted = 0
  let stalledSteps = 0
  let assistPitchInterventions = 0
  let assistYawInterventions = 0

  for (let n = 0; n < iterations; n++) {
    const altitude = 200 + rng() * 9000
    const speed = 30 + rng() * 200
    let s = createState({
      position: v3(0, altitude, 0),
      velocity: v3(speed, (rng() - 0.5) * 40, (rng() - 0.5) * 40),
      attitude: randomAttitude(rng),
      fuelKg: rng() * spec.mass.fuelCapacityKg,
    })

    try {
      let completedFull = true
      // The MEMORY is per flight, which is what matters and is now structural:
      // a captured altitude belongs to one airplane, so carrying one across
      // 200 spawns would drag a held altitude out of a dead flight into a
      // fresh one. The assist FUNCTION itself is stateless and could be built
      // once for the whole soak; it is built here only to keep the two
      // lifetimes visibly together. Null on the unassisted arm, which is the
      // pre-existing behaviour byte for byte -- no assist is constructed and
      // the raw command goes straight to `stepChecked`.
      const assist = assists === null ? null : assistFor(assists)
      // `undefined`: altitude hold was the only assist with memory and was
      // deleted 2026-09-17, so `Assist<M>` is instantiated with nothing.
      let assistMemory: undefined = undefined
      // Run-scoped to the whole flight, not the per-second outer loop below:
      // SimContext.tick's contract (src/sim/loop.ts) is monotonic for the
      // whole run it belongs to, and a flight -- from this spawn to this
      // water hit or timeout -- is that run. See Task 1 fix round 1.
      let flightTick = 0
      for (let second = 0; second < 60; second++) {
        const controls = rollControls(rng, assists === null ? 0 : CENTRED_PITCH_CHANCE)
        for (let i = 0; i < 60; i++) {
          flightTick++
          let flown = controls
          if (assist !== null && assists !== null) {
            const assisted = assist(s, spec, controls, DT, assistMemory)
            flown = assisted.controls
            // Taken from the RESULT, which is the memory the stack just ran
            // with -- not the one going in, which is a step behind.
            assistMemory = assisted.memory
            if (!Object.is(flown.pitch, clampFinite(controls.pitch, -1, 1))) assistPitchInterventions++
            if (!Object.is(flown.yaw, controls.yaw)) assistYawInterventions++
            assertAuthorityHolds(spec, s, controls, flown, assists)
          }
          s = stepChecked(spec, s, flown, { dt: DT, tick: flightTick })
          steps++
          if (isStalled(spec, s)) stalledSteps++
        }
        if (s.position.y <= 0) {
          completedFull = false
          break // hit the water; that is a crash, not a bug
        }
      }
      if (completedFull) flightsCompleted++
    } catch (err) {
      failures.push(
        `iteration ${n} (seed ${seed}, alt ${altitude.toFixed(0)} speed ${speed.toFixed(0)}): ` +
          `${(err as Error).message} -- replay with runSoak(spec, ${n + 1}, ${seed}) and inspect iteration ${n}, the last one run`,
      )
    }
  }

  return {
    failures,
    iterations,
    steps,
    flightsCompleted,
    stalledSteps,
    assistPitchInterventions,
    assistYawInterventions,
  }
}

export type TerrainSoakResult = {
  failures: string[]
  iterations: number
  steps: number
  /**
   * Flights that recorded an impact before their 60 simulated seconds ran
   * out. Reported separately from `failures` because "zero failures" is
   * ambiguous on its own: a soak that never puts an airplane within reach of
   * the ground also reports zero failures, and would keep doing so forever
   * even if the impact check were silently broken (`tests/sim/soak.test.ts`'s
   * floor on this field is what tells the two apart).
   */
  terrainHits: number
  /**
   * Ticks where the PREVIOUS tick left the airplane `supportedContact`
   * (Task 15: not merely `onGround` -- see the gate's own comment below for
   * why a position-only test stopped being a safe proxy for "was genuinely
   * resting" once the gear datum shift gave a too-fast arrival room to
   * freefall through the tolerance band without crashing) and `impact` was
   * still null -- i.e. ticks where the two Task 10 assertions below actually
   * evaluated, not merely ticks where the flight happened to be near the
   * ground. Reported for exactly the reason
   * `terrainHits` already is (see that field's own comment): "zero failures"
   * is meaningless on its own, and a soak whose new assertions never once
   * evaluate would report zero failures forever, indistinguishable from "the
   * constraint held" -- fix-round-1 review measured this at literally 0 for
   * both seed 1337 and seed 7 before the dedicated landing cohort below
   * existed, which is exactly the silent gap this field exists to make loud.
   *
   * Lower again after Task 16 (`supportedContact` also requires land -- a
   * gear-down airplane resting on open water was never a real contact): a
   * large share of this 200 km field is ocean, so a large share of what used
   * to count here no longer does, correctly. See
   * `tests/sim/soak.test.ts`'s floor on this field for the re-measured
   * counts.
   */
  supportedContactTicks: number
}

/** Same value and same purpose as `invariants.ts`'s own (unexported)
 *  `ENERGY_EPS`: floating-point slack for the "did not rise" comparison, not
 *  a physical tolerance. Kept as a separate constant rather than importing
 *  that one because it is private to that module by design (`stepChecked`'s
 *  own doc comment: the throw path is unit-tested directly with synthetic
 *  numbers there, not shared as a public tuning knob). */
const GROUND_CONTACT_ENERGY_EPS = 1e-3

/**
 * Fraction of flights that are a DELIBERATE, engineered landing: gear down,
 * spawned a couple of metres over the ground, at a sink rate and speed
 * comfortably inside `supportedContact`'s own gates (`src/sim/ground.ts`) --
 * so the flight settles onto the ground within the first second or two and
 * STAYS there for the rest of its simulated time, for the two Task 10
 * assertions below to actually exercise.
 *
 * Needed because neither of the other two cohorts reliably produces one.
 * Fix-round-1 review measured `supportedContact` holding on literally ZERO
 * of 417,539 ticks at the shipped seed 1337 (and zero at seed 7) with only
 * the `nearGround` cohort spawning gear down: that cohort's fully random
 * attitude, forward speed (30-230 m/s) and vertical rate (+-20 m/s) is far
 * more likely to crash outright -- exceeding `supportedContact`'s sink or
 * speed cap -- than to arrive gently enough to be carried. `nearGround`
 * still exists unchanged below, and still spawns gear down, but it is
 * exploring "does an arbitrary near-ground arrival get classified right",
 * not "does the resting/rolling constraint hold over time" -- this cohort is
 * for the latter.
 *
 * `randomAttitude` is still used for the spawn orientation even here:
 * `supportedContact` and `onGround` never look at attitude, only position,
 * gear, sink rate and speed, so a random 3D orientation cannot prevent this
 * cohort from registering as supported -- it just means the soak also
 * explores the model's known simplification that "supported" does not
 * require being upright (design doc §9, not solved by this plan).
 */
const LANDING_SPAWN_FRACTION = 0.1
/** Fraction of flights in the pre-existing "arbitrary near-ground arrival"
 *  cohort -- unchanged in width from before this fix round, just no longer
 *  the only gear-down cohort. See `LANDING_SPAWN_FRACTION` above for why a
 *  second, gentler cohort was added alongside it rather than in place of it. */
const NEAR_GROUND_SPAWN_FRACTION = 0.3

/**
 * Randomized soak for the master spec §11 invariant terrain contact closes:
 * "no aircraft is below terrain without a crash event" (design doc
 * `docs/superpowers/specs/2026-09-13-terrain-design.md` §5). Unlike `runSoak`
 * above, this drives flights through `advance` itself (`src/sim/loop.ts`),
 * with `world.terrain` set to the field the caller passes in -- the actual
 * production impact-detection path, not a reimplementation of it -- so what
 * this soaks is whether `advance`'s own bookkeeping holds up over thousands
 * of real, varied trajectories and real terrain samples, not just the four
 * hand-picked states `tests/sim/terrainContact.test.ts` constructs against a
 * flat synthetic plateau.
 *
 * Each flight spawns at a random (x, z) within the terrain field's extent (so
 * the soak exercises the real committed elevation data across the whole
 * field, not always the same column), in one of three cohorts drawn by
 * `LANDING_SPAWN_FRACTION` / `NEAR_GROUND_SPAWN_FRACTION` below: a small
 * ENGINEERED landing (gear down, a couple of metres up, gentle sink and
 * speed -- see that constant's own comment for why it exists), a larger
 * arbitrary near-ground arrival (gear down, within 300 m of the ground,
 * otherwise the same full-range random state as the far cohort -- so a
 * meaningful fraction are genuinely at risk of contact within the 60 s
 * flight budget, most of them fatally), and the rest in the same
 * 200-9,200 m-above-ground band `runSoak` uses above sea level, gear up, so
 * ordinary cruise over real terrain is exercised too. `rollControls` (this
 * file's existing input generator, with `centredPitchChance` 0 -- there is
 * no assist here to engage altitude hold) supplies the same violent,
 * occasionally chaotic control input `runSoak` does, re-rolled once per
 * simulated second, for every cohort once it is airborne -- including the
 * landing cohort once it has settled, so the ground constraint is exercised
 * under the same chaotic input the rest of the soak uses, not a scripted taxi.
 *
 * Per-tick, after `advance`, the invariant is checked from OUTSIDE `advance`'s
 * own state: `heightAt(terrain, ...)` is recomputed independently against the
 * position `advance` just produced, and if that says the airplane is at or
 * below the ground, the player's `impact` must already be non-null
 * (`advance` runs its own identical check first, in the same call, so a correct
 * implementation can never observe otherwise -- this is the same
 * cross-check-by-recomputation shape `assertAuthorityHolds` above uses for
 * the assist stack, not an independent oracle). A flight stops the instant it
 * has one (nothing after the first impact is this task's concern -- see
 * `Impact`'s own comment in `src/sim/loop.ts`), which is also why this
 * function takes no `assists` parameter: coverage of the assist stack over
 * long flights is `runSoak`'s job, and adding it here would only double the
 * cost of this arm for no new coverage of the terrain path.
 *
 * Plan 11a (Task 10): the player's `impact` staying `null` no longer means
 * "still airborne" -- `supportedContact` (`src/sim/ground.ts`) now lets a flight
 * legitimately arrive on its wheels and stay, without ever recording an
 * impact. Both near-ground cohorts spawn gear DOWN (`gearFraction: 1`) for
 * exactly this reason -- gear was never commanded down anywhere in this soak
 * before this task, so the "arrives and stays" path was structurally
 * unreachable -- while the far cohort keeps the pre-existing gear-up cruise
 * spawn. Every tick the PREVIOUS tick left the airplane `supportedContact`
 * (Task 15's own gate; see `TerrainSoakResult.supportedContactTicks`'s
 * comment for why a bare `onGround` stopped being enough), two more things
 * are checked, independently
 * recomputed the same way the impact cross-check above is: the constraint
 * never let the airplane sink through by more than
 * `GROUND_CONTACT_TOLERANCE_M` since that resting tick, and -- gated on idle
 * throttle, the same gate `stepChecked`'s own energy invariant uses, because
 * a rolling airplane under thrust legitimately gains energy and an ungated
 * check would fail every ordinary powered ground roll -- that airmass
 * specific energy did not rise across the step. Both are properties
 * `restOnSurface`'s own doc comment (`src/sim/ground.ts`) claims for itself;
 * this is that claim checked over thousands of real, random trajectories
 * rather than the hand-picked states `tests/sim/ground.test.ts` constructs.
 * `TerrainSoakResult.supportedContactTicks` is what proves these two
 * assertions are actually evaluating rather than sitting dead -- see that
 * field's own comment.
 */
export function runTerrainSoak(
  spec: AircraftSpec,
  iterations: number,
  seed: number,
  terrain: TerrainField,
): TerrainSoakResult {
  const rng = createRng(seed)
  const failures: string[] = []
  let steps = 0
  let terrainHits = 0
  let supportedContactTicks = 0

  for (let n = 0; n < iterations; n++) {
    const half = terrain.header.halfExtentM
    const x = (rng() * 2 - 1) * half
    const z = (rng() * 2 - 1) * half
    const groundHeightM = heightAt(terrain, x, z)
    const cohortRoll = rng()
    const landing = cohortRoll < LANDING_SPAWN_FRACTION
    const nearGround = !landing && cohortRoll < LANDING_SPAWN_FRACTION + NEAR_GROUND_SPAWN_FRACTION
    // See `LANDING_SPAWN_FRACTION`'s own comment: this cohort's altitude,
    // speed and vertical rate are all deliberately narrow and inside
    // `supportedContact`'s gates (`src/sim/ground.ts`), not a smaller version
    // of `nearGround`'s wide-open ranges below.
    // Task 15: `groundHeightM + spec.gear.heightM`, not bare `groundHeightM`,
    // is now the height a RESTING airplane's body origin (`position.y`)
    // actually sits at -- `onGround`/`restOnSurface` (src/sim/ground.ts)
    // compare the gear-offset height for contact, not the raw one. The
    // landing cohort's whole point is spawning a couple of metres over the
    // spot it is meant to settle onto (see `LANDING_SPAWN_FRACTION`'s own
    // comment), so that spot has to move with the datum or every one of
    // these spawns starts already below the new contact surface by up to
    // `spec.gear.heightM`, never getting close enough to trip
    // `supportedContact` at all.
    const altitude = landing
      ? groundHeightM + spec.gear.heightM + rng() * 2
      : nearGround
        ? groundHeightM + rng() * 300
        : groundHeightM + 200 + rng() * 9000
    const speed = landing ? spec.reference.stallSpeedMps * (1.05 + rng() * 0.35) : 30 + rng() * 200
    const velocityY = landing ? -rng() * 2 : (rng() - 0.5) * 40
    const velocityZ = landing ? (rng() - 0.5) * 4 : (rng() - 0.5) * 40

    let world = createWorld(
      spec,
      createState({
        position: v3(x, altitude, z),
        velocity: v3(speed, velocityY, velocityZ),
        attitude: randomAttitude(rng),
        fuelKg: rng() * spec.mass.fuelCapacityKg,
        // Task 10: both near-ground cohorts spawn gear down -- otherwise
        // `supportedContact` (which requires `gearFraction >=
        // GEAR_DOWN_FRACTION`) could never hold and this soak would never
        // reach the "arrives and stays" path it exists to cover. The far
        // cohort is unaffected: `createState`'s own default (gear up) is
        // unchanged for it.
        gearFraction: landing || nearGround ? 1 : 0,
      }),
      { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 },
    )
    world = { ...world, terrain }

    try {
      for (let second = 0; second < 60 && playerAircraft(world).impact === null; second++) {
        world = withControls(world, world.player, rollControls(rng, 0))
        for (let i = 0; i < 60 && playerAircraft(world).impact === null; i++) {
          world = advance(world, DT, stepChecked).world
          steps++
          // The one airplane this soak flies, re-read after every step: its
          // `state`, `previous` and `impact` are what `World` itself carried
          // before Plan 12 generalized it to N entities.
          const player = playerAircraft(world)
          const gh = heightAt(terrain, player.state.position.x, player.state.position.z)
          // Task 10: `position.y <= gh` with `impact` still null is no longer
          // proof of a missed crash by itself -- `advance`'s own impact check
          // (src/sim/loop.ts) exempts a `supportedContact` state on purpose
          // (Task 5b), because an airplane resting or rolling on its wheels
          // is meant to reach exactly `groundHeightM` and stay there without
          // ever being flagged destroyed. This narrowing is NOT a pre-existing
          // bug being fixed: with gear never commanded down anywhere in this
          // soak before this task, `position.y <= gh && impact === null` was
          // unreachable (measured 0 occurrences at seeds 1337, 4242 and 7
          // under the old gear-up-only spawns) -- the gear-down cohorts this
          // task adds are what exposed it. One real consequence of the
          // narrowing: this check can no longer catch `supportedContact`
          // itself being too permissive, since a permissive `supportedContact`
          // exempts the very state this check would otherwise have flagged --
          // exactly how the Step 2 `onGround` mutation escaped this check and
          // was only caught by the sink-through assertion below instead.
          if (player.impact === null && player.state.position.y <= gh && !supportedContact(spec, player.state, gh)) {
            failures.push(
              `iteration ${n} (seed ${seed}, spawn x ${x.toFixed(0)} z ${z.toFixed(0)} alt ${altitude.toFixed(0)}): ` +
                `tick ${world.tick} position.y ${player.state.position.y} <= groundHeightM ${gh} but impact is null ` +
                `and the contact is not a supported one`,
            )
            break
          }
          // Task 10: a crash-free airplane resting or rolling on its wheels
          // (see the doc comment above `runTerrainSoak`) is a legitimate
          // outcome now, and the ground constraint's two promises for it
          // (src/sim/ground.ts's `restOnSurface` doc comment) are checked
          // here, on every tick, not just once at the end of the flight --
          // the same "check it every tick, not just the last" posture the
          // crash check just above already takes.
          //
          // Gated on whether the PREVIOUS tick was resting (`player.previous`,
          // recomputed against the ground height under IT, not under the
          // state `advance` just produced), not on whether this tick's
          // result still is. Gating on the current tick's own position
          // instead would make the bound below tautological: reaching this
          // branch would already require the current position to be within
          // tolerance, which trivially satisfies the very inequality being
          // checked. Gating on last tick's contact means a constraint that
          // let the airplane punch through the ground is still caught even
          // though the resulting position no longer looks anything like
          // "near the ground".
          const ghPrev = heightAt(terrain, player.previous.position.x, player.previous.position.z)
          // Task 15: gated on `supportedContact`, not the bare `onGround`.
          // `onGround` alone is a POSITION-only test, which was an adequate
          // proxy for "was genuinely resting" only because the pre-Task-15
          // datum made the raw crash check (`advance`'s `position.y <=
          // groundHeightM`) co-incide almost exactly with the tolerance band
          // -- a too-fast arrival could not linger there, since one more tick
          // of freefall put the body origin AT the ground and ended the
          // flight. With `spec.gear.heightM` of clearance now between the
          // body origin and the wheels, a too-fast arrival can freefall
          // through the whole tolerance band -- and the ~2 m of gear
          // clearance beyond it -- for many ticks, repeatedly satisfying
          // `onGround` while never once being `supportedContact` (sink rate
          // far past `MAX_SUPPORTED_SINK_MPS`), with no crash yet recorded to
          // stop it. `supportedContact` is what `step()` itself gates
          // `restOnSurface` on (`src/sim/flight/model.ts`), so it is the
          // right predecessor state for THIS check's promise: if the
          // airplane was genuinely carried last tick, it should not have
          // sunk through this tick.
          if (player.impact === null && supportedContact(spec, player.previous, ghPrev)) {
            supportedContactTicks++
            // Task 15: compared against the gear-offset height, not the raw
            // one -- a resting airplane's body origin (`position.y`) sits
            // `spec.gear.heightM` above the ground now, not on it, so the
            // "did not sink through" bound has to follow that same offset or
            // it is trivially true for any position above `gh -
            // GROUND_CONTACT_TOLERANCE_M`, which every normally resting
            // airplane already satisfies by a margin of `spec.gear.heightM`.
            if (!(player.state.position.y - spec.gear.heightM >= gh - GROUND_CONTACT_TOLERANCE_M)) {
              failures.push(
                `iteration ${n} (seed ${seed}, spawn x ${x.toFixed(0)} z ${z.toFixed(0)} alt ${altitude.toFixed(0)}): ` +
                  `tick ${world.tick} position.y ${player.state.position.y} sank through groundHeightM ${gh} ` +
                  `by more than GROUND_CONTACT_TOLERANCE_M (${GROUND_CONTACT_TOLERANCE_M} m) since the previous tick's resting contact`,
              )
              break
            }
            // Idle-throttle gated, the same gate `stepChecked`'s own energy
            // invariant uses (src/sim/invariants.ts): a rolling airplane
            // under thrust legitimately gains energy overcoming drag and
            // friction, and an ungated check would fail on every ordinary
            // powered ground roll, not just a broken constraint.
            if (isIdleThrottle(player.controls)) {
              const before = specificEnergyAirmass(player.previous)
              const after = specificEnergyAirmass(player.state)
              if (after > before + GROUND_CONTACT_ENERGY_EPS) {
                failures.push(
                  `iteration ${n} (seed ${seed}, spawn x ${x.toFixed(0)} z ${z.toFixed(0)} alt ${altitude.toFixed(0)}): ` +
                    `tick ${world.tick} specific energy rose from ${before} to ${after} J/kg across a ` +
                    `ground-contact step at idle throttle`,
                )
                break
              }
            }
          }
        }
      }
      const finalImpact = playerAircraft(world).impact
      if (finalImpact !== null) {
        terrainHits++
        const hit = finalImpact
        // Recomputed from outside `advance`, the same way this soak already
        // re-derives the ground height rather than trusting the one on the
        // world. A field that agrees with itself proves nothing.
        const expectedSurface = surfaceAt(hit.groundHeightM)
        if (hit.surface !== expectedSurface) {
          failures.push(
            `iteration ${n} (seed ${seed}): impact surface ${hit.surface} but groundHeightM ` +
              `${hit.groundHeightM} classifies as ${expectedSurface}`,
          )
        }
        // Land has no survivable outcome until Plan 11 adds landing gear. This
        // is the invariant most likely to be broken by accident when it does.
        if (hit.surface === 'land' && hit.kind !== 'destroyed') {
          failures.push(
            `iteration ${n} (seed ${seed}): land contact recorded as ${hit.kind}, ` +
              `but there is no landing gear to survive one with`,
          )
        }
      }
    } catch (err) {
      failures.push(
        `iteration ${n} (seed ${seed}, spawn x ${x.toFixed(0)} z ${z.toFixed(0)} alt ${altitude.toFixed(0)}): ` +
          `${(err as Error).message} -- replay with runTerrainSoak(spec, ${n + 1}, ${seed}, terrain) and inspect iteration ${n}, the last one run`,
      )
    }
  }

  return { failures, iterations, steps, terrainHits, supportedContactTicks }
}
