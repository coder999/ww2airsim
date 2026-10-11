# B-17G and D3A Val Blender duplicates: re-measured from the three-views

Date: 2026-10-11 · Run: unattended, worktree `ww2airsim-tails`, branch `repair-b17-val-tails`
Supersedes the measurements in `2026-10-11-b-17-geometry-repair.md` and `2026-10-11-d3a-val-geometry-repair.md`.

## What Mark reported

The Blender B-17 and Val looked wrong, the B-17's fin especially: a triangle, not the B-17's sloped taper.

## What was actually wrong

The fin was the visible symptom. Overlaying the built meshes, filled, on the same Kaboldy three-views the
scripts cite showed both first passes had misread their drawings well beyond the tail:

| | First pass | Drawing |
| --- | --- | --- |
| B-17 nose ahead of the wing quarter chord | 29 ft 2 in | 21 ft 0 in |
| B-17 fuselage width amidships | 10 ft 0 in | 7 ft 1 in |
| B-17 fuselage depth at station 66 ft (tail) | 0 ft 4 in | 1 ft 10 in (blunt gunner's housing) |
| B-17 rear fuselage and tailplane height | ~3 ft high | — |
| B-17 fin | straight fillet + trapezoid | curved fillet, rounded crown 14 ft 2 in above datum, raked rudder |
| B-17 tailplane root chord | 14 ft 5 in, ran past the gunner | 11 ft 3 in, rounded tips |
| B-17 nacelles and props | 2 ft aft | — |
| Val cowl depth | 5 ft 8 in | 4 ft 1 in |
| Val canopy | 3 ft 7 in too far aft, roof 11 in high | roof 3 ft 4 in above the prop axis, stations 8 ft 0 in–16 ft 4 in |
| Val fin height above prop axis | 7 ft 8 in, straight edges | 6 ft 5 in, curved LE, rounded crown |
| Val tailplane span | 17 ft 5 in | 14 ft 5 in, elliptical tips |
| Val spat depth | 5 ft 1 in | 2 ft 6 in, teardrop |

Codex's own source-fit overlays showed some of this: dots above the Val canopy and fin. They were drawn as
sparse vertex dots and called a fit. Root causes: the B-17 origin was read 8 ft 2 in too far aft along the body,
and the Val side view was read about 1.35× too large. The top-view wing planforms and both origins' wing
definitions were right and are kept.

## What changed

- **Both airframes re-traced** from Kaboldy's B-17G and D3A1 three-views: fuselage side and plan
  silhouettes, canopy, fin and fillet, rudder, tailplane, B-17 wingtips and nacelles, Val spats and gear leg.
  Every table is in the script headers with its calibration and a cross-check:
  - B-17: the spec-fitted tailwheel lands on the drawn one.
  - Val: the top view's span lands within 0.5% of the cited span.
- **Flight fit unchanged.** Origin, gear heights, wheel and tailwheel x, span and wing area are the spec's.
  The Val's drawn tire is 10 in lower than the spec stance, so its spat is raised that much.
- **New eye points from the drawings:** B-17 `[2.40, 1.44]`, Val `[-0.60, 0.82]`. The specs still use their
  download-fitted eyes; promotion moves them.
- **`kit.fin_outline` / `kit.wing_outline`:** traced planforms with a ring at every traced row. A hinge can be
  a straight line, so curved fins keep straight rudder and elevator hinges. Every other Blender entry
  rebuilds byte-identically (82/82).
- **`silhouette-overlay.ts`** draws filled triangles (and a `top` view) instead of vertex dots, so a misfit
  outline is visible.
- **B-17 turret pivots** follow the measured turret positions (entry JSON).

## Evidence

Shots in `2026-10-11-b17-val-remeasure-shots/`:

- `b17-drawing-overlay.jpg`, `val-drawing-overlay.jpg`: filled mesh over the drawing. On the Val, the spat
  sits 10 in high on purpose (spec stance).
- `b17-side.jpg`, `b17-three-quarter.jpg`, `val-side.jpg`, `val-three-quarter.jpg`: before and after with the
  same `--frame-glb` camera.

| | Bytes | Triangles | Draws | Budget |
| --- | --- | --- | --- | --- |
| B-17 | 1,521,240 | 52,080 | 29 | 5,000,000 / 100,000 / 47 |
| Val | 1,413,112 | 48,746 | 19 | 3,000,000 / 60,000 / 47 |

Tests, run on ryzen through `remote-run`:

- `d3aValBlenderGeometry`, `blenderDuplicates`, `aircraftRigs`, `aircraftDimensions`, `stance`,
  `generatedModels`, `combatFit`, `eyePoints` and `render/airframes`: 9 files, 721 tests passed.
- `blenderEntries` plus `kitAircraft`, `kitDetail` and `kitSkin`: 82 passed.

The rewritten Val test and the B-17 three-view test fail on the pre-repair GLBs and pass on the new ones.
That run swapped the old GLBs in and failed on body ordinates, canopy, fin, gear leg, both eyes and the B-17
check.

## Limits

- The Val drawing is a D3A1. Its cowling details, transverse sections, fin and fillet thickness, and B-17
  fuselage superellipse exponents remain ESTIMATES.
- The B-17's drawn span is 5% short of the cited span at the length scale. Spanwise tail and wingtip figures
  use the span calibration.
- The Hangar was not checked in a browser; preview renders are flat Cycles.

## Viewing

Not merged at writing; see the commit log for whether it reached `main`. Once on `main`, both appear in the
Hangar at `ww2airsim.windomlane.org`.
