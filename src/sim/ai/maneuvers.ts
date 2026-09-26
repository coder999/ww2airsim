import type { AircraftEntity } from '../loop.js'
import type { AircraftSpec } from '../flight/schema.js'
import { add, length, sub, dot, v3, ZERO, type Vec3 } from '../math/vec3.js'
import type { DecisionFacts } from './decision.js'
import { airframeEnvelope, relativeEnvelope, type RelativeEnvelope } from './envelope.js'
import { DEFAULT_MANEUVER, INTENT_OF, SAFE_SEPARATION_M, type ManeuverLatch, type ManeuverName, type PilotManeuver, type PilotSkill } from './pilot.js'
import { ATTACK_RUN_HEIGHT_M } from './maneuverFlight.js'
import { closureRateMps } from './pursuit.js'
import { FLOOR_M, loadFactorBudget } from './safety.js'

/** Spec §3.5: a phased maneuver holds at most this long. */
export const LATCH_CAP_S = 20

/** Everything the selector reads, all live at the rescore instant, as 7b's
 *  intent facts are. */
export type ManeuverFacts = {
  readonly intent: PilotManeuver
  readonly facts: DecisionFacts
  readonly envelope: RelativeEnvelope
  readonly selfSpeedMps: number
  /** Our flight-path angle: radians above the horizon, negative in a dive. */
  readonly selfFlightPathRad: number
  readonly targetSpeedMps: number
  readonly selfCornerSpeedMps: number
  readonly targetCornerSpeedMps: number
  readonly selfDiveSpeedMps: number
  readonly heightAboveGroundM: number
  readonly heightOverTargetM: number
  /** How fast the target's flight path is turning: |body pitch and yaw rates|. */
  readonly targetTurnRateRadPerS: number
  /** The target is behind our 3/9 line. */
  readonly threatBehind: boolean
  /** The angle between the two velocity vectors. */
  readonly velocityAngleRad: number
  /** Spec §3.5's closure: the rate the range is shrinking, positive while
   *  closing (`closureRateMps`). Not 7b's `facts.closingRate`, which is our
   *  own velocity along the line of sight and ignores the target's motion. */
  readonly closureMps: number
}

export function maneuverFacts<M>(
  self: AircraftEntity<M>, target: AircraftEntity<M>, facts: DecisionFacts, intent: PilotManeuver, heightAboveGroundM: number,
): ManeuverFacts {
  const mine = airframeEnvelope(self.spec, self.state)
  const theirs = airframeEnvelope(target.spec, target.state)
  const selfSpeedMps = length(self.state.velocity)
  const targetSpeedMps = length(target.state.velocity)
  const toTarget = sub(target.state.position, self.state.position)
  const denom = selfSpeedMps * targetSpeedMps
  return {
    intent, facts,
    envelope: relativeEnvelope(mine, theirs),
    selfSpeedMps, targetSpeedMps,
    selfFlightPathRad: Math.asin(Math.min(1, Math.max(-1, self.state.velocity.y / Math.max(selfSpeedMps, 1e-9)))),
    selfCornerSpeedMps: mine.cornerSpeedMps,
    targetCornerSpeedMps: theirs.cornerSpeedMps,
    selfDiveSpeedMps: mine.diveSpeedMps,
    heightAboveGroundM,
    heightOverTargetM: self.state.position.y - target.state.position.y,
    targetTurnRateRadPerS: Math.hypot(target.state.bodyRates.y, target.state.bodyRates.z),
    threatBehind: dot(toTarget, self.state.velocity) < 0,
    velocityAngleRad: denom < 1e-9 ? 0 : Math.acos(Math.min(1, Math.max(-1, dot(self.state.velocity, target.state.velocity) / denom))),
    closureMps: closureRateMps(self, target),
  }
}

/** The Pursue family's entry values. Closure is the range rate
 *  (`closureMps`), not 7b's `closingRate`.
 *
 *  OVERSHOOT_RANGE_M, OVERSHOOT_CLOSURE_MPS, LOW_YOYO_RANGE_M and
 *  LOW_YOYO_HEIGHT_MARGIN_M are spec §3.5's table values (range < 600 m,
 *  closure > 40 m/s; range > 400 m, closure < 0, floor + 500 m). Measured
 *  2026-09-26 in production `advance`: the lag and high yo-yo signature
 *  worlds (tests/sim/ai/pursueManeuvers.test.ts) select at the first rescore
 *  at 391 m and 57.7-57.8 m/s; the low yo-yo world at 700 m and about
 *  -10 m/s, 3150 m up. Against the scripted 7d evasion (aiLethality item 3),
 *  green's highest range rate at a rescore with the target turning inside
 *  600 m is 39.7 m/s (clean), 38.1 (rockets), 35.4 (bombs), 34.0 (both), all
 *  at the 6.0 s rescore, so it never selects lag pursuit there: a thin
 *  margin, accepted for now and put to Mark.
 *
 *  TARGET_TURNING_RAD_PER_S is |body pitch and yaw rate|, about 3°/s.
 *  Measured 2026-09-26 on the same airframe: a scripted straight-and-level
 *  target reads 0.000; a scripted 3 g level turn reads 0.216 at the 1 s
 *  rescore and 0.24-0.30 after; the 7d evasion reads at least 0.253
 *  (both) / 0.319 (clean) while its keys are held (0.5-7 s) and at most
 *  0.025-0.028 once it flies hands-off (8-60 s). 0.05 sits about 2x above
 *  the hands-off drift and 5x below the gentlest keyed turn. */
export const TARGET_TURNING_RAD_PER_S = 0.05
export const OVERSHOOT_RANGE_M = 600
export const OVERSHOOT_CLOSURE_MPS = 40
export const LOW_YOYO_RANGE_M = 400
export const LOW_YOYO_HEIGHT_MARGIN_M = 500

/** The Break family's entry values. SCISSORS_RANGE_M, SPLIT_S_MIN_HEIGHT_M
 *  and SPLIT_S_MAX_SPEED_FRACTION are spec §3.5's table values (scissors:
 *  threat within 300 m, both below corner speed, turnAdvantage >= 1;
 *  split-S: threat astern in gun range, >= 1,500 m above ground, airspeed
 *  < 0.6 x dive limit). SCISSORS_ANGLE_RAD is the plan's reading of the
 *  table's "low angle-off", as the angle between the two velocities, kept
 *  at 45° on these measurements (2026-09-26):
 *  - Entry sweep: the Hellcat's starting heading in the scissors signature
 *    world turned toward the Zero by 0, 15, 30, 40 and 44°. Every one
 *    selects the scissors at tick 1 and meets the signature: 2 reversals,
 *    ends with the Hellcat ahead at 11.9-14.4 s, lowest speed 38.0-50.9 m/s.
 *    At 46° and 60°, tick 1 rejects it. A later rescore picks it (ticks 93
 *    and 112), and it runs to the 20 s cap with the Hellcat still behind,
 *    at 22.0-25.2 m/s.
 *  - Load-bearing: in the swapped 120 s run, 75 of the Hellcat's 269 Break
 *    rescores meet every scissors condition but the angle and the gate,
 *    at 1.9-121.8°. 60 of them are at 45° or more, so the angle term
 *    rejects them. The other 15 (1.9-42.8°) are the gate's.
 *
 *  Measured 2026-09-26 at the first rescore of the signature worlds
 *  (tests/sim/ai/breakManeuvers.test.ts). Scissors: 153 m, 0.00° between
 *  the velocities, Zero 88 m/s against a 92.26 m/s corner, Hellcat 100
 *  against 119.98, turnAdvantage 1.596 (turnfight). Swapped, the Hellcat
 *  reads 0.627 (boom-and-zoom). Over its 120 s run, 15 of its 269 Break
 *  rescores meet every other scissors condition, so the envelope gate is
 *  what keeps it out. Split-S: 250 m, threat astern and behind, 3,000 m up,
 *  110 m/s against 0.6 x 216 = 129.6. None of the four shipped pilot
 *  scenarios (pursuit-range, pursuit-range-veteran, the tail-chase and
 *  zero-merge fixtures) selects either in 120 s. */
export const SCISSORS_RANGE_M = 300
export const SCISSORS_ANGLE_RAD = 45 * Math.PI / 180
export const SPLIT_S_MIN_HEIGHT_M = 1500
export const SPLIT_S_MAX_SPEED_FRACTION = 0.6

/** The Immelmann's entry: from near-level flight, the flight path at or
 *  above this. Spec §3.5 has it replace Extend's shallow-climb rejoin; a
 *  pilot still in Extend's dive is not in that rejoin, and a "half loop"
 *  from a 40° dive is a 220° pitch change. Measured 2026-09-26:
 *  - Without this term, every veteran run of pursuit-range-veteran (4
 *    cursors x clean/both, passive player) selected the Immelmann at
 *    15.7-17.2 s, 1.1 km out, in Extend's 13-42° dive. It exited about
 *    2.4 km out at about 76 m/s, still on Extend, and the first post-merge
 *    shot slipped from 90.0-111.7 s (clean) and 70.2-72.9 s (both) to
 *    133.4-138.1 s and 122.4-130.0 s; clean cursor 23757 never fired within
 *    aiReengage's 150 s budget.
 *  - Method: those 8 runs and the 8 tail-chase fixture runs, flown for 150 s
 *    with the Immelmann taken out of the repertoire (HEAD's trajectory),
 *    reading the flight path at every rescore that meets every other
 *    Immelmann condition. There are 55 such rescores, all in
 *    pursuit-range-veteran, at -42.0° to -13.1°; the tail chase has none.
 *    So any value above -13.1° leaves those runs exactly as they were, and
 *    the veteran flies no Immelmann there (0 ticks). At -15°, clean cursor 0
 *    flew one and never fired again. -5° is kept: 8° clear of the steepest
 *    shipped entry it must reject, and 5° below the level entry of the
 *    signature worlds (tests/sim/ai/immelmann.test.ts), which select it at
 *    the first rescore. */
export const IMMELMANN_MIN_PATH_RAD = -5 * Math.PI / 180

/**
 * The repertoire a pilot flies in this airframe: its skill's, less whatever
 * the airframe's own content excludes (`spec.ai.excludedManeuvers`, 7c Task
 * 14). Generic on purpose: spec §7 forbids AI code naming an airframe, so the
 * Zero's exclusion of the Immelmann (Mark, 2026-09-26) lives in its JSON.
 * Pure and deterministic; returns the skill's own array when nothing is
 * excluded, and never mutates the skill, which is shared data.
 */
export function airframeRepertoire(skill: PilotSkill, spec: AircraftSpec): readonly ManeuverName[] {
  const excluded: readonly string[] | undefined = spec.ai?.excludedManeuvers
  if (excluded === undefined || excluded.length === 0) return skill.repertoire
  return skill.repertoire.filter((n) => !excluded.includes(n))
}

/** The named maneuver for this rescore. With nothing special in the picture
 *  it is the intent's default, which keeps 7b's regression floor. Task 8
 *  adds the Pursue family (lag pursuit, high yo-yo, low yo-yo), Task 9 the
 *  attack run, which outranks them all when the height is there and the
 *  pairing is not a turnfight (spec §3.5's envelope gate), Task 10 the
 *  Break family (scissors, split-S), Task 11 the Immelmann (Extend). */
export function selectManeuver(m: ManeuverFacts, repertoire: readonly ManeuverName[]): ManeuverName {
  const has = (n: ManeuverName): boolean => repertoire.includes(n)
  const f = m.facts
  if (m.intent === 'pursue') {
    // The attack run also needs the target ahead of our 3/9 line. Without
    // that, a new run opens as soon as the latch closes, with the target
    // behind, and turns back down after it: the first run then regains 0.561
    // of the height it lost instead of 0.869 (spec signature >= 0.6;
    // measured 2026-09-26 in tests/sim/ai/attackRun.test.ts's world). Lead
    // pursuit brings the target ahead again first.
    if (has('attack-run') && m.envelope.pairing !== 'turnfight' && m.heightOverTargetM >= ATTACK_RUN_HEIGHT_M && !m.threatBehind) return 'attack-run'
    const turning = m.targetTurnRateRadPerS >= TARGET_TURNING_RAD_PER_S
    const overshoot = turning && f.rangeM < OVERSHOOT_RANGE_M && m.closureMps > OVERSHOOT_CLOSURE_MPS
    if (overshoot && has('high-yo-yo') && f.relativeEnergyJPerKg >= 0) return 'high-yo-yo'
    if (overshoot && has('lag-pursuit')) return 'lag-pursuit'
    if (turning && has('low-yo-yo') && f.rangeM > LOW_YOYO_RANGE_M && m.closureMps < 0 &&
        m.heightAboveGroundM >= FLOOR_M + LOW_YOYO_HEIGHT_MARGIN_M) return 'low-yo-yo'
  }
  if (m.intent === 'break') {
    // Scissors needs turnAdvantage >= 1 (spec §3.5's envelope gate): a
    // boom-and-zoom airframe does not get into a flat scissors with a better
    // turner. The split-S needs the threat behind our 3/9 line as well as
    // astern (ruling R12): at a head-on merge the player's gun cone is on us
    // too, and a split-S there would cost the player's head-on shot.
    if (has('scissors') && m.threatBehind && f.rangeM < SCISSORS_RANGE_M && m.velocityAngleRad < SCISSORS_ANGLE_RAD &&
        m.selfSpeedMps < m.selfCornerSpeedMps && m.targetSpeedMps < m.targetCornerSpeedMps &&
        m.envelope.turnAdvantage >= 1) return 'scissors'
    if (has('split-s') && f.threatAstern && m.threatBehind && m.heightAboveGroundM >= SPLIT_S_MIN_HEIGHT_M &&
        m.selfSpeedMps < SPLIT_S_MAX_SPEED_FRACTION * m.selfDiveSpeedMps) return 'split-s'
  }
  // The Immelmann replaces Extend's shallow-climb rejoin (the part of
  // extendDesiredVelocity beyond SAFE_SEPARATION_M) when there is the speed
  // for a half loop: at or above corner speed (spec §3.5), from near-level
  // flight (IMMELMANN_MIN_PATH_RAD). It also needs the threat behind our 3/9
  // line, which the plan's condition left out: the half loop reverses the
  // heading, so it is the rejoin only while we are running away. Without
  // it, a veteran Zero that had already Immelmanned back toward the threat
  // (tests/sim/ai/immelmann.test.ts's world) reached corner speed again 12 s
  // after the first one ended, still on Extend, and a second half loop
  // turned it away from the threat (measured 2026-09-26).
  if (m.intent === 'extend' && has('immelmann') && m.threatBehind && f.rangeM > SAFE_SEPARATION_M &&
      m.selfSpeedMps >= m.selfCornerSpeedMps && m.selfFlightPathRad >= IMMELMANN_MIN_PATH_RAD) return 'immelmann'
  return DEFAULT_MANEUVER[m.intent]
}

const PHASED: ReadonlySet<ManeuverName> = new Set<ManeuverName>(['lag-pursuit', 'high-yo-yo', 'low-yo-yo', 'attack-run', 'scissors', 'split-s', 'immelmann'])
export const isPhased = (name: ManeuverName): boolean => PHASED.has(name)

export const latchExpired = (latch: ManeuverLatch, nowS: number): boolean => nowS - latch.enteredAtS >= LATCH_CAP_S

/** Spec §3.5: the only intent that interrupts a latch is a Break forced by a
 *  threat astern (safety overrides clear latches in pilotTick). */
export function interruptsLatch(latch: ManeuverLatch, intent: PilotManeuver, facts: DecisionFacts): boolean {
  return intent === 'break' && facts.threatAstern && INTENT_OF[latch.name] !== 'break'
}

/** Loop radius for a vertical maneuver at `speedMps` and `loadFactorG`:
 *  R = V^2 / (g (n - 1)). Used by the split-S and the Immelmann (Tasks 10, 11). */
export const loopRadiusM = (speedMps: number, loadFactorG: number): number =>
  (speedMps * speedMps) / (9.80665 * Math.max(0.5, loadFactorG - 1))

export function openLatch<M>(name: ManeuverName, self: AircraftEntity<M>, nowS: number): ManeuverLatch {
  const v = self.state.velocity
  // The split-S pulls through around a center one loop radius below the
  // entry point, the Immelmann around a center one loop radius above it, both at
  // the G budget. The center is fixed here so the pull is not re-aimed.
  const r = loopRadiusM(length(v), loadFactorBudget(self.spec))
  const pos = self.state.position
  const loopCenter: Vec3 = name === 'split-s' ? add(pos, v3(0, -r, 0)) : name === 'immelmann' ? add(pos, v3(0, r, 0)) : ZERO
  return {
    name, phase: 0, enteredAtS: nowS,
    entryHeadingRad: Math.atan2(v.z, v.x),
    entryAltitudeM: self.state.position.y,
    loopCenter,
    reversals: 0, lastSide: 0,
    lowestAltitudeM: self.state.position.y,
  }
}
