import type { Controls } from '../sim/flight/state.js'
import { BINDINGS, type BindingName } from './bindings.js'

export type PressedKeys = ReadonlySet<string>

export const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

/**
 * Seconds from centre to full deflection on a held key.
 *
 * This is the number that decides how the aeroplane feels, and it is a guess
 * until somebody flies it. A key is binary and a stick is not: mapping held
 * straight to +-1 gives bang-bang control that would make a model validated
 * against 1944 trial figures feel like a toy. Expect to tune this.
 */
export const RAMP_SECONDS = 0.35

/** Throttle is a lever: it stays where it is left. Full sweep in this long. */
export const THROTTLE_SECONDS = 2.0

const held = (pressed: PressedKeys, name: BindingName): boolean =>
  BINDINGS[name].some((code) => pressed.has(code))

/** -1, 0 or +1 from a pair of opposed keys. Both held cancels, which is why
 *  this subtracts rather than branching. */
const axis = (pressed: PressedKeys, neg: BindingName, pos: BindingName): number =>
  (held(pressed, pos) ? 1 : 0) - (held(pressed, neg) ? 1 : 0)

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n

/** Moves `current` toward `target` at `perSecond`, never overshooting. */
const approach = (current: number, target: number, perSecond: number, dt: number): number => {
  const maxStep = perSecond * dt
  const delta = target - current
  if (Math.abs(delta) <= maxStep) return target
  return current + Math.sign(delta) * maxStep
}

export function controlsFromKeys(
  pressed: PressedKeys,
  dt: number,
  previous: Controls,
): Controls {
  // A tab suspend can hand us a delta that is negative, enormous or NaN.
  // Letting it through would put a non-finite value into the control vector
  // and from there straight into the integrator.
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0

  const rate = 1 / RAMP_SECONDS
  const throttleRate = 1 / THROTTLE_SECONDS

  return {
    pitch: approach(previous.pitch, axis(pressed, 'pitchDown', 'pitchUp'), rate, step),
    roll: approach(previous.roll, axis(pressed, 'rollLeft', 'rollRight'), rate, step),
    yaw: approach(previous.yaw, axis(pressed, 'yawLeft', 'yawRight'), rate, step),
    // No target of its own: throttle integrates its key and holds.
    throttle: clamp(
      previous.throttle +
        axis(pressed, 'throttleDown', 'throttleUp') * throttleRate * step,
      0,
      1,
    ),
  }
}
