# Aichi D3A2 Val geometry-repair handoff

> **Superseded 2026-10-11** by [2026-10-11-b17-val-remeasure.md](2026-10-11-b17-val-remeasure.md): this pass misread the drawing (see that handoff); its measurements and images no longer describe the model.

Date: 2026-10-11

Worktree: `/home/mark/projects/ww2airsim-repair-d3a-val`

Branch: `repair-d3a-val-geometry`

Base: `repair-aircraft-geometry-foundation` at `de80aa1eca13342a02ce28c47317a096852c07f3`

## Result

`d3a-val-blender` remains the Hangar-only duplicate beside the downloaded `d3a-val`; its ID, library role, rig contract, stance, eye point, armament, and flight-spec relationship are unchanged. This repair replaces the visibly kinked airframe interpretation, closes the daylight seam along both canopy rails, and adds visible fixed-gear roots and braces that geometrically intersect the spats and wing. No downloaded geometry was copied.

The rebuilt asset is 947,156 bytes, 28,754 triangles, and 19 draw calls. Its SHA-256 is `5d3176a0910e6ee4ebbc0a7d01f6cecae10360f5378aaefc267706bf4af301bc`; a second normal `npm run models:build -- d3a-val-blender` produced the same hash.

## Source recheck and the adjacent-variant caveat

The published dimensions and armament still come from English Wikipedia's [Aichi D3A](https://en.wikipedia.org/wiki/Aichi_D3A) Specifications (D3A2 Model 22), read 2026-10-11, which cites René J. Francillon, *Japanese Aircraft of the Pacific War* (1979), pp. 271–276.

The only suitable Commons orthographic remains Kaboldy's [Aichi D3A1 Val.svg](https://commons.wikimedia.org/wiki/File:Aichi_D3A1_Val.svg). It is a **D3A1 drawing, not a D3A2 drawing**. The D3A1 and cited D3A2 published lengths agree at 33 ft 5.4 in, so the drawing remains useful for major stations, but it cannot establish D3A2 cowling details. That caveat has not been weakened.

The repair added exact-variant and period photographic checks:

- Alan Wilson's Commons photograph of survivor c/n 3179, [Aichi D3A2 model 22 “Val” (3179 - N3131G)](https://commons.wikimedia.org/wiki/File:Aichi_D3A2_model_22_%22Val%22_(3179_-_N3131G)_(26094344464).jpg), confirms the broad oval body and greenhouse rails buried in the upper fuselage.
- San Diego Air & Space Museum archive photographs [Aichi D3A Type 99](https://commons.wikimedia.org/wiki/File:Aichi_D3A_Type_99.jpg), [Aichi D3A Type 99 2](https://commons.wikimedia.org/wiki/File:Aichi_D3A_Type_99_2.jpg), and [Aichi D3A Type 99 3](https://commons.wikimedia.org/wiki/File:Aichi_D3A_Type_99_3.jpg) show a short exposed fixed-leg/root fairing between each spat and the wing.

These photographs constrain shape and attachment, but they are not dimensioned installation drawings. The hidden belly interpolation, transverse section exponents, fixed-gear root widths, and brace diameters remain explicitly **ESTIMATE**.

## What was remeasured and repaired

The wing in the D3A1 side drawing occludes the real belly between 7 ft 1.8 in and 12 ft 3.2 in aft of the spinner. The original duplicate accidentally followed the visible wing/fuselage seam as if it were the belly and used the windscreen outline as fuselage deck. The repaired station table separates drawing-visible ordinates from the photo-constrained hidden run and feeds `kit._refine_shape` plus `refinement='shape'`, so interpolation preserves each measured station without cubic overshoot.

The largest corrections, quoted in the internal meter station table but converted here to US customary units, are:

- The deck 11 ft 6.2 in aft of the spinner was lowered by 11.8 in, from the mistaken windscreen outline to the actual fuselage deck.
- The hidden belly 8 ft 0.5 in aft was deepened by 10.6 in to make a continuous aerodynamic cowl-to-fuselage curve rather than a hard inward kink.
- The lower tail ordinate 32 ft 5.0 in aft was raised by 6.7 in to match the measured drawing line.
- The cross-section exponent now broadens the cockpit shoulders progressively rather than producing a narrow, pinched body. Those transverse section shapes are photo-checked estimates because no dimensioned D3A2 body sections were found.

The greenhouse is now an explicit fitted eight-value section table: rail half-width and height, shoulder half-width and height, roof half-width and height, and crown height at each station. The rails sink 1.2–4.7 in into the local shape-preserved fuselage skin. This closes the former see-through side wedge while retaining the drawing-measured windscreen, crown, and rear stations.

Each fixed spat now uses shape-preserving refinement. A 15.3 in visible root/fairing overlaps both the spat and wing, with paired fore/aft braces. The root radii (4.3 in at the spat and 3.1 in at the wing), 1.4 in brace radius, and exact fairing contour are estimates checked against the period photographs. They are intentionally separate intersecting solids rather than a claim about hidden factory structure.

The source-fit overlay still places the model origin at the drawing-measured wing quarter-chord 8 ft 4.4 in aft of the spinner. The corrected cowl, deck, belly, canopy base, tail cone, and spat silhouette follow the D3A1 source closely. The overlay is supporting review evidence, not proof of D3A2-specific cowling or transverse geometry.

## Regression evidence

`tests/tools/models/d3aValBlenderGeometry.test.ts` reads the built GLB and guards the three reported defects:

- every remeasured centerline body ring must match its ordinate and shape refinement may not overshoot between rings;
- all five full-width greenhouse sections must close below the fuselage shoulder;
- each side must contain a compact fixed-gear root component spanning from spat into wing.

Against the preserved pre-repair GLB, the suite failed **all three** tests: the lower tail was 6.7 in low, the greenhouse floor was 8.3 in above the closure limit, and no qualifying left fixed-gear root existed. With the rebuilt GLB, all three pass.

Focused verification through Ryzen `remote-run`:

```text
REMOTE_RUN_OVERFLOW=0 /home/mark/.local/bin/remote-run npx vitest run \
  tests/tools/models/d3aValBlenderGeometry.test.ts \
  tests/tools/models/blenderDuplicates.test.ts \
  tests/tools/models/aircraftDimensions.test.ts \
  tests/tools/models/generatedModels.test.ts \
  tests/render/airframes.test.ts
5 files passed; 99 tests passed; 0 failed; duration 2.02 s

REMOTE_RUN_OVERFLOW=0 /home/mark/.local/bin/remote-run npx vitest run \
  tests/tools/models/aircraftRigs.test.ts -t d3a-val-blender
1 file passed; 30 tests passed; 537 skipped; 0 failed; duration 1.49 s

REMOTE_RUN_OVERFLOW=0 /home/mark/.local/bin/remote-run npx vitest run \
  tests/tools/models/blenderEntries.test.ts -t d3a-val-blender
1 file passed; the D3A deterministic-rebuild test passed; 44 skipped; 0 failed; duration 5.42 s
```

## Review images

The before and after GLBs were rendered through `preview.py` with one another passed as `--frame-glb`, so each pair uses identical union camera bounds. The source-fit image uses the recorded side-view calibration: nose pixel 28, tail pixel 1,335, thrust-line pixel 295, origin 8 ft 4.4 in aft, published length 33 ft 5.4 in, and crop bottom 590 pixels.

The three JPEGs total 101,234 bytes (well below 0.5 MB):

- `docs/handoff/2026-10-11-d3a-val-geometry-repair-shots/2026-10-11-d3a-val-repair-side.jpg` — 23,306 bytes
- `docs/handoff/2026-10-11-d3a-val-geometry-repair-shots/2026-10-11-d3a-val-repair-three-quarter.jpg` — 24,078 bytes
- `docs/handoff/2026-10-11-d3a-val-geometry-repair-shots/2026-10-11-d3a-val-repair-source-fit.jpg` — 53,850 bytes

## Honest limitations

There is still no dimensioned D3A2 three-view or body/gear installation drawing in the source set. The D3A1 orthographic therefore remains an adjacent-variant silhouette reference. Photographs constrain the D3A2 body character, embedded canopy, and visible fixed-gear attachment, but hidden belly curvature, transverse sections, gear-root dimensions, braces, small fairings, airfoil, and propeller diameter remain estimates. The cockpit has no interior; the rear gun and dive brakes remain static; bomb trapeze, racks/stores, wing-fold detail, and tail codes remain absent. The duplicate is still Hangar-only and was not promoted into the flight spec.

No push or merge was performed.
