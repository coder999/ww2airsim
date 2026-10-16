# Forest rework: canopy relief for stand interiors, individual trees at the edges

Written 2026-10-16 from a grilling session with Mark (AskUserQuestion). Master-plan Track L (terrain) / H (rendering budget); size **M**.
Motivation: the distance-forest merge `e6b2476f` (2026-10-13) costs about 8 ms of GPU p95 at 1440p High in the solo views;
see [`docs/handoff/2026-10-16-budget-reevaluation.md`](../../handoff/2026-10-16-budget-reevaluation.md) for the evidence. Mark accepted
the longer forest knowingly (the long-forest handoff said 7 of 48 windows were over 8.33 ms); this plan buys the cost back without
losing the look.

## Header

- **Branch:** `plan-forest-canopy`, worktree `/home/mark/projects/ww2airsim-plan-forest-canopy`.
- **Order (Mark, 2026-10-16):** runs **in parallel with F5C** (different files: terrain and rendering here, shell, sim and campaign there).
  Ryzen measurement stays under `hwlock ryzen-budget`, so the two plans' test runs do not collide.
- **Viewing checkpoints (Mark, 2026-10-16): two, attended.** (1) After the prototype (Task 6): matched before/after captures from the
  same views, with the live toggle on a windomlane dev slot. **Stop and wait for his look before any default changes.** (2) Final
  (Task 10), with the measurements. His viewing is never a test gate.
- **Run mode:** attended at both checkpoints.
- **Heavy jobs** through `REMOTE_RUN_OVERFLOW=0 remote-run` on ryzen. No `pkill -f`, no `rm -rf`.
- **Budget:** the goal is to recover most of the ~8 ms and keep the look. The gate numbers (8.33 ms) are a result, not the target; the
  gates stay as they are and are not tuned to (Mark, 2026-10-16).

## Decisions (Mark, 2026-10-16)

| # | Decision |
| --- | --- |
| D1 | **Stand interiors become a continuous canopy relief surface.** The interior of each forest stand beyond the protected near range is drawn as part of the terrain shading: the existing canopy texture gets height-based relief and per-crown shadowing. No per-tree draws for interiors. |
| D2 | **Individual trees stay at stand edges.** An edge band of about 3 tree rows (~100 ft) along tree lines, clearings, shorelines and field edges stays individual, so outlines and gaps stay crisp. |
| D3 | **Sparse emergents.** About 1 in 20 interior trees stays an individual taller crown, chosen deterministically (seeded, not random per load), so the canopy has silhouettes and texture seen from the side. |
| D4 | **Start range:** right where the near trees end (about 0.75 mi). Within it, nothing changes. |
| D5 | **Protected:** the near detailed trees under and ahead of the plane (accepted 3-lobe look, pixel-dissolve fade and cloud-shadow match, within about 0.75 mi). Everything else may change, but the Trees On/Off row, its saved key `ww2airsim.trees.v1`, Scenery Low hiding trees, and the cloud-shadow response must keep working. |
| D6 | **Fallback:** a **clump-mesh** variant (merged instanced clumps of about 8-20 crowns, 2-3 levels of detail) is built behind the same URL switch, default off, and flipped on only if Mark rejects the relief surface. |
| D7 | **Nothing becomes the default without Mark's yes.** The switch ships as `?forestCanopy=current\|relief\|clumps`, default `current`, until he rules. |
| D8 | **Look test:** matched frozen-view captures, old versus new, with image-difference statistics (mean luminance, silhouette and edge counts, canopy coverage) reported with tolerances and any view outside tolerance listed for review. **Reported, not a pass/fail gate.** |

## What exists (read 2026-10-16, verify before relying)

- Layers today (`docs/terrain.md`): near detailed trees; individual distant crown stand-ins (cards, fade in about 1.5-2.6 mi, out 5-11.2 mi
  on High); coarse groups (16 cells combined, 14 candidates each, one two-triangle card three times a crown radius); and the canopy
  material (blends onto forest and mangrove by camera distance over about 1.5-7.5 mi, mipmapped, one packed sample).
- Files: `src/render/scene/vegetation.ts`, `treeCells.ts`, `treeFade.ts`; `src/render/terrain/canopy.ts`, `surface.ts`, `mesh.ts`,
  `occlusion.ts`; bakes in `tools/terrain/bakeCanopy.ts` and `tools/terrain/canopy.ts`. Controls: `?trees=off`, `?distantTrees=`,
  `?forestDistance=`, `?treeFade=`, `?canopy=`.
- 2026-10-16 measurement on `main`: `runway` p95 4.3-4.9 ms before the merge, 11.7-15.1 ms after, 4.5-5.3 ms with `?trees=off`; in
  battles trees add only 1-2 ms. A first look at single-layer toggles was inconclusive (3-6 ms swings between loads), which is why Task 1 exists.

## Tasks

Each new test is shown to fail without its change. Budget numbers use a fresh dev server per measurement and `BUDGET_PARAMS` for A/B.

1. **Attribution, no code changes to the renderer.** Per-layer cost on a frozen scene (paused, same camera), at least 6 interleaved loads
   per layer: near trees only; plus distant crowns; plus coarse groups; plus the canopy blend; plus the fade; at runway, low-land-600,
   ridge, 6,000 ft and photo. Also the CPU side (cell streaming slices, draw calls, triangles). Output: a table in the handoff that says
   which layer carries the cost. **If the cost is mostly the near trees, stop and report to Mark before building anything** (D5 protects them).
2. **Stand model (pure, tested).** From the land-cover mask and tree placement rules: which cells are interior, which are the 3-row edge
   band, and which interior placements are emergents (1 in 20, seeded from the cell id). Tests: determinism, band width, emergent
   fraction, clearings and water and slope exclusions unchanged, no tree dropped from the near range.
3. **Canopy height channel and bake.** Extend the canopy bake with a height channel (crown relief) next to the existing packed sample;
   `ASSETS.md` provenance row and the cited-facts/ESTIMATE labels, `tests/tools/models/outputs.test.ts` and `modelCredits` pass.
4. **Relief material.** The canopy surface in `terrain/canopy.ts` and `surface.ts` gains height-based relief and per-crown shadowing
   (parallax or a coarse displaced mesh, chosen on measured cost), still mipmapped, still cloud-shadowed, starting at the near range
   with the existing pixel-dissolve handover (D4). Hoist shared nodes out of `If`/`Loop` (D3D12 rule in `docs/night.md`).
5. **Retire interior cards.** The distant crown and coarse group layers keep only edge-band trees and emergents (D2, D3);
   `treeCells.ts` and `vegetation.ts` consume the stand model. `?forestCanopy=relief` selects it; `current` is the default.
6. **Checkpoint 1 (attended).** Matched before/after captures (runway low, ridge, 6,000 ft, photo, under cloud, forward flight, from the
   side and at grazing angles), the live toggle on a free windomlane dev slot, and the image-difference table (D8); email Mark and
   **wait for his look**. If he rejects the relief surface, go to Task 7; otherwise skip it.
7. **Fallback: clump meshes (D6, only if rejected).** Merged instanced clumps with LOD behind `?forestCanopy=clumps`; same captures.
8. **Look-comparison tool.** An enrolled capture program that renders the frozen views for any two settings and prints the D8 statistics;
   tests for its statistics on synthetic images.
9. **Measurement.** Per-view GPU p95, old versus new, at least 6 interleaved loads each, on a fresh dev server, under
   `hwlock ryzen-budget`; the entity-scaling `30x0` and `30x10` points with the new path; CPU cost of cell streaming; draw calls and
   triangles. The budget gates stay as they are.
10. **Checkpoint 2 (attended) and test reconciliation.** Name every changed contract (the tree layers' counts and fade ranges, the
    `__ww2` diagnostics `vegetation`, `canopy`, `distantTrees`, the `forestDistance` and `canopy` params), search the tests for the
    old labels and counts, and update them in the same work; run the affected specs, not just unit tests (trees settings E2E,
    cloud-shadow, terrain, scenery, `distantTrees`, `treeFade`). Record `Tests updated`, `Tests still valid`, `Known gaps`.
11. **Docs and closeout.** `docs/terrain.md`, handoff with the captures and numbers, `MASTER_PLAN.md`, then `/closeout`. The default flips
    only on Mark's yes, and then as a one-line change with its own commit.

## Acceptance

With `?forestCanopy=relief`, the matched views show forests that Mark accepts, the solo views cost close to their pre-forest numbers
(target: within about 1-2 ms of `?trees=off` plus the near trees' own cost), the near trees are bit-identical, and the Trees row, Low
scenery and cloud shadows behave exactly as before. Tests and gate are green as on `main`.

## Not in this plan

- The near-tree look, the Trees setting, ship wakes and spray (`night-bay`), the 8.33 ms bar itself, and entity cost.
