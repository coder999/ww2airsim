# Forest canopy rework: handoff (plan `2026-10-16-forest-canopy-rework`)

Branch `plan-forest-canopy` (pushed, **not merged**: the relief code lives only there); worktree `~/projects/ww2airsim-plan-forest-canopy`.

**Status (2026-10-16): paused by Mark after checkpoint 1.** The investigation found where the cost is not, and did not find a
way to save GPU time; Mark judged the return too low to continue (2026-10-16). What is on `main` from this plan is this
handoff and its data only. The relief material, stand model, canopy height bake and the capture and statistics tools are on the
branch; nothing there is default or shipped. **The nightly's budget phase now runs with Trees saved as Off**
(`E2E_TREES=off`, `playwright.config.ts`; nightly script in `serverconfig`) so the budget specs measure everything but the
forest while the forest cost is unexplained. The correctness phase keeps Trees On.

**What is known (measured, fresh dev server, 6 interleaved loads, ryzen RDP route):** trees off is fast (runway 4.6 / 5.3 ms
p50 / p95), trees on is slow and intermittent (9.5 / 14.4); the near trees add 0 to 0.4 ms of GPU p50 (plus 1 to 3 ms of main-thread
work); the individual distant crowns and the canopy ground blend alone are within noise; removing five sixths of the coarse
cards changed nothing; half render scale roughly halves the cost, so it is pixel-bound; the machine drifted (the forest was almost
free in the first sweeps and slow in 12 of 12 loads after about 19:00). **Untested hypothesis:** the tree shaders' pixel-dissolve
fade discards pixels, which can disable early depth rejection for everything drawn behind them; a per-pass GPU capture or an A/B of
the fade and an alpha-to-coverage or prepass variant would settle it. Also: the plan said the near trees end at about 0.75 mi, but
the accepted soft fade ends them at `TREE_FADE_END_M` = 1,850 m (1.15 mi).

## Task 1: attribution (measured 2026-10-16)

**Verdict: the cost is not the near trees.** Proceeding to Tasks 2 to 6 (the plan's stop condition did not trigger).

Method: `tests/e2e/forestAttribution.spec.ts` (capture tool, `npm run capture:e2e -- forestAttribution.spec.ts` under
`hwlock ryzen-budget`). RX 6700 XT, 1440p, High, `cloudTier=high`, `oceanTier=high`, ryzen RDP-session Chrome (about 32 Hz
frame pacing, `docs/testing.md`), a FRESH vite on slot 3 per set, 6 INTERLEAVED page loads per arm per view (arm order rotated each
round), 4 s settle after streaming and canopy are ready, one 5 s GPU window per load; the table is the median of the 6 loads.
Arms are cumulative query switches, no renderer change: `base` = `trees=off&forestDistance=off&distantTrees=off`; `near-whole` =
near trees, original whole-instance fade; `near-soft` = near trees, accepted soft fade (second transparent pair);
`plus-crowns` = + individual distant crowns; `full` = + coarse groups + the canopy ground blend (= what ships);
`canopy-only` = `full` with `trees=off` (ground blend alone). `runway` and `photo` are the live budget views (parked, not paused);
`low-land-600`, `ridge-6000ft` and `high-6000` are frozen with `sceneryView=1&launch=1&look=0,-10` (chase camera, so they are
NOT the same pictures as the budget views). Raw rows: `2026-10-16-forest-canopy-cost/attribution/`.

GPU p50 / p95 in ms (median of 6 loads), then main-thread frame work p50, draw calls, triangles (M):

| View | arm | GPU p50 | GPU p95 | CPU p50 | draws | tris |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| runway | base | 4.80 | 4.99 | 4.7 | 140 | 2.84 |
| runway | near-soft | 5.00 | 5.22 | 4.9 | 144 | 2.96 |
| runway | plus-crowns | 4.77 | 5.11 | 6.2 | 145 | 3.15 |
| runway | full | 7.92 | 10.09 | 7.7 | 146 | 3.37 |
| runway | canopy-only | 4.74 | 4.95 | 4.9 | 140 | 2.84 |
| photo | base | 4.52 | 6.39 | 4.2 | 96 | 2.82 |
| photo | near-soft | 4.67 | 8.63 | 6.2 | 100 | 2.93 |
| photo | plus-crowns | 4.60 | 7.73 | 8.2 | 101 | 3.13 |
| photo | full | 5.02 | 14.47 | 12.3 | 102 | 3.35 |
| photo | canopy-only | 4.24 | 4.33 | 4.4 | 96 | 2.82 |
| ridge-6000ft (frozen) | base | 7.38 | 7.90 | 5.2 | 239 | 2.96 |
| ridge-6000ft | near-soft | 7.84 | 8.51 | 8.0 | 243 | 5.51 |
| ridge-6000ft | plus-crowns | 7.97 | 8.55 | 10.8 | 244 | 5.71 |
| ridge-6000ft | full | 8.18 | 8.77 | 13.4 | 245 | 5.93 |
| ridge-6000ft | canopy-only | 7.50 | 8.05 | 5.5 | 239 | 2.96 |
| low-land-600 (frozen) | base / full | 4.82 / 4.91 | 5.08 / 5.23 | 4.4 / 7.0 | 142 / 144 | 2.89 / 3.30 |
| high-6000 (frozen) | base / full | 5.21 / 5.29 | 5.59 / 5.72 | 3.9 / 7.4 | 116 / 117 | 2.74 / 2.96 |

What it says:

- **Near trees:** +0.0 to +0.4 ms GPU p50 (runway 4.80 to 5.00, ridge 7.38 to 7.84), and 0 at low-land-600 and high-6000 where no near tree is
  in range. They do cost main-thread time (+0.2 to +3 ms) and 2 to 3 draws.
- **Individual crowns:** within noise on the GPU (+0.1 to +0.3 ms at the ridge), +1 to +3 ms of main-thread frame work.
- **Canopy ground blend alone** (`canopy-only` vs `base`): no GPU cost (runway 4.74 vs 4.80, photo 4.24 vs 4.52, ridge +0.12).
- **Coarse groups + canopy (`full` vs `plus-crowns`):** the layer that moves. Steady GPU cost is small (ridge +0.2 ms p50), but
  it adds 1.5 to 4 ms of main-thread work, 0.22 M triangles, and it is where the **slow mode** appears: in `full`, 5 of 12 runway and
  photo loads had a window whose p50 was 10.7 to 13.4 ms (not just a p95 tail); in the 48 loads of every other arm none did (their worst
  p50 was 6.8 ms).
- **Within one page load** (forest hidden and shown alternately with `setTreesVisible`, 3 s windows, 8 loads per view, `full` arm;
  `forestAttribution.spec.ts`, `FOREST_TOGGLE=1`): the steady difference is 0.15 to 0.4 ms p50 (runway 4.38 on vs 4.20 off, photo
  4.68 vs 4.54), slow windows (p50 above 8 ms) were 1 of 24 on vs 0 of 24 off at the runway and **9 of 24 on vs 2 of 24 off at photo**.
  A slow window also appeared once with the forest hidden, so slow mode is a machine state that the forest makes much likelier,
  not a per-frame forest cost.

So the 8 ms in the budget gates is mostly this slow mode, tied to the far layers (coarse groups plus the canopy blend with trees
present), not the near trees (D5 protects them and they are not the carrier). The mechanism of the slow mode is NOT established:
the data show a strong association, not a cause. If Task 5 (retiring interior cards) removes the slow windows, that is the confirmation;
Task 9 re-measures with the same tool.

Caveats: the frozen views use a chase camera and show a different (smaller) forest cost than the live budget views; RDP pacing is
about 32 Hz (about 40 Hz measured here), so frame-time absolutes are comparable only within this run; low-land-600 and
the first loads of that file were affected by a low sample count (3 to 16 Hz windows) that the tool retries.

### Plan numbers checked against the repo (2026-10-16)

- D4 and the plan header say the near trees end "about 0.75 mi". In the repo the accepted soft fade runs 1,400 to 1,850 m
  (0.87 to 1.15 mi) on High: `TREE_FADE_END_M = 1850` (`src/render/scene/tiers.ts`), band `TREE_FADE_BAND_M = 450`. 0.75 mi is the
  `treeFade=pixel` comparison mode. **Decision I made:** "right where the near trees end" means `TREE_FADE_END_M` (1,850 m), so
  the near trees stay bit-identical (D5).
- The plan's "distance-forest merge costs about 8 ms of GPU p95" holds for the live views' p95 as measured on main, but the steady
  per-frame cost is 0.2 to 0.5 ms; see the slow-mode finding above.

## Tasks 2 to 6: what was built (phase 1, 2026-10-16)

`?forestCanopy=current|relief` (DEV only, `src/render/scene/forestCanopy.ts`); `current` is the default and production always runs it.
`__ww2.forestCanopy()` reports `{ mode, reliefReady, reliefError }`; `__ww2.vegetation().canopyMode` repeats the mode. `forestDistance=off`
turns relief off (it needs the canopy blend). `clumps` is not parsed yet (Task 7, only if Mark rejects relief).

- **Task 2, stand model** (`src/render/scene/standModel.ts`, pure; `treeSites(..., stand)` and `standEdgeSites` in `vegetation.ts`). A tree is an
  EDGE tree when any of 8 probes 30 m (about 100 ft, 3 rows) away is not stand (land cover tree plus mangrove below 0.5, below the shore line, in an
  airfield clearing, near a hut or a river); otherwise it is INTERIOR, and 1 in 20 interior trees (hash of cell and candidate index, so the same
  tree every load) is an EMERGENT, drawn 1.35 times taller and 1.15 times broader. Tests: `tests/render/standModel.test.ts` (band width exact on a
  straight boundary, clearing on every side, emergent fraction 4 to 6 percent and repeatable, same trees and places with and without roles, interior at
  least a band from open land on the real Leyte field, near layer instance count identical in both modes, far layers thinned below 60 percent).
  Shown to fail: with one probe and no emergents three of the eight tests fail.
- **Task 3, height channel** (`tools/terrain/canopy.ts` `bakeCanopyHeight`, `content/canopy/height.bin.gz`, R8 1024 square, 4 to 28 m, 0.64 MB
  download). `material.bin.gz` is byte-identical after the refactor (asserted against the committed file). Provenance rows: `ASSETS.md`,
  `content/canopy/NOTICE.md`. Tests in `tests/tools/canopy.test.ts` (height agrees with the packed slope channels; committed files equal a fresh bake;
  shown to fail by inverting the height byte).
- **Task 4, relief material** (`src/render/terrain/canopy.ts`, `surface.ts`, `mesh.ts`). Chosen: one-step parallax (the crown the eye sees is shifted
  toward the eye by its height over the pivot, clamped at 4 times at grazing angles) and ONE sun-direction crown-shadow tap 7 m toward the sun, which
  scales only the direct sun term; three extra mipmapped R8 reads, no `If` or `Loop` (D3D12 rule). Both fade out over 3,000 to 9,000 m. The surface
  takes over from the near trees over 1,400 to 2,400 m (the flat canopy starts at 2,400 m). Relief-only palette (darker, tone stretched 1.5 times about
  0.42) because the first captures read as a pale meadow. Falls back to the flat material until the height texture loads or if it is invalid
  (`tests/render/canopyRelief.test.ts`; shown to fail by forcing the flat path). A displaced mesh was NOT built or measured.
- **Task 5, interiors retired**: under `relief` the individual crown layer and the coarse groups draw only edge trees and emergents.
  **The GPU still submits the full slot capacity of both layers** (111,328 and 96,140 instances); only the populated count fell (coarse 43,491 to 8,451,
  crowns 7,355 to 5,143 at the runway view). See the cost finding below: that did not help.
- **Task 8, look tool** (pulled forward because Task 6 needs its table): `tools/terrain/forestLook.ts` (mean luminance, canopy coverage, edge count,
  canopy outline length, mean absolute difference, tolerances reported not asserted), `tests/tools/forestLook.test.ts` on synthetic pictures (shown to
  fail with the canopy classifier disabled), `tests/e2e/forestCanopyCapture.spec.ts` (capture tool: any two query strings, frozen views, overlays
  hidden, writes the PNGs, `look.json` and `look.md`).

## Checkpoint 1: matched captures (2026-10-16)

Captures: `2026-10-16-forest-canopy-shots/<view>-current.jpg` and `-relief.jpg` (1600 by 900 from 2560 by 1440 PNGs), same frozen camera, noon,
chase camera so the Corsair is in frame, overlays hidden. Statistics (`look.md`; tolerances are mine, set before looking, report only):

| View | Luminance A \| B | Canopy A \| B | Edges A \| B | Outline A \| B | Mean abs diff | Outside tolerance |
| --- | --- | --- | --- | --- | --- | --- |
| runway-low | 0.425 \| 0.425 (0.0%) | 0.8% \| 0.7% | 37351 \| 36038 (-3.5%) | 12854 \| 12141 (-5.5%) | 0.1% | none |
| ridge-6000ft | 0.442 \| 0.434 (-1.8%) | 37.3% \| 31.7% | 280042 \| 58837 (-79.0%) | 181514 \| 138489 (-23.7%) | 2.5% | canopyCoverage, edgeCount |
| inland-6000ft | 0.445 \| 0.440 (-1.2%) | 42.1% \| 40.3% | 324356 \| 84526 (-73.9%) | 229245 \| 169073 (-26.2%) | 2.5% | edgeCount, silhouetteCount |
| ridge-side-6000ft | 0.459 \| 0.448 (-2.4%) | 38.2% \| 34.0% | 205673 \| 66069 (-67.9%) | 210922 \| 153285 (-27.3%) | 1.9% | edgeCount, silhouetteCount |
| forward-1500ft | 0.418 \| 0.418 (0.0%) | 58.5% \| 58.1% | 348004 \| 343814 (-1.2%) | 119835 \| 117363 (-2.1%) | 0.2% | none |
| side-1000ft | 0.432 \| 0.431 (-0.3%) | 50.2% \| 49.2% | 291497 \| 254840 (-12.6%) | 165247 \| 157612 (-4.6%) | 0.5% | none |
| grazing-250ft | 0.347 \| 0.348 (0.0%) | 41.9% \| 41.9% | 137729 \| 137371 (-0.3%) | 55658 \| 55390 (-0.5%) | 0.0% | none |
| photo | 0.689 \| 0.689 (-0.0%) | 1.1% \| 1.1% | 33527 \| 33762 (0.7%) | 8667 \| 8155 (-5.9%) | 0.0% | none |
| under-cloud | 0.560 \| 0.559 (-0.2%) | 12.0% \| 9.2% | 114811 \| 50274 (-56.2%) | 84806 \| 50262 (-40.7%) | 0.9% | edgeCount, silhouetteCount |

Reading it: inside the near-tree range (runway, forward, side, grazing, photo) nothing moves, which is the D5 promise. Past about 1.2 miles the
canopy looks darker-matched (luminance within 3 percent) but loses most crown-edge contrast (edge counts down 56 to 79 percent): the stand is a
continuous mottled surface with sparse emergents instead of thousands of crown silhouettes. That is the look trade, for Mark's eye.

## Cost finding at checkpoint 1: removing interior cards did NOT move GPU time (read this before the look)

Same tool as Task 1, fresh vite, 6 interleaved loads per arm (`probes/rel2/`), `current` (`full`) vs `relief`, GPU p50 \| p95 ms:

| View | base (trees off) | current | relief |
| --- | --- | --- | --- |
| runway | 4.56 \| 5.34 | 9.47 \| 14.44 | 10.69 \| 14.85 |
| photo | 4.65 \| 5.86 | 12.41 \| 14.50 | 12.26 \| 14.45 |
| ridge-6000ft (frozen) | 7.49 \| 7.92 | 9.45 \| 17.89 | 9.67 \| 18.14 |

Relief populates 5 times fewer far cards (coarse 43,491 to 8,451) and costs the same. Probes (`probes/cap1`, `cap2`, `cap3`, 3 to 4 loads per arm, a
temporary `groveCap` query that set the coarse layer's instance count, since removed): drawing ZERO coarse instances (`cap0`) left the cost
unchanged (runway p50 7.2 vs 7.2, photo 12.6 vs 12.5); near trees plus the canopy terrain without any far layer (`near-canopy`) was already slow (photo
6.6 p50 \| 12.9 p95); rendering at 0.5 scale roughly halved it (so it is pixel-bound, not vertex- or CPU-bound).
The cost is therefore not the far-card population, and not the coarse draw. Hours apart the same arms read very differently on this machine: the
first sweep this afternoon had `full` within about 1 ms of base at the ridge and mostly fast loads at the runway, the sweeps from 19:00 had `full` slow in
12 of 12 loads, and in the last probe even `near-whole` with no canopy had a p95 of 11 ms (photo; first sweep 8.5). `base` never moved. So the slow mode
is workload-dependent and drifts, and the data here do NOT locate it. The next step is a per-pass GPU capture (or toggling the near trees and the canopy
terrain independently inside one load), not more card removal. Task 9 should not assume relief recovers the 8 ms.

## Decisions I made

- Near range = `TREE_FADE_END_M` (1,850 m, 1.15 mi), not the plan's "0.75 mi" (that is the `treeFade=pixel` comparison). D4 and D5 read "right where the near trees end".
- Probes use land cover, shore, clearing, hut and river but not slope (a slope test is five height reads per probe). The stand threshold is 0.5 tree plus mangrove.
- Parallax plus one shadow tap instead of a displaced mesh (cheapest of the two the plan allows; not measured against the mesh).
- A separate R8 height texture rather than repacking the RGBA material, so `material.bin.gz` and the current look stay byte-identical.
- Relief-only palette and tone gain after the first captures looked like a meadow; the flat canopy is untouched.
- Task 8 (look tool) built in phase 1 because the Task 6 table needs it; Tasks 7, 9, 10 and 11 not started.
- Frozen views use the chase camera (`sceneryView`), so the Corsair is in frame; the budget `runway` and `photo` views were frozen for the captures (parked, paused, `launch=1`) so clouds do not differ between the two settings.
- Preliminary relief A/B above was taken on a dev server that had been through HMR edits once (the `rel2` set was on a fresh server; the probes after it were not).
