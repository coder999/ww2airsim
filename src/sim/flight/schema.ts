import { z } from 'zod'

/** Rejects NaN and Infinity. Zod's .number() accepts NaN, which is the exact
 *  failure mode spec §9 warns about: a NaN reaching the integrator. */
const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })
const fraction = finite.refine((n) => n > 0 && n <= 1, { message: 'must be in (0, 1]' })

export const AircraftSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  geometry: z.object({ wingAreaM2: positive, wingSpanM: positive }),
  mass: z.object({ emptyKg: positive, fuelCapacityKg: positive, maxTakeoffKg: positive }),
  aero: z.object({
    clSlopePerRad: positive,
    clMax: positive,
    alphaCritDeg: positive,
    clAtZeroAlpha: finite,
    cd0: positive,
    oswaldE: fraction,
  }),
  engine: z.object({
    maxPowerW: positive,
    propEfficiency: fraction,
    staticThrustN: positive,
    powerFractionByAltitudeM: z
      .array(z.tuple([finite, fraction]))
      .min(2)
      .refine((pts) => pts[0]![0] === 0, { message: 'power curve must start at sea level (altitude 0)' })
      .refine((pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1]![0]), {
        message: 'power curve altitudes must strictly increase',
      }),
  }),
  rates: z.object({
    maxRollRateDegPerSec: positive,
    maxPitchRateDegPerSec: positive,
    maxYawRateDegPerSec: positive,
    rateRefSpeedMps: positive,
  }),
  limits: z.object({ diveSpeedMps: positive, gLimit: positive }),
  reference: z.object({
    source: z.string().min(1),
    topSpeedMps: positive,
    topSpeedAltitudeM: positive,
    climbRateMps: positive,
    stallSpeedMps: positive,
    rollRateDegPerSec: positive,
  }),
})

export type AircraftSpec = z.infer<typeof AircraftSpecSchema>
