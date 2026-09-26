import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { length, sub } from '../math/vec3.js'
import { controlsForDesiredVelocity } from './controller.js'
import { steerToward } from './liftVector.js'
import { AI_GUN_RANGE_M, hasGunSolution, pursuitDesiredVelocity } from './pursuit.js'
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
  }
}
