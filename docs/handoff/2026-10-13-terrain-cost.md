# Terrain checkpoint feedback and tree cost — 2026-10-13

Mark perceived no improvement in the mountain-lighting comparison. The
experiment is shelved: DEV defaults to baseline lighting, with no experimental
map fetches or texture reads. `terrainLighting=on` remains an explicit DEV-only
reproduction path in this isolated worktree. No merge or deployment.

## Measurements

RX 6700 XT, 2560×1440, High, 100% render scale, noon, clouds off, frozen scene.
An exclusive `ryzen-budget` lock excluded remote-run jobs. Windows GPU counters
showed no unrelated active 3D engine before the run and one during the run;
background video-codec activity remained. These are controlled GPU timestamps,
not the screenshot overlay. Each state has three three-second samples, with
tree order alternating. Shader order is reversed in the ridge view.

Median of the three sample medians, baseline terrain lighting:

| View (altitude MSL) | Trees drawn | Trees hidden | Difference |
| --- | ---: | ---: | ---: |
| Low, 1,000 ft | 3.492 ms | 2.900 ms | 0.592 ms |
| Ridge, 6,000 ft | 3.365 ms | 3.263 ms | 0.102 ms |
| High, 13,000 ft | 3.407 ms | 2.956 ms | 0.451 ms |

The ridge's no-tree medians vary from 3.067 to 3.287 ms, so its difference is
only an approximate 0.08–0.30 ms. Do not generalize its single median to all
mountain views. The low-view difference is stable at approximately 0.59 ms,
about 17% of the total with trees. The high view submits 19,165 tree instances
even though altitude puts all of them beyond the visibility distance; hiding
their draws saves approximately 0.45 ms. CPU placement is unchanged by this
comparison switch and is not measured here.

With trees drawn, experimental lighting adds 0.116 ms in the low view and
0.147 ms at the ridge. With trees hidden, the low/high differences are 0.111
and 0.105 ms. The high view with lighting and trees enabled was less stable
(3.289–3.555 ms), so it is not a sound source for a precise lighting delta.
The rejected maps also require 17,860,625 decoded bytes and 4,196,248 download
bytes plus metadata when explicitly enabled.

Raw records and six full-size tree comparisons are in
[`2026-10-13-terrain-cost-shots/`](2026-10-13-terrain-cost-shots/).
Reproduce with `hwlock ryzen-budget env E2E_BUDGET_RUN=1 E2E_CAPTURE=1
E2E_CAPTURE_DIR=docs/handoff/2026-10-13-terrain-cost-shots
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org
npx playwright test tests/e2e/terrainCostCapture.spec.ts` (one shell line).

## What the tree boundary is

High drops trees beyond about 1.15 miles from the eye; Medium drops them beyond
0.75 miles. The transition removes whole trees over a band approximately
1,476 ft wide. Distant terrain has no matching representation of the crowns.
Tree draws also lack automatic frustum culling. The dissolve seed comes from
the packed instance index, which can change when the resident cells shift;
that can change which trees survive the fade while flying. Increasing draw
radius alone would increase cost and merely move the mismatch farther away.

## Noon direction

The inspected low view shows a strong repeated surface pattern, angular crowns
and exposed trunks without dark contact areas. High sunlight reduces broad
mountain contrast, exposing these problems. A stronger candidate is a continuous
canopy surface: irregular crowns, dark enclosed gaps, matching normal detail,
and variation at several landscape scales. It should retain forest structure
past the nearby mesh cutoff. Replace existing forest detail first, then compare
whether close meshes add enough to justify their measured cost. This remains
proposed work for checkpoint 2, not a visual improvement claimed by this report.

## Verification and scope

Typecheck, focused lint and all 24 scenery unit tests passed for the comparison
diagnostics. All three locked GPU measurement views passed. A focused browser
check covers the new default-off path, absence of lighting-map requests and
trees-only switching. The existing explicit lighting modes and fallback are
retained. No tree rendering or terrain color change ships here.

**Tests updated:** default-off and tree visibility wiring added to
`terrainTextures.spec.ts`; opt-in measurement enrollment in
`terrainCostCapture.spec.ts`. The vegetation diagnostic now exposes submitted
instances and group visibility.

**Tests still valid:** scenery placement/tier coverage, explicit terrain
lighting modes and map fallback, terrain collision and material blending.

**Known gaps:** moving-flight tree-boundary capture; CPU tree cost; GPU cost
across other resolutions, devices and cloud conditions; accepted noon canopy
replacement. The invisible high-altitude tree work is measured, not yet fixed.
