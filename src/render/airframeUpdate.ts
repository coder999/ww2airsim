// src/render/airframeUpdate.ts
import type { AirframeUpdate } from './scene/airframe.js'
import type { AircraftEntity } from '../sim/loop.js'
import type { Controls } from '../sim/flight/state.js'
import type { Vec3 } from '../sim/math/vec3.js'
import { qRotate, type Quat } from '../sim/math/quat.js'
import { sideOf, type Side } from '../sim/sides.js'

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
    bayDoorFraction: aircraft.state.bayDoorFraction,
    throttle: aircraft.impact === null ? controls.throttle : 0,
    controls: { roll: controls.roll, pitch: controls.pitch, yaw: controls.yaw },
    frameS,
    cameraDistanceM: Math.hypot(position.x - eye.x, position.y - eye.y, position.z - eye.z),
  }
}

/** How near a hostile aircraft must be before a turret tracks it, meters (about 1,640 yd). ESTIMATE. */
export const TURRET_TRACK_RANGE_M = 1500

/**
 * Where aircraft `index`'s turrets point this frame (turret aim plan, 2026-10-09): the nearest
 * hostile aircraft within TURRET_TRACK_RANGE_M, as a unit direction in its own body frame, or null
 * (stowed) when there is none or it is a wreck. Wrecks are never targets. Visual only: no gun fires.
 */
export function turretAimFor(
  world: { readonly player: string; readonly aircraft: readonly (Pick<AircraftEntity, 'id' | 'impact'> & { readonly side?: Side })[] },
  poses: readonly { readonly position: Vec3; readonly attitude: Quat }[],
  index: number,
): Vec3 | null {
  const me = world.aircraft[index]!
  if (me.impact !== null) return null
  const mine = sideOf(world, me)
  const at = poses[index]!.position
  let best: Vec3 | null = null
  let bestM = TURRET_TRACK_RANGE_M
  world.aircraft.forEach((a, i) => {
    if (i === index || a.impact !== null || sideOf(world, a) === mine) return
    const p = poses[i]!.position
    const d = { x: p.x - at.x, y: p.y - at.y, z: p.z - at.z }
    const m = Math.hypot(d.x, d.y, d.z)
    if (m > 0 && m <= bestM) { bestM = m; best = { x: d.x / m, y: d.y / m, z: d.z / m } }
  })
  if (best === null) return null
  const q = poses[index]!.attitude
  return qRotate({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, best)
}
