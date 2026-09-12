import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { createState, DT, type Controls } from '../../src/sim/flight/model.js'
import { stepChecked } from '../../src/sim/invariants.js'
import { createRng } from '../../src/sim/rng.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

/**
 * Randomized soak: throws the aeroplane around with violent, rapidly-changing
 * control input across the full flight envelope this content file declares
 * (altitude 200 m-9,200 m, speed 30-230 m/s, an initial climb/sink rate up to
 * +-20 m/s and an initial sideslip up to +-20 m/s), and asserts via
 * `stepChecked` that no state ever goes non-finite and that the airmass-frame
 * energy invariant never fires. `stepChecked` is used deliberately rather than
 * the bare `step` -- the whole point of this harness is to catch what the
 * invariants catch (Ruling R5: they are not weakened, bypassed or avoided
 * here, and a trip is a finding to report, not a state to steer around).
 *
 * Ruling R8: the outer loop is 60 iterations (one simulated second each), not
 * the brief's `60 * 60` -- that was a transcription error that would have run
 * 43.2M steps per flight (2,160M total) and blown the 30s vitest default
 * timeout by orders of magnitude. 60 outer iterations x 60 inner steps gives
 * 3,600 steps (one minute of simulated flight) per aeroplane, 720,000 steps
 * total across 200 iterations.
 *
 * Ruling R29: no wind is passed to `stepChecked` -- it takes no wind
 * parameter, `step()` does not consume wind (a later plan's work), and the
 * energy invariant asserts against still air. The brief's wind vector is
 * dropped entirely, not merely zeroed, so there is nothing here that would
 * silently stop typechecking once wind land in a later plan.
 *
 * Control inputs are re-rolled every simulated second across the full
 * [-1, 1] range on pitch/roll/yaw, and throttle is either forced to 0 (20% of
 * seconds, to explore idle-throttle glides -- the one case the energy
 * invariant actually checks) or drawn from the full [0, 1] range otherwise.
 * Reported failures name the iteration, seed-derived spawn altitude and
 * speed, and the underlying invariant's message, so a red run is
 * reproducible: `runSoak(spec, iterations, seed)` is a pure function of its
 * seed (verified by the "reproducible from its seed" test), so replaying the
 * exact failing iteration only needs the same seed and iteration count.
 */
export function runSoak(
  spec: AircraftSpec,
  iterations: number,
  seed: number,
): { failures: string[]; iterations: number } {
  const rng = createRng(seed)
  const failures: string[] = []

  for (let n = 0; n < iterations; n++) {
    const altitude = 200 + rng() * 9000
    const speed = 30 + rng() * 200
    let s = createState({
      position: v3(0, altitude, 0),
      velocity: v3(speed, (rng() - 0.5) * 40, (rng() - 0.5) * 40),
      attitude: qIdentity(),
      fuelKg: rng() * spec.mass.fuelCapacityKg,
    })

    try {
      for (let tick = 0; tick < 60; tick++) {
        // Change controls every second, so the aircraft is thrown around
        // rather than flown politely.
        const controls: Controls = {
          pitch: (rng() - 0.5) * 2,
          roll: (rng() - 0.5) * 2,
          yaw: (rng() - 0.5) * 2,
          throttle: rng() < 0.2 ? 0 : rng(),
        }
        for (let i = 0; i < 60; i++) s = stepChecked(spec, s, controls, DT)
        if (s.position.y <= 0) break // hit the water; that is a crash, not a bug
      }
    } catch (err) {
      failures.push(
        `iteration ${n} (seed ${seed}, alt ${altitude.toFixed(0)} speed ${speed.toFixed(0)}): ${(err as Error).message}`,
      )
    }
  }

  return { failures, iterations }
}
