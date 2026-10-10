# Onboarding an aircraft

The process for making a new airframe flyable: decide what it is, source its
numbers, fit the flight model, fit the drawing, and prove it. The F4F-4
Wildcat (W1, 2026-09-28) is the worked example:
[plan](superpowers/plans/2026-09-28-w1-real-wildcat.md),
[handoff](handoff/2026-09-28-w1-real-wildcat.md). This page points at the
documents that own each fact and does not restate them.

**Flyable means two files:** `content/aircraft/<id>.json` (the spec) and
`content/library/<id>.json` (the card). `src/render/sortie/flyableIndex.ts`
globs the first and throws, naming the spec, if the second is missing. An
airframe with only a model and a card is in the Hangar but not the picker.

## How to run it

Part A is a conversation. For each decision (D1..D14), ask Mark with
`AskUserQuestion`: put the recommended option first, labeled
"(Recommended)", and put the reason in its description. Batch the
independent questions, up to four per call. Do not decide a point silently
even when the recommendation is obvious; a one-line confirmation is cheap.

Write every answer into a decision table at the top of the aircraft's plan
(`docs/superpowers/plans/<date>-<id>.md`), one row per D-number, with the
answer, who chose it, and the date. Parts B onward execute those answers.
The table is what a reviewer checks the spec against.

If a decision is marked **deferred** under "Out of scope", record it as
deferred in the table instead of asking.

## Part A: Decisions

### D1. Which airframe, which variant

Options: the exact variant to model (for example F4U-1A versus F4U-1D), and
the reference date. Recommend the variant that the shipped scenarios or
`GAMEPLAY.md` roster already name, so the Library card and the flying spec
agree. Changes: `id`, `name`, the `reference.source` document choice (D10).

### D2. Side and eligibility

Options: `allied` or `japanese`. Recommend the airframe's real side. A
Japanese spec is offered only with Dev on (`eligibleAircraft` in
`src/sim/sortie.ts`); that is intended and needs no work. `side` is
eligibility only, not a combat side.

### D3. Carrier eligibility

`carrierCapable` is one boolean: it filters the picker on a carrier start and
raises `not-carrier-capable` (a Dev sortie) otherwise. No tailhook, wing-fold
or catapult data sits behind it.

Options: **true** if the type really operated from carriers, else **false**.
Recommend the historical answer, and when true, require a carrier
takeoff-and-trap E2E run in D14 rather than trusting the flag. Note a
carrier-capable airframe needs a gear height and stall speed that let the
existing carrier landing model work; a miss there is a finding to report, not
a coefficient to tune (R36).

### D4. Model source

Options: (a) use the `.glb` already committed under `content/aircraft/`,
(b) fetch a new licensed model (`docs/models.md` steps 1-6), (c) an original
model. Recommend (c), an original Blender model, even when (a) exists: see the
build-first rule at the top of `docs/models.md` (Mark, 2026-10-09). Record
the license row in `ASSETS.md` for (b). Changes: `tools/models/entries/<id>.json`,
`view.model`, `AIRFRAME_RIGS`.

A download is often baked in its sitting pose, nose-up. The sim draws the mesh as is, so it
flies nose-high (the Zero, found 2026-09-29: 12.36 degrees). Check the prop's spin axis against
the body's level, and if it is tilted set `normalize.pitchDeg` in the entry, then re-derive the
entry's pivots and origin in the leveled frame and re-measure every gear, eye and store number.

### D5. Landing gear

Ask three things:

1. **Configuration:** taildragger or tricycle (`gear.layout`). The layout is
   data, and the ground model reads it: `mainX`, `heightM`, `thirdX` and
   `thirdHeightM` set the rest pitch and wheel depth through `gearContact`
   (T1, merged 2026-09-29; design in
   [`2026-09-28-t1-ground-handling-design.md`](superpowers/specs/2026-09-28-t1-ground-handling-design.md)).
   Measure all four from the drawn model. The authoring and the checks are
   Part F, "Undercarriage". Then ask the steering questions: `thirdSteering`,
   `steerYawRateDegPerSec`, `steerLockSpeedMps`, `tailLiftSpeedMps`,
   `propWashSpeedMps`. These are gameplay choices: label them ESTIMATE or cite
   a source. `torqueYawRateDegPerSec` is 0 on the ground by Mark's ruling.
   The fields `tailUpSpeedMps`, `tailwheelYawRateDegPerSec`,
   `differentialBrakes` and `brakeYawRateDegPerSec` no longer exist. Tail
   strike and nosewheel liftoff geometry are not modeled.
2. **Retractable or fixed.** Recommend the historical answer. A fixed gear
   (the Val) sets `gear.fixed: true`: the sim holds the gear down whatever the gear key commands and adds no separate gear drag
   (that drag is inside the fitted `cd0`); `travelSeconds` and `dragAreaM2` still have to be present and are unused. The Oscar's main
   gear retracts (its model has GearL/GearR rig nodes). Check the rig nodes.
3. **Height and stance.** Recommend measuring from the model with
   `tests/tools/models/stance.test.ts`, and stretching legs at load time only
   where the stock model sits wrong (the Wildcat's `wildcatGearStretch`, which
   `ASSETS.md` records). Never edit the `.glb` by hand.

Spec: the `gear` block. Model: nodes `GearL`, `GearR`, `GearNose`,
`Tailwheel`, each with a pivot.

### D6. Engines

**Decided 2026-09-28 (Mark): summed power.** The spec has one `engine`
block and one propeller model. A multi-engine type (P-38, Betty, Sally,
B-17, B-29) gets one block with the summed power, `propEfficiency` fitted as
for a single engine, and the rig naming `Prop1..PropN` so every propeller
turns. No engine-out handling. Say in the spec's `source` that the power is a
sum, and in the card that a failed engine is not modeled. Record as decided,
not asked. Engine-out is a possible follow-up.

### D7. Payload

Options, one per airframe:

- **None.** Guns only. Omit `stores`.
- **External bombs (racks only).** As the Wildcat: `rails: []`.
- **External bombs and rockets (racks and rails).** As the Hellcat.
- **Bay-carried bombs.** Racks inside the hull, undrawn: the bombs drop from
  inside the airframe with no external rack or bay door in the picture. Place the
  rack offsets within the drawn hull and hold them with a test like the B-17's
  `internalBay.test.ts`. The source line says the real load is internal. The
  schema is unchanged. (Mark's ruling for the B-17, 2026-09-29; drawn racks
  hanging below the airplane were the earlier plan and are retired.)

Ask which, and how many stations. `racks` allows 1 to 8 and `rails` 0 to 16;
a bomber whose real load exceeds 8 gets 8 and a source line saying so.
Recommend the historically standard load, not the maximum.

### D8. Which stores

Each rack or rail names a `store` that must exist in `types` and, for the
name shown on Form 4, in the Library as an ordnance entry (`an-m65`, `type98-no25`,
`hvar` today; a Japanese bomber carries `type98-no25`, V2 2026-10-09). Options: an existing store, or a new one. Recommend an existing one
where the real weapon matches; a new store needs a mass, drag area, filler,
damage and blast figure each with a source, plus its Library ordnance card.

### D9. Attachment points

Do not guess offsets. Measure them on the drawn model with
`npm run models:mounts`, which `tests/tools/models/wildcatMounts.test.ts`
enforces. Ask only where the real aircraft is ambiguous (for example an
inboard versus outboard wing station), and recommend the station the
sourced loadout uses. For a bay load, recommend the fuselage centerline at the
bay's longitudinal center, spaced fore and aft.

### D10. Physics reference

The flight model is fitted to a `reference` block, so the question is which
document. Options: (a) a primary trial report (best; the F4F-4 used a BIS
production trial), (b) a secondary compilation, (c) an ESTIMATE with no
document. Recommend (a), then (b) with the gap named. Choose (c) only with
Mark's approval, and mark it in capitals in the spec. Every figure carries a
`source` (Part B).

### D11. Guns and damage

Options: fixed guns as sourced (count, caliber, rate, muzzle velocity,
convergence), structure and subsystem hit points, damage zones. Recommend
copying the shape of the nearest existing aircraft's `combat` block and
replacing each number with a sourced one. **Turrets and flexible guns as
appropriate** (Mark, 2026-10-09, replacing "no turrets"): rig every real
turret and flex gun on the turret-aim and flex-gun machinery
(`docs/handoff/2026-10-09-turret-aim.md`, `2026-10-09-flex-guns.md`) so
they aim. Gunners that fire are Track E3 and arrive for every airframe at
once. A bomber may have no `combat` block at all (the
B-17): it still drops bombs, but it cannot fire or be hit.

### D12. Cockpit view

Only `view.eyePointM` exists today, and `eyePoints.test.ts` checks that it
sits inside the canopy. Recommend an eye point in the canopy and nothing
more. A modeled cockpit per airframe is deferred, not asked.

### D13. AI behavior

`excludedManeuvers` removes named maneuvers from an airframe's pilot
(`EXCLUDABLE_MANEUVERS`, `src/sim/flight/schema.ts`). Ask which real
limits apply (for example no split-S for a type with a weak roll-off).
Recommend excluding nothing without a source, and excluding maneuvers a
sourced limit forbids. A bomber flown by AI is deferred.

### D14. Where it appears, and what proves it

Ask:

1. **Library card.** Name, roster name, blurb, history, dated sources.
   Deterministic checks the roster in `GAMEPLAY.md`.
2. **Scenarios.** Options: none (picker only), or named shipped scenarios.
   Recommend none until the airframe passes Part F.
3. **Acceptance.** Recommend the tolerances the graded suite already holds
   for the F6F and the Zero, and no wider. State the misses as findings; do
   not tune a coefficient to pass a card (R36).

## Part B: Source every figure

Every number in `content/aircraft/<id>.json` carries a `source` string that
names its document and the date it was read, or is labeled in capitals as one
of `SOURCED`, `DERIVED`, `FITTED` or `ESTIMATE`. Copy the style of
`content/aircraft/f4f-wildcat.json`. A figure with no source is a defect.

## Part C: Fit the flight model with the sweep

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

## Part D: Add a `CARDS` entry

`tests/sim/testcards/graded.test.ts` grades every aircraft from its
`reference`. Add the aircraft's entry to `CARDS`; the suite fails by name for
any spec that is missing from it. Each comment records its measurement and
date. Tolerances only ever tighten.

## Part E: Model, rig and register

`docs/models.md` owns steps 4 to 8: inspect, entry, build, register in
`AIRFRAME_RIGS`, and the Library entry. The parts this page adds are the
D-answers that feed them: rig node names (D5, D6), the `view.model` (D4), and
mounts measured before the spec's `stores` offsets are written (D9).

Control surfaces (C1) are part of the rig. A Blender model gets them from
`kit.py` by naming each control. A download needs each surface `split` into its own node, with a `pivot` on its
hinge line, oriented as `docs/models.md` §5 says. A download usually draws no
hinge, and its skin triangles run the full chord, so the rule takes a `cut`
(§5). The F6F and F4U entries are the worked examples (C1 batch 2). Add the
airframe to the pinned list in `aircraftRigs.test.ts`, whose direction check
decides whether the orientation is right.

## Part F: Fit the drawing

Run the model-fit tests. On a new aircraft they fail in this order, and each
failure names what to fix:

1. `tests/tools/models/stance.test.ts` - the gear layout against the drawn model (see Undercarriage below).
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

`tests/tools/models/aircraftRigs.test.ts` also ray-casts every retracted leg onto
the airframe surface beneath it and fails if a wheel stands more than 0.08 m
above it (`_retractedSkin.ts`). A leg that cannot meet that with the rig's single
hinge axis goes on `THROUGH_SKIN` with its measured excess and a date; the list
only shrinks.

### Undercarriage

The gear layout is data, and a new aircraft passes the ground checks or does
not ship.

1. Author `layout`, `mainX`, `heightM`, `thirdX` and `thirdHeightM` in the
   spec's `gear` block from the drawn model: pitch the drawn points about the
   main axle and take the first aft (tailwheel) or forward (nosewheel) point
   to touch, through `_drawnPoints.ts`, with a throwaway test deleted before
   commit.
2. Label every steering, tail-lift, prop-wash and torque number ESTIMATE, or
   cite the source. Append the label to `reference.source`; do not rewrite
   what is there.
3. Add the aircraft to `allGroundSpecs` in `tests/sim/ground/fixtures.ts` and
   run:

   ```sh
   npx vitest run tests/sim/ground/conformance.test.ts tests/sim/gearContact.test.ts tests/tools/models/stance.test.ts
   ```

   The battery does not cover the retracted-gear and water cases (`gearDown`
   is always true in it); a separate ground test holds those. The ground pitch
   ceiling is derived from the aircraft's own lift curve
   (`groundPitchCeilingRad` in `src/sim/ground.ts`: CL = clMax / 1.1^2, capped
   at `alphaCritRad`, never below rest pitch), so liftoff lands near 1.1 x the
   clean stall speed with no gear data. Do not add a tuned cap.
4. `tests/sim/carrierTakeoff.test.ts` auto-discovers specs and every deck. A
   failing pairing goes on its dated exception list or gets more wind; never
   weaken a threshold.

## Part G: E2E

Run `tests/e2e/hangar.spec.ts` and the aircraft's own spec on a worktree dev
server. The Hangar checks that pin node lists and mount counts (9 and 11)
are per-aircraft facts: change them with the model, in the same commit. If
D3 was true, add a carrier takeoff and trap run. If D7 was a bay load, the
racks are undrawn and inside the hull: confirm in the Hangar that nothing hangs
below the fuselage.

## Part H: Flyable in the game (the definition of done)

An aircraft is onboarded when Mark can pick it in the sortie forms and fly it.
"Has a spec and a Library card" is not that. The shipped rules make it
mechanical:

- **Availability.** Every spec in `content/aircraft/` is a flyable aircraft.
  With Dev checked, Form 3 lists all of them on every scenario
  (`eligibleAircraft`). Without Dev it lists the allied ones, and on a carrier
  start only `carrierCapable` ones. There is no registry to edit.
- **Data the forms read.** Form 3 shows the Library card's `blurb` and
  `figuresFor` (speeds, climb, stall, weights, from the spec). Form 4 shows
  `storesLine` (racks and rails, named from the Library ordnance cards).
  The Hangar shows `history` and `sources`. `flyable.test.ts` fails a card
  that lacks any of these.
- **Armament follows the stores block.** An aircraft with a `stores` block
  offers only the loadouts it can carry, in Dev too: racks only means Clean and
  Bombs, so a bomber never offers rockets. Dev lends the Hellcat layout only to
  an airplane with no `stores` at all. A bomber needs no `combat` block to drop
  bombs (fixed 2026-09-29; before that a bomb from an aircraft with no
  `combat` block was counted off the rack and then deleted).
- **The acceptance run.** `tests/e2e/flyableAll.spec.ts` needs no edit for a new
  aircraft. For every spec it quick-launches on the Tacloban runway with a full
  bomb load, asserts it parks on its wheels with no validation error, is drawn
  as its own model, holds the right bomb count, takes off, and drops one bomb.
  Run it on the worktree dev server and look at the screenshots it writes to
  `test-results/flyable-<id>-*.png`.

If the run fails, the airplane is not onboarded, whatever the cards say.

Finish with a handoff (`docs/handoff/<date>-<id>.md`) that lists what was
measured, what was accepted, and the D-table.

## Out of scope for now

Each of these is a deliberate deferral (Mark, 2026-09-28), not an omission.
Record it in the D-table as "deferred", and do not build it.

- **Turrets and defensive guns.** `Turret1..N` rig nodes exist, but no
  gunner is modeled.
- **A modeled cockpit.** Each airframe needs its own; every one uses the
  eye-point view (D12) until that work is scheduled.
- **Bomber AI.** A bomber is flown by the player only.
- **Real internal bays.** Bay loads drop from undrawn racks inside the hull (D7); bay doors are C2 (`MASTER_PLAN.md`), real door nodes in every bay bomber's model, listed in its rig's `doors` (`docs/models.md` §5): a Blender model gets them from `kit.fuselage(doors=...)`, a download from a `split` with a `cut`. A new bay bomber needs a `bayDoors` block in its spec and the door nodes in its model and rig; `aircraftRigs.test.ts` and `combat.test.ts` pin the lists.
- **Engine-out handling** for multi-engine types (D6); the power is summed.

## Lessons from the first run (F4U-1D, 2026-09-29)

Detail: [`docs/handoff/2026-09-29-f4u-corsair.md`](handoff/2026-09-29-f4u-corsair.md).

- A detail specification is a guarantee. Stall and flap figures it does not state come
  from a flown trial of the same family, scaled by weight and labeled DERIVED. Do not
  fit `clMax` to close the gap; report it.
- Adding a flyable touches tests you did not write: `wildcatMounts.test.ts` (list),
  `centerPoint.test.ts` (a per-model STATION when gear legs sit at the 30% station),
  `eyePoints.test.ts`, the picker order pins in `sortieFlow.test.ts` and
  `sortie/flyable.test.ts`, and the Hangar `catalog.test.ts`. The Library card needs
  `spec`.
- `remote-run npm run verify` stops at the first failing stage. Run the later stages
  separately to see the whole picture, and check a red test against the base commit
  before assuming it is yours.
- On nexus, E2E needs `sg render -c '...'`; without it Chromium falls to
  SwiftShader and every test fails at the software-rasterizer page.
- No browser spec flies a carrier approach for any airplane. Cover the trap at the sim
  level: `tests/sim/trap.test.ts` enrolls every `carrierCapable` airframe from content
  (since 2026-10-08), so there is nothing to clone; add the id to its pinned list.

## Lessons from the second run (B-17G, 2026-09-29)

Detail: [`docs/handoff/2026-09-29-b-17.md`](handoff/2026-09-29-b-17.md).

- **Check the model's origin first.** The body frame's origin is the wing
  quarter-chord. The stock B-17 build sat 0.354 m off it. The wing-section reader
  clips at `WING_MIN_X_M` (-2 m), which truncates a 4.9 m chord and gives a wrong
  origin: pass a wider `minX` (`sectionAtFor(model, minX)`), and add the per-model
  value to `centerPoint.test.ts`.
- **Bay loads are undrawn internal racks (D7).** The B-17 has 8 racks inside the hull,
  held by `internalBay.test.ts`. Bay doors get their own plan.
- **A heavy airplane needs longer harness windows.** Ground conformance tests 6 and 8
  give a from-standstill take-off 40 s and 30 s; the B-17 needs about 44 s. Widen the
  window (`takeoffWindowS`), never the physics. The lift-off band inherits the
  airplane's graded stall miss: the B-17's stall is 7.6% slow, so unstick landed at 0.931
  of the target.
- **A `carrierCapable: false` type does not belong in the carrier take-off matrix.**
  `carrierTakeoff.test.ts` now filters on the flag; do not add a KNOWN_EXCEPTIONS entry.
- **One cd0 cannot fit both a low-altitude and a high-altitude flown climb** when the
  trial had cowl flaps open and the model has none. Fit the points the card grades, and
  report the rest as a finding (B-17: +55.6% at 25,000 ft).
- **Check red tests against the base commit.** Six red tests on this branch were already
  red at the base (the Zero's leveling and its new stores block); two minutes in a
  detached worktree at the base settled it.
- **Gear cycle tests assume a travel time.** `hangar.spec.ts` "Cycle" ticks a fixed
  duration; a slow gear (B-17: 12 s) needs the tick count raised.

## Lessons from the third run (G4M1 Betty, 2026-09-29)

Detail: [`docs/handoff/2026-09-29-g4m-onboard.md`](handoff/2026-09-29-g4m-onboard.md).

- **A type with no flight test still onboards, but say so in the spec source.** The G4M1 has
  one speed point and one climb figure, both secondary, and no clean stall at all. The fit
  is then two unknowns to two figures and proves nothing; the stall cards grade the model
  against an estimate derived from its own `clMax`, and `flap.clIncrement` derived from that
  estimate is circular. Disclose each; do not read a green card as validation.
- **`powerFractionByAltitudeM` entries must be in (0, 1].** Take the peak (take-off) rating
  as `maxPowerW` and express a lower continuous rating as fractions of it; do not put the
  continuous rating in `maxPowerW` and let altitude power exceed 1.
- **On a twin, pick the wing-section station clear of the nacelles.** `centerPoint.test.ts` needs a `STATION` (0.2 for the G4M) as well as a `MIN_X` entry.
- **`eyePoints.test.ts` takes the canopy material name** (`g4m_dark` for the G4M).
- **Check a red test against the base before owning it.** The Zero ground pair and soak are known red; boundary and skyLoad fail only on ryzen.
- **When no bomb store fits the historic load, match mass, not count.** The Betty's single
  800 kg bomb became two `an-m65` (907 kg) in tandem; the source says so.

## Lessons from the fourth run (B-29 Superfortress, 2026-09-29)

Detail: [`docs/handoff/2026-09-29-b29-onboard.md`](handoff/2026-09-29-b29-onboard.md).

- **A tricycle needs `stance.test.ts` and `gearContact.test.ts` to know it.** The nose wheel ties the mains for the lowest
  point, so the mains are taken from the points aft of the nose gear and the nose wheel is checked on its own; the "CG between
  the wheels" check flips sign (mainX below zero, thirdX above). Both tests do this now.
- **A swept wing at a large chord can fail `centerPoint.test.ts` at any origin.** Give the model a `MIN_X` entry first (the
  default clip reads the quarter-chord 0.35 m aft on a 5 m chord); a per-model `TOLERANCE_BY_MODEL` entry is the fallback, with
  its reason written next to it.
- **A very heavy airplane can outrun three harness limits, all generic:** `TOP_SPEED_MAX_S` in `tools/testcards/measure.ts` (900 s,
  now 3600), the conformance `takeoffWindowS` (110 s for the B-29) and the Hangar gear-cycle tick count (25 s). Widen the
  harness; do not change the physics to fit it.
- **When the source's charts are computed at a lower rating than the take-off rating, `powerFractionByAltitudeM` carries the
  ratio** (2,000 / 2,200 here), and the sea-level take-off then runs at the lower power. Say so in the spec source.
- **Grade a known-bad take-off at a wide band and say why in the card's comment** rather than dropping the sourced distance.
- **Check the failing e2e specs against a clean `origin/main` worktree** (a detached `git worktree add`, its own vite port) before owning them.

## Lessons from the fifth run (P-38 Lightning, 2026-09-29)

Detail: [`docs/handoff/2026-09-29-p38-onboard.md`](handoff/2026-09-29-p38-onboard.md).

- **The mounts slicer reads propellers, booms and tail as wing.** On a twin, inboard stations (here z below about 4 m) give
  a leading edge or "no lower skin" error. Put racks and rails on the clean outer wing, and choose z yourself; x and y come from
  `npx tsx tools/models/mounts.ts`.
- **The Library card `name` must equal the spec `name` and the GAMEPLAY.md roster name**, or the library test fails twice
  (once on the roster, once on spec versus card).
- **A stall miss over about 15% breaks conformance test 6** (the take-off's unstick speed upper bound). Widen it per model with a
  dated comment (`liftoffHighFraction`); it is the shared clMax 1.4 showing, not a coefficient to tune.
- **`centerPoint.test.ts` needs a `STATION` that misses the props and booms** (0.6 here; the default reads a 2.24 m quarter-chord).
- **A tricycle whose drawn mains stand aft of the schema's `mainX < 0` limit** needs a documented allowance in `gearContact.test.ts`.
- **The picker order pins move**: `flyable.test.ts` (sorted by name) and `sortieFlow.test.ts` (Dev list, sorted by id).
- **Check the failing e2e specs against a clean `origin/main` worktree** before owning them (three `sortie.spec.ts` failures are old).

## Lessons from the sixth run (Ki-43-II Oscar, 2026-09-30)

Detail: [`docs/handoff/2026-09-30-ki43-onboard.md`](handoff/2026-09-30-ki43-onboard.md).

- **Use `rosterName` when the card needs the variant.** The card `name` must equal the spec `name`; the roster name in GAMEPLAY.md
  ("Nakajima Ki-43 Oscar") then goes in the card's `rosterName`, as the Hellcat does, so the spec can say "Ki-43-II".
- **A model with a fixed tailwheel and no Tailwheel node needs nothing in the rig.** Take `thirdX`, `thirdHeightM` and the stance pitch
  from the tailwheel meshes in the glb (first aft point to touch); only the main gear nodes are registered.
- **`tsx` cannot import `tests/tools/models/_drawnPoints.ts`** (it pulls in `import.meta.env` through `src/render/content.ts`). For a scratch
  script, read the glb with `modelIO().readBinary` and `worldPositions` directly, as the fit tests do.
- **A racks-only `stores` block (`rails: []`) is legal for a type with no rocket load**; the sortie then offers Clean and Bombs.
  A `stores` block is offered the same with or without Dev, so a stores-carrying spec needs no `needsDevStores` handling.
- **Fit two speeds first, then look at the climb.** With the Zero's lift curve the first-guess cd0 and propulsive efficiency landed both
  sourced speeds within 1%; the climb then reads +17% to +20%, the fleet's known bias, and is left alone.

## Lessons from the seventh run (D3A2 Val, 2026-09-30)

Detail: [`docs/handoff/2026-09-30-d3a-onboard.md`](handoff/2026-09-30-d3a-onboard.md).

- **A fixed gear was not a thing before this run.** `gear.fixed: true` (schema, `gearAfter`, `gearDragN`) pins `gearFraction` at 1 and zeroes the
  separate gear drag; without it the G key retracted the Val's spats in the sim while the model kept drawing them. The spec still needs
  `travelSeconds` and `dragAreaM2` to satisfy the schema; label them unused. The fixed gear's drag lives in the fitted `cd0`, which is why
  the Val's (0.022) is above the retractable fighters'.
- **A fixed-gear model has no rig nodes, so the "stands on the gear height" check in `aircraftRigs.test.ts` reads the airframe mesh
  (every node but the propeller) for a `gear.fixed` spec.**
- **A sourced climb table can rise with altitude** (two-speed blower: the Val's 2,160 ft/min at sea level, 2,330 ft/min at 9,850 ft). The
  graded card's "climbs more slowly at each higher altitude" check now follows the sourced direction instead of assuming a fall.
- **A centerline belly rack is neither a wing mount nor an internal bay.** Add the id to `INTERNAL` in `wildcatMounts.test.ts` (the set means
  "not wing-hung") and hold the offset with `tests/tools/models/bellyRack.test.ts`. The `an-m65` origin is the lug top, so the offset y is the
  lowest belly point under the store minus about 0.02 m minus the lug height.
- **A store the game does not have stands in for the historic load, and the card says so.** The Val's 250 kg + 2 x 60 kg is one 453.6 kg
  `an-m65` on one rack (+23%); the two wing bombs are dropped rather than faked with a 7.6x heavier bomb.
- **Sea-level power fractions carry the rating the speed sheet uses.** The TAIC speeds are military power, so the curve is 1,075/1,280 = 0.84 at
  sea level, and the take-off roll then reads long (+56%); it is reported, not fitted.
- **Carrier capability is cheap to try**: set `carrierCapable: true`, run `carrierTakeoff.test.ts` and `trap.test.ts` (both
  auto-discover; `trap.test.ts` pins the list, so add the id there). The Dev carrier-start pins in `sortieFlow.test.ts` and `catalog.test.ts` gain the id.
- **Spec name and card name must match; put the short roster name in `rosterName`** (the Val: "Aichi D3A2 Model 22 Val" / "Aichi D3A Val").
- **Combat zones must stay inside the propeller-excluded bounds** (`combatFit.test.ts`); the engine zone's first guess overshot the cowl by 6 mm.
## Lessons from the seventh run (Ki-84-Ia Frank, 2026-09-30)

Detail: [`docs/handoff/2026-09-30-ki84-onboard.md`](handoff/2026-09-30-ki84-onboard.md).

- **`mainX` must be positive, and `centerPoint.test.ts` caps how far you can move the origin.** A taildragger whose drawn mains stand on the
  model origin fails the schema ("body origin between its wheels"). The fix is `normalize.origin` in the model entry (source coordinates,
  rebuild with `npx tsx tools/models/build.ts <id>`, no Blender), but the origin also stands for the quarter-chord within 0.15 m, so the
  usable shift is under 0.15 m. Every x in the spec (guns, zones, racks, eye, `thirdX`) moves with it; re-run `tools/models/mounts.ts`.
- **A steep drawn stance pins the ground pitch ceiling to the rest pitch and fails conformance test 6 low.** At 16.4 degrees tail-down the
  airplane unsticks at its own stall (1.00 x, against the 0.95 floor). That is a finding about the drawing, so the floor was widened for the id
  in `conformance.test.ts` with a comment, as the B-17's was.
- **`solve.ts` diverges when the speed Jacobian is near singular.** cd0 and propulsive efficiency were nearly degenerate on speed alone; scan a
  grid of pairs and break the tie with the climb, and say that you did.
- **The catalog test's model-only fixture is a real card.** `tests/render/hangar/catalog.test.ts` used the Ki-84 card as its "display-only"
  example; it now strips `spec` from a copy. Any card onboarded next needs no change there.
- **A scratch vitest prints nothing by default:** `--silent=false --reporter=verbose`. And check `ss -ltn` for the E2E port before starting
  vite: `--strictPort` fails and the curl then reaches someone else's server.
## Lessons from the seventh run (Ki-21-IIb Sally, 2026-09-30)

Detail: [`docs/handoff/2026-09-30-ki21-onboard.md`](handoff/2026-09-30-ki21-onboard.md).

- **A source's own climb table may rise with altitude.** The Ki-21's TAIC sheet prints more climb at 8,550 ft than at sea level (the
  supercharger's military rating peaks there), and `graded.test.ts` used to demand a fall. It now orders the model as the reference is
  ordered; do not bend the powers to make a rise into a fall.
- **The default center-point station can sit on a nacelle or fuselage.** Sweep stations 0.05 to 0.9 with `sectionAtFor(id, -6)` in a
  scratch test and take a clean wing one (the Ki-21: station 0.5, 0.000 m); the fit test prints the failing quarter-chord.
- **The schema needs `testMassKg` at or under `maxTakeoffKg`.** When the sourced test weight exceeds a secondary maximum, use the test
  weight as the maximum and name both figures in `source`.
- **The B-17's 11.27 g lift-off bump is not visible to a consecutive-tick velocity probe** (the same probe reads 1.28 g on the B-17), so it
  cannot be used to check another airplane that way.

## Lessons from the D1 run (TBM-3 Avenger and B5N2 Kate, 2026-10-09)

Detail: [`docs/handoff/2026-10-09-d1-torpedo-planes.md`](handoff/2026-10-09-d1-torpedo-planes.md).

- **The harness carries `testMassKg - emptyKg` as disposable load whatever the fuel capacity.** Pair the graded figures with the
  weight the source quotes (the TBM-3E's normal loaded weight, Francillon's gross for the Kate), not empty plus full fuel; a light
  test mass put the Kate's climb 75% over.
- **A source can overrule the plan's D-table.** D11 named forward guns for the B5N2; Francillon gives it only the rear gun. A
  combat block may now have no guns (`guns: []`): it keeps hit zones, so the airplane can be shot down, and the gunsight and AI
  lead skip it. Say so in `combat.source`.
- **A gun turret behind a long greenhouse needs a traverse limit.** The barrel sweep found the Avenger's ball turret reaching the
  canopy dead ahead; its arc stops 30 degrees short. A ventral flexible gun pointing aft and down needs its elevation held below
  the belly's rise.
- **Bay doors on a deep, curved belly do not drop.** `aircraftRigs.test.ts` wants the keel edge to fall as the door opens; a door
  whose keel already hangs well below its hinge only swings sideways. Lay the bay under a flat stretch of belly.
- **Landing gear that folds outboard** is `retracts: 'outboard'` (added for the Avenger).
- **A flyable card with a `model` takes the Hangar's display path, which hangs no stores.** The Kate's card has none, so the Hangar
  hangs its torpedo; the Avenger's keeps one, as every bay bomber's does, because check 6 looks for stores from the front and a
  bay load is invisible there.
- **A carrier airframe traps on its own side's fleet carrier** in `trap.test.ts` (Essex, or Zuikaku for a Japanese type).

## The worked example

The Wildcat also shows the two things a stock model may need: a load-time
modification (the lengthened main legs, `wildcatGearStretch`, recorded in
`ASSETS.md`) and a racks-only loadout (`rails` may be empty). Read the W1
handoff for what was measured and what was accepted.
