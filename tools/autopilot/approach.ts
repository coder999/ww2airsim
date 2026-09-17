import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import type { AircraftState, Controls } from '../../src/sim/flight/state.js'
import { airspeed } from '../../src/sim/flight/model.js'

/**
 * Where an approach is aiming.
 *
 * `touchdownElevationM` is the TERRAIN height at the aim point, not an
 * altitude the airplane should reach: the wheels sit `spec.gear.heightM` above
 * it, and this module adds that itself.
 */
export type ApproachTarget = {
  readonly aimX: number
  readonly aimZ: number
  /** Radians, 0 = northbound (+z). Only used to document intent today -- the
   *  lateral steering below assumes a northbound strip, which is the one this
   *  project has. Generalising it is work for whoever lands on a second. */
  readonly runwayHeadingRad: number
  readonly touchdownElevationM: number
}

/**
 * Vref: the conventional 1.3 times the stalling speed in the landing
 * configuration, which is why `reference.stallSpeedFlapMps` had to become a
 * real field. A TUNING value, not a measurement, and the first number to
 * change if the autopilot cannot hold the path.
 */
export const VREF_STALL_MULTIPLE = 1.3
/** Standard 3-degree approach path. Tuning value. */
const GLIDE_PATH_RAD = (3 * Math.PI) / 180
/**
 * Height above the wheels' touchdown point at which the controller stops
 * chasing the path and starts arresting the sink. Tuning value.
 *
 * **12 m, not the 5 m this started at, and the arithmetic is the reason.** At
 * an approach speed near 49 m/s, 5 m of height is ONE TENTH OF A SECOND -- far
 * too little to arrest a sink with a rate-commanded airplane, and the first
 * flown approach drove the wheels 2.21 m underground at 5.16 m/s as a result.
 */
const FLARE_HEIGHT_M = 12
/** Sink rate the flare aims to arrive at, m/s. Tuning value. */
const FLARE_SINK_MPS = 0.6
/**
 * Ceiling on the nose-up the flare will command. **Bounded on purpose**: a
 * full, indefinitely-held deflection over-rotates into a stall and porpoises,
 * which `tests/render/frame.test.ts` records observing. Tuning value.
 */
const FLARE_PITCH_MAX = 0.5
/** Ceiling on the sink rate the path loop will ask for, m/s, so a large height
 *  error cannot command a dive. Tuning value, and deliberately below
 *  `MAX_SUPPORTED_SINK_MPS` so the path loop can never itself demand an
 *  arrival the gates would reject. */
const MAX_APPROACH_SINK_MPS = 3.0
/** Wheel braking during the roll-out. Tuning value. */
const ROLLOUT_BRAKE = 0.6
/** Throttle held on the path before the speed correction is added, so the
 *  controller is trimming around a power setting rather than chasing from
 *  idle. Tuning value. */
const APPROACH_THROTTLE = 0.3

/**
 * Gains. All tuning values, and all proportional only: the plant is a
 * rate-commanded airplane (master spec §5), and an integrator here would need
 * anti-windup to be honest about what it does at the control limits.
 */
/** Commanded pitch per m/s of sink-rate error. */
const PITCH_PER_SINK_ERROR = 0.25
/** How much sink rate one metre of height error buys, per second. This is the
 *  outer loop: height error sets a sink target, and the sink error sets pitch.
 *  A cascade rather than pitch-from-height directly, because the first version
 *  of this normalised the height error by the distance to the aim point and so
 *  produced a gain that vanished at range -- `atan2(10, 5000)` is 0.002 rad,
 *  which is no correction at all. */
const SINK_PER_HEIGHT_ERROR = 0.04
const THROTTLE_PER_MPS = 0.05
const YAW_PER_OFFSET_M = 0.01

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
/** Non-finite reads as zero. Every output of this module feeds `step` and from
 *  there the integrator, so a NaN escaping here is master spec §9's hazard. */
const finite = (v: number) => (Number.isFinite(v) ? v : 0)

/**
 * The controls an approach wants, this tick. Master spec §11's item 2.
 *
 * **A pure function of the state with no stored phase**, rather than a script
 * of timed inputs. That is what lets a harness drop it into any loop that
 * already drives `step`, restart it anywhere, and get the same answer for the
 * same state -- and it is why the phase below is chosen by comparing the state
 * against thresholds instead of being remembered.
 *
 * In `tools/` and not `src/`: this is a test instrument. Master spec §11 lists
 * the scripted autopilot (item 2) and the AI pilot controller (item 3) as
 * different things, and item 3 -- the one that flies the player's seat through
 * a mission -- is Plan 7's. Putting this in `src/` would ship a mission AI two
 * plans early.
 *
 * Sign conventions, which are worth stating because one of them is
 * counter-intuitive: `Controls.pitch` is positive nose-up and `Controls.yaw`
 * positive nose-right (`src/sim/flight/state.ts`). `AircraftState.bodyRates.y`
 * is NEGATIVE when yawing right, so do not read that field's sign off
 * `Controls.yaw`.
 */
export function approachControls(spec: AircraftSpec, state: AircraftState, target: ApproachTarget): Controls {
  const vrefMps = VREF_STALL_MULTIPLE * spec.reference.stallSpeedFlapMps
  // Height of the WHEELS above the touchdown point: `position` names the body
  // origin, which sits `gear.heightM` above them. Getting this wrong by 2.2 m
  // would put the flare 2.2 m into the ground.
  const wheelHeightM = finite(state.position.y - spec.gear.heightM - target.touchdownElevationM)
  const alongM = finite(target.aimZ - state.position.z)
  const acrossM = finite(state.position.x - target.aimX)
  const speedMps = finite(airspeed(state))

  // Configured for landing throughout. The gear and flaps take seconds to
  // travel, so asking early is the whole point of asking at all.
  const configured = { gearDown: true, flapDown: true }
  // Positive yaw is nose-right, and `acrossM` is positive when right of the
  // centreline, so the correction is its negation.
  const yaw = clamp(-acrossM * YAW_PER_OFFSET_M, -1, 1)

  // Rolling: on the wheels and slower than the approach speed, so this is a
  // roll-out and not a touch-and-go. Steer with the tailwheel and brake.
  if (wheelHeightM <= 0.1 && speedMps < vrefMps) {
    return { ...configured, pitch: 0, roll: 0, yaw, throttle: 0, brake: ROLLOUT_BRAKE }
  }

  const sinkMps = finite(-state.velocity.y)

  // Flare: stop chasing the path and fly a sink rate instead, throttle closed.
  // Pitch is clamped NON-NEGATIVE here -- the flare never pushes down, because
  // the only thing below is the runway.
  if (wheelHeightM <= FLARE_HEIGHT_M) {
    const sinkErrorMps = sinkMps - FLARE_SINK_MPS
    return {
      ...configured,
      pitch: clamp(sinkErrorMps * PITCH_PER_SINK_ERROR, 0, FLARE_PITCH_MAX),
      roll: 0,
      yaw,
      throttle: 0,
      brake: 0,
    }
  }

  // On the path, as a cascade: the height error sets a sink-rate target, and
  // the sink-rate error sets pitch. Throttle holds Vref -- the conventional
  // pairing, chosen because it keeps each loop readable rather than because it
  // is claimed to be optimal.
  //
  // Past the aim point `alongM` goes negative and the wanted height is zero, so
  // the loop asks for the ceiling sink rate; the flare above is what actually
  // catches that case, which is why the ceiling sits below the sink the landing
  // gates will accept.
  const wantedHeightM = Math.max(0, alongM) * Math.tan(GLIDE_PATH_RAD)
  const heightErrorM = wheelHeightM - wantedHeightM
  const nominalSinkMps = speedMps * Math.sin(GLIDE_PATH_RAD)
  const wantedSinkMps = clamp(
    nominalSinkMps + heightErrorM * SINK_PER_HEIGHT_ERROR,
    0,
    MAX_APPROACH_SINK_MPS,
  )
  return {
    ...configured,
    pitch: clamp((sinkMps - wantedSinkMps) * PITCH_PER_SINK_ERROR, -1, 1),
    roll: 0,
    yaw,
    throttle: clamp(APPROACH_THROTTLE + (vrefMps - speedMps) * THROTTLE_PER_MPS, 0, 1),
    brake: 0,
  }
}
