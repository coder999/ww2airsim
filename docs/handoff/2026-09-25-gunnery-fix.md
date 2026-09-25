# Gunnery fix handoff (2026-09-25)

Branch `worktree-gunnery-fix`, from `main` at `6df4a28`. It is not merged or pushed. This work carries out the five items Mark approved on 2026-09-25 from the shootdown spike (`.claude/worktrees/shootdown-spike/scratch/shootdown-spike.md`). The spike's key numbers were re-measured in this worktree before any change, and they reproduce exactly: 0 hits at every range, and the rounds pass 1.13, 1.25, 1.50 and 1.90 m below the aim point at 100, 200, 300 and 400 m.

## Before and after: a target centered on the reticle

The setup is a co-moving tail chase. Both F6Fs fly level at 120 m/s and step at constant velocity. The target's body origin sits on the drawn reticle line. Everything runs through production `stepCombat`. A kill takes 12 hits.

| Range | Hits, 1 s burst, before | Kill, before | Hits, 1 s burst, after | Time to kill, after (rounds fired) |
| --- | --- | --- | --- | --- |
| 100 m | 0 | never | 12 | 0.35 s (30) |
| 200 m | 0 | never | 12 | 0.70 s (60) |
| 300 m | 0 | never | 12 | 0.43 s (36) |
| 400 m | 0 | never | 12 | 1.08 s (90) |
| 500 m | not measured | not measured | 12 | 1.13 s (96) |

The sight's depression is 0.2843° for the F6F. The spike estimated 0.287° from a mean it had rounded to 2 decimal places. The mean impact of production rounds at 300 m sits 0.2835° below the eye line, which matches the function to within 0.001°.

In the chase view, the pipper sits 1.17° below the screen center at 120 m/s. That offset is the aim error a pilot made by using the screen center.

## Scenario start: firing chance for a scripted player on the new reticle

These runs use the scripted player in `tests/sim/gunneryBot.ts` (the spike's "human" bot, which aims with the harmonized reticle). Each start was run 8 times with 8 noise cursors, 60 s per run.

| Start | Pursuer | Firing chance (within 2° of the reticle, inside 400 m) | Kills |
| --- | --- | --- | --- |
| Old tail chase (the frozen fixture) | green | 0/8 | 0/8 |
| Old tail chase (the frozen fixture) | veteran | 0/8 | 0/8 |
| New `pursuit-range`, head-on | green | 8/8, at 8.5 s | 7/8 (six at 9.0-9.2 s, one at 28.3 s) |
| New `pursuit-range-veteran`, head-on | veteran | 8/8, at 8.5 s | 8/8 (9.0-9.3 s) |

## What changed (commits)

1. `abfbb34`: `src/sim/weapons/harmonization.ts`, `gunHarmonization(combat, eyePointM, { referenceGuns?, airspeedMps? })`.
   - It flies each reference gun's round with production `flyProjectile` to `convergenceM` and returns the depression angle, the body-frame mean impact point, and the gun count.
   - It is driven by the spec. The `referenceGuns` predicate is the hook for the A6M plan's mixed battery.
   - Airspeed moves the result by only 0.002° across 0-200 m/s, so a fixed 120 m/s reference is used.
2. `8a8d2fa`: the reticle in `panel.ts` is drawn depressed by that angle, and it now has a 0.2° center dot in its 1° gap.
   - The false "sits on the boresight" test in `panel.test.ts` now requires the depression.
   - New test: `tests/render/gunsightBallistics.test.ts`.
3. `d65bda3`: the old `pursuit-range` is frozen as the test fixture `tests/fixtures/scenarios/pursuit-tail-chase.json`. It is loaded by `tests/fixtures/scenarios.ts` through the new `bundleForScenario` in `tools/content/load.ts`. The Plan 7a/7b tests in `scenario.test.ts` now read the fixture, with their numbers unchanged.
4. `226f718`: airborne spawns start at `AIRBORNE_SPAWN_THROTTLE = 0.7` (`src/sim/scenario.ts`).
   - **Checked first:** neither `plan1-rulings` nor the Plan 7 docs give any reason for a throttle of 0. Commit `732ea9d` reused the parked airplane's `NEUTRAL`.
   - The value 0.7 is the setting that holds 120 m/s at 3,000 m hands-off. Through `nextFrameState` the speed went from 120.0 to 120.3 m/s over 30 s. The specs carry no cruise setting, so this is a constant.
   - A scenario can pin its own value with `airborneAt.throttle` (0 to 1). The fixture pins 0.
   - No golden or trajectory test starts airborne, so none were regenerated.
5. `c366094`: `pursuit-range` is now a head-on merge with a green pursuer. The player flies east at 120 m/s. The pursuer starts 2.5 km ahead heading west at 125 m/s, with a 60 m lateral offset at the same altitude.
   - New scenario: `pursuit-range-veteran`, labeled "Air Combat: Veteran" on the title screen.
   - New tests: `tests/sim/pursuitMerge.test.ts` and the title and dist lists.
6. `a8397f8`: the chase-view gun pipper, `src/render/scene/gunPipper.ts`.
   - It is a 1° ring at the harmonization impact point, posed with the player airframe. It is visible only when the airframe is visible, and it draws without a depth test.
   - New test: `tests/render/gunPipper.test.ts`. It pins the chase projection to production rounds within 0.02°, and checks that the pipper lies on the cockpit reticle's line.
   - The `main.ts` edit is **4 lines**: an import, the create and add, and the per-frame pose.

`npm run verify` passed after every commit (`rc=0`). The final run gave 1630 passed and 12 skipped. The skips are the missing terrain tiles.

## Tier 2 on the reference GPU (after merging to main, 2026-09-25)

Merged into `main` via `c763c7f` (main into the branch, no conflicts, then a fast-forward). `npm run verify` on the merge: `rc=0`, 1644 passed, 12 skipped.

The first Tier 2 run had 7 failures and 1 pass. Five of the failures were test mechanics and are now fixed; they pass on re-run (9/9, including `audio.spec.ts`):

- `gunnery.spec.ts` ×3 and `audio.spec.ts`: they expected 6 clips, but there have been 7 since `9432942` (Plan 6b's `rocket_whoosh`). This predates the gunnery fix. The count now comes from `AUDIO_ASSETS.length`.
- `meta-game.spec.ts`: it read the roster once, right after `waitForScenario`. `scenarioId()` flips when `loadScenario` assigns the bundle, which happens before its `await buildScenarioEntities` and before `rebuildFrame`. The spec saw gunnery-range's targets. It now polls the roster. The root fix would be for `scenarioId()` to report the rebuilt frame's scenario. That is not done, because it changes a `main.ts` diagnostic that every `waitForScenario` caller relies on.
- `radar.spec.ts`: the head-on start is 1.55 mi out, so the 1 mi ring was empty when the spec paused. It now waits for the contact to enter the ring, which headless happens at 3.7 s.

Still red. Both are AI behavior (see open items 1 and 5), not test mechanics:

- `ai-pursuit.spec.ts`: the pursuer never fires.
- `ai-maneuver.spec.ts`: closest range is 44.8 m, below the floor of 50. Headless, the veteran closes to 11 m, so switching the spec to `pursuit-range-veteran` would not help.

`ai-pursuit-difficulty.spec.ts` passed.

## Open items

1. **Lane A: after a head-on merge the AI never re-engages.** With a passive player, both skills pick `break` and then `extend`, and they never leave `extend`. At 120 s the range is 4.4 km and the pursuer has fired 0 rounds. So a player who misses on the first merge has no second fight. This comes from the `src/sim/ai/decision.ts` scoring, which was not touched here.
2. **Lane A: the AI leads with the target's velocity instead of the relative velocity** (`muzzleLeadDirection`, `src/sim/ai/pursuit.ts`). The spike has a failing-test sketch. This is out of scope here.
3. **Nobody has seen the pipper and the depressed reticle on the GPU.** They have not been checked under the photoreal pipeline (TRAA, aerial perspective). The pipper's material uses `depthTest: false` and `fog: false`.
4. The DEV `?spawnX/Y/Z` override moves a parked player into the air but keeps its parked controls, so the throttle is still 0. It was not changed.
5. The veteran is no harder than the green on the first merge (8/8 kills against 7/8). Whether "Veteran" should mean something at the merge is a Lane A tuning question.
