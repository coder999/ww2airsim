# Aichi D3A2 Model 22 Val Blender duplicate handoff

Date: 2026-10-11
Worktree: `/home/mark/projects/ww2airsim-d3a-val-blender`
Branch: `blender-d3a-val`
Base: `main` at `14fb2cadf2605fc181865a1d1a6bac46d3ba0e4e`

## Result

`d3a-val-blender` is an original, procedural, Hangar-only Aichi D3A2 Model 22 duplicate. It sits beside the downloaded `d3a-val` and deliberately has no `spec`, so the existing download remains the flyable aircraft. The script rebuilds the checked-in GLB byte-for-byte through the normal entry pipeline.

The model has a three-blade `Prop`, fixed spatted main gear and tailwheel baked into the skin, separate left/right ailerons, two flap sections per side, separate elevators, a rudder, two forward gun barrels, a static rear flexible gun, and static underwing dive-brake panels. Fixed gear has no invented `GearL`, `GearR`, or tailwheel animation node. The rear gun and dive brakes are static because the renderer has neither a rear-gunner control contract for this Hangar-only duplicate nor a dive-brake part-name/control contract.

## Sources, drawing, and measurement

The specifications come from English Wikipedia's [Aichi D3A](https://en.wikipedia.org/wiki/Aichi_D3A) Specifications (D3A2 Model 22), read 2026-10-11; that table cites René J. Francillon, *Japanese Aircraft of the Pacific War* (1979), pp. 271–276. The measured drawing is Wikimedia Commons [Aichi D3A1 Val.svg](https://commons.wikimedia.org/wiki/File:Aichi_D3A1_Val.svg), found through the article image API and fetched through `Special:FilePath` as a 1,920 × 2,447 PNG.

This is the important source limitation: Commons exposed a D3A1 three-view, not a D3A2 three-view. The published D3A1 and cited D3A2 lengths agree, so the drawing was scaled to the D3A2's 33 ft 5.4 in published length. It is useful for the airframe/cockpit stations, but the D3A2 cowling and other variant details remain estimates.

What matches the cited D3A2 specification:

- span: 47 ft 1.6 in
- length: 33 ft 5.4 in
- wing area: 375.7 sq ft
- three-blade metal constant-speed propeller
- two forward 0.303 in Type 97 guns and one flexible rear 0.303 in Type 92 gun
- one 551 lb fuselage bomb and two 132 lb wing bombs as attachment/spec data, not permanent model geometry

What was measured from the drawing:

- The representative wing chord at 30% semispan runs from 6 ft 0.0 in to 15 ft 6.2 in aft of the spinner tip. Its quarter-chord is 8 ft 4.4 in aft of the spinner tip, and that is the model origin.
- The windscreen front is 11 ft 6.2 in aft of the spinner tip. The canopy crown runs from about 13 ft 3.4 in to 16 ft 9.2 in aft, at 4 ft 3.6 in to 4 ft 1.2 in above the thrust line. The canopy rear is 21 ft 11.8 in aft.
- The fin begins near 24 ft 11 in aft and the tailplane leading edge near 27 ft 3 in aft.
- The proposed real-cockpit eye point is `[-5 ft 8.9 in, 3 ft 4.6 in]` relative to the model origin. The existing spec's `[-2 ft 7.5 in, 2 ft 5.5 in]` eye was fitted to the downloaded canopy and was not copied.
- Fuselage top, bottom, and half-width stations were measured nose-to-tail. The exact station table, in the model's internal feet-independent meter frame, is preserved at the top of `tools/models/blender/d3a-val-blender.py`.

The centerline silhouette was rendered from the procedural model and overlaid on the drawing. The cowl, fuselage deck/belly, long greenhouse, wing station, and horizontal-tail station align closely. The procedural fin is visibly more angular than the drawing, and the belly around the wing/spat transition is an approximation.

## Fits and estimates

The stance is fitted to the existing `d3a-val` flight spec so a future model swap needs no stance change: main contacts are 10.1 in forward of the origin and 6 ft 0.8 in below it; the tail contact is 21 ft 7 in aft and 1 ft 6.0 in below it. The forward gun positions also use the existing spec. Store racks remain spec attachment data and were validated by the duplicate contract rather than modeled as permanent geometry.

Wikipedia leaves the airfoil and propeller diameter blank. The NACA 23015 root / 23009 tip procedural sections and 10 ft 6.0 in propeller diameter are explicitly estimates. Also estimated are wing-section blending and 4.5° dihedral, tail cross-sections, spat and wheel shapes, exhausts, antenna and pitot shapes, static dive-brake detail, paint colors, marking placement, and small fairings. No downloaded mesh geometry or downloaded canopy position was reused.

## Output and registration

- Script: `tools/models/blender/d3a-val-blender.py`
- Entry: `tools/models/entries/d3a-val-blender.json`
- GLB: `content/aircraft/d3a-val-blender.glb`
- Library: `content/library/d3a-val-blender.json` (model only; no flight spec)
- GLB size: 901,876 bytes
- Geometry: 27,060 triangles, 19 draw calls
- Bounds: 33 ft 2.4 in nose-to-tail, 47 ft 1.6 in span, and 13 ft 9.0 in overall authored vertical extent
- Rig registration: exact three-fold prop symmetry, fixed gear, nine control-surface nodes
- Duplicate test eye point: `[-5 ft 8.9 in, 3 ft 4.6 in]`

The asset catalog, dimensions citation, pinned rig list, duplicate contract, Hangar budget list, Hangar checker list, and airframe rig table are registered. `docs/blender-aircraft.md` now records the missing process rules for an adjacent-variant drawing, fixed gear, static display-only flexible guns, and unsupported special surfaces such as dive brakes.

## Verification

The required deterministic suite ran through Ryzen `remote-run`:

```text
REMOTE_RUN_OVERFLOW=0 /home/mark/.local/bin/remote-run npx vitest run tests/tools/models tests/render/hangar tests/render/airframes.test.ts
64 files passed; 1,554 tests passed; 0 failed; duration 213.60 s
```

The exact Hangar Playwright command ran against a dedicated local Vite server:

```text
PW_BASE_URL=http://localhost:5191 npx playwright test tests/e2e/hangar.spec.ts --workers=1
```

Result: 22 passed and one pre-existing inventory-count assertion failed after 6.9 minutes. Check 17 expects 12 gallery warships, but the base contains 13 (`abukuma-cl`, `casablanca-cve`, `cleveland-cl`, `crow-amc-20`, `essex-cv`, `fletcher-dd`, `kagero-dd`, `mogami-ca`, `pennsylvania-bb`, `shiratsuyu-dd`, `type-b-maru`, `yamato-bb`, and `zuikaku-cv`). An immediate isolated rerun with `--grep M1b` failed identically in 1.4 seconds: expected 12, received 13. The aircraft-specific Hangar checks 10 and 16 passed, including `d3a-val-blender` at 27,060 triangles / 19 draw calls and checker luminance `0.0982 / 0.2555 / 0.0982` with 97.5% of pixels changed. This branch changes only the two requested aircraft lists in that file; it does not alter the warship test or inventory.

Preview contact sheets were rendered with the same `preview.py` side and front cameras for the download and new model. The third JPEG is the measured drawing overlay. Total JPEG size is 90,349 bytes:

- `docs/handoff/2026-10-11-d3a-val-blender-shots/d3a-val-side-contact.jpg` — 24,588 bytes
- `docs/handoff/2026-10-11-d3a-val-blender-shots/d3a-val-front-contact.jpg` — 20,008 bytes
- `docs/handoff/2026-10-11-d3a-val-blender-shots/d3a-val-drawing-overlay.jpg` — 45,753 bytes

## Known limitations and next step

There is no D3A2 three-view in the source set, so the D3A1 drawing caveat must stay visible. The cockpit has no interior, the rear gun does not traverse, the dive brakes do not deploy, and bomb trapeze/racks/stores and wing-fold detail are intentionally absent. The fin and several small fairings are procedural approximations. The duplicate is not promoted to flight use; promotion should first reconcile the real eye point and any future D3A2-specific reference against the existing flight spec.

No push or merge was performed.
