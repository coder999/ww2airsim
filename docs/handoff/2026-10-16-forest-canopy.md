# Forest canopy rework: handoff (plan `2026-10-16-forest-canopy-rework`)

Branch `plan-forest-canopy`, worktree `~/projects/ww2airsim-plan-forest-canopy`. Phase 1 (Tasks 1 to 6) in progress; the default
stays `forestCanopy=current` until Mark rules.

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

## Decisions I made
