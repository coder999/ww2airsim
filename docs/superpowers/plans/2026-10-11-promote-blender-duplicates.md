# Plan: fly the seven Blender duplicates, with specs re-fitted to the drawings

Date: 2026-10-11 · Author: Claude (planning only; another agent implements)
Mark's ruling (2026-10-11):
- Promote all seven: A6M2, Ki-43, F6F, F4U, F4F, B-17G and D3A2.
- The Wildcat included. Its download-era one-offs are retired, so every aircraft follows one pattern.
- Keep the downloads in the Hangar as display-only cards.

Viewing checkpoints: final product only (default; Mark may amend). Run: unattended. Collect captures in the
handoff.

## Why

The duplicates were re-measured from Commons three-views on 2026-10-11:
- `docs/handoff/2026-10-11-b17-val-remeasure.md`
- `docs/handoff/2026-10-11-fleet-remeasure.md`

Their flight specs still carry stance, eye and gun figures fitted to the downloads, which were wrong. So the
duplicates stand on download-fitted gear. Promotion swaps the flown model and re-fits those figures to the
drawings in one change.

## Read first

- `AGENTS.md`
- `docs/testing.md` "Philosophy"
- `docs/blender-aircraft.md`: "Promoting a duplicate" is the unexercised procedure this plan executes and
  corrects, plus the traps sections.
- each script's header in `tools/models/blender/<id>-blender.py`: the drawing calibration, origin and drawn
  gear figures.

## Scope per aircraft (spec `content/aircraft/<spec>.json`)

For each of the seven, in one commit per aircraft:

1. **Re-fit `gear` to the drawing.** Set `heightM`, `mainX`, `thirdX` and `thirdHeightM` from the drawn wheels,
   in the model frame: origin at the 30%-semispan quarter chord, y up from the thrust line. Use the drawn tire
   bottoms and axle stations. Then rebuild the duplicate with its spec-fit constants (GEAR/TAILWHEEL tables,
   the Val's `SPAT_RAISE`, the Wildcat's long legs) changed to the drawing. Leg geometry then becomes the real
   airplane's. The first-read drawing figures below must be re-verified on the drawing; they are not a source.
2. **Update the stance.** Change `MODEL_STANCE` in `src/render/scene/stance.ts` and keep the key the same as
   `view.model`. Set `mainWheelXM` to the new `mainX` and `tailDownPitchRad` to the angle of the line through
   the main and tail tire bottoms.
3. **Point the spec at the duplicate.** Set `view.model` to the duplicate's id. Set `view.eyePointM` to the
   eye row in `tests/tools/models/blenderDuplicates.test.ts`, then delete that row and add the model to
   `CANOPY` in `tests/tools/models/eyePoints.test.ts`.
4. **Re-fit `combat.guns`.** Move positions to the drawn gun ports and muzzles (the scripts record them). Keep
   each gun's direction, ammunition and rate unchanged. The F6F and F4U spec guns sit 1–3 ft outboard of the
   drawn ports.
5. **Re-measure stores.** Run `npm run models:mounts` and write the printed rack and rail offsets into the
   spec. Update the pinned lists (`tests/tools/models/wildcatMounts.test.ts` holds them despite its name).
6. **Point the Library card at the spec.** Keep the download's card and glb as a display-only comparison: its
   `ASSETS.md` credit stays. Its stance entry may stay only if a test needs it, otherwise remove it.
7. **Leave everything else in the flight model unchanged:** mass, wing geometry and engine.

### First-read drawn gear (verify before use)

| Spec | Now: heightM, mainX, thirdX, thirdHeightM | Drawing says (first read) |
| --- | --- | --- |
| f4f-wildcat | 2.3952, 0.413, -4.627, 1.293 | tire 1.75 m below thrust line; tailwheel 0.19 m aft of spec x, 0.56 m higher |
| f4u-corsair | 2.418, 0.418, -5.722, 1.306 | main axle 2.33 m aft of hub (spec 2.47), tire 2.35 m down; tailwheel 0.95 m down, x 6 cm aft; ground line ~12.5° |
| f6f-hellcat | 2.42, 0.62, -6.0, 1.318 | main matches (x 0.61, 2.42); tailwheel x -5.85, 0.24 m higher; ~11.8° |
| a6m2-zero | 2.025, 0.182, -6.532, 0.57 | main axle 1.94 m aft of spinner (origin 2.36 m ⇒ x +0.42), r 0.295; tailwheel 8.55 m aft (x -6.19); drawn tire 0.25 m higher |
| ki-43-oscar | 1.843, 0.348, -5.375, 0.595 | main axle 1.65 m aft (origin 2.222 m), 0.14 m forward of spec, 0.05 m lower; tailwheel within 0.05 m |
| b-17-flying-fortress | 2.548, 0.852, -10.623, 1.097 | main axle station 5.92 m (origin 6.40 m ⇒ x +0.48), tire -2.29 m (model y); tailwheel station ~16.7 m, -1.26 m |
| d3a-val | 1.85, 0.257, -6.577, 0.457 | main axle station 2.12 m (origin 2.55 m ⇒ x +0.43), tire -2.11 m; tailwheel station 9.34 m, -0.50 m |

The B-17 and Val figures came from the extended-gear phantoms drawn on their three-views. Confirm that the
drawn circle is the extended wheel and not a retracted outline.

## The Wildcat: retire the one-offs

The flown model today is `view.model: "wildcat"`, loaded by `src/render/scene/wildcat.ts`. That loader carries
`wildcatFrame.ts` (`wildcatCorrection`, `wildcatToSimMatrix`), a leg stretch (`wildcatGearStretch`) and
code-drawn split flaps.

1. Promote `f4f-wildcat-blender` through the generic rig, like the others. The duplicate already has kit
   flaps and gear, its rig row in `src/render/scene/airframeRigs.ts` has its gear swinging aft, and the
   `MODEL_STANCE` key becomes `f4f-wildcat-blender`.
2. Make the drawn gear real (step 1 above). The spec's 2.3952 m height is the download's stretched leg. With
   the drawn 1.75 m, revisit the aft-swing gear row: a real-length leg may fold inboard again, which is
   closer to the real airplane's fold into the fuselage side. Choose whichever passes `aircraftRigs`.
3. Delete what only the download needed, after grepping every reference:
   - `wildcat.ts`'s special path and `wildcatFrame.ts`;
   - the `_drawnPoints.ts` Wildcat branch;
   - `tests/render/wildcat.test.ts`;
   - `tests/tools/models/wildcatGear.test.ts`;
   - the `wildcat` entries in `stance.ts` and `stance.test.ts`.

   Then check `tools/models/mounts.ts`, `tests/sim/gearContact.test.ts`, `tests/sim/flight/schema.test.ts`,
   `tests/e2e/wildcat.spec.ts`, `tests/e2e/sortie.spec.ts`, and the hangar catalog, library and models
   tests. Re-point what still has a purpose to the generic path and delete the rest. Keep the downloaded
   `wildcat` glb only as a Hangar display card; if keeping it needs the special loader, ask Mark rather than
   keeping the loader.
4. The Wildcat is the default aircraft. Run its e2e flight and sortie specs on the reference GPU (ryzen, per
   `docs/testing.md`).

## Acceptance (automated; Mark's viewing is not a gate)

- **Per aircraft:**
  - the duplicate's drawing-overlay still fits (`tools/models/blender/silhouette-overlay.ts`);
  - `blenderEntries -t <id>` rebuilds byte-identically;
  - its geometry test passes.
- **Suite:** `npm run verify` passes on ryzen (`REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`). Read real
  counts and exit status.
- **E2E:** the Hangar, wildcat, sortie and vehicle-capture specs pass on the reference GPU.
- **Graded flight cards** (`tests/sim/testcards/graded.test.ts`):
  - They read the spec and will feel the stance change.
  - If one fails, find out why: takeoff attitude, prop clearance, carrier deck geometry.
  - Fix the cause or record the measured change in the handoff with Mark's sign-off.
  - Never widen a tolerance to pass.
- **Ground clearance:** confirm prop-tip clearance at the new stance for each fighter. The F4U and F6F
  tail-down pitch rises about 2°.
- **Records:**
  - update `docs/blender-aircraft.md` "Promoting a duplicate" with what the first real promotion found;
  - add one line to `MASTER_PLAN.md`;
  - write `docs/handoff/<date>-promote-blender-duplicates.md` with before/after Hangar captures per aircraft;
  - email the handoff with `tools/mail-doc.py`.

## Risks

- **Carrier operations:** catapult, arrest and deck spot may assume the old gear heights. Grep for `heightM`
  consumers and `thirdHeightM` and test a carrier launch (F6F/F4U/F4F).
- **AI pilots:** they fly the same specs. Gun convergence moves with the new gun positions; watch the
  AI-gunnery tests.
- **Concurrent sessions:** other sessions commit to `main`. Work in a worktree, one commit per aircraft, and
  check `origin/main..main` before any push (none required by this plan).
