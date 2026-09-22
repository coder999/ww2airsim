import { z } from 'zod'
import { CombatSpecSchema } from '../weapons/schema.js'

/**
 * Every object below is `.strict()`, top level and each sub-object.
 *
 * Finding I6: Zod strips unknown keys by default, so a content typo was
 * silently dropped rather than reported -- `"cdO": 0.5` sitting next to a
 * present `cd0` validated clean and vanished, and the airplane flew on the
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

/**
 * One carriable store -- a bomb or a rocket -- as content, mirroring
 * `CombatSpecSchema`'s standing for the gun/hitbox data it sits beside.
 * Plan 6b §2.1: `storesSpec` in `src/sim/weapons/stores.ts` reads `massKg`
 * and `dragAreaM2` to bake carried load into a derived `AircraftSpec`; the
 * rest (`fillerKg`, `armS`, `warheadKg`, `burnS`, `burnDeltaVMps`, `damage`,
 * `blastRadiusM`, `lifetimeS`, `dragPerM`) belongs to the projectile system
 * later tasks build, not to this task.
 */
const StoreTypeObject = z.object({
  kind: z.enum(['bomb', 'rocket']),
  massKg: positive,
  dragAreaM2: positive,
  damage: positive,
  blastRadiusM: positive,
  lifetimeS: positive,
  dragPerM: z.number().finite().min(0),
  // bomb-only
  fillerKg: positive.optional(),
  armS: positive.optional(),
  // rocket-only
  warheadKg: positive.optional(),
  burnS: positive.optional(),
  burnDeltaVMps: positive.optional(),
}).strict()
  .refine((t) => t.kind !== 'bomb' || (t.fillerKg !== undefined && t.armS !== undefined), { message: 'a bomb needs fillerKg and armS' })
  .refine((t) => t.kind !== 'rocket' || (t.warheadKg !== undefined && t.burnS !== undefined && t.burnDeltaVMps !== undefined), { message: 'a rocket needs warheadKg, burnS and burnDeltaVMps' })

const StoresSchema = z.object({
  racks: z.array(z.object({ id: z.string().min(1), offset: z.tuple([finite, finite, finite]), store: z.string().min(1) }).strict()).min(1).max(8),
  rails: z.array(z.object({ id: z.string().min(1), offset: z.tuple([finite, finite, finite]), store: z.string().min(1) }).strict()).min(1).max(16),
  types: z.record(z.string(), StoreTypeObject),
  source: z.string().min(1),
}).strict()
  .refine((s) => [...s.racks, ...s.rails].every((m) => m.store in s.types), { message: 'every rack/rail store id must exist in types' })

export type StoreType = z.infer<typeof StoreTypeObject>
export type Stores = z.infer<typeof StoresSchema>

const AircraftSpecObject = z.object({
  combat: CombatSpecSchema.optional(),
  stores: StoresSchema.optional(),
  id: z.string().min(1),
  name: z.string().min(1),
  geometry: z.object({ wingAreaM2: positive, wingSpanM: positive }).strict(),
  mass: z.object({ emptyKg: positive, fuelCapacityKg: positive, maxTakeoffKg: positive }).strict(),
  aero: z.object({
    clSlopePerRad: positive,
    clMax: positive,
    alphaCritDeg: positive,
    clAtZeroAlpha: finite,
    /**
     * Side-force coefficient per radian of sideslip, referenced to wing area.
     * Positive; the DIRECTION is applied by `step` (along the body's -right
     * axis), so this is a magnitude slope and mirrors `clSlopePerRad`.
     *
     * Added 2026-09-17 because the model had no lateral aerodynamic force at
     * all, which is why holding rudder crabbed the airplane without turning
     * it -- see `sideForceN` in `src/sim/aero.ts`.
     */
    cySlopePerRad: positive,
    cd0: positive,
    oswaldE: fraction,
  }).strict(),
  engine: z.object({
    maxPowerW: positive,
    propEfficiency: fraction,
    staticThrustN: positive,
    /** Cd0 increment from a propeller that is not pulling, applied in full at
     *  closed throttle. See `windmillDragCd0` in src/sim/aero.ts. */
    windmillCd0: positive,
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
    /**
     * Time constant, seconds, for the fin to swing the nose into the relative
     * wind. Sideslip decays by 1/e in this long at full control authority.
     *
     * Added 2026-09-13. Master spec section 5's rate-command model says it
     * carries no damping derivatives, and directional stability is one, so
     * until now nothing in the model produced a yaw moment from sideslip at
     * all: roll into a turn, level out, and the airplane kept flying crabbed
     * for minutes. Measured before the fix, hands off at 120 m/s from 10
     * degrees of sideslip, the nose heading did not move at all in a full
     * minute and the slip decayed only to 5.15 degrees, purely because thrust
     * has a lateral component while crabbed.
     */
    weathercockSeconds: positive,
    /**
     * Auto-rudder assist gain: yaw-command units (of the pilot's own
     * `Controls.yaw`, range [-1, 1]) added per degree of sideslip.
     * `src/assists/index.ts`'s `autoRudder` stage multiplies this by the
     * current sideslip angle and adds the result to the pilot's own yaw
     * command -- the fix Mark asked for after flying it twice: rolling into a
     * turn and levelling out left the airplane travelling diagonally rather
     * than straight, because nothing was pushing the nose back onto the
     * velocity vector for him.
     *
     * Unlike `weathercockSeconds` above, this is NOT a measured aircraft
     * characteristic -- it is a synthetic pilot aid layered on top of the
     * airframe's own (poor) directional stability, not a property of the
     * real F6F. NACA Wartime Report L-716 measured the real airplane's
     * aileron yaw at about 18.5 degrees of sideslip in left rolls and 23.5
     * degrees in right rolls at roughly 100 mph, and judged its directional
     * stability "low" and the handling "objectionable" -- the report has no
     * auto-rudder gain to cite, because the real airplane never had a
     * rudder that moved by itself.
     *
     * 0.1 was chosen empirically against
     * `tests/assists/autoRudder.test.ts`: a one-second full-deflection roll
     * at 90/130/180 m/s develops only a few degrees of sideslip in this
     * model (that test's own `slipWithoutAssist` measurements are 2.99,
     * 2.01 and 1.07 degrees respectively, both roll directions), so a gain
     * that reaches full rudder authority at 10 degrees of sideslip (1 /
     * 0.1) gives a clearly measurable reduction at all three speeds and
     * both roll directions inside that window, without saturating so hard
     * that the "pilot rudder is still effective" test has no headroom left
     * to show an added command changing the result.
     */
    autoRudderGainPerDeg: positive,
    /**
     * Stall-limiter assist time constant, seconds: the limiter lets the pilot
     * consume the REMAINING angle-of-attack margin no faster than
     * `margin / stallLimiterSeconds` radians per second, so the commanded
     * pitch rate falls to zero as alpha reaches `aero.alphaCritDeg`.
     * `src/assists/index.ts`'s `stallLimiter` stage is the only reader.
     *
     * Like `autoRudderGainPerDeg` and unlike `weathercockSeconds`, this is NOT
     * a measured aircraft characteristic: no F6F ever had an alpha limiter, so
     * there is no primary source to cite and NACA WR L-716 has nothing to say
     * about it. It is per-aircraft tuning of a synthetic pilot aid, in content
     * rather than in code because the Global Constraints forbid a tuning
     * constant invented in a source file.
     *
     * It sets two things at once, which is why one number does the job of a
     * margin and a rate limit both. Larger is more conservative: the limiter
     * starts biting at `margin = tau * maxPitchRate`, i.e. at alpha above
     * `alphaCrit - tau * maxPitchRate` for full back stick, and it leaves more
     * headroom against the one thing it cannot command away -- alpha rising
     * because the flight path is falling, which no pitch input prevents.
     *
     * 0.15 was chosen by measurement, 2026-09-13, and the measurement's first
     * result is that SAFETY DOES NOT DISCRIMINATE between the candidates. The
     * sweep was a 36-condition grid -- 6 entry speeds (70 to 200 m/s) x 6
     * flight-path angles (-30 to +45 degrees), 15 s of full back stick, full
     * throttle, spawned at 3000 m -- scoring the highest alpha reached while
     * the airplane was still flying (airspeed above 50 m/s, |alpha| under 90).
     * With the limiter OFF that grid reaches 16.86 degrees against this
     * aircraft's 15.5 degree alphaCrit. With it on, at every tau tried:
     *
     *     tau     worst alpha, 36 runs     full back stick limited above
     *     0.017 (= DT)   15.27            15.0 deg
     *     0.10           14.63            12.5 deg
     *     0.15           14.29            11.0 deg
     *     0.25           13.74             8.0 deg
     *     0.50           12.98             0.5 deg
     *
     * Not one of 36 runs at any tau crossed the boundary, down to tau = the
     * fixed step itself. That is the derivation working as intended: the bound
     * lets alpha consume at most the margin per time constant, so the pilot's
     * command alone cannot cross the boundary, and the flight-path term the
     * derivation drops happens to help rather than hurt in a pull.
     *
     * That sentence used to end "at any tau >= DT", which quietly made the
     * guarantee the CALLER's: a caller stepping longer than tau would have
     * spent more than the whole margin in one step and sailed past the
     * boundary. Corrected 2026-09-13 (Task 5) by making it the limiter's own
     * property -- it rations the margin over `max(tau, dt)`, so the guarantee
     * holds at any dt, whatever the caller does. The value of this field is
     * unchanged and the production path (a fixed `DT` step, well under 0.15 s)
     * is byte-for-byte unaffected; see `stallLimiterBounds` in
     * `src/assists/index.ts`, and the dt test in
     * `tests/assists/stallLimiter.test.ts` that measures a caller stepping at
     * 0.5 s crossing the boundary on the old expression and not on this one.
     *
     * So the choice is about FEEL, and the right-hand column is the one that
     * decides it: limiting begins at `alphaCrit - tau * maxPitchRate` (times
     * the dynamic-pressure authority, so later than this when slow). 0.50
     * would start softening full back stick from half a degree of alpha, i.e.
     * from level cruise, and make the airplane feel blunt everywhere. 0.017
     * gets within 0.23 degrees of the boundary with no margin for the one case
     * the bound cannot cover. 0.15 leaves the first 11 degrees of alpha --
     * over two-thirds of the usable range -- completely untouched while
     * keeping the measured worst case 1.2 degrees clear.
     *
     * What no tau can prevent, and no test should claim: alpha also rises
     * because the FLIGHT PATH falls away, which no pitch command opposes. A
     * 60 m/s entry at a 60-degree climb angle -- full back stick, full
     * throttle, 15 s from 3000 m -- departs at every tau tried, and departs
     * completely. Re-measured 2026-09-13 at tau 0.017, 0.10, 0.15, 0.25 and
     * 0.50: every one of the five reaches a peak |alpha| of 180.0 degrees
     * (179.96, and the five differ by under 0.001) and an airspeed of 2.9
     * m/s; the wing first stalls at 9.3 s and the airplane is past the
     * limiter's own 90-degree stand-down from 11.3 s onward. Of the 900 ticks
     * in that run the limiter commands full nose-down for 119, and for 780 it
     * has stood down and is handing the pilot's own command straight back.
     *
     * The figures this paragraph used to carry -- "peak alpha 89.6 degrees,
     * airspeed down to 11 m/s" -- were not measurements of the airplane.
     * 89.6 is the ceiling of the SWEEP HARNESS's own |alpha| < 90 scoring
     * filter -- the same harness and the same scoring as the 36-condition
     * grid above -- carried out of it and printed as a physical result: the
     * identical run scored through that filter reports exactly 89.6, and
     * scored without it reports 180.0. No
     * scoring reproduces 11 m/s at all -- the run's minimum is 2.9 and the
     * harness's own airspeed floor is 50. The qualitative claim was right and
     * both numbers were artefacts of the instrument, which is why a figure in
     * a durable comment is worth only as much as the statement of how it was
     * measured. See `tests/assists/stallLimiter.test.ts`, which tests this
     * honestly rather than asserting a guarantee the limiter does not make.
     *
     * Being a feel constant, this is exactly the kind of value Plan 3's own
     * Task 6 -- Mark flying it -- is expected to revise.
     */
    stallLimiterSeconds: positive,
      }).strict(),
  limits: z.object({ diveSpeedMps: positive, gLimit: positive }).strict(),
  /** Landing gear: travel time, the drag it costs extended, rolling and
   *  braking friction, and the ground-handling speed/rate gates Task 7 adds. */
  gear: z.object({
    /** Seconds for the gear to travel fully up-to-down or down-to-up. */
    travelSeconds: positive,
    /** Drag AREA (Cd·A) of the extended gear, m^2 -- multiplies dynamic
     *  pressure directly, with the drag coefficient already folded in. */
    dragAreaM2: positive,
    /** Rolling-friction coefficient, brakes off: force = coeff * weight,
     *  opposing the ground track. Dimensionless. */
    rollingResistanceCoeff: positive,
    /** Rolling-friction coefficient, brakes fully applied. Must be read as
     *  the upper end of the brake blend in `rollingResistanceN`, not
     *  validated against `rollingResistanceCoeff` here -- a content author
     *  is trusted to keep it the larger of the two. */
    brakingResistanceCoeff: positive,
    /** Ground speed, m/s, at or above which the tail is judged light enough
     *  for full pitch authority. Below it, `groundBodyRates` commands no
     *  pitch at all -- see that function's own doc comment for the ruling
     *  behind a speed gate instead of an elevator-moment model. */
    tailUpSpeedMps: positive,
    /** Maximum tailwheel-steering yaw rate, deg/s, available at any ground
     *  speed including zero -- distinct from `rates.maxYawRateDegPerSec`,
     *  which is the RUDDER's authority in the air. */
    tailwheelYawRateDegPerSec: positive,
    /**
     * Seconds for the wheels to bleed away a sideways velocity component, as a
     * first-order time constant.
     *
     * A DECAY and not a removal on purpose: removing the sideways component
     * would put the airplane on rails and make a **ground loop impossible**,
     * and a ground loop is the characteristic hazard of a taildragger rather
     * than an edge case. The form follows `rates.weathercockSeconds`, which is
     * already a seconds-valued time constant in this spec.
     */
    lateralGripSeconds: positive,
    /**
     * Gear height, metres: how far the wheels' contact point sits BELOW the
     * body origin `position` names -- equivalently, how high the thrust line
     * sits when parked. Added by Task 15 after Mark flew the merged Plan 11a
     * and found the airplane spawning buried to the wing root: every ground
     * consumer (`onGround`, `restOnSurface`, the runway spawn) had been
     * comparing `position.y` directly to `groundHeightM`, treating the body
     * origin as though it were the wheels. It is not -- `view.eyePointM`'s
     * `[1.2, 0.9, 0]` in this same content file is measured from that origin,
     * which fixes the convention -- so the airframe below it (a 1.5 m
     * fuselage, a wing at -0.25, and a propeller disc reaching -1.95 m,
     * `src/render/scene/hellcat.ts`) needs a real offset to sit on the
     * runway rather than in it.
     *
     * Load-bearing everywhere a position is compared to a terrain height FOR
     * CONTACT (`onGround`, `restOnSurface`, `supportedContact`, the runway
     * spawn in `src/render/frame.ts`'s `settleOnTerrain`) -- see `heightM`'s
     * own content-file comment for the F6F's specific derivation. Deliberately
     * NOT read by `advance`'s impact check (`src/sim/loop.ts`): that check is
     * about the body origin itself passing through the terrain, which is a
     * crash whatever the gear is doing, so it stays a raw `position.y`
     * comparison on purpose (see the comment on that check).
     */
    heightM: positive,
  }).strict(),
  /**
   * Trailing-edge flaps: travel time, the drag they cost, and the lift they
   * buy. Separate from `gear` because they are a separate device with a
   * separate lever, even though both are actuators with travel time.
   */
  flap: z.object({
    /** Seconds for the flaps to travel fully up-to-down or down-to-up. */
    travelSeconds: positive,
    /** Drag AREA (Cd·A) of fully extended flaps, m^2 -- multiplies dynamic
     *  pressure directly, the same shape `gear.dragAreaM2` takes. */
    dragAreaM2: positive,
    /**
     * Lift-coefficient increment at full extension, added to
     * `aero.clAtZeroAlpha` -- a camber shift, which is what flaps physically
     * are.
     *
     * **NOT applied to `aero.clMax`**, which `liftCoefficient` has not read
     * since Plan 1's finding C1 rebuilt the lift curve. Raising that field
     * does nothing at all, and it agrees with the curve's actual peak to
     * 1.3e-4 by coincidence, which is exactly what would make the mistake
     * look right.
     *
     * DERIVED rather than estimated: stall speed goes as 1/sqrt(CLmax) at
     * fixed weight, and this airplane's own `reference.source` carries both
     * the clean power-off stall and the landing-condition one from the same
     * trial table. See `reference.stallSpeedFlapMps`.
     */
    clIncrement: positive,
  }).strict(),
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
    /**
     * Power-off stall speed in the LANDING configuration, m/s. Graded by
     * `tests/sim/testcards/f6f.test.ts` with the flaps set.
     *
     * Promoted out of `reference.source`'s prose on 2026-09-17, because a
     * graded card cannot read prose: the figure sat inside that string for two
     * plans, flagged as "unreachable for a model with no high-lift devices",
     * which it was until Plan 11b gave the wing flaps.
     */
    stallSpeedFlapMps: positive,
    rollRateDegPerSec: positive,
    /** Ground-roll distance the cited trial measured for take-off, metres.
     *  The model has no flaps, no rolling friction and no ground effect, so
     *  the card grading this is expected to run a bit short of the trial
     *  figure -- see the tolerance comment on that card in f6f.test.ts. */
    takeoffDistanceM: positive,
  }).strict(),
  /** Render-only data. `sim/` never reads this; it lives here because it is
   *  per-aircraft content and a second content file for one field would be
   *  over-engineering. Revisit if a second category of render-only data
   *  appears (Plan 2 design §6). */
  view: z.object({
    /** Pilot's eye, metres in body frame: +X forward, +Y up, +Z right. */
    eyePointM: z.tuple([finite, finite, finite]),
  }).strict(),
}).strict()

/** Cross-field: the trial the reference block was measured at has to be a
 *  loading the airplane can actually fly, i.e. at or under its own
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

/**
 * `storesLoad` is NOT part of the content schema above -- content never sets
 * it, and a malformed `storesLoad` in actual JSON is therefore never a thing
 * to validate. It exists only so `storesSpec` (src/sim/weapons/stores.ts)
 * can return an object that still type-checks as `AircraftSpec` after baking
 * remaining carried drag area in, the same way `damagedSpec` returns a
 * `spec` shape unchanged by any zod schema.
 */
export type AircraftSpec = z.infer<typeof AircraftSpecSchema> & {
  storesLoad?: { massKg: number; dragAreaM2: number }
}
