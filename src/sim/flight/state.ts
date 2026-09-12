import { type Vec3, v3 } from '../math/vec3.js'
import { type Quat, qIdentity } from '../math/quat.js'

export type Controls = {
  readonly pitch: number     // [-1, 1], positive = nose up
  readonly roll: number      // [-1, 1], positive = right roll
  readonly yaw: number       // [-1, 1], positive = nose right
  readonly throttle: number  // [0, 1]
}

export type AircraftState = {
  readonly position: Vec3    // world metres, +Y up
  readonly velocity: Vec3    // world m/s
  readonly attitude: Quat
  readonly bodyRates: Vec3   // rad/s, { x: roll, y: yaw, z: pitch }
  readonly fuelKg: number
}

export const createState = (init: Partial<AircraftState> = {}): AircraftState => ({
  position: init.position ?? v3(0, 0, 0),
  velocity: init.velocity ?? v3(0, 0, 0),
  attitude: init.attitude ?? qIdentity(),
  bodyRates: init.bodyRates ?? v3(0, 0, 0),
  fuelKg: init.fuelKg ?? 400,
})
