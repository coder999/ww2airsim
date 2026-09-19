import { type Vec3, v3 } from '../math/vec3.js'
import { type Quat, qIdentity } from '../math/quat.js'

export type Controls = {
  readonly pitch: number     // [-1, 1], positive = nose up
  readonly roll: number      // [-1, 1], positive = right roll
  readonly yaw: number       // [-1, 1], positive = nose right
  readonly throttle: number  // [0, 1]
  /** What the pilot is asking the gear to do, not where it is. Optional for
   *  the same reason `SimContext.terrain` is: `Controls` literals appear
   *  throughout the suite, and `undefined` reads as "unchanged", which is what
   *  every one of them means. */
  readonly gearDown?: boolean
  /** Wheel brakes, [0, 1]. Optional for the same reason `gearDown` is:
   *  `Controls` literals appear throughout the suite, and `undefined` reads
   *  as "brakes off", which is what every one of them means. */
  readonly brake?: number
  /** What the pilot is asking the FLAPS to do, not where they are. Optional
   *  for the same reason `gearDown` and `brake` are: `Controls` literals
   *  appear throughout the suite and `undefined` reads as "unchanged". */
  readonly flapDown?: boolean
  /** The tailhook lever. Optional like `gearDown`; `undefined` reads as up.
   *  No travel is modelled (Plan 8 design section 5). */
  readonly hookDown?: boolean
}

export type AircraftState = {
  readonly position: Vec3    // world metres, +Y up
  readonly velocity: Vec3    // world m/s
  readonly attitude: Quat
  // rad/s, { x: roll, y: yaw, z: pitch }. `y` is the rate about body +Y, so
  // it is NEGATIVE when yawing right: a positive rotation about +Y turns +X
  // (forward) toward -Z (left) in this right-handed frame, the opposite of
  // Controls.yaw's "positive = nose right" -- e.g. yaw: +1 commands
  // bodyRates.y < 0. Do not read this field's sign directly off Controls.yaw.
  //
  // Since Task 8, this is a pure output of `step` -- recomputed from
  // `controls` every frame via `commandedBodyRates` -- not an initial
  // condition `step` reads back. Any value passed into
  // `createState({ bodyRates })` is overwritten on the very first step and
  // has no effect.
  readonly bodyRates: Vec3
  readonly fuelKg: number
  /** The simulation tick this state is the result of. Starts at 0.
   *  Master spec §3 has the renderer interpolating between the two most recent
   *  ticks, which needs each snapshot to say which tick it is. It also makes a
   *  stale-snapshot bug loud instead of silent: without it, yesterday's state
   *  and today's are indistinguishable whenever their values happen to agree. */
  readonly tick: number
  /** Gear travel, 0 = fully retracted, 1 = fully extended. A fraction rather
   *  than a boolean because a Hellcat's gear takes seconds to move and the
   *  drag changes across that interval, not in one tick. Defaults to 0 so that
   *  every flight predating Plan 11a is unchanged. */
  readonly gearFraction: number
  /** Flap travel, 0 = fully retracted, 1 = fully extended. A fraction rather
   *  than a boolean for the same reason `gearFraction` is one: the travel
   *  takes seconds and both the lift and the drag change across it. Defaults
   *  to 0 so every flight predating Plan 11b is unchanged. */
  readonly flapFraction: number
  /** The pendant is on the hook (Plan 8): set by `step` when the arcade trap
   *  rule holds, cleared when the wheels leave the deck. While set, the
   *  deck-relative velocity decays at `TRAP_DECEL_MPS2`. */
  readonly arrested: boolean
}

export const createState = (init: Partial<AircraftState> = {}): AircraftState => ({
  position: init.position ?? v3(0, 0, 0),
  velocity: init.velocity ?? v3(0, 0, 0),
  attitude: init.attitude ?? qIdentity(),
  bodyRates: init.bodyRates ?? v3(0, 0, 0),
  fuelKg: init.fuelKg ?? 400,
  tick: init.tick ?? 0,
  gearFraction: init.gearFraction ?? 0,
  flapFraction: init.flapFraction ?? 0,
  arrested: init.arrested ?? false,
})
