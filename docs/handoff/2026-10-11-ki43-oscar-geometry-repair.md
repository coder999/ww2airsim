# Ki-43-IIb Oscar geometry repair handoff — 2026-10-11

> **Superseded 2026-10-11** by [2026-10-11-fleet-remeasure.md](2026-10-11-fleet-remeasure.md): the models were re-measured from their drawings; the measurements and images here no longer describe them.

## Scope and base

- Worktree: `/home/mark/projects/ww2airsim-repair-ki43-oscar`
- Branch: `repair-ki43-oscar-geometry`
- Base: `de80aa1eca13342a02ce28c47317a096852c07f3` (`repair-aircraft-geometry-foundation`)
- Model only: `ki-43-oscar-blender`; no downloaded geometry was copied, and no other aircraft opted into refinement.

The complaint was real: the first authored fuselage had a visible upper-deck dip ahead of the cockpit and a hump behind it. Shape interpolation contributed only millimeter-scale overshoot. The dominant error was four source stations measured from panel/wing-root lines inside the drawing rather than the airplane's outer silhouette.

## Evidence and variant caveat

The model remains a Ki-43-IIb, using the English Wikipedia Specifications (Ki-43-IIb), read 2026-10-11, for its 35 ft 7 in span, 29 ft 3 in length, 230 sq ft wing area, NN-12 modified airfoil, three-blade 9 ft 2 in propeller and two 0.50 in Ho-103 guns. The measurement reference is Wikimedia Commons `File:Nakajima Ki 43-I.svg`, obtained through the article image API and `Special:FilePath` at width 1600; the returned PNG was 1920 × 2312 px.

The Commons drawing is explicitly a Ki-43-I, not a IIb. Its 1,327 px side-view spinner-to-tail length was calibrated to the cited 29 ft 3 in IIb length. The IIb's cited shorter span, longer cowl, three-blade propeller and slightly taller canopy override the adjacent-variant drawing. Cross-variant fuselage likeness and all transverse section shapes remain **ESTIMATE**, not a claim that the Ki-43-I drawing is exact IIb loft data.

Internal model stations are meters aft of the spinner tip because the glTF/body-frame pipeline is metric:

| Station | Superseded top | Corrected top | Drawing evidence |
| ---: | ---: | ---: | --- |
| 1.60 m | 0.54 m | 0.64 m | outer cowl line at about y=156 px; old value followed the lower panel/deck line |
| 2.00 m | 0.48 m | 0.64 m | outer cowl/deck line at about y=155 px; old value followed an internal line under the windscreen |
| 4.00 m | 0.59 m | 0.54 m | dorsal silhouette at about y=171 px; old value followed the higher wing-root/detail line |
| 4.50 m | 0.50 m | 0.44 m | dorsal silhouette at about y=186 px; old value followed the higher interior line |

The other side stations and top-view half-widths were rechecked and retained. Several top-view stations cross the wing and cannot reveal an uncontaminated fuselage edge; those widths remain the original drawing-constrained **ESTIMATE** rather than invented precision. The fin correction interprets the drawing as about 1.17 m of visible surface above its 0.17 m dorsal root (about 1.34 m above the thrust line), not the superseded 1.45 m full-profile reading.

## Geometry changes

- The measured fuselage and its `fus_section` lookup both use the foundation's shape-preserving refinement. The old Catmull path is unchanged for every other model.
- The canopy now uses explicit eight-value rail/shoulder/roof/crown sections. Each rail is evaluated from the same refined fuselage surface and sunk 0.02 m into it, eliminating the floating rail/open shoulder in the earlier primitive.
- Canopy crown positions remain drawing measurements with the documented 0.08 m IIb height allowance. Shoulder and roof fractions are explicitly **ESTIMATE** because the available drawing has no trustworthy section ordinates.
- The committed GLB is 804,744 bytes, 25,596 triangles and 17 draw calls.

The download served only as a same-camera visual foil. No vertex, silhouette, canopy location or attachment point was transferred from it.

## Regression and review evidence

`blenderDuplicates.test.ts` now reads the committed `ki43b_dark` mesh at the four corrected centerline stations. Against the exact pre-repair GLB saved from the base commit, the new test failed as intended on the first station: actual 0.540 m versus required 0.640 m. Against the repaired GLB, the Oscar duplicate row plus regression passed 6/6.

Review JPEGs (120,134 bytes total, under the 0.5 MB handoff budget):

- [`2026-10-11-ki43-oscar-geometry-repair-shots/ki43-before-after-review.jpg`](2026-10-11-ki43-oscar-geometry-repair-shots/ki43-before-after-review.jpg) — pre/post side, three-quarter and top renders, each pair framed with the other's GLB for identical cameras.
- [`2026-10-11-ki43-oscar-geometry-repair-shots/ki43-source-fit-review.jpg`](2026-10-11-ki43-oscar-geometry-repair-shots/ki43-source-fit-review.jpg) — repaired model vertices over the calibrated Commons side drawing.

The side overlay is evidence for lengthwise silhouette only. It does not promote estimated cross-sections to measured facts; the top and three-quarter renders are the continuity check for those shapes.

## Verification

- `REMOTE_RUN_OVERFLOW=0 .../remote-run npm run models:build -- ki-43-oscar-blender` — PASS; 804,744 bytes, 25,596 triangles, 17 draws.
- Deterministic Nexus rebuild with the same model command — PASS with identical figures.
- Exact pre-repair GLB with the new regression — EXPECTED FAIL; 0.540 m at the 1.60 m station versus 0.640 m.
- Repaired GLB: `remote-run npx vitest run tests/tools/models/blenderDuplicates.test.ts -t ki-43-oscar-blender` — PASS, 6 tests passed, 30 skipped.
- `remote-run npx vitest run tests/tools/models/aircraftDimensions.test.ts tests/tools/models/aircraftRigs.test.ts tests/tools/models/blenderDuplicates.test.ts tests/tools/models/blenderEntries.test.ts` — Oscar-relevant checks PASS: dimensions 22/22, duplicates 36/36, rigs 567/567, and `ki-43-oscar-blender` rebuilt byte-identically. The combined run was 667 passed / 3 failed because the base commit's unrelated `a6m2-zero-blender`, `d3a-val-blender` and `f6f-hellcat-blender` committed GLBs do not match their current scripts.
- Isolated follow-up `remote-run npx vitest run tests/tools/models/blenderEntries.test.ts -t ki-43-oscar-blender` — PASS, 1 passed / 44 skipped; deterministic rebuild completed in 3.919 s.

No push or merge was performed.
