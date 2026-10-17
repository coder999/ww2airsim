# F8A Task 0: four new models, ready for Hangar review

**Date:** 2026-10-16  
**Branch:** `f8a-new-models` (cut from `main` 5b679667+; not merged, nothing deployed)  
**Attendance:** unattended build; the Hangar view below is Mark's checkpoint. No site file uses these models until he approves.

## What was built

All four are original Blender builds from the documented form (no Wikipedia or photo imagery), registered as kind `building`.
Facing: length along z, front toward +z like the hangar and barracks (the pier and ramp run to +x like `pier-and-warehouses`).

| Model | Triangles | Draw calls (Hangar) | GLB bytes | Size | Cited vs ESTIMATE |
| --- | ---: | ---: | ---: | --- | --- |
| `quonset-hut-20x48` | 768 | 1 | 74,380 | 20 x 48 ft hut on a slab, 14.4 ft tall with stovepipe | 20 x 48 ft nominal size only; the Navy manual page did not load, so UNVERIFIED. Half-circle rise, slab, doors, windows, stovepipe are ESTIMATE |
| `pontoon-pier-segment` | 2,076 | 1 | 169,744 | 3 x 8 cells, 56 x 16 ft, 6.6 ft tall | All ESTIMATE (cell 5 x 7 x 5 ft is the plan's "about"; the Navy chapter gives no cell size) |
| `jinamoc-seaplane-ramp` | 628 | 1 | 61,008 | 220 x 40 ft, 17.6 ft rise | 220 ft CITED (Navy ch. XXIX). Width 40 ft, 1 in 15 slope, slab/steel split, fill, piles ESTIMATE |
| `ormoc-customs-building` | 752 | 1 | 70,288 | 33 x 59 ft, 30 ft with flagpole | Existence only (JACAR); the whole look is ESTIMATE. No light, lamp or lit marker |

Every figure is labeled in each script's header; Library cards, entries and `ASSETS.md` rows repeat the cited/ESTIMATE split.

## Why `building`, not `vehicle` or `equipment`

All four are fixed structures like `pier-and-warehouses`. `building` gets the Hangar's outside stage, the 4-draw-call budget class, and
`F8` Task 3 already plans to place `building` kinds through `staticModels`. `equipment` (used for the lighthouse) is the F4 kind for
small fixtures; a 220 ft ramp and a pier run are not that. The pier and ramp keep a ground origin (`y=0` is the underside), not the waterline, so a placer sets the waterline.

## Files

Scripts `tools/models/blender/{quonset-hut-20x48,pontoon-pier-segment,jinamoc-seaplane-ramp,ormoc-customs-building}.py` (one per id, because
`buildingModels.test.ts` reads literal footprint and height constants per script; F4's shared-script layout would not fit it),
entries `tools/models/entries/<id>.json`, Library `content/library/<id>.json`, glbs `content/buildings/<id>.glb`,
`src/render/scene/staticModels.ts`, `ASSETS.md`, capture tool `tests/e2e/f8aModelsCapture.spec.ts` (listed in `captureTools.ts`),
tests below. No existing model, entry or recording changed (`git diff` touches no existing glb).

## How Mark views them

Hangar with the test bench: `https://ww2airsim.windomlane.org/hangar.html?bench`, then pick the four cards (Library, kind Building) by name. That host serves
the dev server off the primary checkout, which does not hold this branch, so the models appear there only after the branch is checked out
there or served from a slot. On a dev slot from this worktree: `WW2AIRSIM_TUNNEL=1 npx vite --port 5175` (or 5174), then
`https://ww2airsim-2.windomlane.org/hangar.html?bench`. I did not start a slot server (ports 5173 to 5175 were all in use by others).

Review images (committed): `docs/handoff/2026-10-16-f8a-shots/`: `f8a-review-board.jpg` (all four models, 16 views) plus per-model
`-day.png` (Blender preview, sky background, flat colors), `-low.png`, `-eye.png`, `-over.png` (real Hangar captures on nexus's 680M
WebGPU against the Hangar's dark stage, a one-off vite on 127.0.0.1:5196, stopped afterward). The Hangar pontoon `low` shot is
partly under the info card; orbit in the Hangar for a better angle. Nexus captures are correctness only.

## Tests

- Added `tests/tools/models/f8aModels.test.ts` (registered, Library entry, ASSETS row, ESTIMATE provenance, customs has no light).
- Extended `tests/tools/models/buildingModels.test.ts` to the four (footprint within 1%, height 2%, ground origin, budget, textures, z-fight, winding-safe parts).
- `blenderEntries.test.ts` rebuilds every Blender entry byte-identically, which covers the four and proves every existing model is unchanged.

**Tests updated:** `buildingModels.test.ts` (roster completeness now counts F8A), `tests/e2e/hangar.spec.ts` (building budget/url list).  
**Tests still valid:** `staticModels`, Hangar roster and provenance, `blenderEntries`, `kitBuildings`.  
**Known gaps:** `tests/e2e/fixtures/flat-luminance.json` (Hangar check 15) has no rows for these models, because it needs flat predecessors measured on the reference GPU; the e2e `hangar.spec.ts` was not run (needs ryzen's GPU; the updated list is unrun). No gameplay use; ramp slope and widths are guesses; the Navy Quonset manual was never read.
