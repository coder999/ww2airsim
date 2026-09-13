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
    /**
     * Time constant, seconds, for the fin to swing the nose into the relative
     * wind. Sideslip decays by 1/e in this long at full control authority.
     *
     * Added 2026-09-13. Master spec section 5's rate-command model says it
     * carries no damping derivatives, and directional stability is one, so
     * until now nothing in the model produced a yaw moment from sideslip at
     * all: roll into a turn, level out, and the aeroplane kept flying crabbed
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
     * turn and levelling out left the aeroplane travelling diagonally rather
     * than straight, because nothing was pushing the nose back onto the
     * velocity vector for him.
     *
     * Unlike `weathercockSeconds` above, this is NOT a measured aircraft
     * characteristic -- it is a synthetic pilot aid layered on top of the
     * airframe's own (poor) directional stability, not a property of the
     * real F6F. NACA Wartime Report L-716 measured the real aeroplane's
     * aileron yaw at about 18.5 degrees of sideslip in left rolls and 23.5
     * degrees in right rolls at roughly 100 mph, and judged its directional
     * stability "low" and the handling "objectionable" -- the report has no
     * auto-rudder gain to cite, because the real aeroplane never had a
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
     * the aeroplane was still flying (airspeed above 50 m/s, |alpha| under 90).
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
     * from level cruise, and make the aeroplane feel blunt everywhere. 0.017
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
     * m/s; the wing first stalls at 9.3 s and the aeroplane is past the
     * limiter's own 90-degree stand-down from 11.3 s onward. Of the 900 ticks
     * in that run the limiter commands full nose-down for 119, and for 780 it
     * has stood down and is handing the pilot's own command straight back.
     *
     * The figures this paragraph used to carry -- "peak alpha 89.6 degrees,
     * airspeed down to 11 m/s" -- were not measurements of the aeroplane.
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
    /**
     * Altitude-hold assist time constant, seconds. `src/assists/index.ts`'s
     * `altitudeHold` stage is the only reader; see that function's own doc
     * comment for the full derivation. In one sentence: the captured altitude
     * error is closed into a target climb rate over this many seconds, and
     * the resulting target pitch attitude is closed into a commanded pitch
     * rate over the SAME time constant -- one number governs both loops, not
     * two, which is what keeps this to a single content field rather than
     * `holdLevelFlight`'s separate `ALT_GAIN`/`VS_GAIN` pair.
     *
     * Like `autoRudderGainPerDeg` and `stallLimiterSeconds`, this is NOT a
     * measured aircraft characteristic -- no F6F ever had an altitude-hold
     * assist, so there is nothing in NACA WR L-716 or the reference trial to
     * cite. It is per-aircraft tuning of a synthetic pilot aid.
     *
     * 3 was chosen by measurement, 2026-09-13 (`/tmp/althold_probe.ts`,
     * `step()` end to end on this aircraft's content, not an idealised
     * model). Hands off with `pitch = 0` held for 60 s from level cruise, the
     * unassisted aeroplane drifts by a wide margin: -236 m at 70 m/s / 50%
     * throttle, -167 m at 90 m/s / 70%, -77 m at 130 m/s full throttle, -19 m
     * at 180 m/s full throttle. With the assist engaged at tau = 3, the same
     * four conditions (plus 70 m/s / 100% and 130 m/s / 30% throttle) finish
     * within 0.4 m of the captured altitude, worst excursion during the 60 s
     * under 11 m.
     *
     * The transient after capturing mid-manoeuvre is a different, larger
     * number, and an earlier revision of this comment stated one that was
     * measured wrong: it tipped `velocity` while leaving `attitude` at
     * identity, a combination no manoeuvre in this flight model reaches
     * (alpha -17.9 degrees at capture) and that understated the real number
     * by 5 to 25 times. Re-measured 2026-09-13 through an actual
     * pull-and-release (`/tmp/real_maneuver_probe.ts`: hold a real pitch
     * input via `step()`, release, then hold): a mild 0.3 for 3 s at 90-180
     * m/s captures with 17-69 m/s of vertical speed already in progress and
     * transients 46-146 m over the 60 s hold, converging to under 0.2 m by
     * the end; a moderate 0.6 for 3 s at 130 m/s transients 189 m, converging
     * to 0.04 m; a full pull (1.0) for 5 s at 130 m/s -- captured climbing at
     * 69 m/s vertical speed -- transients 394 m and is still 22 m off at 60 s,
     * a slow phugoid that is converging but not yet damped in that window.
     * These are the honest figures a caller re-capturing mid-manoeuvre should
     * expect; the four-figure "within 0.4 m" statement above is level-entry
     * only.
     *
     * tau = 1 tightens the level-entry figures further (worst excursion under
     * 4 m) at the cost of a visibly twitchier stick; tau = 3 is the looser of
     * the two candidates that still keeps every measured level-entry case
     * comfortably inside a few percent of the starting altitude, leaving
     * headroom for Task 6 (Mark flying it) to retune either direction --
     * exactly the same status `stallLimiterSeconds`'s own comment gives it.
     *
     * What no tau can fix, and no test should claim: at zero throttle the
     * aeroplane cannot hold any altitude at all. Lift demand rises as speed
     * bleeds off, which bleeds more speed, and the probe's idle-throttle case
     * departs (2277 m of drift in 120 s) exactly the way `holdLevelFlight`'s
     * own doc comment describes for the same underlying reason: past the
     * point where the wing can deliver the demanded angle of attack, the
     * command saturates and the aeroplane sinks. That is correct behaviour,
     * not a defect in this constant, and `tests/assists/altitudeHold.test.ts`
     * asserts it honestly rather than claiming a guarantee that does not
     * hold.
     */
    altitudeHoldSeconds: positive,
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
