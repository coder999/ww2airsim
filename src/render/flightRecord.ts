import { DT } from '../sim/flight/model.js'

/**
 * One scored stretch of flight, from a New game / Restart / previous bank
 * to the next debrief (dossier spec §B.2). Time comes from WORLD TICKS
 * advanced, not wall time, so a paused world, the title or the chart adds
 * nothing and triple time counts triple.
 */
export type FlightSegment = {
  readonly flightSeconds: number
  readonly maxAltitudeM: number
  readonly maxTrueAirspeedMps: number
}

export const EMPTY_SEGMENT: FlightSegment = { flightSeconds: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0 }

export type SegmentSample = {
  readonly ticksAdvanced: number
  readonly altitudeM: number
  /** Air-relative speed: length(airVelocity(state, world.wind)). The sim couples a scenario wind. */
  readonly speedMps: number
  readonly airborne: boolean
}

export function stepSegment(s: FlightSegment, sample: SegmentSample): FlightSegment {
  const ticks = Math.max(0, sample.ticksAdvanced)
  return {
    flightSeconds: s.flightSeconds + (sample.airborne ? ticks * DT : 0),
    maxAltitudeM: Math.max(s.maxAltitudeM, sample.altitudeM),
    maxTrueAirspeedMps: Math.max(s.maxTrueAirspeedMps, sample.speedMps),
  }
}
