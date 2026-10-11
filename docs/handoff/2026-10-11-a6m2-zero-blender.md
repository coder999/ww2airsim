# A6M2 Model 21 Blender duplicate handoff (2026-10-11)

## Result

`a6m2-zero-blender` is an original, Hangar-only duplicate beside the existing downloaded `a6m2-zero`.
It is built from `kit.py`, keeps the existing flying Zero and its spec unchanged, and fits that spec's
stance, weapons and stores so a later model swap does not require flight-model work.

Worktree: `/home/mark/projects/ww2airsim-a6m2-zero-blender`

Branch: `blender-a6m2-zero`

Base: `14fb2cadf2605fc181865a1d1a6bac46d3ba0e4e`

Built output: 717,844 bytes, 21,464 triangles, 18 draw calls.

## Sources and measurements

English Wikipedia's **Mitsubishi A6M Zero**, Specifications (A6M2 Type 0 Model 21), read
2026-10-11, is the citation for the 12.0 m (39 ft 4 in) span, 9.06 m (29 ft 9 in) length,
22.44 m2 wing area, MAC118/NACA 2315 root and MAC118/NACA 3309 tip airfoil alternatives,
three-bladed Sumitomo-Hamilton propeller, two 7.7 mm Type 97 cowling guns and two 20 mm
Type 99-1 Mk.3 wing cannon. Its table leaves propeller diameter blank; the script says so rather
than implying otherwise.

The measured reference is Wikimedia Commons `Mitsubishi A6M Zero drawing.svg`, discovered through
the article image API and fetched through `Special:FilePath` at 1,920 by 2,325 pixels. The side view
calibrates from spinner x=25 to tail x=1,380 at 0.006686 m/px, with thrust line y=262.5. The top view
calibrates independently from spinner x=25 to tail x=1,474 at 0.006253 m/px, with centerline y=1,424.
The wing quarter chord at 30% semispan is 2.22 m aft of the spinner and is the model origin.

Measured nose-relative stations are preserved in the script header. The important ones are:

| Feature | Distance aft of spinner | Height or width |
| --- | ---: | ---: |
| windscreen front | 2.17 m | fuselage top +0.62 m |
| canopy crown | 2.75-3.10 m | +1.00 m |
| canopy rear | 4.55 m | +0.70 m |
| real cockpit eye | 3.10 m | +0.70 m |
| fin leading edge | about 7.05 m | about 1.2 m above the spine |
| tailplane leading edge | about 6.7 m | about 4.0 m total span |

The real-cockpit eye is `[-0.88, 0.70, 0]` in model coordinates, 0.30 m below the canopy crown.
That is reassuringly close to the existing spec's `[-0.896, 0.73, 0]`; promotion would need only
the small measured correction.

`tools/models/blender/silhouette-overlay.ts` projects built glTF vertices over a calibrated side
drawing. Its corrected overlay is in the evidence directory. The first overlay exposed a bad tail
pixel selection (x=1,040); this was discarded and all stations/model work were recalibrated to the
actual side-view tail at x=1,380 before verification.

## What is exact, measured, fitted and estimated

- **CITED from Wikipedia:** overall dimensions, area, listed airfoils, three propeller blades and
  maker, and the four-gun armament.
- **MEASURED from the Commons drawing:** fuselage top/bottom and half-width stations, windscreen,
  canopy crown/rear, fin, tailplane, 2.22 m origin station and the 2.90 m propeller diameter. The
  diameter remains tagged `ESTIMATE` because it is not a published specification.
- **FITTED to `content/aircraft/a6m2-zero.json`:** main-wheel bottoms 2.025 m below origin at x=0.182,
  tailwheel x=-6.532 / bottom 0.570 m, 12.224 degree stance, the two cowling and two wing-gun
  positions, and the wing envelope that accepts every declared rack/rail point. Stores are spec data,
  not geometry.
- **ESTIMATE:** symmetric kit-airfoil approximation, 5.5 degree dihedral, taper, paint color,
  individual control-surface proportions, antenna/pitot/exhaust detail, leg covers, and tailwheel
  folding motion. The main gear uses the cited 90 degree inward retraction but, like the other kit
  duplicates, one hinge leaves each wheel upright.

The model deliberately omits a cockpit interior, folding wing tips, arrester hook, drop tank and
external stores. It is a clean, low-poly Hangar representation, not a claim of museum-level detail.

## Parts and registration

The `Prop` node is exactly three-fold symmetric. `GearL`, `GearR` and `Tailwheel` move from the rig
row. `AileronL/R`, `Flap1L/R`, `ElevatorL/R` and `Rudder` are retained control-surface nodes. The
script also models four gun barrels, hinomaru, pitot, antenna, exhausts and gear covers.

Registered touchpoints:

- Blender script and manifest: `tools/models/blender/a6m2-zero-blender.py`,
  `tools/models/entries/a6m2-zero-blender.json`
- committed GLB and Hangar entry: `content/aircraft/a6m2-zero-blender.glb`,
  `content/library/a6m2-zero-blender.json` (model only, no `spec`)
- rig and asset registry: `src/render/scene/airframeRigs.ts`, `ASSETS.md`
- dimensional, rig, duplicate and E2E pins in the required test files
- new `ijnaGray` paint role in `kit.py` and `tools/models/skin/surfaces.ts`

The process documentation now records independent three-view scales, exact union-camera comparisons,
blank specifications-table fields, and the reusable silhouette-overlay check.

## Verification

- `REMOTE_RUN_OVERFLOW=0 /home/mark/.local/bin/remote-run npx vitest run tests/tools/models tests/render/hangar tests/render/airframes.test.ts`
  — **64 files, 1,550 tests passed** in 210.84 s. This includes byte-identical rebuild, dimensions,
  eye, store-envelope, three-fold prop symmetry, moving controls and folded-gear clearance.
- `PW_BASE_URL=http://127.0.0.1:4187 npx playwright test tests/e2e/hangar.spec.ts --workers=1`
  — **22 passed, 1 failed** in 8.1 minutes. Every A6M2-related case passed, including the requested
  checks 10 and 16. Case 17 failed before exercising a model because `content/ships` and the Hangar
  contain 13 warships while its unrelated hard-coded assertion still expects 12. An isolated rerun
  with `-g warship` reproduced exactly `Expected: 12; Received: 13`; it was not a load timeout and
  this aircraft branch does not change a ship or that assertion.

## Review and delivery

The evidence directory is `docs/handoff/2026-10-11-a6m2-zero-blender-shots/`. The download and new
model were rendered with `preview.py --view side|front`, each using the other through `--frame-glb`,
so each pair uses the exact same union camera. `a6m2-zero-contact-sheet.jpg` is 37,111 bytes and was
emailed as a plain MIME attachment from `alerts@marktuttle.dev` to `marktuttle1@gmail.com` with
`msmtp -t`; the command exited successfully with no output. The drawing overlay is review evidence,
not a golden test.

Nothing was pushed or merged.
