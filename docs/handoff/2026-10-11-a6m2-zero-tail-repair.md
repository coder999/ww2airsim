# A6M2 Zero aft-fuselage repair handoff (2026-10-11)

> **Superseded 2026-10-11** by [2026-10-11-fleet-remeasure.md](2026-10-11-fleet-remeasure.md): the models were re-measured from their drawings; the measurements and images here no longer describe them.

## Result

`a6m2-zero-blender` keeps its stable Hangar asset id, stance, rig and flight-model fit, but no longer pinches the
fuselage to a narrow strip behind the cockpit. The side and top ordinates were re-read from the real-airplane
reference, the main loft now uses shape-preserving refinement, and the generated GLB was rebuilt.

- Worktree: `/home/mark/projects/ww2airsim-repair-a6m2-zero`
- Branch: `repair-a6m2-zero`
- Base: `repair-aircraft-geometry-foundation` at `de80aa1e`
- Output: 819,108 bytes, 26,038 triangles, 18 draw calls (budget: 3 MB / 60,000 / 47)
- Review: `docs/handoff/2026-10-11-a6m2-zero-tail-repair-shots/` (two JPEGs, 86,693 bytes total)

## What was wrong

The cited `Mitsubishi A6M Zero drawing.svg` was the right source, but the first transcription selected internal
longitudinal and panel lines instead of the outer mold line. Six meters aft of the spinner, the script described the
belly at about +0.25 m relative to the thrust line and the half-width at about 0.18 m. Re-reading the visible exterior
gives about -0.49 m and 0.35 m. The loft therefore lost roughly three quarters of a meter of depth and half its width
before reaching the empennage. A correct side overlay could not reveal that mistake because it had been compared to
the same misidentified line.

## Sources, measurements and estimates

The authoritative drawing remains Wikimedia Commons
[`Mitsubishi A6M Zero drawing.svg`](https://commons.wikimedia.org/wiki/File:Mitsubishi_A6M_Zero_drawing.svg),
Kaboldy's A6M2 orthographic, read 2026-10-11 at 1,920 by 2,325 pixels. Side scale is 0.006686 m/px from spinner
x=25 to tail x=1,380; top scale is 0.006253 m/px from spinner x=25 to tail x=1,474. The repaired script header records
the full table. Representative outer-envelope results are:

| Distance aft of spinner | Fuselage top | Fuselage bottom | Half-width |
| ---: | ---: | ---: | ---: |
| 5.20 m | +0.57 m | -0.54 m | 0.42 m |
| 5.50 m | +0.55 m | -0.52 m | 0.38 m |
| 6.00 m | +0.52 m | -0.49 m | 0.35 m |
| 6.50 m | +0.47 m | -0.45 m | 0.32 m |
| 6.80 m | +0.45 m | -0.41 m | 0.29 m |
| 7.00 m | +0.36 m | -0.39 m | 0.26 m |

The aft-body proportions were sanity-checked against the public-domain 1942 U.S. Navy photograph
[`Mitsubishi A6M2 USA 1942.jpg`](https://commons.wikimedia.org/wiki/File:Mitsubishi_A6M2_USA_1942.jpg), showing the
captured Akutan A6M2 in flight. The restored Model 21 photograph
[`A6M2 Model 21 Zero MfrNo 500- port tail detail.jpg`](https://commons.wikimedia.org/wiki/File:A6M2_Model_21_Zero_MfrNo_500-_port_tail_detail.jpg)
was a secondary three-quarter check of the tailplane/fuselage junction, not a period measurement source.

What remains an estimate is explicit: the drawing hides the fuselage boundary beneath the tailplane near 7.5 m, so
the 0.12 m half-width there is interpolated from the last visible forward boundary and the visible tail cone, then
checked against the photographs. No factory loft ordinates or primary cross-sections were available. The transverse
superellipse and the exact fin-to-body blend therefore remain estimates; the fin root is sunk into the corrected aft
spine so it stays attached while preserving the drawing's overall fin crown.

## Implementation

- Replaced the erroneous aft side and top stations in `a6m2-zero-blender.py` and documented the measured/estimated
  boundary.
- Opted the main fuselage into `fuselage(..., refinement='shape')` and changed the matching surface lookup to
  `kit._refine_shape`, preserving every authored station without Catmull-Rom overshoot.
- Kept the fitted canopy, propeller, gear and control-surface interfaces. The foundation's fitted-canopy update is
  present in the rebuild; no Zero canopy position was copied from the downloaded model.
- Added a regression assertion at the 6.0 m drawing station. It reads the committed GLB and requires the exterior
  belly below -0.40 m and half-width above 0.32 m, so the original wrong-line transcription fails both checks.
- Added the outer-mold-line trap to `docs/blender-aircraft.md`.

## Verification

- Focused Ryzen model checks: `blenderDuplicates.test.ts`, `aircraftDimensions.test.ts`, and `aircraftRigs.test.ts` —
  **3 files, 625 tests passed**. This includes the new aft-envelope assertion, stance, stores, eye point, propeller,
  gear and every control-surface check.
- Nexus-only Blender determinism case: `npx vitest run tests/tools/models/blenderEntries.test.ts -t a6m2-zero-blender`
  — **1 passed**, 44 nonmatching cases skipped; the script rebuild is byte-identical to the committed GLB.
- `git diff --check` passed before the build.
- Visual QA: same-camera side/top before-after render and calibrated side overlay inspected. The repaired outer side
  profile follows the drawing from the canopy rear through the tail cone, and the top view keeps substantial volume
  through the last unobscured fuselage stations. The source overlay is review evidence, not a golden test.

The complete multi-aircraft model/render and Hangar gates are intentionally left to the integration pass after the
six independent repair branches are combined. Nothing from this worktree was pushed or merged.
