# M1b: Visible AA mounts, and guns that elevate

**Goal:** make ship AA visible and testable, as a follow-up to M1 (`docs/handoff/2026-10-08-m1-ship-models.md`). Track M in `MASTER_PLAN.md`.

**Run:** worktree `m1b-aa-mounts`, merged to `main` at the end. Unattended.
**Viewing checkpoints:** the first new light-AA kit (the 40 mm quad), then the final product. Because the run is unattended, the checkpoint capture goes in the handoff and the run does not stop for it.

## Why (Mark, 2026-10-09)

Mark "didn't see AA on the ships mostly". A close-up render of the M1 glbs shows three causes:

- The generated 40 mm and 25 mm kits are bare rings in the hull's own gray, with barrels about 6 cm across. They vanish at flight distance.
- About a third of the light-AA entries are `kit: null` galleries: a barrel count with nothing drawn. That covers all of Shiratsuyu's light AA and 8 of Fletcher's 12.
- The sweep only trains mounts. Nothing elevates.

## Rulings (Mark, 2026-10-09)

| # | Ruling |
| --- | --- |
| B1 | Better 40 mm (quad and twin) and 25 mm (triple, triple-shielded, single) kits: shields, sights, a crew platform, and thicker barrels in a dark gunmetal role rather than the hull gray. |
| B2 | Draw the 20 mm and 25 mm galleries. A shielded single-gun kit gets one instance per barrel, spaced along each gallery entry, so `barrels: N` shows N guns. The sim keeps one entry per gallery, so M2's fire positions are unchanged. |
| B3 | Scale light AA (40 mm and below) to 1.3x for readability. Heavy AA and main turrets stay true scale. Record the factor in `docs/models.md` as deliberate. |
| B4 | **Elevation.** Every kit splits into a mount part (trains about Y) and a gun part (elevates about its trunnion axis). The ship view exposes `setElevation(rad)` beside `setTraining`, and the Hangar's Train mounts sweep moves both: training ±90°, and elevation from 0° to each kit's maximum (about 85° for light AA and dual-purpose 5"/38 and 127 mm mounts, about 30° for battleship main turrets, about 40° for cruiser main turrets, about 55° for IJN destroyer 127 mm; ESTIMATES, each sourced in the kit comment). This applies to the AA mounts and to the main turrets' guns. |

## Design

- **Kit split.** `Kit_<kit>` stays the mount, and `Kit_<kit>_Guns` is the guns, with its origin on the trunnion axis. The locator gains `userData.trunnion` (its offset from the mount origin) and `userData.maxElevationRad`.
  - Carved downloads: the barrel islands are already separate (the M1 survey), so the carve puts them into `_Guns`.
  - Blender and generated kits: `naval.py` and `mountKits.ts` emit the two parts.
- **Renderer.** One `InstancedMesh` per part. The gun instance matrix is the mount matrix × translate(trunnion) × rotateX(elevation), so it costs one extra draw per kit type. Re-check every draw budget, and record any rise in the entry, as Shiratsuyu's was in M1.
- **Galleries.** The build expands a gallery entry into N locators, `LightAA<k>_<i>`, spaced along the entry's `run` vector. New optional field: `run`, the gallery length and direction in ship meters, an estimate per gallery. The sim's armament stays one entry.

## Tasks

- [ ] 0. Worktree `../ww2airsim-m1b` on branch `m1b-aa-mounts`; link the model cache per `docs/models.md`.
- [ ] 1. Elevation:
  - split the kits;
  - add the locator `trunnion` and `maxElevationRad`;
  - add `setElevation` in `src/render/scene/ship.ts`;
  - extend the Hangar sweep.
  - Enroll it in `tests/render/ship.test.ts` (an elevated gun moves, and its mount doesn't) and in Hangar E2E check 17. See it red once.
- [ ] 2. The new 40 mm quad kit (B1, B3). Capture it in the Hangar, close up and at about 1,500 ft: this is checkpoint 1, and it goes in the handoff. Then the twin and the 25 mm kits.
- [ ] 3. The 20 mm/25 mm single kit and the gallery expansion (B2).
  - Every `kit: null` entry gains a `run` and a kit.
  - Enroll it in `tests/tools/shipModels.test.ts`: instance count = Σ barrels, and every instance stands on a surface.
- [ ] 4. Rebuild all nine warships and re-pin the byte-identical rebuild hashes, one commit per ship with the reason.
- [ ] 5. Captures of all ten ships, still and mid-sweep (trained and elevated), plus a flight-distance view of one battleship and one destroyer.
- [ ] 6. Docs: the `docs/models.md` convention (split kits, galleries, the 1.3x factor); the handoff `docs/handoff/<date>-m1b-aa-mounts.md`; Track M in `MASTER_PLAN.md`. Merge, run `npm run verify` on `main`, push, and email the handoff.

## Done means

- In the Hangar sweep, every warship visibly trains and elevates each mount and turret gun.
- Every gallery draws its barrel count.
- `npm run verify` passes on `main`.
- Budgets hold, or each rise is recorded.
