import { z } from 'zod'

/**
 * Every object below is `.strict()`, top level and each sub-object.
 *
 * Finding I6: Zod strips unknown keys by default, so a content typo was
 * silently dropped rather than reported -- `"cdO": 0.5` sitting next to a
 * present `cd0` validated clean and vanished, and the aeroplane flew on the
 * value the author thought they had overridden. Spec §9 requires malformed
 * content to fail loudly, and a key the schema has never heard of is
 * malformed content. Adding a field here therefore now has to be done in both
 * places, which is the point.
 */

/** Rejects NaN and Infinity. Zod's .number() accepts NaN, which is the exact
 *  failure mode spec §9 warns about: a NaN reaching the integrator. */
const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })
const fraction = finite.refine((n) => n > 0 && n <= 1, { message: 'must be in (0, 1]' })

const AircraftSpecObject = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  geometry: z.object({ wingAreaM2: positive, wingSpanM: positive }).strict(),
  mass: z.object({ emptyKg: positive, fuelCapacityKg: positive, maxTakeoffKg: positive }).strict(),
  aero: z.object({
    clSlopePerRad: positive,
    clMax: positive,
    alphaCritDeg: positive,
    clAtZeroAlpha: finite,
    cd0: positive,
    oswaldE: fraction,
  }).strict(),
  engine: z.object({
    maxPowerW: positive,
    propEfficiency: fraction,
    staticThrustN: positive,
    powerFractionByAltitudeM: z
      .array(z.tuple([finite, fraction]))
      .min(2)
      .refine((pts) => pts.length === 0 || pts[0]![0] === 0, {
        message: 'power curve must start at sea level (altitude 0)',
      })
      // `.every` on an empty/undersized array never dereferences pts[i - 1], so
      // this one is safe even when the preceding `.min(2)` has already failed
      // (a "dirty" but not aborted parse still runs later refinements).
      .refine((pts) => pts.every((p, i) => i === 0 || p[0] > pts[i - 1]![0]), {
        message: 'power curve altitudes must strictly increase',
      }),
  }).strict(),
  rates: z.object({
    maxRollRateDegPerSec: positive,
    maxPitchRateDegPerSec: positive,
    maxYawRateDegPerSec: positive,
    rateRefSpeedMps: positive,
  }).strict(),
  limits: z.object({ diveSpeedMps: positive, gLimit: positive }).strict(),
  reference: z.object({
    source: z.string().min(1),
    /** Gross weight the cited trial was flown at, kg. Every reference figure
     *  below is weight-dependent, so a measurement harness that spawns at any
     *  other mass is comparing apples to oranges (Ruling R31). Note this is a
     *  gross weight, not a fuel load: `mass.emptyKg + fuelKg` is the model's
     *  only mass expression, so a harness reproducing it has to carry the
     *  pilot, oil and ammunition in `fuelKg` -- see tools/testcards/measure.ts. */
    testMassKg: positive,
    topSpeedMps: positive,
    topSpeedAltitudeM: positive,
    climbRateMps: positive,
    stallSpeedMps: positive,
    rollRateDegPerSec: positive,
    /** Ground-roll distance the cited trial measured for take-off, metres.
     *  The model has no flaps, no rolling friction and no ground effect, so
     *  the card grading this is expected to run a bit short of the trial
     *  figure -- see the tolerance comment on that card in f6f.test.ts. */
    takeoffDistanceM: positive,
  }).strict(),
}).strict()

/** Cross-field: the trial the reference block was measured at has to be a
 *  loading the aeroplane can actually fly, i.e. at or under its own
 *  documented maximum take-off weight. This is on the whole object, not the
 *  `reference` sub-schema, because it has to see `mass` too -- a mistyped or
 *  mis-sourced testMassKg would otherwise pass validation and only surface
 *  much later as a `disposableLoadKg` result nobody expects. */
export const AircraftSpecSchema = AircraftSpecObject.refine(
  (spec) => spec.reference.testMassKg <= spec.mass.maxTakeoffKg,
  (spec) => ({
    message:
      `reference.testMassKg (${spec.reference.testMassKg} kg) exceeds ` +
      `mass.maxTakeoffKg (${spec.mass.maxTakeoffKg} kg)`,
    path: ['reference', 'testMassKg'],
  }),
)

export type AircraftSpec = z.infer<typeof AircraftSpecSchema>
