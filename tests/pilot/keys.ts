import type { Controls } from '../../src/sim/flight/state.js'
import { BINDINGS } from '../../src/input/bindings.js'

/**
 * The keys a player would hold to make the ramped keyboard controls
 * (`controlsFromKeys`: an axis moves toward -1, 0 or +1 at 1/RAMP_SECONDS
 * per second) follow a continuous command, plus the edge-triggered toggles
 * (gear, flaps) that differ from what is commanded. Shared by the Node pass
 * (`tests/sim/gunneryRangePass.test.ts`, which feeds the keys back through
 * `controlsFromKeys`) and the in-page pilot (`tests/e2e/pilot.ts`, which
 * dispatches them), so both fly through the same quantization.
 */
export type KeyCommand = { readonly held: readonly string[]; readonly toggles: readonly string[] }

const EPS = 0.04

/** The key for an axis: the direction that moves `current` toward `wanted`. */
function axisKey(wanted: number, current: number, neg: string, pos: string): string | null {
  if (current < wanted - EPS) return wanted > 0 ? pos : null
  if (current > wanted + EPS) return wanted < 0 ? neg : null
  return wanted > EPS ? pos : wanted < -EPS ? neg : null
}

export function keysFor(wanted: Controls, current: Controls, gearDown: boolean, flapDown: boolean): KeyCommand {
  const held: string[] = []
  const push = (k: string | null): void => { if (k !== null) held.push(k) }
  push(axisKey(wanted.pitch, current.pitch, BINDINGS.pitchDown[0], BINDINGS.pitchUp[0]))
  push(axisKey(wanted.roll, current.roll, BINDINGS.rollLeft[0], BINDINGS.rollRight[0]))
  push(axisKey(wanted.yaw, current.yaw, BINDINGS.yawLeft[0], BINDINGS.yawRight[0]))
  if (wanted.throttle > current.throttle + 0.02) held.push(BINDINGS.throttleUp[0])
  else if (wanted.throttle < current.throttle - 0.02) held.push(BINDINGS.throttleDown[0])
  if (wanted.fire === true) held.push(BINDINGS.fireGuns[0])
  if ((wanted.brake ?? 0) > 0.5) held.push(BINDINGS.brakes[0])
  const toggles: string[] = []
  if (wanted.gearDown !== undefined && wanted.gearDown !== gearDown) toggles.push(BINDINGS.toggleGear[0])
  if (wanted.flapDown !== undefined && wanted.flapDown !== flapDown) toggles.push(BINDINGS.toggleFlaps[0])
  return { held, toggles }
}
