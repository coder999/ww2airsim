import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState } from '../flight/state.js'
import { massKg } from '../flight/model.js'

const G_MPS2 = 9.80665
const DEG = Math.PI / 180

/** Tuning values from 7c spec §3.3: above 1.1 we out-turn the target enough
 *  to fight flat; below 0.9 we should not. */
export const TURNFIGHT_THRESHOLD = 1.1
export const BOOM_AND_ZOOM_THRESHOLD = 0.9

export type Pairing = 'turnfight' | 'boom-and-zoom' | 'neutral'

export type AirframeEnvelope = {
  readonly wingLoadingNPerM2: number
  readonly powerLoadingWPerN: number
  readonly cornerSpeedMps: number
  readonly diveSpeedMps: number
  readonly gLimit: number
  readonly maxRollRateRadPerS: number
  readonly maxPitchRateRadPerS: number
}

/**
 * What an AI knows about an airframe, derived from fields every AircraftSpec
 * already carries (7c spec §3.3). This replaces master spec §9's
 * hand-authored `aiHint`, so a new airframe needs no AI content. Wing and
 * power loading use the model's own mass (`massKg`: empty weight plus
 * remaining fuel), so they move as fuel burns. Corner speed is the speed at
 * which the stall and the G limit meet: stall speed x sqrt(gLimit).
 */
export function airframeEnvelope(spec: AircraftSpec, state: AircraftState): AirframeEnvelope {
  const weightN = massKg(spec, state) * G_MPS2
  return {
    wingLoadingNPerM2: weightN / spec.geometry.wingAreaM2,
    powerLoadingWPerN: (spec.engine.maxPowerW * spec.engine.propEfficiency) / weightN,
    cornerSpeedMps: spec.reference.stallSpeedMps * Math.sqrt(spec.limits.gLimit),
    diveSpeedMps: spec.limits.diveSpeedMps,
    gLimit: spec.limits.gLimit,
    maxRollRateRadPerS: spec.rates.maxRollRateDegPerSec * DEG,
    maxPitchRateRadPerS: spec.rates.maxPitchRateDegPerSec * DEG,
  }
}

export type RelativeEnvelope = {
  /** Target's wing loading over ours: above 1 means we out-turn it. */
  readonly turnAdvantage: number
  /** Our power loading over the target's: above 1 means we out-climb it. */
  readonly climbAdvantage: number
  /** Our dive limit over the target's. */
  readonly diveAdvantage: number
  readonly pairing: Pairing
}

export function relativeEnvelope(self: AirframeEnvelope, target: AirframeEnvelope): RelativeEnvelope {
  const turnAdvantage = target.wingLoadingNPerM2 / self.wingLoadingNPerM2
  return {
    turnAdvantage,
    climbAdvantage: self.powerLoadingWPerN / target.powerLoadingWPerN,
    diveAdvantage: self.diveSpeedMps / target.diveSpeedMps,
    pairing: turnAdvantage >= TURNFIGHT_THRESHOLD ? 'turnfight'
      : turnAdvantage <= BOOM_AND_ZOOM_THRESHOLD ? 'boom-and-zoom'
        : 'neutral',
  }
}
