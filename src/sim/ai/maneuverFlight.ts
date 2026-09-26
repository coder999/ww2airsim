import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { controlsForDesiredVelocity } from './controller.js'
import { steerToward } from './liftVector.js'
import { hasGunSolution, pursuitDesiredVelocity } from './pursuit.js'
import { breakDesiredVelocity, extendDesiredVelocity, type PilotManeuver } from './pilot.js'
import { loadFactorBudget } from './safety.js'

/**
 * What each maneuver flies (7c spec §3.4-3.5). `perceived` is the target as
 * of the last rescore (7d's staleness); only the fire gate and steering read
 * it. Never imports decision.ts, maneuvers.ts or pilotTick.ts.
 */

/** 7a's lead pursuit and gun gate, steered through `steerToward` (ruling R3):
 *  within 60° of the nose this is `pursuitControls` exactly. */
export function leadPursuitControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>): Controls {
  const steered = steerToward(self.state, self.spec, pursuitDesiredVelocity(self, perceived), loadFactorBudget(self.spec))
  return hasGunSolution(self, perceived) ? { ...steered, fire: true } : steered
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

export function intentControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, maneuver: PilotManeuver): Controls {
  switch (maneuver) {
    case 'pursue': return leadPursuitControls(self, perceived)
    case 'extend': return extendControls(self, perceived)
    case 'break': return defensiveBreakControls(self, perceived)
  }
}
