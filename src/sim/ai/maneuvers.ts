import type { AircraftEntity } from '../loop.js'
import { length, sub, dot, v3, ZERO, type Vec3 } from '../math/vec3.js'
import type { DecisionFacts } from './decision.js'
import { airframeEnvelope, relativeEnvelope, type RelativeEnvelope } from './envelope.js'
import { DEFAULT_MANEUVER, INTENT_OF, type ManeuverLatch, type ManeuverName, type PilotManeuver } from './pilot.js'
import { closureRateMps } from './pursuit.js'
import { FLOOR_M } from './safety.js'

/** Spec §3.5: a phased maneuver holds at most this long. */
export const LATCH_CAP_S = 20

/** Everything the selector reads, all live at the rescore instant, as 7b's
 *  intent facts are. */
export type ManeuverFacts = {
  readonly intent: PilotManeuver
  readonly facts: DecisionFacts
  readonly envelope: RelativeEnvelope
  readonly selfSpeedMps: number
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

/** Tuning values from spec §3.5's table; measured in the Task 8 signature
 *  tests. A target is "turning" above about 3°/s. */
export const TARGET_TURNING_RAD_PER_S = 0.05
export const OVERSHOOT_RANGE_M = 600
export const OVERSHOOT_CLOSURE_MPS = 40
export const LOW_YOYO_RANGE_M = 400
export const LOW_YOYO_HEIGHT_MARGIN_M = 500

/** The named maneuver for this rescore. With nothing special in the picture
 *  it is the intent's default, which keeps 7b's regression floor. Task 8
 *  adds the Pursue family (lag pursuit, high yo-yo, low yo-yo); Tasks 9-11
 *  add the rest. */
export function selectManeuver(m: ManeuverFacts, repertoire: readonly ManeuverName[]): ManeuverName {
  const has = (n: ManeuverName): boolean => repertoire.includes(n)
  const f = m.facts
  if (m.intent === 'pursue') {
    const turning = m.targetTurnRateRadPerS >= TARGET_TURNING_RAD_PER_S
    const overshoot = turning && f.rangeM < OVERSHOOT_RANGE_M && m.closureMps > OVERSHOOT_CLOSURE_MPS
    if (overshoot && has('high-yo-yo') && f.relativeEnergyJPerKg >= 0) return 'high-yo-yo'
    if (overshoot && has('lag-pursuit')) return 'lag-pursuit'
    if (turning && has('low-yo-yo') && f.rangeM > LOW_YOYO_RANGE_M && m.closureMps < 0 &&
        m.heightAboveGroundM >= FLOOR_M + LOW_YOYO_HEIGHT_MARGIN_M) return 'low-yo-yo'
  }
  return DEFAULT_MANEUVER[m.intent]
}

const PHASED: ReadonlySet<ManeuverName> = new Set<ManeuverName>(['lag-pursuit', 'high-yo-yo', 'low-yo-yo'])
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
  const loopCenter: Vec3 = ZERO
  void v3
  return {
    name, phase: 0, enteredAtS: nowS,
    entryHeadingRad: Math.atan2(v.z, v.x),
    entryAltitudeM: self.state.position.y,
    loopCenter,
    reversals: 0, lastSide: 0,
    lowestAltitudeM: self.state.position.y,
  }
}
