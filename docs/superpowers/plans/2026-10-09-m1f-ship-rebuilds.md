# M1f: Rebuild four downloaded warships in Blender, add Abukuma, fly ensigns

**Goal:** bring Mogami, Yamato, Cleveland and Essex up to Fletcher's level of detail by building them in Blender the way Pennsylvania was built. Also add an IJN light cruiser, and fly each ship's own ensign. Track M in `MASTER_PLAN.md`; this follows `docs/handoff/2026-10-09-m1d-download-detail.md` and `2026-10-09-m1e-zuikaku.md`.

**Run:** worktree `m1f-ship-rebuilds` on nexus, merged to `main` at the end. Unattended.
**Viewing checkpoints:** the final product only. Mark can watch progress at any time on `ww2airsim-2.windomlane.org`, which serves this worktree.
**Machines:**
- Blender geometry builds run on nexus.
- The Cycles bakes run on Ryzen's RX 6700 XT through `npm run models:bake`, as in M1c. Each bake takes seconds, so plan V1, running in parallel, shares the GPU without contention.

## Mark's feedback (2026-10-09)

| Ship | His words, condensed |
| --- | --- |
| Cleveland | "still looks very much like polygons and basic single texture on the metal sides". Wants fine detail, shading, fixtures and a US flag. |
| Essex | The bridge and island need more detail, styling and color. Wants wires between the masts if accurate, and a US flag. |
| Fletcher | "looks fantastic". It is the bar. |
| Kagero | Good. Add a Japanese flag. |
| Mogami | Wants Fletcher-level detail: guardrails and fencing, and wires between the masts. "Smokestack should look more like a smokestack." "Bridge looks like stacked prisms." Add a Japanese flag. |
| Pennsylvania | "looks amazing". Add a US flag. |
| Type B Maru | It is described as Japanese but flies a US flag. Remove the flag so it can serve either side. |
| Yamato | Wants Fletcher-level detail and styling. Add a Japanese flag. |
| Shiratsuyu | "quite large". Her spec length (107.5 m, 353 ft) is right and shorter than Fletcher's, so check her drawn length against it. |

## Rulings (Mark, 2026-10-09)

| # | Ruling |
| --- | --- |
| F1 | **Rebuild in Blender:** Mogami, Yamato, Cleveland, then Essex, in that order. <br>- Each becomes `tools/models/blender/<id>.py` on `kit.py`/`naval.py`, with the M1c detail list and bake, like Pennsylvania. <br>- The download stays in `ASSETS.md` as a reference for proportions only, or is retired. <br>- Each keeps its spec armament layout (M1 ruling R4: Mogami keeps five turrets) and its current budget. Essex's budget may go to 3 MB / 45k / 12, the warship default, if its island needs it; record why. <br>- What "Fletcher-level" means: <br>&nbsp;&nbsp;• rounded and stepped superstructure, not boxes; <br>&nbsp;&nbsp;• a real funnel with a cap and a rim (Mogami's trunked funnel is the test case); <br>&nbsp;&nbsp;• railings broken at mounts; <br>&nbsp;&nbsp;• rigging between masts, where the class had it; <br>&nbsp;&nbsp;• boats, davits, searchlights, director and radar detail; <br>&nbsp;&nbsp;• paint per period, sourced per spec. |
| F2 | **Ensigns, historical, waving:** <br>- US ships fly the 48-star ensign. <br>- IJN warships fly the Rising Sun naval ensign. <br>- Type B Maru flies none (its US flag is removed). <br>- At sea, the ensign flies from the mainmast gaff, estimated per ship. <br>- A `Flag` part in each glb uses a small flag texture. <br>- The renderer animates the wave with a cheap vertex sine in the material: no cloth simulation and no extra draw if the flag shares an atlas. <br>- The ensign follows the ship spec's side, so a captured or neutral ship can change it. |
| F3 | **Abukuma**, a Nagara-class light cruiser as at Surigao Strait in October 1944 (Shima's force). <br>- Built in Blender at the same level. <br>- New spec `content/ships/abukuma-cl.json`. <br>- Her 1944 armament is sourced, and her AA is held to the balance rule Essex and Zuikaku set (M1d D3, M1e E3): 4 light mounts, two a side, with the real fit recorded in the spec. |
| F4 | **Shiratsuyu's size:** measure her drawn length against the spec. Fix the scale if it is wrong; if it is right, say so in the handoff. |

## Tasks

- [ ] 0. Worktree `../ww2airsim-m1f` on branch `m1f-ship-rebuilds`; link the model cache.
  - Start the preview server: `cd ../ww2airsim-m1f && WW2AIRSIM_TUNNEL=1 nohup npx vite --config /home/mark/projects/ww2airsim/node_modules/.slot2-m1f.vite.config.mjs &`. That config is untracked and gives the server its own `cacheDir`, per AGENTS.md.
  - Confirm `https://ww2airsim-2.windomlane.org/hangar.html` returns 200.
  - Wake Ryzen.
- [ ] 1. Ensigns (F2): the flag texture assets (both sides), the flag part in the build, the wave in the renderer, and every ship that gets a flag. Remove Type B Maru's US flag. Enroll the flag in the ship tests: a flag exists where the spec says, has the side's texture, and moves over time.
- [ ] 2. Shiratsuyu's size (F4).
- [ ] 3. Mogami (F1). Before and after captures. Record bytes, triangles and draws.
- [ ] 4. Yamato.
- [ ] 5. Cleveland.
- [ ] 6. Essex (the island first).
- [ ] 7. Abukuma (F3). Enroll her wherever Mogami is enrolled.
- [ ] 8. Re-pin the rebuild hashes with reasons, one commit per ship. Run the Hangar E2E checks, re-baselining check 15 deliberately with a reason. Capture every ship at close, side-close, deck and 1,500 ft, before and after, plus one frame with a flag mid-wave.
- [ ] 9. Docs:
  - `docs/models.md` (flags);
  - `ASSETS.md` (retired downloads and flag sources);
  - `CONTEXT.md` (Ensign);
  - the handoff `docs/handoff/<date>-m1f-ship-rebuilds.md`;
  - Track M in `MASTER_PLAN.md`.

  Then merge, run `npm run verify` on `main`, push, and email the handoff. Stop the slot-2 server by its PID, then remove the worktree; keep the branch.

## Done means

- The four rebuilt ships and Abukuma are inside their budgets, with baked detail, railings, rigging and believable funnels and bridges.
- Every warship flies its side's ensign, and the flag waves.
- The cargo ship flies no flag.
- Shiratsuyu's length is verified.
- `npm run verify` passes on `main`.
