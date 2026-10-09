# M1d: Baked detail on the six downloaded warships, and a lighter Essex AA fit

**Goal:** bring the six Sketchfab warships up to the detail level M1c gave our own three:
- Yamato
- Mogami
- Cleveland
- Essex
- Fletcher
- Shiratsuyu

This is Track M in `MASTER_PLAN.md`, following `docs/handoff/2026-10-09-m1c-ship-detail.md`.

**Run:** worktree `m1d-download-detail`, merged to `main` at the end. Unattended.
**Viewing checkpoints:** the final product only. All captures go in the handoff.
**Machines:**
- Builds run on nexus.
- Bakes run in Windows Blender 5.0.1 with Cycles on Ryzen's RX 6700 XT, through the existing `npm run models:bake` path.

## Rulings (Mark, 2026-10-09)

| # | Ruling |
| --- | --- |
| D1 | All six downloads get the M1c treatment where their mesh allows it: <br>- a baked normal map and AO; <br>- rust, salt and waterline grime; <br>- roughness that varies by material; <br>- planks that read from the air on wood decks. |
| D2 | Budgets stay as each entry has them now. |
| D3 | **Essex light AA is cut to 4 mounts in total, two on each side.** This is chosen for balance, not history: a real late-1944 Essex had about 17 quad 40 mm mounts and about 55 single 20 mm guns, and the spec had 15 and 56. <br>- The 5" mounts stay. <br>- The four survivors are 40 mm quads, two forward and two aft, one of each pair on each beam. <br>- The 20 mm galleries go. <br>- The spec comment records that the cut is deliberate. |

## The download problem: UVs

M1c baked onto atlases that we laid out ourselves. A download's UVs are whatever its author made, and they can overlap, mirror or be missing.

Each ship gets one of three treatments, decided per ship and recorded in the handoff:

1. **The UVs are clean** (no overlaps, enough texel density). Bake onto them and compose into the existing textures.
2. **The UVs overlap or are too coarse.** Re-unwrap the hull with a Smart UV Project at build time, then bake the source textures plus the new detail onto the new atlas.
   - This step must be deterministic: build it twice and check the bytes match. If a re-unwrap cannot be made byte-identical, the unwrapped mesh becomes a committed artifact next to the bake.
3. **Neither works within budget.** Paint only (D1 without the bake), and the handoff says why.

The detail model for a download is its own mesh, plus bake-only details (portholes, hatches, plating seams) placed by a per-ship detail list. Those details use the same `m.detail(...)` vocabulary as M1c, run against the imported mesh. The stale-bake test covers these bakes the same way.

## Tasks

- [ ] 0. Worktree `../ww2airsim-m1d` on branch `m1d-download-detail`; link the model cache. Wake Ryzen and confirm the HIP device.
- [ ] 1. **Essex AA (D3)** first, because it is a small change:
  - the spec;
  - the rebuild;
  - re-pin Essex's rebuild hash;
  - the shipModels test (instance count = Σ barrels).
- [ ] 2. A UV survey of all six: overlap fraction, texel density at the hull, and source texture sizes. Choose 1, 2 or 3 for each ship.
- [ ] 3. Extend the bake pipeline to download entries (the per-ship detail list and the re-unwrap path), and see the stale-bake test fail once for a download.
- [ ] 4. Then, one ship at a time:
  - Yamato
  - Mogami
  - Cleveland
  - Essex
  - Fletcher
  - Shiratsuyu

  For each, record the bytes, triangles and draws before and after, and re-pin with the reason, one commit per ship.
- [ ] 5. Captures through `tests/e2e/shipCaptures.spec.ts`: close, side-close, deck and 1,500 ft for each ship, with before and after side by side, plus the groove view for Essex. Run the Hangar E2E checks.
- [ ] 6. Docs:
  - `docs/models.md` (bakes for downloads);
  - `ASSETS.md` (if a source changes);
  - the handoff `docs/handoff/<date>-m1d-download-detail.md`;
  - Track M in `MASTER_PLAN.md`.

  Then merge, run `npm run verify` on `main`, push, and email the handoff.

## Done means

- All six ships are within budget, and each has its treatment recorded.
- The rebuild tests pass from the committed artifacts.
- Essex draws four light AA mounts.
- The handoff shows before and after for every ship.

## Not in this plan

A Japanese carrier. Sourcing one is a separate task now under way. Whether it comes from Sketchfab or a Blender build, it gets its own plan.
