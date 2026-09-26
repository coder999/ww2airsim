import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { qRotate } from '../math/quat.js'
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
 *  ZOOM_CLIMB_RAD line toward the target until the energy advantage is
 *  restored (the latched entry altitude, `entryAltitudeM`, regained) or the
 *  climb is spent (under ZOOM_END_VY_MPS), whichever comes first.
 *
 *  The plan ended the zoom 300 m above the target instead, which capped the
 *  zoom's own recovery near 300 m over the height lost: 0.47 of 623 m in the
 *  earlier 600 m-above signature world, the rest only momentum after the
 *  latch closed (measured 2026-09-26).
 *
 *  "Past it" is not the plan's range-opening test (`closureRateMps` < 0).
 *  Measured 2026-09-26 in the signature world (tests/sim/ai/attackRun.test.ts,
 *  run for 90 s): with the range-rate test, 22 of 23 attack runs "passed"
 *  within 1 s of entry, because a run re-entered above a target it has not
 *  caught opens the range from the start; the zoom's end is then already
 *  true, so the pilot flickered through all three phases every rescore and
 *  never dived again. Target-behind, alone or while descending: 0 of 4. (In
 *  the earlier 600 m-above world, target-behind alone flickered 1 of 5 and
 *  target-behind while descending 0 of 4, so the descent clause stays.)
 *
 *  ATTACK_RUN_HEIGHT_M is spec §3.5's table value (300 m). The other four
 *  are the plan's values, kept; each swept 2026-09-26 in that world with
 *  everything else fixed, reading the first run's recovery (height regained
 *  after its lowest point, before the next run, over height lost; spec
 *  signature >= 0.6), then in brackets the part regained before the latch
 *  closed. In every row but the last the 20 s latch cap, not the zoom's own
 *  end, closes the latch: the pass comes at 13.5 s.
 *  - PASS_RANGE_M: 50, 100, 150 -> 0.869 (0.529); 250 -> 0.852 (0.552);
 *    350 -> 0.952 (0.566). The first run ends on "level with the target" at
 *    198 m, so 150 m does not bind there.
 *  - ZOOM_CLIMB_RAD: 15° -> 0.923 (0.459); 30° -> 0.869 (0.529);
 *    45° -> 0.827 (0.544); 60° -> 0.908 (0.565). Every value meets the
 *    signature; 30° is kept rather than re-tuned on one world.
 *  - ZOOM_START_VY_MPS: 5, 10 -> 0.868 (0.529); 20 -> 0.869 (0.529);
 *    40 -> 0.870 (0.531).
 *  - ZOOM_END_VY_MPS: 0, 5, 15 -> 0.869 (0.529); 30 -> 0.413, because the
 *    zoom then ends the tick it starts and the next dive goes lower. */
export const ATTACK_RUN_HEIGHT_M = 300
export const PASS_RANGE_M = 150
export const ZOOM_CLIMB_RAD = 30 * Math.PI / 180
export const ZOOM_START_VY_MPS = 20
export const ZOOM_END_VY_MPS = 5
export function flyAttackRun<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const y = self.state.position.y
  const lowestAltitudeM = Math.min(latch.lowestAltitudeM, y)
  const next = (phase: number): ManeuverLatch =>
    phase === latch.phase && lowestAltitudeM === latch.lowestAltitudeM ? latch : { ...latch, lowestAltitudeM, phase }
  const to = sub(perceived.state.position, self.state.position)
  if (latch.phase === 0) {
    const rangeM = length(to)
    const passed = y <= perceived.state.position.y || rangeM < PASS_RANGE_M || (self.state.velocity.y < 0 && dot(to, self.state.velocity) < 0)
    const controls = { ...leadPursuitControls(self, perceived), throttle: 1 }
    return { controls, latch: next(passed ? 1 : 0) }
  }
  const n = loadFactorBudget(self.spec)
  if (latch.phase === 1) {
    const controls = controlsForLiftVector(self.state, self.spec, UP, n, 1)
    return { controls, latch: next(self.state.velocity.y >= ZOOM_START_VY_MPS ? 2 : 1) }
  }
  const flat = length(v3(to.x, 0, to.z)) > 1e-6 ? normalize(v3(to.x, 0, to.z)) : normalize(v3(self.state.velocity.x, 0, self.state.velocity.z))
  const line = v3(flat.x * Math.cos(ZOOM_CLIMB_RAD), Math.sin(ZOOM_CLIMB_RAD), flat.z * Math.cos(ZOOM_CLIMB_RAD))
  const controls = { ...steerToward(self.state, self.spec, scale(line, Math.max(length(self.state.velocity), 60)), n), throttle: 1 }
  const done = self.state.velocity.y < ZOOM_END_VY_MPS || y >= latch.entryAltitudeM
  return { controls, latch: done ? null : next(2) }
}

const headingOf = (v: { readonly x: number; readonly z: number }): number => Math.atan2(v.z, v.x)
const headingChange = (from: number, to: number): number => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)))

/** Scissors (spec §3.5): a turn toward the threat's side of our flight
 *  path, the lift vector set for a 60° / 2 g level turn (SCISSORS_BANK_RAD)
 *  at SCISSORS_THROTTLE, reversing into the threat each time it crosses
 *  behind us to the other side, so we slow and it slides ahead. It is not
 *  held level: in the signature world below, the Zero climbs 262 m
 *  (3,000 -> 3,262 m) and ends at 38.0 m/s pulling about 1 g, because the
 *  2 g lift runs out as it slows. Its stall margin, load factor over
 *  (V / stall speed)^2, peaks at 0.83 (measured 2026-09-26; no §3.2 stall
 *  guard exists). Ends once the threat is ahead of
 *  our 3/9 line (or at the 20 s latch cap). The latch records the threat's
 *  side (+1 right, -1 left, in the horizontal plane) and counts each
 *  change as a reversal.
 *
 *  The plan flew the lift vector straight at the threat at the G budget.
 *  Measured 2026-09-26 in the scissors signature world (a veteran Zero at
 *  88 m/s, a Hellcat 150 m behind at 100 m/s, tests/sim/ai/breakManeuvers.test.ts):
 *  with the threat near dead astern that lift line is ill-conditioned; the
 *  roll command never changed sign in 16 s (0 roll reversals), the latch's
 *  body-axis side flickered 3 times in 6 ticks, and 16 s in the Zero was
 *  down to 38 m/s with the Hellcat still behind it.
 *
 *  SCISSORS_BANK_RAD, swept 2026-09-26 in that world at throttle 0.3, 0.4
 *  and 0.5, as the load factor of the equivalent level turn: 1.5, 1.75, 2, 2.25, 2.5 and 3 g all
 *  give 2 reversals inside 12 s and end with the Hellcat ahead (12.2-19.7 s).
 *  The Zero's lowest speed during the maneuver falls with the G: 59.2, 49.2,
 *  38.0, 28.1, 22.8, 28.6 m/s at throttle 0.4. Its stall speed is 34.87 m/s,
 *  so above 2 g it mushes below the stall. Both airplanes are pitch-rate
 *  limited here (30°/s scaled by airspeed), so turning harder only bleeds
 *  speed. At the G budget instead (6.3 g asked, about 3.4 g flown) with
 *  throttle 0.3-0.4 the scissors ran to the cap with the Hellcat still
 *  behind; at throttle 0-0.2 the Hellcat got ahead after one reversal. 60°
 *  (2 g), the textbook level-turn bank, is kept.
 *
 *  SCISSORS_THROTTLE is the plan's 0.4, kept: at 60°, throttle 0.3 / 0.4 /
 *  0.5 end at 14.1 / 14.4 / 15.0 s with a lowest speed of 35.2 / 38.0 /
 *  39.3 m/s.
 *
 *  SCISSORS_SIDE_DEADBAND_M: the threat must be this far across our flight
 *  path before we reverse. At 60° / 0.4, a deadband of 0 or 2 m counts 4
 *  latch reversals against 2 real roll reversals (the side flickers as the
 *  threat crosses). 5 m counts 2 against 2; 10 and 20 m also count 2 but
 *  reverse 18 and 36 ticks later, with a lowest speed of 34.8 and 30.6 m/s. */
export const SCISSORS_BANK_RAD = 60 * Math.PI / 180
export const SCISSORS_THROTTLE = 0.4
export const SCISSORS_SIDE_DEADBAND_M = 5
export function flyScissors<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const v = self.state.velocity
  const to = sub(perceived.state.position, self.state.position)
  const flatRight = normalize(v3(-v.z, 0, v.x))
  const s = dot(to, flatRight)
  const side = latch.lastSide === 0 ? (s >= 0 ? 1 : -1)
    : s * latch.lastSide < -SCISSORS_SIDE_DEADBAND_M ? -latch.lastSide : latch.lastSide
  const lift = add(UP, scale(flatRight, side * Math.tan(SCISSORS_BANK_RAD)))
  const controls = controlsForLiftVector(self.state, self.spec, lift, 1 / Math.cos(SCISSORS_BANK_RAD), SCISSORS_THROTTLE)
  if (dot(to, v) > 0) return { controls, latch: null }
  if (side === latch.lastSide) return { controls, latch }
  return { controls, latch: { ...latch, lastSide: side, reversals: latch.reversals + (latch.lastSide !== 0 ? 1 : 0) } }
}

/** Split-S (spec §3.5): phase 0 rolls inverted (lift straight down at 1 g);
 *  phase 1 pulls through around the loop center fixed at entry
 *  (`openLatch`), at the G budget. Ends with the heading reversed by
 *  REVERSAL_DONE_RAD and the nose back near level: climb component
 *  (velocity.y / speed) above LEVEL_EXIT_MIN_CLIMB. REVERSAL_DONE_RAD is
 *  spec §3.5's signature (heading change >= 150°; the table's "reversed
 *  ± 30°").
 *
 *  The other two are the plan's values, kept. Measured 2026-09-26 in the
 *  split-S signature world (`splitSWorld`: a veteran F6F at 110 m/s, a
 *  Hellcat 250 m dead astern at 130 m/s, 3,000 m up), each swept with the
 *  other fixed, reading heading change / height lost / peak G / exit speed:
 *  - SPLIT_S_THROTTLE: 0 -> 166.7° / 513 m / 5.81 g / 103.2 m/s;
 *    0.3 -> 167.5° / 504 m / 6.41 g / 112.9 m/s; 0.6 -> 176.1° / 509 m /
 *    6.72 g / 121.9 m/s; 1 -> 176.2° / 539 m / 6.83 g / 134.0 m/s. Every
 *    value meets the signature; 0.3 keeps the exit near the entry speed.
 *  - LEVEL_EXIT_MIN_CLIMB: -0.4 -> 170.0° / 488 m, exit 8.3 s after entry;
 *    -0.2 -> 167.5° / 504 m, 8.8 s; 0 -> 165.6° / 509 m, 9.35 s;
 *    0.1 -> 164.7° / 508 m, 9.63 s. */
export const REVERSAL_DONE_RAD = 150 * Math.PI / 180
export const LEVEL_EXIT_MIN_CLIMB = -0.2
export const SPLIT_S_THROTTLE = 0.3
export function flySplitS<M>(self: AircraftEntity<M>, _perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  if (latch.phase === 0) {
    const controls = controlsForLiftVector(self.state, self.spec, v3(0, -1, 0), 1, SPLIT_S_THROTTLE)
    return { controls, latch: qRotate(self.state.attitude, UP).y < -0.9 ? { ...latch, phase: 1 } : latch }
  }
  const controls = controlsForLiftVector(self.state, self.spec, sub(latch.loopCenter, self.state.position), loadFactorBudget(self.spec), SPLIT_S_THROTTLE)
  const v = self.state.velocity
  const turned = headingChange(latch.entryHeadingRad, headingOf(v)) >= REVERSAL_DONE_RAD
  const level = v.y / Math.max(length(v), 1e-6) > LEVEL_EXIT_MIN_CLIMB
  return { controls, latch: turned && level ? null : latch }
}

/** Immelmann (spec §3.5): replaces Extend's shallow-climb rejoin at or above
 *  corner speed. Phase 0 is a half loop up around the center fixed at entry
 *  (`openLatch`), at the G budget and full power, until the heading has
 *  reversed by REVERSAL_DONE_RAD with the nose back near level
 *  (IMMELMANN_TOP_MAX_CLIMB). Phase 1 rolls upright at 1 g. It ends upright,
 *  pointing back at the threat. Never fires: Extend never does (7b).
 *
 *  IMMELMANN_UPRIGHT_COS (body-up within 30° of vertical) is the plan's
 *  value, kept. Measured 2026-09-26 in the signature world with
 *  IMMELMANN_TOP_MAX_CLIMB at 0.2, the roll-out (phase 1) takes 2.61 s on
 *  the F6F and 3.00 s on the Zero; peak load factor over the whole maneuver
 *  is 6.42 g (limit 7.5) and 6.05 g (limit 7). */
export const IMMELMANN_UPRIGHT_COS = Math.cos(30 * Math.PI / 180)
/** Phase 0 ends at the top of the loop: the heading reversed AND the climb
 *  component (velocity.y / speed) back under this. The plan ended it on the
 *  heading alone, which flips 180° the moment the airplane passes the
 *  vertical: measured 2026-09-26 in the signature world, the F6F entered
 *  phase 1 at 4.25 s pointing straight up (vy 101.6 of 102.1 m/s), rolled to
 *  lift-up at 1 g and hung; the Zero exited at 22.4 m/s, below 1.1 x stall.
 *  Swept 2026-09-26 in that world (tests/sim/ai/immelmann.test.ts), reading
 *  heading change / height gained / exit speed, F6F from 140 m/s then Zero
 *  from 110 m/s:
 *  - 0: 173.3° / 428 m / 92.6 m/s; 172.0° / 349 m / 81.1 m/s
 *  - 0.1: 174.0° / 448 / 90.2; 171.7° / 369 / 78.1
 *  - 0.2: 174.6° / 466 / 88.0; 171.5° / 386 / 75.4
 *  - 0.3: 175.1° / 483 / 85.9; 171.2° / 400 / 73.0
 *  - 0.5: 175.9° / 512 / 82.3; 170.2° / 428 / 68.2
 *  Every value meets the signature. 0.2 mirrors the split-S's
 *  LEVEL_EXIT_MIN_CLIMB (-0.2) and rolls out near the top of the loop. */
export const IMMELMANN_TOP_MAX_CLIMB = 0.2
export function flyImmelmann<M>(self: AircraftEntity<M>, _perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  if (latch.phase === 0) {
    const controls = controlsForLiftVector(self.state, self.spec, sub(latch.loopCenter, self.state.position), loadFactorBudget(self.spec), 1)
    const v = self.state.velocity
    const turned = headingChange(latch.entryHeadingRad, headingOf(v)) >= REVERSAL_DONE_RAD
    const top = v.y / Math.max(length(v), 1e-6) < IMMELMANN_TOP_MAX_CLIMB
    return { controls, latch: turned && top ? { ...latch, phase: 1 } : latch }
  }
  const controls = controlsForLiftVector(self.state, self.spec, UP, 1, 1)
  return { controls, latch: qRotate(self.state.attitude, UP).y > IMMELMANN_UPRIGHT_COS ? null : latch }
}

/** A maneuver's controls this tick, and its latch afterwards: the same
 *  object while it continues unchanged, a new one when its data changes (a
 *  phase change, or the attack run's new lowest altitude), null once it has
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
    case 'scissors': return flyScissors(self, perceived, decision.latch!)
    case 'split-s': return flySplitS(self, perceived, decision.latch!)
    case 'immelmann': return flyImmelmann(self, perceived, decision.latch!)
  }
}
