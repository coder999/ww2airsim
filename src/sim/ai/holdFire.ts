import type { AircraftEntity } from '../loop.js'
import { qRotate } from '../math/quat.js'
import { dot, length, sub, v3 } from '../math/vec3.js'
import { sameSide } from '../sides.js'
import { isAircraftDown } from '../weapons/combat.js'
import { AI_GUN_CONE_RAD } from './pursuit.js'
import type { TargetingView } from './targeting.js'

/** 7e spec §4.3: twice the gun cone, unscaled by skill (ruling W5), so a
 *  sloppier shooter is not also a less careful one. */
export const HOLD_FIRE_CONE_RAD = 2 * AI_GUN_CONE_RAD
/** How far past the target a friendly still blocks: a round that misses the
 *  target keeps going. */
export const HOLD_FIRE_BEYOND_TARGET_M = 100

/**
 * Hold fire (7e spec §4.3): true while any live same-side aircraft -- the
 * player and parked aircraft included -- is within `HOLD_FIRE_CONE_RAD` of
 * the nose and no farther than `targetRangeM + HOLD_FIRE_BEYOND_TARGET_M`.
 * Reads the start-of-tick snapshot. Friendly fire itself stays physical: this
 * only stops an AI from pulling the trigger.
 */
export function friendlyInLineOfFire<M>(self: AircraftEntity<M>, targetRangeM: number, view: TargetingView<M>): boolean {
  const nose = qRotate(self.state.attitude, v3(1, 0, 0))
  const cos = Math.cos(HOLD_FIRE_CONE_RAD)
  const limit = targetRangeM + HOLD_FIRE_BEYOND_TARGET_M
  for (const f of view.snapshot) {
    if (f.id === self.id || !sameSide(view.sides, self.id, f.id) || isAircraftDown(view.combat, f)) continue
    const to = sub(f.state.position, self.state.position)
    const r = length(to)
    if (r < 1e-6 || r > limit) continue
    if (dot(nose, to) / r >= cos) return true
  }
  return false
}
