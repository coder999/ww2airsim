import { BINDINGS, type BindingName } from './bindings.js'
import type { PressedKeys } from './keyboard.js'

/**
 * Where the pilot's head is pointed, relative to straight ahead, in body
 * frame.
 *
 * This is an OFFSET layered on the active camera mode rather than a mode of
 * its own. That is the structural choice: it means looking around behaves
 * identically from the cockpit and from the chase camera, and the snap views
 * are presets of the same value instead of separate code paths.
 */
export type LookOffset = {
  /** Positive = left, radians. Matches the body-frame convention in
   *  src/sim/flight/state.ts: a positive rotation about body +Y turns +X
   *  (forward) toward -Z, i.e. left. */
  readonly yawRad: number
  /** Positive = up, radians. A positive rotation about body +Z (right) turns
   *  +X (forward) toward +Y (up). */
  readonly pitchRad: number
}

export const LOOK_CENTRE: LookOffset = { yawRad: 0, pitchRad: 0 }

/** Stops the view tipping past vertical, where yaw and pitch become
 *  ambiguous. PI/2.2 (~81.8 degrees) is comfortably short of the 90-degree
 *  quarter-turns the hat itself produces, so "look up" and "look down" land
 *  clamped short of straight up/down rather than exactly on it. */
export const LOOK_LIMIT_RAD = Math.PI / 2.2

const QUARTER = Math.PI / 2

const held = (pressed: PressedKeys, name: BindingName): boolean =>
  BINDINGS[name].some((code) => pressed.has(code))

/**
 * Snap, not pan: a hat switch is instantaneous and springs back on release.
 * Ramping this would make checking your six a chore rather than a glance --
 * deliberately unlike the control axes in src/input/keyboard.ts, which do
 * ramp toward a target over RAMP_SECONDS. `dt` and `previous` are accepted
 * to match that function's shape (both are frame-loop inputs), but this
 * function is a pure snapshot of which keys are held right now and does not
 * use either.
 */
export function lookOffsetFromKeys(
  pressed: PressedKeys,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- shape-matching only, see doc above
  dt: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- shape-matching only, see doc above
  previous: LookOffset,
): LookOffset {
  if (held(pressed, 'lookCentre')) return LOOK_CENTRE
  if (held(pressed, 'lookBack')) return { yawRad: Math.PI, pitchRad: 0 }

  const yawRad =
    (held(pressed, 'lookLeft') ? QUARTER : 0) - (held(pressed, 'lookRight') ? QUARTER : 0)
  const rawPitch =
    (held(pressed, 'lookUp') ? QUARTER : 0) - (held(pressed, 'lookDown') ? QUARTER : 0)
  const pitchRad = Math.max(-LOOK_LIMIT_RAD, Math.min(LOOK_LIMIT_RAD, rawPitch))

  return yawRad === 0 && pitchRad === 0 ? LOOK_CENTRE : { yawRad, pitchRad }
}
