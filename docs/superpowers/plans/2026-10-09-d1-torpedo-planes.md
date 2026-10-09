# D1: TBM-3 Avenger, B5N2 Kate, and the torpedo weapon

**Goal:** a torpedo plane for each side, flyable from the picker and from carriers, dropping real torpedoes. This is Track D steps 1 and 2 in `MASTER_PLAN.md`, onboarded per `docs/aircraft.md`.

**Run:** worktree `d1-torpedo-planes` on nexus, merged to `main` at the end. Unattended.
- It starts **after V1 merges**, because it uses V1's Type 91 and Mk 13 models.
- If M1f is still running, coordinate merges: re-diff against `HEAD`.

**Viewing checkpoints:** the final product only. Mark can watch progress on a free dev slot (see task 0).

## Decisions (Mark, 2026-10-09, AskUserQuestion)

| D | Answer |
| --- | --- |
| D1 | **The TBM-3 Avenger** (1944–45) and **the B5N2 Kate**. |
| D2 | The Avenger is `allied`. The Kate is `japanese`, so she appears in the picker only with Dev on, as every IJN airframe does. |
| D3 | Both are `carrierCapable: true`. Each needs a takeoff and trap: the Avenger on Essex, the Kate on Zuikaku. |
| D4 | **Both are built in Blender**, as the B-29, G4M, Ki-21, P-38 and Ki-84 were. The rigs include the C1 surfaces, and the Avenger's bay doors use C2's hinge machinery. |
| D5 | Both are taildraggers with retractable landing gear, measured from the drawn model (Part F, "Undercarriage"). |
| D6 | Each has a single engine. |
| D7 | **Avenger:** a bay load with working doors. **Kate:** an external centerline rack. |
| D8 | **New store kind `torpedo`** (Track D step 2): the Avenger carries the Mk 13 and the Kate carries the Type 91. The **G4M Betty switches to a Type 91** as well. Library ordnance cards are added for both torpedoes. |
| D9 | Offsets are measured with `npm run models:mounts`. The Avenger's are inside the bay, held by a bay test like the B-17's. |
| D10 | **Primary trials first.** <br>- TBM-3: a USN or GM performance report if `wwiiaircraftperformance.org` has one, otherwise the pilot's handbook charts. <br>- B5N2: TAIC/ATIU data, otherwise a secondary compilation. <br>Gaps are named, and an ESTIMATE is marked in capitals. |
| D11 | **Fixed guns, sourced:** the TBM-3's two wing .50s and the B5N2's forward 7.7 mm guns, with hit points shaped like the Val's. **Turrets as appropriate** (the new rule in `docs/aircraft.md` D11): the Avenger's ball turret and ventral .30, and the Kate's rear 7.7 mm, are rigged on the turret-aim and flex-gun machinery so they aim. Firing waits for E3's gunners. |
| D12 | The eye point is inside the canopy. |
| D13 | No maneuvers are excluded without a source. The AI torpedo attack is Track E. |
| D14 | Each gets a Library card. They appear in the picker and in carrier starts, but in no scenarios yet. Acceptance uses the graded suite's existing tolerances, and misses are reported, not tuned (R36). |

## The torpedo weapon (Track D step 2)

| Rule | Detail |
| --- | --- |
| Kind | `torpedo` joins round, bomb and rocket in `combat.ts`. |
| Drop envelope | Sourced per type, and forgiving (Mark): <br>- Mk 13 with the 1944 shroud ring: about 800 ft and 280 knots; <br>- Type 91 Mod 2: about 330 ft and 260 knots. <br>Both are ESTIMATES until sourced; cite them in the store's `source`. <br>Outside the envelope the torpedo breaks up or dives, and the HUD shows "TORPEDO BROKE UP". |
| Run | Water entry, then a straight run at a set speed and depth for a sourced range. The torpedo sinks at the end of its run. The wake is a small visual, budgeted. |
| Hit | Contact with a ship's hull below the waterline does the store's damage to `hullHp`. A larger waterline effect is Track D step 3. |
| Tests | Enrolled per `docs/testing.md`: <br>- a drop inside the envelope runs; <br>- a drop outside it breaks up; <br>- a run hits a stationary ship and does damage; <br>- a run past its range sinks. <br>See each fail once. |

## Tasks

- [ ] 0. Wait until V1 has merged.
  - Create worktree `../ww2airsim-d1` on branch `d1-torpedo-planes` and link the model cache.
  - Preview server: copy `node_modules/.slot3-v1.vite.config.mjs` to `.slot3-d1.vite.config.mjs`. Point it at `../ww2airsim-d1` and keep its own `cacheDir`.
  - Start the server on slot 3 (port 5174), unless V1 still holds that slot. If it does, use whichever of slots 2 and 3 is free.
  - Confirm the server returns 200.
- [ ] 1. Part A is done (the table above). Part B: source every figure for both airframes.
- [ ] 2. The torpedo weapon (above), with the G4M switched to the Type 91.
- [ ] 3. **The Avenger:**
  - the Blender model, the rig (surfaces, gear, bay doors, turret, ventral gun) and its budget;
  - the spec (Part C sweep fit, then a `CARDS` entry);
  - the Library card;
  - the drawing fit (Part F);
  - the E2E checks (Part G);
  - a carrier takeoff and trap on Essex;
  - a flown torpedo drop that hits a target ship.
- [ ] 4. **The Kate**, the same steps, with a takeoff and trap on Zuikaku.
- [ ] 5. Captures:
  - each airframe in the Hangar;
  - the Avenger's doors open with the torpedo in the bay;
  - each drop at release and on its run;
  - each trap.
- [ ] 6. Docs:
  - a "Lessons" section in `docs/aircraft.md`;
  - `ASSETS.md` (sources);
  - `CONTEXT.md` (Torpedo, Drop envelope);
  - the handoff `docs/handoff/<date>-d1-torpedo-planes.md`;
  - Track D in `MASTER_PLAN.md` (steps 1 and 2 done).

  Then merge, run `npm run verify` on `main`, push, and email the handoff. Stop the preview server by its PID, then remove the worktree; keep the branch.

## Done means

- Both planes are flyable from the picker and from their carriers.
- Each drops its torpedo, which runs and hits a ship.
- Bad drops break up.
- The Betty carries a Type 91.
- Their turrets aim.
- `npm run verify` passes on `main`.
