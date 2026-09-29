# Plan 7h handoff: AI takeoff

Branch `worktree-ai-7h-takeoff` (worktree `/home/mark/projects/ww2airsim-worktrees/ai-7h-takeoff`), not merged. Plan: `docs/superpowers/plans/2026-09-28-ai-7h-takeoff.md`. Run was unattended; Mark's viewing is the final checkpoint only.

## 1. What shipped

- `src/sim/ai/takeoff.ts`: the takeoff phase machine (`wait`, `roll`, `climb`) and its controls. `pilotTick` has a `takeoff` mode that short-circuits the rescore and hands off to engage or loiter at `TAKEOFF_DONE_M` (450 m AGL).
- `takeoffClear` runs in id order: a pilot starts its roll only when every lower-id aircraft still in takeoff mode is airborne or far enough away (`TAKEOFF_CLEAR_M` = 400 m).
- A held group may park an aircraft on an airfield with `pilot.takeoff: true`; `spawnInto` settles the parked spawn onto the terrain.
- Airfield Strike's two defenders are Zeros parked on Dulag's runway at local z = +650 and +740, unchocked, `pilot { skill: 'green', takeoff: true }`. They scramble off the field instead of appearing in mid air.
- `takeoff-range` (dev scenario, "Takeoff (dev)" on the title screen): player Hellcat chocked at Tacloban, two allied veteran Zeros taking off from Dulag.
- `__ww2.aircraft()` rows carry `takeoff: TakeoffPhase | null`.

## 2. Measured numbers

| What | Value | Where |
| --- | --- | --- |
| Zero takeoff run | 267 m (`ZERO_TAKEOFF_RUN_M`) | Tier 1 |
| Hand-off, ai-1 / ai-2, sim seconds | 50.2 / 61.1 | Tier 2, desktop, `takeoff-range` |
| Hand-off, ai-1 / ai-2, sim seconds | 50.15 / 60.15 | Tier 2, nexus 680M |
| gpu p95 with the takeoff | 7.683 ms over 638 samples | desktop, 1440p, under `hwlock ryzen` |
| gpu p95 baseline, `recovery.spec.ts` (no takeoff) | 7.622 ms over 2512 samples | same setup |
| Validation errors | 0 | Tier 2 |

The takeoff adds nothing measurable to the frame; the 1440p budget is the tier's standing red baseline (7g handoff, open item 1).

## 3. Rulings and findings

- **Spot z = +750 was on the runway's end edge, and fell through the ground in the app** (found 2026-09-28). Dulag's runway is 1500 m long, so local z = 750 is exactly the end. The app's cover raster classes anything outside the firm runway rectangle as soft or forest; forest is never a supported contact (`supportedContact`), so the parked Zero free-fell 2.4 m and registered a destroyed impact at tick 54, frozen in mode `takeoff` phase `wait`. Tier 1 has no cover data, so it never saw this. The spot moved to z = +740 in both scenarios, and `airfield-strike.test.ts` now asserts every defender spot is at least 5 m inside the runway. **Any future parked spawn needs the same margin, and any Tier 1 test of parked-on-runway behavior is blind to cover.**
- The plan's checkboxes for Tasks 1-3 were committed unticked; corrected when 7h resumed. Suggestion: tick the plan in each task's own commit so `git log` reconstructs progress.
- The `impact` row of `__ww2.aircraft()` keeps showing the stale takeoff phase for an aircraft that has crashed (`pilotTick` returns an impacted entity unchanged). Not changed.

## 4. Tier 2 captures

`tests/e2e/takeoff.spec.ts` writes `test-results/takeoff-handoff-tacloban.png` (gitignored). No camera follows an AI, so the assertions are numeric: both Zeros roll and leave takeoff mode inside 90 s of sim time, the player is untouched, no impact, zero validation errors.

## 5. Open items

1. `takeoff.spec.ts` is red on the 1440p budget (7.68 ms against 6.0), like `recovery.spec.ts` (7.62 ms). Same baseline; the assertion is kept so it goes green when the baseline does.
2. Taxiing is not modeled: a pilot rolls from where it is parked.
3. Fuel is not scenario content, so the 7g fuel trigger is still dormant.

## 6. Mark's viewing steps (final checkpoint)

1. Start `npm run dev:lan` in this worktree, assert `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/` prints `200` (the primary slot may be another session's; check first).
2. Open the title screen with Dev on, pick "Takeoff (dev)", and watch Dulag's runway from the Hellcat (press T for triple time): two Zeros roll one after the other, lift off and climb away.
3. Fly Airfield Strike: the two defenders now start on Dulag's runway when you cross the scramble ring.

## 7. Test evidence

- Touched Tier 1 files pass on nexus (`airfield-strike.test.ts`, `options.test.ts`, `sortieFlow.test.ts`, `titleScreen.test.ts`: 76 tests).
- `remote-run npm run verify` (2026-09-28): typecheck, lint and depcruise clean; 3766 tests pass. Under shared ryzen load three tests timed out (`kitAircraft` Blender, `boundary` probe check, `skyLoad`); each passes re-run alone. One real failure, `envelope.test.ts` (7c §7: no file under `src/sim/ai` may name a content aircraft id), was `takeoff.ts` comments naming `a6m2-zero`; reworded, and it passes.
