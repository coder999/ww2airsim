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
import { stepChecked } from '../../src/sim/invariants.js'
import { createRng } from '../../src/sim/rng.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import {
  applyAssistsWithAuthority,
  assistFor,
  NOT_HOLDING,
  type AltitudeHoldMemory,
  type AssistSettings,
} from '../../src/assists/index.js'
import { advance, createWorld } from '../../src/sim/loop.js'
import { heightAt, type TerrainField } from '../../src/sim/world/terrain.js'

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
  /** Steps on which altitude hold's own two gates were BOTH open -- a captured
   *  altitude in the runner's memory and the pilot's pitch exactly centred --
   *  i.e. steps where that stage was live rather than standing down. Counted
   *  from the gates rather than inferred from the command, so it is unambiguous
   *  coverage: it was 0 of 550,320 steps before `CENTRED_PITCH_CHANCE` existed,
   *  which is how the gap was found. Always 0 on the unassisted arm. */
  assistHoldEngagedSteps: number
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
 * subsumes the other: the sweep can put the aeroplane anywhere, including
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
  memory: AltitudeHoldMemory,
): void {
  const { controls, pitchAuthority: a } = applyAssistsWithAuthority(state, spec, raw, DT, assists, memory)
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
 * Randomized soak: throws the aeroplane around with violent, rapidly-changing
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
 * 3,600 steps (one minute of simulated flight) per aeroplane, 720,000 steps
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
  let assistHoldEngagedSteps = 0

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
      // a captured altitude belongs to one aeroplane, so carrying one across
      // 200 spawns would drag a held altitude out of a dead flight into a
      // fresh one. The assist FUNCTION itself is stateless and could be built
      // once for the whole soak; it is built here only to keep the two
      // lifetimes visibly together. Null on the unassisted arm, which is the
      // pre-existing behaviour byte for byte -- no assist is constructed and
      // the raw command goes straight to `stepChecked`.
      const assist = assists === null ? null : assistFor(assists)
      let assistMemory: AltitudeHoldMemory = NOT_HOLDING
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
            if (controls.pitch === 0 && assistMemory.heldAltitudeM !== null) assistHoldEngagedSteps++
            assertAuthorityHolds(spec, s, controls, flown, assists, assistMemory)
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
    assistHoldEngagedSteps,
  }
}

export type TerrainSoakResult = {
  failures: string[]
  iterations: number
  steps: number
  /**
   * Flights that recorded an impact before their 60 simulated seconds ran
   * out. Reported separately from `failures` because "zero failures" is
   * ambiguous on its own: a soak that never puts an aeroplane within reach of
   * the ground also reports zero failures, and would keep doing so forever
   * even if the impact check were silently broken (`tests/sim/soak.test.ts`'s
   * floor on this field is what tells the two apart).
   */
  terrainHits: number
}

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
 * field, not always the same column), and at an altitude drawn relative to
 * the ground height there rather than sea level -- 30% of flights within 300
 * m of it (so a meaningful fraction are genuinely at risk of contact within
 * the 60 s flight budget) and the rest in the same 200-9,200 m-above-ground
 * band `runSoak` uses above sea level, so ordinary cruise over real terrain is
 * exercised too. `rollControls` (this file's existing input generator, with
 * `centredPitchChance` 0 -- there is no assist here to engage altitude hold)
 * supplies the same violent, occasionally chaotic control input `runSoak`
 * does, re-rolled once per simulated second.
 *
 * Per-tick, after `advance`, the invariant is checked from OUTSIDE `advance`'s
 * own state: `heightAt(terrain, ...)` is recomputed independently against the
 * position `advance` just produced, and if that says the aeroplane is at or
 * below the ground, `world.impact` must already be non-null (`advance` runs
 * its own identical check first, in the same call, so a correct
 * implementation can never observe otherwise -- this is the same
 * cross-check-by-recomputation shape `assertAuthorityHolds` above uses for
 * the assist stack, not an independent oracle). A flight stops the instant it
 * has one (nothing after the first impact is this task's concern -- see
 * `Impact`'s own comment in `src/sim/loop.ts`), which is also why this
 * function takes no `assists` parameter: coverage of the assist stack over
 * long flights is `runSoak`'s job, and adding it here would only double the
 * cost of this arm for no new coverage of the terrain path.
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

  for (let n = 0; n < iterations; n++) {
    const half = terrain.header.halfExtentM
    const x = (rng() * 2 - 1) * half
    const z = (rng() * 2 - 1) * half
    const groundHeightM = heightAt(terrain, x, z)
    const nearGround = rng() < 0.3
    const altitude = nearGround ? groundHeightM + rng() * 300 : groundHeightM + 200 + rng() * 9000
    const speed = 30 + rng() * 200

    let world = createWorld(
      spec,
      createState({
        position: v3(x, altitude, z),
        velocity: v3(speed, (rng() - 0.5) * 40, (rng() - 0.5) * 40),
        attitude: randomAttitude(rng),
        fuelKg: rng() * spec.mass.fuelCapacityKg,
      }),
      { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 },
    )
    world = { ...world, terrain }

    try {
      for (let second = 0; second < 60 && world.impact === null; second++) {
        world = { ...world, controls: rollControls(rng, 0) }
        for (let i = 0; i < 60 && world.impact === null; i++) {
          world = advance(world, DT, stepChecked).world
          steps++
          const gh = heightAt(terrain, world.aircraft.position.x, world.aircraft.position.z)
          if (world.impact === null && world.aircraft.position.y <= gh) {
            failures.push(
              `iteration ${n} (seed ${seed}, spawn x ${x.toFixed(0)} z ${z.toFixed(0)} alt ${altitude.toFixed(0)}): ` +
                `tick ${world.aircraft.tick} position.y ${world.aircraft.position.y} <= groundHeightM ${gh} but impact is null`,
            )
            break
          }
        }
      }
      if (world.impact !== null) terrainHits++
    } catch (err) {
      failures.push(
        `iteration ${n} (seed ${seed}, spawn x ${x.toFixed(0)} z ${z.toFixed(0)} alt ${altitude.toFixed(0)}): ` +
          `${(err as Error).message} -- replay with runTerrainSoak(spec, ${n + 1}, ${seed}, terrain) and inspect iteration ${n}, the last one run`,
      )
    }
  }

  return { failures, iterations, steps, terrainHits }
}
