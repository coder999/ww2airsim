import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { measureClimbRate } from '../../../tools/testcards/measure.js'

const f6f = loadAircraftSpec('f6f-hellcat')

// Finding 9: the "climbs more slowly at altitude" card below needs the same
// sea-level climb rate the card above it already measured (a ~152,000-step
// sweep). Hoisted so it is computed once, not twice.
const climbRateSeaLevel = measureClimbRate(f6f, 0)

describe('F6F-5 flight test card', () => {
  it('climbs more slowly at altitude than at sea level', () => {
    expect(measureClimbRate(f6f, 8000)).toBeLessThan(climbRateSeaLevel)
  })

  /**
   * The climb card is a LONGITUDINAL measurement: a wings-level, zero-sideslip
   * climb at a held attitude has no lateral force at all, so its reading must
   * not move by a single bit when `aero.cySlopePerRad` does. Bit-identical,
   * not merely close, because the side force is `q * S * Cy * beta` with beta
   * exactly 0 at every settled sweep point -- `0 * anything` is `0`.
   *
   * Added 2026-09-17 after the card was found reading 15.8 / 20.5 / 15.8 /
   * 22.1 / 22.9 m/s at coefficients 0.1 / 0.2 / 0.5 / 0.7 / 0.9. The cause
   * was NOT a path-dependent settling branch, as the handoff of that date
   * first diagnosed: every attitude from 0 to 30 degrees settles to the same
   * state at every coefficient. From 32 degrees up the airplane departs in
   * the transient, rolls through 180 degrees and is still tumbling when the
   * sample window opens; those samples are intermittently unstalled, so the
   * stalled-sample filter let them through, and their vertical speed is
   * whatever the tumble happened to be doing that second. `measureClimbRate`
   * now accepts only a STEADY sample -- see `STEADY_PITCH_ERR_RAD` in measure.ts.
   *
   * These are the four coefficients of the original table, and the whole
   * physical range published for this class (0.5-1.0/rad) sits inside them.
   */
  it('reads the same climb rate at any lateral-force coefficient', () => {
    for (const cySlopePerRad of [0.2, 0.5, 0.7, 0.9]) {
      const lateral = { ...f6f, aero: { ...f6f.aero, cySlopePerRad } }
      expect(measureClimbRate(lateral, 0), `cySlopePerRad ${cySlopePerRad}`).toBe(climbRateSeaLevel)
    }
  })
})
