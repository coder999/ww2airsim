import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { createState, step, airspeed, DT, type Controls } from '../../src/sim/flight/model.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

export type GoldenTrajectory = {
  engine: string
  checkpoints: Array<{ tick: number; position: [number, number, number]; speed: number }>
}

/**
 * Fixed manoeuvre: 60 s total (two 30 s phases, `steps = 3600` at 60 Hz), a
 * sustained right-roll-and-pitch-up rate command at three-quarter throttle
 * for the first 30 s, then a sustained left-roll-and-pitch-down rate command
 * at nine-tenths throttle for the second 30 s.
 *
 * `Controls` are body-RATE commands, not attitude holds (see
 * `ratesFromDynamicPressure` in `src/sim/flight/model.ts`) -- that is why a
 * sustained `roll: 0.3` does not settle the aircraft into a banked turn the
 * way a human pilot's stick-then-release input would. It commands a
 * continuous roll rate for the full 30 s of each phase, so the aircraft
 * keeps rotating rather than banking and holding. This is the misconception
 * that produced an earlier, wrong docstring on this function ("climbing
 * right turn" / "descending left turn") -- naming it here is meant to stop
 * the next reader making the same mistake.
 *
 * Measured on this checkout, node v22.22.1, 2026-09-12 (re-verify against
 * the code before trusting these on a future change):
 *   - speed stays in 128.98-153.34 m/s for the whole run
 *   - max |AoA| is 5.487 degrees, against this aircraft's `alphaCritDeg` of
 *     15.5 degrees -- `isStalled` never fires (0 of 3,600 ticks)
 *   - `q/qRef` (dynamic pressure over the rate-authority reference) never
 *     drops below 1.287, so the rate-authority clamp in
 *     `ratesFromDynamicPressure` is saturated for the entire run and the
 *     commanded body rates are constant within each phase
 *   - net descent is 576.9 m at the final tick (tick 3599)
 *   - the aircraft completes ~4 full rotations (2 per 30 s phase), and
 *     spends 49.4% of ticks inverted
 *
 * This is a sound golden fixture precisely because of the saturation above:
 * with the rate clamp pinned at 1 and never stalling, attitude integrates
 * from a constant, position-independent body rate -- it is exogenous,
 * decoupled from position and velocity, so there is no feedback loop to
 * amplify a small numeric difference. A perturbation study measured the
 * response as linear at ~23.7x, so a single Math.sin/cos ULP difference
 * (the reason spec §3 requires a tolerance rather than exact equality)
 * propagates to on the order of 1e-11 m against this test's 1e-3 m tolerance
 * -- i.e. this trajectory is *harder* to false-positive on than a gentler
 * one would be, not easier. (That tolerance was 1.0 m until finding I2: eight
 * orders looser than this paragraph's own argument, and loose enough to
 * absorb a change of integration scheme. It is now ~8 orders above the drift
 * it exists for, which is still all the headroom that argument asks for.) It also exercises the lift-direction
 * double-cross-product and the quaternion integration across the whole
 * attitude sphere by inverting repeatedly, rather than staying near level.
 */
// Exported so tests/sim/loop.test.ts can drive this exact manoeuvre through
// `advance` (rather than `step` directly, as `recordTrajectory` below does)
// and check the result against the same golden file -- point at one
// manoeuvre definition instead of a second copy drifting from this one.
export const ROLLING_DESCENT_CONTROLS = (tick: number): Controls =>
  tick < 1800
    ? { pitch: 0.15, roll: 0.3, yaw: 0, throttle: 0.75 }
    : { pitch: -0.1, roll: -0.3, yaw: 0, throttle: 0.9 }

export function recordTrajectory(spec: AircraftSpec, steps = 3600): GoldenTrajectory {
  let s = createState({
    position: v3(0, 2000, 0),
    velocity: v3(130, 0, 0),
    attitude: qIdentity(),
    fuelKg: 400,
  })
  const checkpoints: GoldenTrajectory['checkpoints'] = []
  // Checkpoint every 300 ticks (5 s), plus the final tick regardless of
  // where it falls in that schedule -- steps - 1 is not itself a multiple
  // of 300 (3599 % 300 = 299), so without the explicit `|| tick === steps -
  // 1` the last 299 steps of the run are never checked, and a regression
  // confined to them would pass. Labelling convention: a checkpoint labelled
  // `tick: N` is recorded *after* the step that produced tick N has run --
  // i.e. `tick: 0`'s position is the state after one physics step, not the
  // initial spawn state, so it is not `(0, 2000, 0)`.
  for (let tick = 0; tick < steps; tick++) {
    s = step(spec, s, ROLLING_DESCENT_CONTROLS(tick), { dt: DT, tick: tick + 1 })
    if (tick % 300 === 0 || tick === steps - 1) {
      checkpoints.push({
        tick,
        position: [s.position.x, s.position.y, s.position.z],
        speed: airspeed(s),
      })
    }
  }
  return { engine: `node ${process.version}`, checkpoints }
}
