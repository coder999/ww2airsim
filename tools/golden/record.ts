import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { createState, step, airspeed, DT, type Controls } from '../../src/sim/flight/model.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

export type GoldenTrajectory = {
  engine: string
  checkpoints: Array<{ tick: number; position: [number, number, number]; speed: number }>
}

/** Fixed manoeuvre: 60 s of climbing right turn at three quarter throttle,
 *  then 30 s of descending left turn at nine-tenths throttle. */
export const CRUISE_CONTROLS = (tick: number): Controls =>
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
  for (let tick = 0; tick < steps; tick++) {
    s = step(spec, s, CRUISE_CONTROLS(tick), DT)
    if (tick % 300 === 0) {
      checkpoints.push({
        tick,
        position: [s.position.x, s.position.y, s.position.z],
        speed: airspeed(s),
      })
    }
  }
  return { engine: `node ${process.version}`, checkpoints }
}
