import type { AircraftEntity } from '../loop.js'
import { length, sub, dot, v3, ZERO, type Vec3 } from '../math/vec3.js'
import type { DecisionFacts } from './decision.js'
import { airframeEnvelope, relativeEnvelope, type RelativeEnvelope } from './envelope.js'
import { DEFAULT_MANEUVER, INTENT_OF, type ManeuverLatch, type ManeuverName, type PilotManeuver } from './pilot.js'

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
  }
}

/** The named maneuver for this rescore. With nothing special in the picture
 *  it is the intent's default, which keeps 7b's regression floor. Tasks 8-11
 *  add one branch per maneuver. */
export function selectManeuver(m: ManeuverFacts, repertoire: readonly ManeuverName[]): ManeuverName {
  void repertoire
  return DEFAULT_MANEUVER[m.intent]
}

const PHASED: ReadonlySet<ManeuverName> = new Set<ManeuverName>([])
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
