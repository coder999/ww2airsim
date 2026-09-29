# DP3 handoff: buildings (2026-09-29)

DP3 is the last plan of the model detail pass. The nine flat-shaded Blender
buildings now carry baked skins and richer, type-appropriate geometry, at the
level of the DP0 hangar. The flat-shaded allowlist in
`tests/tools/models/skins.test.ts` is deleted: every non-generated entry must
be skinned. The design is
[`2026-09-28-model-detail-pass-design.md`](../superpowers/specs/2026-09-28-model-detail-pass-design.md)
and the plan is
[`2026-09-29-dp3-buildings.md`](../superpowers/plans/2026-09-29-dp3-buildings.md).

The work is complete on branch `worktree-dp3-buildings` (forked from `main` at
`2aa28ff`) and is **not merged**. Merging into `main` is Mark's call. Nothing
under `src/sim` changed and no scenario changed. The run was unattended, with
Mark's viewing checkpoint set to the final product only.

## What shipped

- Nine buildings rebuilt with `kit.Model(name, skin=512)`, each with a baked
  atlas, a sidecar JSON and one `TEXCOORD_0`. Overall dimensions, node names
  and placement anchors are unchanged: `aaa` keeps Turret1, and
  `coastal-gun-battery` keeps Turret1 and Turret2 (aaa's entry needed a new
  `keep` list for that, because the skinned join otherwise merges the turret
  away).
- Two new surface rows in `tools/models/skin/surfaces.ts` (earth and timber),
  with sidecar tests.
- Hangar checks 15 and 16 cover all nine (check 16's id list gained them; check
  15's baselines are in `tests/e2e/fixtures/flat-luminance.json`, measured on
  the reference GPU by the DP1 method before any rebuild).
- The allowlist and its ceiling are gone. The tests that remain require every
  non-generated entry to have a textured glb, and every Blender entry to say
  `"skin": true`.

## Per-building numbers

Read from the committed glbs (`npx tsx` measurement script, 2026-09-29). The
budget for a building is 500,000 bytes, 5,000 triangles and 4 draws; the ratio
is the lit luminance of the skinned model over its flat predecessor, from
Hangar check 15 on the reference GPU (band 0.6x to 1.5x).

| Building | Bytes | Triangles | Draws | Check 15 ratio | Flat baseline luminance | What was added |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| aaa | 96,452 | 592 | 2 | 0.980x | 0.12199 | anti-aircraft battery: base plate, shield, recoil jackets, sight and seat, steps, duckboards, net posts; Turret1 kept |
| ammunition-bunker | 37,528 | 276 | 1 | 1.010x | 0.15836 | earth mound, headwall and wing caps, apron, strapped door leaves, vent stacks, lightning rod |
| barracks-and-huts | 238,244 | 2,848 | 1 | 1.017x | 0.10994 | corner boards, window frames and shutters, door frames and steps, footing blocks, hut stove pipes |
| coastal-gun-battery | 123,144 | 992 | 3 | 0.968x | 0.14638 | breech housings, barrel jackets, hand-wheels, ready lockers, walkway, magazine portal; Turret1 and Turret2 kept |
| fuel-tank-farm | 302,480 | 3,860 | 1 | 0.991x | 0.11922 | weld bands, wind girders, roof manways and vents, ladders, pipe sleepers, flanges, valves, soot stain |
| pier-and-warehouses | 131,752 | 1,588 | 1 | 1.013x | 0.11852 | stringers, fender piles, bollards, rail tracks, warehouse plinths, door frames and tracks, corner boards |
| radio-radar-station | 152,600 | 1,472 | 1 | 0.972x | 0.09144 | mast plinth, guy wires and anchors, array frame, hut windows, roof air unit, generator and drums |
| revetment | 195,964 | 2,568 | 1 | 0.967x | 0.16765 | sandbag crest, wheel stop, tie-down pads, apron lip |
| tower | 120,000 | 1,188 | 1 | 1.013x | 0.07863 | leg plinths, girts, deck rails, glazed cab with muntins, door, roof rim, mast cross-arm, stair handrail |

Every glb rebuilt byte-identically when built twice in a row.

## Captures

Reference GPU (RX 6700 XT, Playwright over ryzen), the Hangar, 2026-09-29. The
close-up is a tighter crop of the same view. I looked at the three-quarter
view of every building, and the close-ups of the fuel tank farm, the pier, and
the radio station (where I found and fixed glazing that had been sunk inside
the hut wall). I did not individually inspect every side and top image.

| Building | Three-quarter | Side | Top | Close-up |
| --- | --- | --- | --- | --- |
| aaa | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/aaa-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/aaa-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/aaa-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/aaa-close.png) |
| ammunition-bunker | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/ammunition-bunker-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/ammunition-bunker-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/ammunition-bunker-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/ammunition-bunker-close.png) |
| barracks-and-huts | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/barracks-and-huts-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/barracks-and-huts-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/barracks-and-huts-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/barracks-and-huts-close.png) |
| coastal-gun-battery | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/coastal-gun-battery-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/coastal-gun-battery-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/coastal-gun-battery-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/coastal-gun-battery-close.png) |
| fuel-tank-farm | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/fuel-tank-farm-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/fuel-tank-farm-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/fuel-tank-farm-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/fuel-tank-farm-close.png) |
| pier-and-warehouses | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/pier-and-warehouses-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/pier-and-warehouses-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/pier-and-warehouses-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/pier-and-warehouses-close.png) |
| radio-radar-station | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/radio-radar-station-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/radio-radar-station-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/radio-radar-station-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/radio-radar-station-close.png) |
| revetment | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/revetment-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/revetment-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/revetment-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/revetment-close.png) |
| tower | [three-quarter](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/tower-three-quarter.png) | [side](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/tower-side.png) | [top](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/tower-top.png) | [close-up](https://github.com/Coder999/ww2airsim/blob/worktree-dp3-buildings/docs/handoff/2026-09-29-dp3-shots/tower-close.png) |

## CITED versus ESTIMATE

Nothing here is CITED. No period drawing or survey was fetched and read for any
building, so every added dimension is an ESTIMATE, labeled as such in each
script's header with the date read (2026-09-29). Colors come from
`MARKING_COLORS` in `tools/models/skin/colors.ts` (all ESTIMATE). Earth reads
smooth from a distance because the concrete scan stands in for it: accepted
and labeled ESTIMATE.

## Verified and not run

Verified 2026-09-29:

- `buildingModels.test.ts` and `skins.test.ts`: 128 tests pass on nexus with
  `--maxWorkers=1`.
- Hangar Tier 2 checks 8, 10, 15 and 16 pass on the reference GPU
  (`PW_REMOTE`, my own vite on nexus tunneled to ryzen), 4 of 4.
- `remote-run` full verify: typecheck, depcruise and lint pass. `npm test`
  finished 4,035 passed and 5 failed, all explained: `tests/sim/soak.test.ts`
  (2 tests) fails on clean `main` and is unrelated; `boundary.test.ts`,
  `skyLoad.test.ts` and `ai/determinism.test.ts` are load timeouts under the
  shared ryzen run, and all three pass when run alone on nexus (34 of 34).
  That full run predates the last commit (the radar station's glazing fix,
  one glb); the glb's tests and check 15 were re-run after it.

Not run: the game's own in-flight rendering of these buildings (the game
draws its airfield from procedural boxes, below); any frame-time measurement;
the 4K budget spec.

## Open items

- **Decision for Mark, not done:** the roster spec's section 6.3 follow-on. The
  in-game procedural airfield boxes (`src/render/scene/airfield.ts`) now look
  cruder than the Library models beside them. That is the design spec's open
  question 4. Swapping the game over to these models is a separate decision.
- The branch is pushed but not merged; the merge and any deploy are Mark's.
- One commit (tower and radar; barracks and pier) covers each pair, because
  the pinned texture count in `buildingModels.test.ts` was shared. One commit
  went in with 12 red tests (a chained `;`) and was fixed in the next; the
  ledger records it.
