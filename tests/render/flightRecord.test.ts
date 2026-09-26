import { describe, expect, it } from 'vitest'
import { EMPTY_SEGMENT, stepSegment } from '../../src/render/flightRecord.js'
import { DT } from '../../src/sim/flight/model.js'

const air = { altitudeM: 1000, speedMps: 100, airborne: true }

describe('flight segment (dossier spec §B.2)', () => {
  it('accrues seconds from world ticks, only while airborne', () => {
    let s = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 60 })
    expect(s.flightSeconds).toBeCloseTo(60 * DT, 10)
    s = stepSegment(s, { ...air, ticksAdvanced: 60, airborne: false })
    expect(s.flightSeconds).toBeCloseTo(60 * DT, 10)
  })

  it('a paused frame (0 ticks) adds no time; triple time (3x ticks) adds 3x', () => {
    const paused = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 0 })
    expect(paused.flightSeconds).toBe(0)
    const triple = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: 3 })
    expect(triple.flightSeconds).toBeCloseTo(3 * DT, 10)
  })

  it('keeps the peak altitude and speed, on the ground too', () => {
    let s = stepSegment(EMPTY_SEGMENT, { ticksAdvanced: 1, altitudeM: 3000, speedMps: 150, airborne: true })
    s = stepSegment(s, { ticksAdvanced: 1, altitudeM: 500, speedMps: 60, airborne: true })
    s = stepSegment(s, { ticksAdvanced: 1, altitudeM: 10, speedMps: 170, airborne: false })
    expect(s.maxAltitudeM).toBe(3000)
    expect(s.maxTrueAirspeedMps).toBe(170)
  })

  it('records the air-relative speed the caller passes as true airspeed', () => {
    // The caller (main.ts, a later task) passes length(airVelocity(state, world.wind))
    // because the sim couples a scenario wind since Plan 8 (commit 56ff8b4).
    const s = stepSegment(EMPTY_SEGMENT, { ticksAdvanced: 1, altitudeM: 0, speedMps: 123.4, airborne: true })
    expect(s.maxTrueAirspeedMps).toBe(123.4)
  })

  it('ignores a negative tick delta (a Restart rewinds the world clock)', () => {
    const s = stepSegment(EMPTY_SEGMENT, { ...air, ticksAdvanced: -500 })
    expect(s.flightSeconds).toBe(0)
  })
})
