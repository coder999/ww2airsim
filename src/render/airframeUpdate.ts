// src/render/airframeUpdate.ts
import type { AirframeUpdate } from './scene/airframe.js'
import type { AircraftEntity } from '../sim/loop.js'
import type { Controls } from '../sim/flight/state.js'
import type { Vec3 } from '../sim/math/vec3.js'

/**
 * What one aircraft's airframe is told for one rendered frame (main.ts's
 * per-aircraft loop, A6M Zero spec §7.3). Pure, so the rules are tests:
 * - the player's airframe reads `playerControls`, the frame's raw input,
 *   which is what its propeller always read; every other aircraft reads its
 *   own entity's `controls`, which its AI pilot sets
 * - a wreck gets throttle 0, so its propeller stops (whole-branch review
 *   I-1: an ungated spin left it turning at full speed in its own fireball)
 */
export function airframeUpdateFor(
  aircraft: Pick<AircraftEntity, 'state' | 'controls' | 'impact'>,
  playerControls: Controls | null,
  position: Vec3,
  eye: Vec3,
  frameS: number,
): AirframeUpdate {
  const controls = playerControls ?? aircraft.controls
  return {
    gearFraction: aircraft.state.gearFraction,
    flapFraction: aircraft.state.flapFraction,
    throttle: aircraft.impact === null ? controls.throttle : 0,
    controls: { roll: controls.roll, pitch: controls.pitch, yaw: controls.yaw },
    frameS,
    cameraDistanceM: Math.hypot(position.x - eye.x, position.y - eye.y, position.z - eye.z),
  }
}
