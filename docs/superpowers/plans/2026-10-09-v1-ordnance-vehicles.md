# V1: Torpedo and bomb models, a moving Chi-Ha, and a driven jeep

**Goal:** draw two aerial torpedoes and a Japanese bomb, and bring the two ground vehicles to life. Mark's requests of 2026-10-09.

**Run:** worktree `v1-ordnance-vehicles` on nexus, merged to `main` at the end. Unattended.
**Viewing checkpoints:** the final product only. Mark can watch progress at any time on `ww2airsim-3.windomlane.org`, which serves this worktree.
**Machines:** Blender on nexus. Ryzen's GPU only if a Cycles bake is used, and it is shared with M1f, which runs in parallel.

## Rulings (Mark, 2026-10-09)

| # | Ruling |
| --- | --- |
| V1 | **Torpedoes, one per side**, picked for simplicity over strict history: <br>- the **Type 91 aerial** (IJN); <br>- the **Mk 13 aerial** (USN). <br>Each is built in Blender (`tools/models/blender/type91.py`, `mk13.py`) with its sourced length, diameter, tail and shroud. These are drawn models only: the torpedo weapon, its drop envelope and its run are Track D step 2. M4's ship torpedoes reuse the same two models, which is a simplification. |
| V2 | **The Type 98 No. 25 bomb** (250 kg, 551 lb), as a model and a store. <br>- The store gets sourced mass, filler and dimensions; the fleet's estimated fields (drag, damage, blast radius) are scaled from the AN-M65 and labeled. <br>- Every Japanese aircraft that carries the AN-M65 switches to it: the A6M2 for now, plus any other IJN spec found carrying `an-m65`. <br>- The rack offsets are re-measured with `npm run models:mounts`. |
| V3 | **The Type 97 Chi-Ha:** <br>- the turret traverses and the gun elevates, through the same rig machinery the bomber turrets use, and the Hangar sweep drives both; <br>- the tracks move by a scrolling tread texture, plus road wheels, sprockets and idlers turning to match. Individual links are not modeled. <br>A sim speed drives the scroll and the wheel spin, and the Hangar has a speed control. |
| V4 | **The Willys MB jeep:** <br>- the wheels spin with speed; <br>- the front wheels steer left and right, tied to the steering wheel, which turns with them at a sourced or estimated ratio. <br>The Hangar has steer and speed controls. |
| V5 | **The jeep's driver**, built in Blender: <br>- a low-poly seated US Army soldier: M1 helmet, olive drab uniform, in the jeep's own style; <br>- his hands follow the steering wheel, a two-bone arm or a simple parent to the wheel rim, whichever reads right; <br>- he is part of the jeep model, inside its budget, or the budget rises with a recorded reason. |

## Tasks

- [ ] 0. Worktree `../ww2airsim-v1` on branch `v1-ordnance-vehicles`; link the model cache.
  - Start the preview server: `cd ../ww2airsim-v1 && WW2AIRSIM_TUNNEL=1 nohup npx vite --config /home/mark/projects/ww2airsim/node_modules/.slot3-v1.vite.config.mjs &`. That config is untracked and gives the server its own `cacheDir`, per AGENTS.md.
  - Confirm `https://ww2airsim-3.windomlane.org/hangar.html` returns 200.
- [ ] 1. The torpedoes (V1): models, Hangar entries, and sourced dimensions in the script header.
- [ ] 2. The Type 98 bomb (V2): the model, the store, the IJN specs switched, the offsets re-measured. Enroll it in the stores tests and see them fail once.
- [ ] 3. The Chi-Ha (V3): the turret and gun rig, tread scroll and wheel spin, and Hangar controls. Enroll it in the rig tests: the turret trains and the hull doesn't; the tread offset advances with speed.
- [ ] 4. The jeep (V4, V5): spin and steer, the driver, and Hangar controls. Enroll it in the rig tests: the steer angle matches the wheel rotation, and the driver's hands stay on the rim.
- [ ] 5. Captures: each torpedo and bomb, the bomb hung on the Zero, the Chi-Ha mid-traverse with the tracks moving (two frames), and the jeep steering left and right with the driver.
- [ ] 6. Docs:
  - `docs/models.md` (vehicle rigs);
  - `ASSETS.md`;
  - `CONTEXT.md` (if a new term appears);
  - the handoff `docs/handoff/<date>-v1-ordnance-vehicles.md`;
  - `MASTER_PLAN.md` (Track D notes that the torpedo models exist; record where vehicles live).

  Then merge (re-diff against `HEAD` first, since M1f merges in parallel), run `npm run verify` on `main`, push, and email the handoff. Stop the slot-3 server by its PID, then remove the worktree; keep the branch.

## Done means

- Both torpedoes and the Type 98 bomb are drawn.
- IJN aircraft carry the Type 98.
- The Chi-Ha's turret and gun move and its tracks run.
- The jeep's wheels spin and steer, with a driver at the wheel.
- `npm run verify` passes on `main`.
