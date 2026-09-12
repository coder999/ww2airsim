import { describe, it, expect } from 'vitest'
import { parseAircraftSpec, loadAircraftSpec } from '../../../src/sim/content.js'

const valid = {
  id: 'test-plane',
  name: 'Test Plane',
  geometry: { wingAreaM2: 30, wingSpanM: 13 },
  mass: { emptyKg: 4000, fuelCapacityKg: 600, maxTakeoffKg: 6000 },
  aero: { clSlopePerRad: 4.6, clMax: 1.4, alphaCritDeg: 15.5, clAtZeroAlpha: 0.1, cd0: 0.021, oswaldE: 0.85 },
  engine: {
    maxPowerW: 1_491_000, propEfficiency: 0.8, staticThrustN: 20_000,
    powerFractionByAltitudeM: [[0, 1], [7132, 1], [11400, 0.6]],
  },
  rates: { maxRollRateDegPerSec: 80, maxPitchRateDegPerSec: 30, maxYawRateDegPerSec: 15, rateRefSpeedMps: 103 },
  limits: { diveSpeedMps: 216, gLimit: 7.5 },
  reference: { source: 'test', topSpeedMps: 170, topSpeedAltitudeM: 7132, climbRateMps: 17, stallSpeedMps: 38, rollRateDegPerSec: 80 },
}

describe('AircraftSpec validation (spec §9)', () => {
  it('accepts a well-formed spec', () => {
    expect(parseAircraftSpec(valid).id).toBe('test-plane')
  })

  it('rejects NaN rather than letting it reach the integrator', () => {
    const bad = { ...valid, mass: { ...valid.mass, emptyKg: Number.NaN } }
    expect(() => parseAircraftSpec(bad)).toThrow(/emptyKg/)
  })

  it('rejects a missing required field with a field name in the message', () => {
    const withoutAero: Record<string, unknown> = { ...valid }
    delete withoutAero['aero']
    expect(() => parseAircraftSpec(withoutAero)).toThrow(/aero/)
  })

  it('rejects non-positive wing area', () => {
    const bad = { ...valid, geometry: { ...valid.geometry, wingAreaM2: 0 } }
    expect(() => parseAircraftSpec(bad)).toThrow(/wingAreaM2/)
  })

  it('rejects a power curve that does not start at sea level', () => {
    const bad = { ...valid, engine: { ...valid.engine, powerFractionByAltitudeM: [[1000, 1]] } }
    expect(() => parseAircraftSpec(bad)).toThrow(/sea level/)
  })

  it('loads and validates the real F6F content file', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    expect(f6f.id).toBe('f6f-hellcat')
    expect(f6f.reference.source).not.toBe('')
    expect(f6f.geometry.wingAreaM2).toBeGreaterThan(0)
  })
})
