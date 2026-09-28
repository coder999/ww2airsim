# W1: the real F4F-4 Wildcat (design)

**Date:** 2026-09-28. **Status:** design approved section by section in
conversation with Mark; this written spec awaits his review.
**Viewing checkpoint:** the final product only. **Run:** unattended; the
checkpoint captures go in the handoff.

## Goal

`content/aircraft/f4f-wildcat.json` is a deliberate placeholder today. Every
flight figure in it is the F6F-5's (Mark, 2026-09-24,
[plan](../plans/2026-09-24-f4f-wildcat-default-aircraft.md)). The drawn model
is scaled to that placeholder's 13.06 m span, and its sim origin sits 2.1 m
forward of the wing. W1 makes the Wildcat a real F4F-4. It gets a flight model
sourced from 1942 Navy trials, drawn at its real size and stance, and armed as
an F4F-4. It does this through a generic onboarding path that the next
aircraft reuses.

**Success:**
- Every figure in the file is sourced (document, and the date it was read) or
  labeled ESTIMATE.
- A graded card suite passes, and it grades any aircraft from its `reference`.
- Model-fit tests hold the drawing to the spec: gear height, center point,
  parked angle, eye point, zones and mounts.
- The Wildcat draws visibly smaller than the Hellcat, sits at Grumman's 12°20′
  and flies level.

## Rulings (Mark, 2026-09-28)

| # | Ruling |
| --- | --- |
| R1 | The variant is the **F4F-4**. The FM-2 was offered, as the type actually at Leyte, and not taken. |
| R2 | **Graded at the six-gun combat condition, about 7,972 lb** (Grumman's overload table). Anacostia 4058's primary figures are the cross-checks. |
| R3 | **Ordnance:** the existing AN-M65 1,000 lb bombs on two racks, and **no rockets**. This is a gameplay choice. The real F4F-4 carried 100 to 250 lb bombs or drop tanks. |
| R4 | **W1 builds the generic onboarding path**, with the Wildcat as its first user: a shared graded card suite and `docs/aircraft.md`. |
| R5 | **The parked angle is fixed in W1** by lengthening the drawn main gear, and it is held to Grumman's sourced 12°20′. |

## Sources (all read 2026-09-28 from the scans)

These are under `http://www.wwiiaircraftperformance.org/f4f/`. The site's HTML
transcription of the Grumman stall rows is wrong: the scan gives 75.0, 76.7
and 81.3 mph, where the HTML gives 70.7, 75.0 and 77.4. Cite the scans.

| Key | Document | Standing |
| --- | --- | --- |
| [4058] | BIS Final Report of Production Inspection Trials, F4F-4 No. 4058, NAS Anacostia, 24 Mar 1942 (`f4f-4-4058.pdf`) | primary |
| [5262] | NAS Anacostia, F4F-4 with Full Span Flaps, 10 Sep 1942 (`f4f-4-5262.pdf`) | primary |
| [02135] | NAS Anacostia, Performance at Military Power, 19 Sep 1942 (`f4f-4-02135.pdf`) | primary |
| [DS] | Grumman Report 1471C, Detail Specification SD-235-4-3A, rev. 21 Oct 1942 (`f4f-4-detail-specification.pdf`) | manufacturer, "based on 4058 flight tests" |
| [SAC] | BuAer Airplane Characteristics & Performance, F4F-4/FM-1, 1 Jul 1943 (`f4f-4.pdf`) | semi-primary |
| [N868] | NACA Report 868 (Toll), Fig. 47 | F4F-**3** roll data only |
| [HB] | AN 01-190FB-1, **FM-2** Pilot's Handbook, 1945 | ground handling only; the F4F-4's own handbook was not found |

## 1. The flight model

**The trial condition** (`reference`, R2):

| Item | Value | Source |
| --- | --- | --- |
| `testMassKg` | 3,616.04 (7,972 lb) | [DS] overload |
| `topSpeedByAltitudeM` | SL 122.67, 762 m 125.66, 1,402 m 126.38, 3,658 m 135.19, 4,267 m 135.81, 5,791 m 140.82, 5,913 m 141.31 m/s (274.4 / 281.1 / 282.7 / 302.4 / 303.8 / 315.0 / 316.1 mph true) | [DS] overload table |
| `topSpeedMps` | 141.31 at 5,913 m (19,400 ft) | [DS] |
| `climbRateMps` | 8.585 (1,690 ft/min) at sea level | [DS] overload |
| `climbRateByAltitudeM` | 4,968 m: 7.62 m/s (1,500 ft/min) | [02135], at 7,933 lb and military power: 0.5% lighter than R2's weight, and stated as such |
| `stallSpeedMps` | 40.45 (90.5 mph) | DERIVED: [4058]'s clean power-off 87 mph at 7,370 lb, corrected to 7,972 lb by √(W ratio) = 1.0400 |
| `stallSpeedFlapMps` | 35.33 (79.0 mph) | DERIVED: [4058]'s landing power-off 76 mph, by the same correction |
| `takeoffDistanceM` | 209.1 (686 ft) calm | [4058] six-gun, 7,921 lb, 0.6% lighter than R2's weight. No flap setting is stated. |

- **Stall cross-check:** [DS] gives 81.3 mph "without power" at 7,972 lb with
  no flap condition named. That lies between the two derived stalls, and the
  card comment records it.
- **IAS or TAS:** no source says which. These are sea-level figures, where TAS
  and CAS agree to within the instrument error, and the `source` string says
  so.

**Geometry and mass:**
- Span 11.582 m (38 ft 0 in); wing area 24.155 m² (260 sq ft) [DS].
- Empty weight 2,673.9 kg (5,895 lb, 1943 service airplane) [SAC].
- `maxTakeoffKg` 3,974.4 (8,762 lb, with two drop tanks) [SAC].
- Internal fuel 144 US gal, which is 392.5 kg at 0.72 kg/L (the Zero's rule)
  [SAC].

**Engine and fit.** The engine is an R-1830-86 with a two-stage blower,
1,200 hp for take-off [SAC]. The power curve's breakpoints follow [SAC]'s
normal and military ratings by altitude. These values are FITTED, not sourced,
by the Z2 method (the `tools/testcards/measure.ts` sweep at `testMassKg`), and
each is labeled FITTED:
- the power fractions,
- `cd0`,
- `propEfficiency`.

These are DERIVED, the Zero's way:
- `staticThrustN` is the F6F's 20,000 N scaled by take-off power.
- `flap.clIncrement` is `clMax × ((stall ÷ flap stall)² − 1)`.
- `windmillCd0` is 2 × `cd0`.

**Estimates**, each labeled ESTIMATE in `source`:
- `rollRateDegPerSec` is 68, read by eye from [N868]'s **F4F-3** curve (about
  ±3°/s).
- `gear.travelSeconds` is 10. The gear was hand-cranked (about 28 turns, [HB]),
  and no timing was found.
- The `rates` and `controlFadeByEasMps` fields keep the F6F's values.
- The gear friction and steering fields also keep the F6F's values. T1 reworks
  them.

`reference.source` loses its PLACEHOLDER label.

**Cards (R4).**
- **`tests/sim/testcards/graded.test.ts` (new)** grades every aircraft from its
  `reference`:
  - top speed at every table altitude,
  - climb at sea level and at every table altitude,
  - clean and flap stall,
  - take-off distance where present,
  - roll rate at its reference speed.
- **Each aircraft's tolerances** live in one table in that file. They are the
  existing F6F and Zero values, carried across unchanged, and each keeps its
  dated measurement comment. Tolerances only tighten.
- **The F6F and Zero cards move into it first,** in their own commit, with
  every value and tolerance unchanged, so the move shows as a pure move in
  review.
- **What stays in per-aircraft files:** only claims about particular
  airplanes. These are the F6F-vs-Zero matchups, the Zero's control fade and
  negative-g cut-out, and a new `f4f.test.ts` of F4F-vs-F6F matchups: slower at
  every shared altitude, lower sea-level climb, lower clean and flap stall,
  shorter take-off roll, and lighter wing loading.

## 2. The drawing and its re-fit

The rule set by R3's ruling P1 holds throughout: the drawing wins over any
estimate, and a test enforces each fit.

- **Scale.** `WILDCAT_SCALE` = 11.582 ÷ the model's native span, 15.658.
- **Center point.** A new `WILDCAT_OFFSET_X_M` puts the wing's quarter-chord at
  body x = 0. It is measured at 30% of the half-span. Measured 2026-09-28 at the
  equivalent station, the Hellcat's quarter-chord sits at 0.04 m and the Zero's
  at 0.11 m, while the current Wildcat's sits at 2.11 m. A new generic test
  holds every drawn model to |x| ≤ 0.15 m.
- **The main gear is lengthened (R5).**
  - **The evidence.** With the thrust line level (the propeller axis measured
    at 0.00°), the model's own wheels give a 7.43° parked angle, against
    [DS]'s static ground angle of 12°20′.
  - **Why the mains.** The tailwheel's top is already 0.08 m inside the
    fuselage skin, so the tail cannot come up. Lengthening the mains by
    0.4445 m at the real scale gives 12°20′ (measured 2026-09-28, while
    writing the plan).
  - **What it doesn't fix.** The model's proportions don't match the real
    airplane everywhere, and R5 makes the ground angle the one that is held.
    The other gaps are recorded and not fixed:
    - the parked propeller hub then sits at 2.347 m, against about 2.10 m
      derived from [DS]'s 11 ft 9 in height over the propeller and its 9 ft
      9 in propeller;
    - the wheelbase is 5.04 m, against 5.46 m;
    - the main-wheel track is 1.28 m, against 1.96 m.
  - **How.** `loadWildcat` stretches each main strut along the leg's own axis
    and moves the wheel down it. The stretch is one named constant, measured
    and asserted.
  - **The check.** A new test poses the gear at GEAR_UP and requires the
    lengthened leg and wheel to stay inside the fuselage well. The skin check
    follows the method of `aircraftRigs.test.ts`.
  - **License.** The model is CC-BY 4.0, which permits modification with the
    change indicated. `ASSETS.md` records it.
- **Refitted from the drawing.** Each of these is enforced by a test that
  already exists or is added here:
  - `gear.heightM` (about 1.95 m plus the stretch; `stance.test.ts`);
  - `MODEL_STANCE.wildcat`, which becomes 12.33° with the re-measured main
    wheel x (`stance.test.ts`, which now requires the Wildcat's drawn wheels to
    give the sourced angle within 0.25°);
  - the eye point (`eyePoints.test.ts`);
  - the rack offsets (`npm run models:mounts`; `wildcatMounts.test.ts`).
- **The physics does not change in W1.** The drawing-only stance
  (`src/render/scene/stance.ts`) keeps drawing the parked tilt until T1.

## 3. Combat, ordnance and tests

- **Guns.** Six M2 .50 cal with 240 rounds per gun, 1,440 in all ([DS] 104c,
  [SAC]). [SAC]'s drawing says 1,400, which is a conflict, and 1,440 is
  preferred. Ballistics reuse the existing sourced M2 figures. The mounts are
  re-measured on the rescaled wing, three per side. Convergence and dispersion
  stay the gameplay ESTIMATES they are.
- **Survivability.** The zones are refitted to the rescaled drawing. HP and
  damage stay the F6F's values, as ESTIMATES.
- **Ordnance (R3).** The racks carry `an-m65`, and there are no rails. Because
  of that, the sortie form offers only Clean and Bombs for the Wildcat
  (`loadoutsFor`, `src/sim/sortie.ts`); Dev is unchanged. The `stores.source`
  string records R3 as a gameplay choice.
- **Generic tests (R4).**
  - Every aircraft's zones and gun mounts must lie inside its drawn airframe's
    bounds.
  - An existing Hellcat or Zero zone that fails goes on a named allowlist with
    its overshoot measured. It is not refitted here.
  - These tests sit alongside the graded suite, the center-point test, and the
    existing stance, eye-point and rig tests.
- **Tier 2.** `wildcat.spec.ts` and `sortie.spec.ts` are updated: the Wildcat's
  loadouts are only Clean and Bombs. The checkpoint captures show the Wildcat
  and a Hellcat parked at Tacloban, the Wildcat on the Essex, the Wildcat's
  cockpit view, and the Wildcat in flight.
- **Docs.**
  - `docs/aircraft.md`, the onboarding runbook: sourcing standard, the fit
    sweep, the checks that fail and the order to fix them in, with the Wildcat
    as its worked example.
  - A dated handoff, the §15 row, the `ASSETS.md` modification note, and a
    README pointer.

## Out of scope: T1, the tailwheel in the physics

T1 is recorded here so it is not lost. It gets its own spec.

- **Contact points in the spec.** The main-wheel and tailwheel contact points
  go into each aircraft's spec. The parked angle is derived from them, and the
  drawing is held to them.
- **Tail-up and tail-down from moments.**
  - The tail comes up on the take-off roll from elevator authority and
    propeller wash, pitching about the main axle to roughly level. It replaces
    today's `tailUpSpeedMps` gate.
  - A rotation follows, nose up about the same axle.
  - The reverse happens on landing: a wheel landing with the tail settling as
    speed bleeds off, or a three-point landing. It is airframe-specific,
    through the contact geometry.
  - Mark described this sequence on 2026-09-28.
- **Taxi steering.** The measured failure (2026-09-28, the Hellcat at 60%
  throttle with full rudder): 5.5°/s falling to 1.5°/s as speed rose, about
  12 m of lateral travel in 73 m. It has four causes:
  - the tailwheel steering fading to zero at 15 m/s;
  - auto-rudder opposing the pilot on the ground;
  - no propeller wash on the rudder;
  - no differential braking.

  T1 models a castering tailwheel with a lock (the F4F's, per [HB], is not
  steerable), differential brakes and propeller wash, and keeps auto-rudder
  out of ground handling.
- **The rest attitude moves into the sim.** The drawing-only stance is
  retired. The take-off cards, the landing rest-point pins and the AI take-off
  and landing (7g, planned but not started) are re-read against it.
- **Graded card suite.** T1 re-grades through the graded suite that W1
  builds.

**Also out of scope:** the FM-2 (R1), drop tanks, a sourced F4F-4 roll rate,
and the F6F's and Zero's zones beyond the allowlist.
