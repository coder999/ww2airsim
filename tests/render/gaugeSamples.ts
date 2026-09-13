import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import type { GaugeId } from '../../src/render/gauges.js'

/**
 * Low and high sample states for each dial, used to check that a needle moves
 * the right way across its scale.
 *
 * These lived in `GAUGES` itself until 2026-09-13, which meant twelve
 * `AircraftState` objects were constructed at module load and shipped in the
 * production bundle purely so a test had inputs -- and production data knew
 * about its own tests. Review finding; the comment on `GaugeId` calls a gauge
 * "a louder claim than a comment", and a fixture is not a claim at all.
 *
 * The heading pair reads ATTITUDE, not velocity: a velocity-only sample left
 * both ends at zero and the monotonic test comparing 0 > 0.
 */
export const GAUGE_SAMPLES: Record<GaugeId, { low: AircraftState; high: AircraftState }> = {
  airspeed: {
    low: createState({ velocity: v3(20, 0, 0) }),
    high: createState({ velocity: v3(200, 0, 0) }),
  },
  altimeter: {
    low: createState({ position: v3(0, 100, 0) }),
    high: createState({ position: v3(0, 8000, 0) }),
  },
  verticalSpeed: {
    low: createState({ velocity: v3(100, -20, 0) }),
    high: createState({ velocity: v3(100, 20, 0) }),
  },
  heading: {
    low: createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.2) }),
    high: createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) }),
  },
  fuel: {
    low: createState({ fuelKg: 50 }),
    high: createState({ fuelKg: 650 }),
  },
  slip: {
    low: createState({ velocity: v3(100, 0, -20) }),
    high: createState({ velocity: v3(100, 0, 20) }),
  },
}
