# Onboarding an aircraft

The runbook for giving an aircraft a sourced flight model and a drawing that
fits it. The F4F-4 Wildcat (W1, 2026-09-28) is the worked example:
[plan](superpowers/plans/2026-09-28-w1-real-wildcat.md),
[handoff](handoff/2026-09-28-w1-real-wildcat.md). This page points at the
documents that own each fact and does not restate them.

## 1. Source every figure

Every number in `content/aircraft/<id>.json` carries a `source` string that
names its document and the date it was read, or is labeled in capitals as one
of `SOURCED`, `DERIVED`, `FITTED` or `ESTIMATE`. Copy the style of
`content/aircraft/f4f-wildcat.json`. A figure with no source is a defect.
R36 applies: if a card misses, report the gap. Never tune a coefficient to
make a card pass.

## 2. Fit the flight model with the sweep

Fit `cd0`, `propEfficiency` and the power curve against the `reference`
block with `tools/testcards/measure.ts`. The W1 probe was a scratch script
under `.superpowers/w1/` (gitignored). Its shape, which any new aircraft
should copy:

```ts
import { loadAircraftSpec } from '../../tools/content/load.js'
import { measureTopSpeed, measureClimbRate, measureStallSpeed, measureTakeoffRun } from '../../tools/testcards/measure.js'
const base = loadAircraftSpec('<id>')
// Build a candidate spec from (cd0, eta, powerScale): spread the base, then
// override geometry, mass, aero.cd0, engine.{maxPowerW, propEfficiency,
// powerFractionByAltitudeM} and reference.
// Grade it: % error of measureTopSpeed at each sourced altitude,
// measureClimbRate at sea level and at the sourced altitude, measureStallSpeed
// (altitude, flaps 0 and 1), measureTakeoffRun (lift-off speed, flaps).
// Sweep a small grid of (cd0, eta) and keep the combination whose errors fit
// the widths the graded cards already hold for the F6F and the Zero.
```

## 3. Add a `CARDS` entry

`tests/sim/testcards/graded.test.ts` grades every aircraft from its
`reference`. Add the aircraft's entry to `CARDS`; the suite fails by name for
any spec that is missing from it. Each comment records its measurement and
date. Tolerances only ever tighten.

## 4. Fit the drawing

Run the model-fit tests. On a new aircraft they fail in this order, and each
failure names what to fix:

1. `tests/tools/models/stance.test.ts` - the parked angle and gear height.
2. `tests/tools/models/centerPoint.test.ts` - the drawing centered on the
   quarter-chord, at the real span.
3. `tests/tools/models/eyePoints.test.ts` - the eye point sits in the canopy.
4. `tests/tools/models/combatFit.test.ts` - guns and zones lie inside the
   airframe as drawn.
5. `tests/tools/models/aircraftRigs.test.ts` - the rig's nodes exist.
6. `tests/tools/models/wildcatMounts.test.ts` - the store mounts, if the
   aircraft has stores.

`tests/tools/models/_drawnPoints.ts` is the one reader of drawn points; use
it rather than a second reader.

## 5. Undercarriage

The gear layout is data, and a new aircraft passes the ground checks or does
not ship. The design is in
[`2026-09-28-t1-ground-handling-design.md`](superpowers/specs/2026-09-28-t1-ground-handling-design.md);
this step only says what to author and what to run.

1. Author `layout`, `mainX`, `heightM`, `thirdX` and `thirdHeightM` in the
   spec's `gear` block from the drawn model. The method is the one Task 1 of
   the T1 plan used: pitch the drawn points about the main axle and take the
   first aft (tailwheel) or forward (nosewheel) point to touch, through
   `tests/tools/models/_drawnPoints.ts`, with a throwaway test that is deleted
   before commit.
2. Label every steering, brake, tail-lift, prop-wash and torque number
   (`thirdSteering`, `steerYawRateDegPerSec`, `steerLockSpeedMps`,
   `tailLiftSpeedMps`,
   `propWashSpeedMps`, `torqueYawRateDegPerSec`) ESTIMATE, or cite the source.
   Append the label to `reference.source`; do not rewrite what is there.
3. Run:

   ```sh
   npx vitest run tests/sim/ground/conformance.test.ts tests/sim/gearContact.test.ts tests/tools/models/stance.test.ts
   ```

   The conformance battery runs over `allGroundSpecs` in
   `tests/sim/ground/fixtures.ts`; add the new aircraft there. It does not cover the
   retracted-gear and water cases (`gearDown` is always true in it); those are
   held by a separate ground test. A taildragger whose drawn model rests level
   gets a rotation ceiling of 6 degrees from a sim-side floor
   (`TAILDRAGGER_MIN_ROTATION_RAD`); note that in the handoff as a data gap.

## 6. Tier 2

Run `tests/e2e/hangar.spec.ts` and the aircraft's own spec on a worktree dev
server. The Hangar checks that pin node lists and mount counts (9 and 11)
are per-aircraft facts: change them with the model, in the same commit.

## The worked example

The Wildcat also shows the two things a stock model may need: a load-time
modification (the lengthened main legs, `wildcatGearStretch`, recorded in
`ASSETS.md`) and a racks-only loadout (`rails` may be empty). Read the W1
handoff for what was measured and what was accepted.
