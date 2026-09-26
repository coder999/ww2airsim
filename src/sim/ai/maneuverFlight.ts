import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { add, dot, length, normalize, scale, sub, v3 } from '../math/vec3.js'
import { controlsForDesiredVelocity } from './controller.js'
import { controlsForLiftVector, steerToward } from './liftVector.js'
import { AI_GUN_RANGE_M, closureRateMps, hasGunSolution, pursuitDesiredVelocity } from './pursuit.js'
import { breakDesiredVelocity, extendDesiredVelocity, type ManeuverLatch, type PilotDecisionState } from './pilot.js'
import { loadFactorBudget } from './safety.js'

/**
 * What each maneuver flies (7c spec §3.4-3.5). `perceived` is the target as
 * of the last rescore (7d's staleness); only the fire gate and steering read
 * it. Never imports decision.ts, maneuvers.ts or pilotTick.ts.
 */

/** Beyond gun range the pursuer firewalls the throttle. Lead pursuit's
 *  requested speed (target + at most 35 m/s) and the controller's throttle
 *  law otherwise settle near 140 m/s against a 115 m/s target: 25 m/s of
 *  closure, and 16 of 16 runs could not get back into gun range within
 *  120 s (7c plan ablation, 2026-09-25). Not a change to leadPursuitVelocity's
 *  intercept math (spec §9). */
export const PURSUIT_FULL_POWER_BEYOND_M = AI_GUN_RANGE_M

/** 7a's lead pursuit and gun gate, steered through `steerToward` (ruling R3):
 *  within 60° of the nose this is `pursuitControls` exactly. */
export function leadPursuitControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>): Controls {
  const steered = steerToward(self.state, self.spec, pursuitDesiredVelocity(self, perceived), loadFactorBudget(self.spec))
  const rangeM = length(sub(perceived.state.position, self.state.position))
  const powered = rangeM > PURSUIT_FULL_POWER_BEYOND_M ? { ...steered, throttle: 1 } : steered
  return hasGunSolution(self, perceived) ? { ...powered, fire: true } : powered
}

/** 7b's Extend, steered through `steerToward`: the reversal back toward the
 *  threat is a roll-and-pull, not a push into the sea. */
export function extendControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>): Controls {
  return steerToward(self.state, self.spec, extendDesiredVelocity(self, perceived), loadFactorBudget(self.spec))
}

/** 7b's Break, flown exactly as 7b flies it (ruling R4): at a head-on merge
 *  Break is chosen from the first rescore, and the lift-vector version cost
 *  the player's first-merge kill (7/8 -> 0/8, measured 2026-09-25). */
export function defensiveBreakControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>): Controls {
  return controlsForDesiredVelocity(self.state, self.spec, breakDesiredVelocity(self, perceived))
}

const UP = v3(0, 1, 0)
const withGate = <M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, c: Controls): Controls =>
  hasGunSolution(self, perceived) ? { ...c, fire: true } : c

/** Lag pursuit (spec §3.5): aim at a point this far behind the target along
 *  its track, at the target's speed, to stop an overshoot; the gun gate stays
 *  live. Ends once closure (`closureRateMps`, the range rate) is under
 *  LAG_END_CLOSURE_MPS. With 7b's own-velocity closing rate instead, the end
 *  never came: it stays near our airspeed while the nose is on the target, so
 *  green held lag pursuit to the 20 s latch cap against the 7d evasion
 *  (measured 2026-09-26 through the production frame path, the
 *  aiLethality.test.ts item 3 world). */
export const LAG_DISTANCE_M = 150
export const LAG_END_CLOSURE_MPS = 15
export function flyLagPursuit<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const tv = perceived.state.velocity
  const ts = length(tv)
  const behind = ts > 1e-6 ? sub(perceived.state.position, scale(tv, LAG_DISTANCE_M / ts)) : perceived.state.position
  const to = sub(behind, self.state.position)
  const desired = length(to) < 1e-6 ? tv : scale(normalize(to), Math.max(ts, 60))
  const controls = withGate(self, perceived, steerToward(self.state, self.spec, desired, loadFactorBudget(self.spec)))
  return { controls, latch: closureRateMps(self, perceived) < LAG_END_CLOSURE_MPS ? null : latch }
}

/** High yo-yo: phase 0 pulls the lift vector above the target's plane at the
 *  G budget and full power until HIGH_YOYO_CLIMB_M is gained; phase 1 rolls
 *  back down into lead pursuit. Ends within YOYO_TAIL_ANGLE_RAD of the
 *  target's tail. */
export const HIGH_YOYO_CLIMB_M = 100
export const YOYO_TAIL_ANGLE_RAD = 30 * Math.PI / 180
function nearTail<M>(self: AircraftEntity<M>, target: AircraftEntity<M>): boolean {
  const back = scale(target.state.velocity, -1)
  const toSelf = sub(self.state.position, target.state.position)
  const d = length(back) * length(toSelf)
  return d > 1e-9 && Math.acos(Math.min(1, Math.max(-1, dot(back, toSelf) / d))) < YOYO_TAIL_ANGLE_RAD
}
export function flyHighYoYo<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  if (latch.phase === 0) {
    const toTarget = normalize(sub(perceived.state.position, self.state.position))
    const lift = add(scale(UP, 1.5), toTarget)
    const controls = controlsForLiftVector(self.state, self.spec, lift, loadFactorBudget(self.spec), 1)
    const climbed = self.state.position.y - latch.entryAltitudeM >= HIGH_YOYO_CLIMB_M
    return { controls, latch: climbed ? { ...latch, phase: 1 } : latch }
  }
  return { controls: leadPursuitControls(self, perceived), latch: nearTail(self, perceived) ? null : latch }
}

/** Low yo-yo: the nose inside the target's turn and below its plane, the lead
 *  line tipped down by LOW_YOYO_DROP of its speed, full power, gun gate
 *  live. Ends once closure (the range rate) turns positive. */
export const LOW_YOYO_DROP = 0.25
export function flyLowYoYo<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const lead = pursuitDesiredVelocity(self, perceived)
  const speed = length(lead)
  const dipped = speed < 1e-6 ? lead : scale(normalize(sub(normalize(lead), scale(UP, LOW_YOYO_DROP))), speed)
  const controls = withGate(self, perceived, { ...steerToward(self.state, self.spec, dipped, loadFactorBudget(self.spec)), throttle: 1 })
  return { controls, latch: closureRateMps(self, perceived) > 0 ? null : latch }
}

/** A maneuver's controls this tick, and its latch afterwards: the same
 *  object while it continues, a new one on a phase change, null once it has
 *  ended. A non-phased maneuver returns null. */
export type Flown = { readonly controls: Controls; readonly latch: ManeuverLatch | null }

export function flyManeuver<M>(
  self: AircraftEntity<M>, perceived: AircraftEntity<M>, decision: PilotDecisionState, nowS: number,
): Flown {
  void nowS
  switch (decision.named) {
    case 'lead-pursuit': return { controls: leadPursuitControls(self, perceived), latch: null }
    case 'extend': return { controls: extendControls(self, perceived), latch: null }
    case 'defensive-break': return { controls: defensiveBreakControls(self, perceived), latch: null }
    case 'lag-pursuit': return flyLagPursuit(self, perceived, decision.latch!)
    case 'high-yo-yo': return flyHighYoYo(self, perceived, decision.latch!)
    case 'low-yo-yo': return flyLowYoYo(self, perceived, decision.latch!)
  }
}
