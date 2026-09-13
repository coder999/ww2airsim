import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { createState, DT, isStalled, type Controls } from '../../src/sim/flight/model.js'
import { stepChecked } from '../../src/sim/invariants.js'
import { createRng } from '../../src/sim/rng.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

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
}

/** Non-finite and finite-but-out-of-range values injected onto a single
 *  control channel roughly 2% of seconds (Important 11a): these are the
 *  values `clampFinite`'s NaN -> 0 mapping and its [-1,1]/[0,1] clamp exist
 *  to handle (a malformed input event, a bad replay file, ...), and without
 *  this the soak's ordinary draws -- always finite and in-range -- never
 *  reach that code path at all. */
const CHAOTIC_VALUES = [NaN, Infinity, -Infinity, 5, -5] as const

function rollControls(rng: () => number): Controls {
  const base: Controls = {
    pitch: (rng() - 0.5) * 2,
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
 * The water check (`position.y <= 0`) runs once per simulated second, not
 * once per physics step, so a flight can descend well past sea level within
 * that second before the break fires (a measured example reached -208 m).
 * `densityAt` is then evaluated at a negative altitude for the remaining
 * steps of that second -- this is harmless (still finite, just unphysical
 * for those few steps) and arguably useful robustness exploration in its own
 * right, not a bug to fix.
 */
export function runSoak(spec: AircraftSpec, iterations: number, seed: number): SoakResult {
  const rng = createRng(seed)
  const failures: string[] = []
  let steps = 0
  let flightsCompleted = 0
  let stalledSteps = 0

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
      for (let tick = 0; tick < 60; tick++) {
        const controls = rollControls(rng)
        for (let i = 0; i < 60; i++) {
          s = stepChecked(spec, s, controls, DT)
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

  return { failures, iterations, steps, flightsCompleted, stalledSteps }
}
