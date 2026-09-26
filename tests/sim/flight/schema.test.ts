import { describe, it, expect } from 'vitest'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const valid = {
  id: 'test-plane',
  name: 'Test Plane',
  role: 'fighter',
  geometry: { wingAreaM2: 30, wingSpanM: 13 },
  mass: { emptyKg: 4000, fuelCapacityKg: 600, maxTakeoffKg: 6000 },
  aero: { clSlopePerRad: 4.6, clMax: 1.4, alphaCritDeg: 15.5, clAtZeroAlpha: 0.1, cySlopePerRad: 0.5, cd0: 0.021, oswaldE: 0.85 },
  engine: {
    maxPowerW: 1_491_000, propEfficiency: 0.8,
    windmillCd0: 0.0422, staticThrustN: 20_000,
    powerFractionByAltitudeM: [[0, 1], [7132, 1], [11400, 0.6]],
  },
  rates: {
    maxRollRateDegPerSec: 80,
    maxPitchRateDegPerSec: 30,
    maxYawRateDegPerSec: 15,
    rateRefSpeedMps: 103,
    weathercockSeconds: 1.5,
    autoRudderGainPerDeg: 0.1,
    stallLimiterSeconds: 0.15,
    
  },
  limits: { diveSpeedMps: 216, gLimit: 7.5 },
  gear: {
    travelSeconds: 7,
    dragAreaM2: 0.3,
    rollingResistanceCoeff: 0.02,
    brakingResistanceCoeff: 0.4,
    tailUpSpeedMps: 15,
    tailwheelYawRateDegPerSec: 20,
    lateralGripSeconds: 1.5,
    heightM: 2.2,
  },
  flap: { travelSeconds: 5, dragAreaM2: 0.6, clIncrement: 0.4831 },
  reference: {
    source: 'test', testMassKg: 5600, topSpeedMps: 170, topSpeedAltitudeM: 7132,
    climbRateMps: 17, stallSpeedMps: 38, stallSpeedFlapMps: 33, rollRateDegPerSec: 80,
    takeoffDistanceM: 230,
  },
  view: { eyePointM: [1.2, 0.9, 0], model: 'wildcat' },
}

describe('AircraftSpec validation (spec §9)', () => {
  it('accepts a well-formed spec', () => {
    expect(parseAircraftSpec(valid).id).toBe('test-plane')
  })

  it('requires a view block with an eye point', () => {
    const withoutView: Record<string, unknown> = { ...valid }
    delete withoutView['view']
    expect(() => parseAircraftSpec(withoutView)).toThrow(/view/)
  })

  it('rejects an eye point that is not three finite numbers', () => {
    expect(() => parseAircraftSpec({ ...valid, view: { eyePointM: [0, 1], model: 'wildcat' } })).toThrow(/eyePointM/)
    expect(() => parseAircraftSpec({ ...valid, view: { eyePointM: [0, 1, NaN], model: 'wildcat' } })).toThrow(/eyePointM/)
  })

  it('requires view.model, a lowercase model id', () => {
    expect(() => parseAircraftSpec({ ...valid, view: { eyePointM: [1.2, 0.9, 0] } })).toThrow(/model/)
    expect(() => parseAircraftSpec({ ...valid, view: { eyePointM: [1.2, 0.9, 0], model: 'Wildcat' } })).toThrow(/lowercase model id/)
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

  it('rejects an empty power curve with the field named, not a raw TypeError', () => {
    const bad = { ...valid, engine: { ...valid.engine, powerFractionByAltitudeM: [] } }
    expect(() => parseAircraftSpec(bad)).toThrow(/powerFractionByAltitudeM/)
  })

  it('rejects a testMassKg above mass.maxTakeoffKg, naming both values', () => {
    const bad = {
      ...valid,
      reference: { ...valid.reference, testMassKg: valid.mass.maxTakeoffKg + 1 },
    }
    expect(() => parseAircraftSpec(bad)).toThrow(/testMassKg/)
    expect(() => parseAircraftSpec(bad)).toThrow(/maxTakeoffKg/)
  })

  /**
   * Finding I6: Zod strips unknown keys by default, so before `.strict()` a
   * misspelled key was silently dropped and the airplane flew on the value
   * the author thought they had overridden. `"cdO"` next to a present `cd0`
   * is the exact case found -- it validated clean and vanished.
   */
  describe('rejects keys the schema does not declare (finding I6)', () => {
    it('rejects a misspelled sub-object key, naming the offending key', () => {
      const bad = { ...valid, aero: { ...valid.aero, cdO: 0.5 } }
      expect(() => parseAircraftSpec(bad)).toThrow(/cdO/)
      // And it says where, not just what.
      expect(() => parseAircraftSpec(bad)).toThrow(/aero/)
    })

    it('rejects an unknown top-level key', () => {
      const bad = { ...valid, aerodynamics: { cd0: 0.02 } }
      expect(() => parseAircraftSpec(bad)).toThrow(/aerodynamics/)
    })

    it.each(['geometry', 'mass', 'aero', 'engine', 'rates', 'limits', 'gear', 'reference', 'view'] as const)(
      'rejects an unknown key inside %s',
      (section) => {
        const bad = {
          ...valid,
          [section]: { ...(valid[section] as Record<string, unknown>), notAField: 1 },
        }
        expect(() => parseAircraftSpec(bad)).toThrow(/notAField/)
      },
    )
  })

  it('loads and validates the real F6F content file', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    expect(f6f.id).toBe('f6f-hellcat')
    expect(f6f.reference.source).not.toBe('')
    expect(f6f.geometry.wingAreaM2).toBeGreaterThan(0)
  })

  it('loads and validates the real F4F-4 Wildcat content file', () => {
    const f4f = loadAircraftSpec('f4f-wildcat')
    expect(f4f.id).toBe('f4f-wildcat')
    expect(f4f.reference.source).not.toBe('')
    expect(f4f.geometry.wingAreaM2).toBeGreaterThan(0)
  })

  it('the F6F is a fighter (master spec §8 scoring role)', () => {
    expect(loadAircraftSpec('f6f-hellcat').role).toBe('fighter')
  })

  it('requires role to be fighter or bomber', () => {
    const bad: Record<string, unknown> = { ...valid, role: 'transport' }
    expect(() => parseAircraftSpec(bad)).toThrow(/role/)
    const missing: Record<string, unknown> = { ...valid }
    delete missing['role']
    expect(() => parseAircraftSpec(missing)).toThrow(/role/)
    expect(() => parseAircraftSpec({ ...valid, role: 'bomber' })).not.toThrow()
  })
})

describe('optional reference tables (A6M plan Z2)', () => {
  const withReference = (reference: Record<string, unknown>) => ({ ...valid, reference })

  it('accepts a spec whose trial gives no take-off distance', () => {
    const reference: Record<string, unknown> = { ...valid.reference }
    delete reference['takeoffDistanceM']
    expect(parseAircraftSpec(withReference(reference)).reference.takeoffDistanceM).toBeUndefined()
  })

  it('accepts level speed and climb tables by altitude', () => {
    const spec = parseAircraftSpec(withReference({
      ...valid.reference,
      topSpeedByAltitudeM: [[0, 120.7], [1524, 128.3]],
      climbRateByAltitudeM: [[4572, 12.09]],
    }))
    expect(spec.reference.topSpeedByAltitudeM).toEqual([[0, 120.7], [1524, 128.3]])
    expect(spec.reference.climbRateByAltitudeM).toEqual([[4572, 12.09]])
  })

  it('rejects a table whose altitudes do not strictly increase', () => {
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, topSpeedByAltitudeM: [[1524, 128], [1524, 130]] })))
      .toThrow(/topSpeedByAltitudeM.*strictly increase/)
  })

  it('rejects a negative altitude, a non-positive value, and an empty table', () => {
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, climbRateByAltitudeM: [[-1, 12]] }))).toThrow(/climbRateByAltitudeM/)
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, climbRateByAltitudeM: [[0, 0]] }))).toThrow(/climbRateByAltitudeM/)
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, climbRateByAltitudeM: [] }))).toThrow(/climbRateByAltitudeM/)
  })

  it('stays strict: a misspelled table name still fails', () => {
    expect(() => parseAircraftSpec(withReference({ ...valid.reference, topSpeedByAltitude: [[0, 120]] }))).toThrow(/topSpeedByAltitude/)
  })

  it('the real F6F still carries its sourced take-off distance', () => {
    expect(loadAircraftSpec('f6f-hellcat').reference.takeoffDistanceM).toBe(230.124)
  })
})
