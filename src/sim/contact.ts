import { SEA_LEVEL_M } from './world/terrain.js'
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState } from './flight/state.js'
import { attitudeAngles } from './flight/attitude.js'
import { length } from './math/vec3.js'

/** Which kind of surface a contact happened against. `'land'` and `'water'`
 *  are the only two that exist; airplanes, ships and buildings are entities
 *  and arrive with Plan 12, which is when this type grows. */
export type ContactSurface = 'water' | 'land'

/**
 * The surface at a contact, from the ground height already captured on
 * `Impact`.
 *
 * At or below sea level is water. This deliberately reads the elevation data
 * that is already loaded rather than a second coastline map: one copy cannot
 * disagree with itself. `heightAt` returns `SEA_LEVEL_M` both for open ocean
 * and for any query outside the 200 km box, so "exactly zero" is the ordinary
 * case over the sea rather than a boundary curiosity.
 */
export function surfaceAt(groundHeightM: number): ContactSurface {
  return groundHeightM <= SEA_LEVEL_M ? 'water' : 'land'
}

/** What a contact did to the airplane. */
export type ContactKind = 'ditched' | 'destroyed'

/**
 * The ditching gates.
 *
 * These are the numbers that decide whether a water arrival is survivable, and
 * they are guesses until somebody flies them -- the same standing this
 * codebase gives `RAMP_SECONDS` in src/input/keyboard.ts. Getting them wrong
 * makes ditching too easy or impossible; it does not make anything incorrect.
 * Expect to tune them.
 */
export const DITCH_MAX_BANK_RAD = (10 * Math.PI) / 180
export const DITCH_MAX_SINK_MPS = 3.0
export const DITCH_MIN_PITCH_RAD = (-2 * Math.PI) / 180
export const DITCH_MAX_PITCH_RAD = (12 * Math.PI) / 180
/** Relative to the spec's stall speed, not absolute, so a second airplane in
 *  the roster gets a sane judgment without a second constant. For the F6F this
 *  is 1.2 * 43.81 = 52.6 m/s -- fast for a ditching, and honest: that is the
 *  CLEAN, power-off stall, because the model has no flaps and the trial's
 *  slower landing-condition figure is unreachable for it (see the `reference`
 *  block in content/aircraft/f6f-hellcat.json). */
export const DITCH_MAX_SPEED_STALL_MULTIPLE = 1.2

/**
 * Whether a contact is survivable.
 *
 * **On land, never.** The flight model has no landing gear, no flaps and no
 * rolling friction (`src/sim/flight/schema.ts`, the comment on
 * `takeoffDistanceM`), so there is nothing to land on land with and a
 * survivable land contact would be a fiction. Plan 11 adds gear-down and
 * runway-underneath as two more inputs HERE rather than inventing this
 * judgment somewhere else.
 *
 * Every gate is a positive comparison, so a non-finite state fails all of them
 * and comes back `'destroyed'`. Written as negations it would come back
 * `'ditched'`, which is the wrong way for a broken state to fail.
 */
export function contactOutcome(
  spec: AircraftSpec,
  state: AircraftState,
  surface: ContactSurface,
): ContactKind {
  if (surface === 'land') return 'destroyed'

  const { pitchRad, rollRad } = attitudeAngles(state)
  const wingsLevel = Math.abs(rollRad) <= DITCH_MAX_BANK_RAD
  // Bounds sink from below only -- a climbing state at contact would pass
  // this gate too. Unreachable today, but not because "arriving at y <= 0
  // from above implies velocity.y <= 0": that is a continuous-motion
  // argument, and discrete sampling does not automatically preserve it. The
  // real guarantee is `src/sim/flight/model.ts`'s integrator: it is
  // semi-implicit (symplectic) Euler, so velocity is advanced from the force
  // BEFORE position is advanced using that new velocity in the same step --
  // a step that ends this tick climbing cannot have used a downward velocity
  // to fall through the surface first. An explicit Euler or a midpoint/RK
  // scheme would not give this for free, and this gate would need its own
  // check if the integrator ever changes.
  const sinkingGently = state.velocity.y >= -DITCH_MAX_SINK_MPS
  const noseUp = pitchRad >= DITCH_MIN_PITCH_RAD && pitchRad <= DITCH_MAX_PITCH_RAD
  const slow =
    length(state.velocity) <= DITCH_MAX_SPEED_STALL_MULTIPLE * spec.reference.stallSpeedMps

  return wingsLevel && sinkingGently && noseUp && slow ? 'ditched' : 'destroyed'
}
