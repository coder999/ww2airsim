import type { AircraftEntity, EntityId, World } from '../loop.js'
import { qRotate } from '../math/quat.js'
import { length, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import { decksOf } from '../world/deck.js'
import { groundUnder } from '../world/ground.js'
import { airborne } from './airborne.js'
import { controlsForDesiredVelocity } from './controller.js'
import { limitLoadFactor, loadFactorBudget } from './safety.js'
import { airVelocity, commandedBodyRates } from '../flight/model.js'
import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import { STANDARD_GRAVITY_MPS2 } from '../damage/overload.js'
import { pursuitDesiredVelocity } from './pursuit.js'
import { sideOf } from '../sides.js'
import { isAircraftDoomed } from '../weapons/combat.js'

/**
 * The player's pursuit autopilot (Mark, 2026-09-25): while its key is held,
 * the player's stick is flown by the same lead-pursuit law the AI flies
 * (`pursuit.ts` + `controller.ts`) at the nearest live enemy. Steering only --
 * the frame keeps the player's own throttle and trigger.
 *
 * "Enemy" is every unparked, uncrashed, undestroyed aircraft on the other
 * side from the player (`sideOf`, Plan 7e; before 7e there were no sides and
 * every other aircraft counted). Excluding destroyed aircraft is what keeps
 * it from following a plane that is going down.
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

/** B3 (Mark, 2026-10-10): the autopilot pulls at most this fraction of the
 *  airframe's own `limits.gLimit` (and pushes no further than the AI's
 *  negative floor), so Shift never overstresses the airplane under Realistic
 *  damage. The limit clamps the STEADY pitch rate, and the airframe overshoots
 *  it while the rate builds, so the margin is measured, not guessed
 *  (tools/autopilot/pursuitProbe.ts, 2026-10-10, B3 handoff): the worst
 *  peak ran 0.4-0.7% over the commanded budget at 0.9, 0.95 and 1.0. At 1.0
 *  the F6F reached 7.55 g on a green Zero and lost structure in 4 of 4
 *  runs; 0.95 peaked at 0.957 of the limit; 0.9 at 0.904. Seconds in gun
 *  solution did not rise with the fraction (12.8 s at 0.9, 12.4 at 0.95,
 *  12.1 at 1.0, summed over 24 duels), so 0.9 keeps a 10% margin, the AI's
 *  `G_BUDGET`, for nothing. */
export const AUTO_PURSUIT_G_FRACTION = 0.9

/** B3: at or above this fraction of `limits.diveSpeedMps` the autopilot
 *  keeps chasing in heading but climbs (`RECOVERY_CLIMB_SIN`) instead of
 *  diving, because the throttle is the player's and overspeed breaks the
 *  airframe as surely as g does (`damageFromStructuralOverload`). Not a
 *  descent-only trigger: the P-38's content top speed is above its dive
 *  speed, and with one it held level at 0.95 of dive speed and never turned
 *  (pursuitProbe, 2026-10-10). Measured the same day: at 0.95 the F6F
 *  still overran its dive speed in the pull-out on a green Zero (structure
 *  0.990-0.996 in 3 of 4 runs); 0.85 and 0.9 kept 1.000. The AI cuts its
 *  throttle at the same 0.9 (`OVERSPEED_THROTTLE_CUT`). */
export const AUTO_PURSUIT_DIVE_FRACTION = 0.9

/**
 * `limitLoadFactor` on the pitch, with the autopilot's own fraction, then the
 * rudder held to the lateral load the pitch leaves inside the same budget.
 * The load the overload model reads is the magnitude of the whole proper
 * acceleration, and at 230 m/s full rudder alone is about 5 g of sideslip:
 * measured 2026-10-10 (pursuitProbe crossing/green) with the pitch limited
 * to 0.9 x 7.5 g, the yaw at 1.00 took the F6F to 8.27 g. Both rates are
 * linear in the stick (`commandedBodyRates`), so a unit command converts.
 * The lateral term ignores gravity along the wing, as `pitchCommandForLoadFactor`
 * does not: the measured peaks are what say it is enough.
 */
export function limitPursuitLoad(state: AircraftState, spec: AircraftSpec, controls: Controls, fraction: number): Controls {
  const c = limitLoadFactor(state, spec, controls, fraction)
  const speed = length(state.velocity)
  const unit = commandedBodyRates(spec, state, { roll: 0, pitch: 1, yaw: 1, throttle: 0 })
  if (speed < 1 || Math.abs(unit.z) < 1e-6 || Math.abs(unit.y) < 1e-6) return c
  const budget = loadFactorBudget(spec, fraction)
  const normal = speed * unit.z * c.pitch / STANDARD_GRAVITY_MPS2 + qRotate(state.attitude, v3(0, 1, 0)).y
  const lateral = Math.sqrt(Math.max(0, budget * budget - normal * normal))
  const yawMax = lateral * STANDARD_GRAVITY_MPS2 / (speed * Math.abs(unit.y))
  return { ...c, yaw: Math.min(yawMax, Math.max(-yawMax, c.yaw)) }
}

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
  const decks = decksOf(world.ships)
  for (const a of world.aircraft) {
    if (a.id === world.player || a.impact !== null) continue
    if (!airborne(a, world.terrain, decks)) continue
    if (sideOf(world, a) === sideOf(world, self)) continue
    if (isAircraftDoomed(world.combat.aircraft, a)) continue
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
  const overspeed = length(airVelocity(self.state, world.wind)) >= AUTO_PURSUIT_DIVE_FRACTION * self.spec.limits.diveSpeedMps
  const wanted = target === null || sinking
    ? scale(v3(forward.x, 0, forward.z), Math.max(60, length(self.state.velocity)))
    : pursuitDesiredVelocity(self, target)
  // A margin of 0 is "at the floor": the same climb-out, on the chase's heading.
  const desired = floorLimitedVelocity(wanted, forward, overspeed ? Math.min(0, margin) : margin)
  const { roll, pitch, yaw } = limitPursuitLoad(self.state, self.spec, controlsForDesiredVelocity(self.state, self.spec, desired), AUTO_PURSUIT_G_FRACTION)
  return { target: target?.id ?? null, roll, pitch, yaw }
}
