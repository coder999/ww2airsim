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
/** Measured 2026-09-26 in the lag signature world (green, 170 m/s into a
 *  110 m/s target in a 3 g turn, 450 m ahead), sweeping this value with
 *  everything else fixed: 50 m ends at 15.7 m/s after 3.45 s, min range
 *  237.6 m; 100 m, 3.40 s, 240.2 m; 150 m, 3.28 s, 245.1 m; 200 m, 2.85 s,
 *  258.0 m; 300 m, 1.92 s, 301.8 m. All five meet the signature; the aim
 *  point barely matters here, and 150 m (the mid value) is kept.
 *  LAG_END_CLOSURE_MPS is spec §3.5's exit (closure < 15 m/s); at 150 m the
 *  maneuver ends at 14.9 m/s, from 57.8 m/s at entry. */
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
 *  target's tail. HIGH_YOYO_CLIMB_M and the 30° tail angle are spec §3.5's
 *  signature and exit. Measured 2026-09-26 in the high yo-yo signature world:
 *  101.9 m climbed, closure 57.7 -> -22.7 m/s, ended 23.9° off the tail at
 *  3.58 s. Converting that geometry into a shot is lead pursuit's job, and it
 *  cannot against a target still pulling 3 g (see that test's comment). */
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
/** Measured 2026-09-26 in the low yo-yo signature world (veteran, 115 m/s,
 *  700 m behind a 125 m/s target in a 3 g turn, 150 m above it), sweeping
 *  this value with everything else fixed. Descent before closure turns
 *  positive: 0 gives 4.6 m (closure positive at tick 152); 0.1, 6.6 m (145);
 *  0.25, 9.6 m (141); 0.4, 11.2 m (139); 0.6, 11.7 m (139). 0.25 takes most
 *  of the gain and more buys almost nothing, so it is kept. The effect is
 *  small in this world: the lead line already points down at a target
 *  150 m below. */
export const LOW_YOYO_DROP = 0.25
export function flyLowYoYo<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const lead = pursuitDesiredVelocity(self, perceived)
  const speed = length(lead)
  const dipped = speed < 1e-6 ? lead : scale(normalize(sub(normalize(lead), scale(UP, LOW_YOYO_DROP))), speed)
  const controls = withGate(self, perceived, { ...steerToward(self.state, self.spec, dipped, loadFactorBudget(self.spec)), throttle: 1 })
  return { controls, latch: closureRateMps(self, perceived) > 0 ? null : latch }
}

/** Attack run (spec §3.5): for a boom-and-zoom or neutral pairing with a
 *  height advantage (the selector also wants the target ahead of our 3/9
 *  line). Phase 0 dives onto the lead point at full power with the gun gate
 *  live, until level with the target, within PASS_RANGE_M, or past it: the
 *  target behind our 3/9 line while we descend. Phase 1 pulls up at the G
 *  budget until climbing at ZOOM_START_VY_MPS. Phase 2 zooms on a
 *  ZOOM_CLIMB_RAD line toward the target until the climb is spent
 *  (ZOOM_END_VY_MPS) or the height advantage is back (ATTACK_RUN_HEIGHT_M
 *  above the target, so the selector can start the next run).
 *
 *  "Past it" is not the plan's range-opening test (`closureRateMps` < 0).
 *  Measured 2026-09-26 in the signature world (tests/sim/ai/attackRun.test.ts,
 *  90 s): with the range-rate test, 27 of 29 attack runs "passed" within
 *  1 s of entry, because a run re-entered above a target it had not caught
 *  opens the range from the start; phase 2's end is then already true, so
 *  the pilot flickered through all three phases every rescore instead of
 *  diving. Target-behind alone: 1 of 5. Target-behind while descending: 0
 *  of 4.
 *
 *  ATTACK_RUN_HEIGHT_M is spec §3.5's table value (300 m). The other four
 *  are the plan's values, kept; each swept 2026-09-26 in that world with
 *  everything else fixed, reading the first run's zoom recovery (height
 *  regained after its lowest point, over height lost; spec signature >= 0.6):
 *  - PASS_RANGE_M: 50, 100, 150 -> 0.756; 250 -> 0.754; 350 -> 0.738. The
 *    first run ends on "level with the target" at 235 m, so it rarely binds.
 *  - ZOOM_CLIMB_RAD: 15° -> 1.047; 30° -> 0.756; 45° -> 0.895; 60° -> 1.013.
 *    Every value meets the signature; 30° is kept rather than re-tuned on one
 *    world.
 *  - ZOOM_START_VY_MPS: 5, 10 -> 0.756; 20 -> 0.756; 40 -> 0.757.
 *  - ZOOM_END_VY_MPS: 0, 5, 15 -> 0.756 (the height test ends the zoom
 *    first, at 71 m/s of climb); 30 -> 0.717, because the zoom then ends the
 *    tick it starts. */
export const ATTACK_RUN_HEIGHT_M = 300
export const PASS_RANGE_M = 150
export const ZOOM_CLIMB_RAD = 30 * Math.PI / 180
export const ZOOM_START_VY_MPS = 20
export const ZOOM_END_VY_MPS = 5
export function flyAttackRun<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const y = self.state.position.y
  const lowestAltitudeM = Math.min(latch.lowestAltitudeM, y)
  const to = sub(perceived.state.position, self.state.position)
  if (latch.phase === 0) {
    const rangeM = length(to)
    const passed = y <= perceived.state.position.y || rangeM < PASS_RANGE_M || (self.state.velocity.y < 0 && dot(to, self.state.velocity) < 0)
    const controls = { ...leadPursuitControls(self, perceived), throttle: 1 }
    return { controls, latch: { ...latch, lowestAltitudeM, phase: passed ? 1 : 0 } }
  }
  const n = loadFactorBudget(self.spec)
  if (latch.phase === 1) {
    const controls = controlsForLiftVector(self.state, self.spec, UP, n, 1)
    return { controls, latch: { ...latch, lowestAltitudeM, phase: self.state.velocity.y >= ZOOM_START_VY_MPS ? 2 : 1 } }
  }
  const flat = length(v3(to.x, 0, to.z)) > 1e-6 ? normalize(v3(to.x, 0, to.z)) : normalize(v3(self.state.velocity.x, 0, self.state.velocity.z))
  const line = v3(flat.x * Math.cos(ZOOM_CLIMB_RAD), Math.sin(ZOOM_CLIMB_RAD), flat.z * Math.cos(ZOOM_CLIMB_RAD))
  const controls = { ...steerToward(self.state, self.spec, scale(line, Math.max(length(self.state.velocity), 60)), n), throttle: 1 }
  const done = self.state.velocity.y <= ZOOM_END_VY_MPS || y >= perceived.state.position.y + ATTACK_RUN_HEIGHT_M
  return { controls, latch: done ? null : { ...latch, lowestAltitudeM } }
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
    case 'attack-run': return flyAttackRun(self, perceived, decision.latch!)
  }
}
