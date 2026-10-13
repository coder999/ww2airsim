# PBY-5A Catalina and water operations implementation plan

**Goal:** ship a flyable, Blender-built PBY-5A with bombs, Mk 13 torpedoes,
and reusable water taxi/takeoff/landing mechanics.

**Run:** worktree `pby-5a-water-ops` on nexus, branch
`pby-5a-water-ops`, merged to `main` at the end. Unattended.

**Viewing checkpoints:** final product only. Mark will inspect the final
Hangar and water-operation captures.

**Design:**
[`2026-10-12-pby-5a-water-operations-design.md`](../specs/2026-10-12-pby-5a-water-operations-design.md)

## Tasks

- [x] 1. Source dossier and ledger
  - Preserve the public-domain Navy manual citations and page measurements in
    the model/spec source strings; do not commit the scans.
  - Add the PBY-5A and reusable water operations to `MASTER_PLAN.md` as one
    open track, then close individual rows only after their acceptance passes.
  - Add source/license rows to `ASSETS.md` and the operational terms to
    `CONTEXT.md` where that document owns them.

- [x] 2. Water-capable aircraft schema
  - Add the strict optional `waterOperations` block to `AircraftSpec`.
  - Add content-loader acceptance/rejection fixtures and prove incomplete,
    negative, unknown, NaN, and infinite values fail by name.
  - Preserve parsed output for every existing aircraft.

- [x] 3. Pure water support mechanics
  - Add `src/sim/waterOperations.ts` with contact depth, safe-arrival,
    support, drag, attitude, taxi-yaw, and separation functions.
  - First add failing deterministic tests for every gate and for no energy
    gain/no reversal.
  - Keep every non-water-capable aircraft on the old path exactly.

- [x] 4. Integrate water support into the flight step and impact seam
  - Route a supported water hull through the constraint while leaving wheel
    support land/deck-only.
  - Make unsupported water contact keep reaching `contactOutcome`; make safe
    amphibious contact remain active instead of recording terminal `ditched`.
  - Add the water control regime without weakening ground or deck behavior.
  - Run the focused ground, contact, invariant, loop, and flight-model suites.

- [x] 5. Water landing and mission semantics
  - Add `water` to the landing destination/report contract.
  - Track hull touchdown, water rollout, and stop without calling it an
    airfield recovery.
  - Add a shipped `water-quals` mission with an afloat PBY start; keep
    historical combat content unchanged.
  - Enroll recovery agreement and deterministic qualification tests.

- [x] 6. PBY-5A content and flight fit
  - Add `content/aircraft/pby-5a-catalina.json` and its Library card.
  - Fit power, drag, lift, flap, and reference tables to AN 01-5MA-1; enroll
    in graded flight cards and document every residual.
  - Add retractable tricycle gear, the sourced two-engine RPM data, the water
    block, maneuver exclusions, four bomb racks, and the two-rack Mk 13
    loadout.
  - Assign the American-bomber cockpit with no sight and two RPM needles.

- [x] 7. Original Blender model
  - Build `tools/models/blender/pby-5a-catalina.py` from the primary Navy
    Figure 1 and station diagrams, using the nearest two-engine/turret
    templates and `kit.py` primitives.
  - Add surface, gear, propeller, float, and gun rig nodes; skin and markings;
    model entry and explicit budgets.
  - Build through the manifest on nexus/Ryzen, register the rig and Hangar,
    measure eye/stance/racks/zones, and pass all model-fit suites.
  - Render side/top/front/three-quarter previews and source overlays before
    accepting the shape.

- [x] 8. Stores, defensive installations, and UI
  - Reuse the existing AN-M65 and Mk 13 definitions; add loadout selection
    that supports bombs and torpedoes on different subsets of PBY racks.
  - Draw bow, waist, and tunnel installations as static detail; do not add
    aiming or firing behavior.
  - Show water capability and the correct loadout names in Form 5/Form 6,
    Hangar, HUD, and controls/help where applicable.

- [x] 9. Acceptance and captures
  - Run focused Vitest suites during each task through `remote-run`.
  - Run model/Hangar suites and the deterministic flight cards.
  - Run the PBY runway and water qualifications, bomb and Mk 13 releases,
    Hangar E2E, and auto-discovered flyable-all E2E.
  - Capture the final Hangar views, gear and floats in both states, afloat
    taxi, planing/takeoff, water touchdown, bomb load, and torpedo run.
  - Run any budget-titled browser spec only under the exclusive
    `ryzen-budget` lock; do not acquire it for correctness-only suites.

- [x] 10. Reconcile docs and tests
  - Update `docs/aircraft.md`, `docs/models.md`, `docs/testing.md`, and any
    water-operation instructions that became standing procedure.
  - Search the touched behavior for stale tests and assertions. Enroll the
    new behavior in canonical suites, delete superseded one-off coverage, and
    keep correctness and performance budgets separate.
  - Write `docs/handoff/2026-10-12-pby-5a-water-operations.md` with source
    measurements, tuning residuals, exact test evidence, captures, and
    deferred work. Email the handoff.

- [ ] 11. Merge and clean up
  - Rebase or merge current `origin/main` into the branch and rerun affected
    tests.
  - Merge to nexus `main`, run `npm run verify` through `remote-run`, push,
    and verify GitHub CI to completion.
  - Stop the preview server, remove scratch manual renders, archive/remove the
    local and nexus worktrees, and retain the branch.

## Done means

The exact definition of done is the design document's final section. A green
unit suite without the flown water qualification and final visual inspection
is not completion.

