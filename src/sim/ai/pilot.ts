export type PilotSkill = {
  /** Seconds between decision-layer rescores. Lower = reacts faster. This
   *  IS "reaction delay" (master spec §7) -- the decision layer's own
   *  rescore cadence gates how fast a pilot changes its mind; there is no
   *  separate buffered-observation mechanism. */
  readonly reactionS: number
  /** 0-1. Scales AI_GUN_CONE_RAD's half-angle; 1.0 leaves the cone
   *  unchanged. Does not change AI_GUN_RANGE_M. */
  readonly gunneryAccuracy: number
  /** 0-1. Scales how much relative-energy margin Pursue needs over Extend
   *  before Pursue still wins the score. Higher = holds the attack longer. */
  readonly energyDiscipline: number
  /** Relative-energy floor (same units as the decision layer's energy term)
   *  below which Extend is forced -- reserved for a future slice; this
   *  plan's forced override is range-based (MIN_ENGAGEMENT_RANGE_M) only. */
  readonly disengageThreshold: number
}

export const VETERAN_SKILL: PilotSkill = {
  reactionS: 0.3,
  gunneryAccuracy: 0.6,
  energyDiscipline: 0.7,
  disengageThreshold: -400,
}

export const GREEN_SKILL: PilotSkill = {
  reactionS: 1.0,
  gunneryAccuracy: 1.0,
  energyDiscipline: 0.3,
  disengageThreshold: -150,
}

export type PilotManeuver = 'pursue' | 'extend' | 'break'

export type PilotDecisionState = {
  readonly maneuver: PilotManeuver
  /** Sim time (tick * DT) at which the next rescore runs. */
  readonly nextRescoreS: number
}
