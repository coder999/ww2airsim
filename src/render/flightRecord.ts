import { DT } from '../sim/flight/model.js'
import type { LandingAt } from '../sim/landing.js'

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

/**
 * The trap-vs-field split for a completed landing (dossier spec §B.5):
 * a carrier touchdown banks as `'trap'`, everything else -- a real airfield
 * OR an off-field landing (`at: null`, no field or deck under the touchdown)
 * -- banks as `'field'`. Extracted from main.ts's inline ternary (fix round
 * 2 finding 6) so it has a Tier 1 test of its own; main.ts still does the
 * wiring (tests/render/flightRecord.test.ts's own site-count checks that).
 */
export function landingKind(report: { readonly at: LandingAt | null }): 'trap' | 'field' {
  return report.at?.kind === 'carrier' ? 'trap' : 'field'
}
