import type { AircraftEntity, EntityId, World } from '../loop.js'
import { qRotate } from '../math/quat.js'
import { length, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import { decksOf } from '../world/deck.js'
import { groundUnder } from '../world/ground.js'
import { controlsForDesiredVelocity } from './controller.js'
import { pursuitDesiredVelocity } from './pursuit.js'

/**
 * The player's pursuit autopilot (Mark, 2026-09-25): while its key is held,
 * the player's stick is flown by the same lead-pursuit law the AI flies
 * (`pursuit.ts` + `controller.ts`) at the nearest live enemy. Steering only --
 * the frame keeps the player's own throttle and trigger.
 *
 * "Enemy" is every other unparked, uncrashed, undestroyed aircraft: the world
 * has no friend/foe field, and `radar.ts` draws exactly this set. Excluding
 * destroyed aircraft is what keeps it from following a plane that is going
 * down.
 */

/** Height above the ground or sea below which an enemy is not chased, and
 *  below which the autopilot will not take the player. ~1,000 ft. */
export const AUTO_PURSUIT_FLOOR_AGL_M = 300

/** The autopilot only engages airborne: below this it returns `null` and the
 *  keys fly the airplane, so holding the key on a deck or runway does nothing. */
const MIN_ENGAGE_AGL_M = 30

/** Descent allowed toward the floor is the remaining margin over this many
 *  seconds, so the dive shallows progressively rather than bottoming out. */
const FLOOR_LOOKAHEAD_S = 6

/** Below the floor, climb out at this sine of flight-path angle (~15 deg). */
const RECOVERY_CLIMB_SIN = 0.25

/** Height of `position` above whatever is under it: a deck, terrain, or the
 *  sea. Terrain below sea level reads as the sea surface (0). */
export function heightAboveSurfaceM<M>(world: World<M>, position: Vec3): number {
  const ground = groundUnder(world.terrain, decksOf(world.ships), position.x, position.z)
  return position.y - Math.max(0, ground?.heightM ?? 0)
}

/** The nearest aircraft worth chasing, or `null` when none is. */
export function autoPursuitTarget<M>(world: World<M>): AircraftEntity<M> | null {
  const self = world.aircraft.find((a) => a.id === world.player)
  if (self === undefined) return null
  let best: AircraftEntity<M> | null = null
  let bestRange = Infinity
  for (const a of world.aircraft) {
    if (a.id === world.player || a.parked || a.impact !== null) continue
    if (world.combat.aircraft[a.id]?.damage.destroyedAt != null) continue
    if (heightAboveSurfaceM(world, a.state.position) < AUTO_PURSUIT_FLOOR_AGL_M) continue
    const range = length(sub(a.state.position, self.state.position))
    if (range < bestRange) {
      best = a
      bestRange = range
    }
  }
  return best
}

/**
 * `desired` with its descent limited so the flight path cannot cross the
 * floor: `marginM` is height above the floor (negative below it). Speed is
 * preserved; only the split between horizontal and vertical changes. A
 * request with no horizontal part (a target straight below) climbs out along
 * `forward`'s heading instead.
 */
export function floorLimitedVelocity(desired: Vec3, forward: Vec3, marginM: number): Vec3 {
  const speed = length(desired)
  if (speed < 1e-6) return desired
  const minVy = marginM <= 0
    ? RECOVERY_CLIMB_SIN * speed
    : Math.max(-speed, -marginM / FLOOR_LOOKAHEAD_S)
  if (desired.y >= minVy) return desired
  const horizontalSpeed = Math.sqrt(Math.max(0, speed * speed - minVy * minVy))
  let hx = desired.x
  let hz = desired.z
  if (Math.hypot(hx, hz) < 1e-6) {
    hx = forward.x
    hz = forward.z
  }
  const h = Math.hypot(hx, hz)
  // Nose (and request) both vertical: no heading to keep, so pick one.
  if (h < 1e-6) return v3(horizontalSpeed, minVy, 0)
  return v3((hx / h) * horizontalSpeed, minVy, (hz / h) * horizontalSpeed)
}

export type AutoPursuitCommand = {
  /** What is being chased, or `null`: holding a level heading for want of a
   *  target, rather than letting go of the stick in whatever dive the last
   *  chase left it in. */
  readonly target: EntityId | null
  readonly roll: number
  readonly pitch: number
  readonly yaw: number
}

/** The stick for this frame, or `null` when the autopilot does not engage
 *  (the player is on or near the ground). */
export function autoPursuit<M>(world: World<M>): AutoPursuitCommand | null {
  const self = world.aircraft.find((a) => a.id === world.player)
  if (self === undefined || self.impact !== null) return null
  const agl = heightAboveSurfaceM(world, self.state.position)
  if (agl < MIN_ENGAGE_AGL_M) return null

  const forward = qRotate(self.state.attitude, v3(1, 0, 0))
  const target = autoPursuitTarget(world)
  const margin = agl - AUTO_PURSUIT_FLOOR_AGL_M
  // Limiting the REQUESTED flight path is not enough on its own: the
  // controller banks up to 70 degrees to turn, and a hard turn sinks. Probed
  // 2026-09-25 with a target 5 km behind at 400 m: the pursuer followed the
  // limited request into the turn and bottomed out at 57 m. So when the sink
  // rate would carry it through the floor within the lookahead, stop chasing
  // and fly wings-level along the nose until it would not.
  const sinking = margin + self.state.velocity.y * FLOOR_LOOKAHEAD_S < 0
  const wanted = target === null || sinking
    ? scale(v3(forward.x, 0, forward.z), Math.max(60, length(self.state.velocity)))
    : pursuitDesiredVelocity(self, target)
  const desired = floorLimitedVelocity(wanted, forward, margin)
  const { roll, pitch, yaw } = controlsForDesiredVelocity(self.state, self.spec, desired)
  return { target: target?.id ?? null, roll, pitch, yaw }
}
