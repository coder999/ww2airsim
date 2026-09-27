# Handoff: friendly fire and dishonorable discharge

Dated 2026-09-26. Branch `worktree-friendly-fire`, worktree
`.claude/worktrees/friendly-fire`, cut from `main` at `7d8dc22` (which includes
Plan 7e). **Not merged.** Spec
[`2026-09-26-friendly-fire-design.md`](../superpowers/specs/2026-09-26-friendly-fire-design.md),
plan [`2026-09-26-friendly-fire.md`](../superpowers/plans/2026-09-26-friendly-fire.md).
The plan's header: final-product viewing checkpoint, unattended.

## 1. What shipped

| Task | What | Commit |
| --- | --- | --- |
| 1 | Every ship and structure has a side. Ships take the scenario key `ships[].side`; structures take their airfield's side (base `side`, overridden per scenario by `airfieldSides`). Tacloban is allied, Dulag axis, `cv-1`/`dd-1`/`dd-2` allied, `maru-1` axis. Sides are validated at world build, and each message names the entity. | `45665e3` |
| 2 | `AircraftCombat.friendlyFire` records the first damage an aircraft does to its own side (round, bomb, rocket or blast; not itself, not wreckage). Own-side ship and structure destructions count only in `friendlyKills`. | `f3e7b55` |
| 3 | `withDischarge` (`src/render/discharge.ts`) overlays DISHONORABLE DISCHARGE on all three debriefs: red stamp, score 0, every row 0 points, `Recovery: … — forfeit (×0)`, a "Friendly fire" figure, no Continue. `outcome` stays physical (FF-5). | `d802729` |
| 4 | Roster status `discharged`; `dischargePilot` takes the whole flight back off the career and can lower rank (FF-6); resurrection works as it does for K.I.A. The title row and chip read DISCHARGED; the Dossier reads "Discharged" and "… · Discharged". | `71ab0e9` |
| 5 | `main.ts` wraps the three debrief builders and banks a discharge through `dischargeInRoster`. The combat readout leads with `CEASE FIRE! YOU'RE HITTING FRIENDLIES!` for 300 ticks (5 s), then a persistent `FRIENDLY FIRE` tag. | `71a5c40` |
| 6 | `friendly-fire-range` ("Friendly Fire (dev)"), its Tier 1 test and Tier 2 spec, and [the note for M2](../superpowers/notes/2026-09-26-friendly-fire-for-m2.md). | `6bb79da` |
| 7 | Shape-pin fix found by verify; these docs. | `078ac18`, this commit |

## 2. Verification

- **Tier 1:** `remote-run npm run verify` at `078ac18`: rc=0. 233 files (232 passed, 1 skipped); 2,424 tests passed, 21 skipped. The skips are the M0 Blender tests; ryzen has no Blender. The first run, at `6bb79da`, failed one test: `gunneryFrame.test.ts` pins the exact diagnostics shape and lacked the new `friendlyFire: null`. That is fixed in `078ac18`.
- **Sim bit-identity:** the 7e digest probe (`.superpowers/ff/hash.ts`, gitignored) ran at `6bb79da`. Stripped and motion digests are identical to the `7d8dc22` baseline for all nine runs (seven shipped scenarios plus two fx runs, 1,800 ticks each). No shipped trajectory changed.
- **Tier 2 (reference GPU): NOT RUN.** `tests/e2e/friendly-fire.spec.ts` is written, typechecks and lists. It was never run, because every dev-server slot was taken all session:
  - 5173 served `main`;
  - 5175 (`ww2airsim-2`) served the `ai-7e` worktree, whose handoff promises the server stays up for viewing, although 7e is now merged;
  - 5174 (`ww2airsim-3`) served another live session's `o1-ordnance` worktree.

  I did not stop another session's server or add a route. **No viewing URL exists yet for this branch**, and no captures exist. To run it once a slot is free, from this worktree: point the local `vite.config.ts` at the free slot (scratch, never committed), then run `WW2AIRSIM_TUNNEL=1 npx vite --port <5175|5174>` and `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-<2|3>.windomlane.org npx playwright test friendly-fire meta-game meta-game-relaunch`. The review flagged one tight timing: the first readout assertion must land inside the 5 s window.
- **Whole-branch review** (fresh context, most capable model): ready to merge with fixes; no Critical findings. Its one Important finding is open item 1 below.

## 3. Open for Mark

1. **The free-flight gunnery target is parked in front of an allied hangar** (review, Important). `f6f-2` is axis by 7e's default (spec §9) and sits at Tacloban (-90, 100). `tacloban-hangar-3` is now allied, at (-146, 100): same z, 56 m behind it on the x axis. The AAA is 70 m away. A strafing pass along x sends overshoots into the hangar and discharges the pilot for shooting the target the scenario offers him. `deck-quals` parks it there too. The options:
   - move `f6f-2`, which changes the free-flight and deck-quals digests;
   - make it allied (spec §9), which takes away the Shift autopilot's target;
   - accept the risk.

   Not fixed: each option is your call.
2. **An Essex cannot be hurt by rounds that meet it below the flight-deck edge** (found in Task 2, measured 2026-09-26, pre-existing). The 32.9 m deck overhangs the 28.3 m hull box, and `groundHit` reads the deck as ground, so a round fired horizontally from abeam at 5, 10 or 15 m does no damage. Strafing `cv-1` from above discharges the pilot; skimming its side does not. Bombs and rockets hurt it through blast. This lives in E1-era contact code (`nearestContact`), so it is not fixed here.
3. **Deferred minors from the review.**
   - `friendly-fire.spec.ts:56`: the failure message says "the axis Hellcat was hit" for an assertion that it was *not* hit.
   - After land, Continue, friendly fire, the earlier landing's Dossier log line still shows its points and kills, while the career has had them taken back.
4. **Spec §9 leftovers.** `f6f-2`'s side, as in item 1. Mission `destroy` objectives aimed at an allied entity are unchecked (for M3/M4).
5. **Tier 2**, as in §2.

## 4. Rulings

FF-1 to FF-10 are in the plan. Rulings made during execution are in the ledger (`.superpowers/sdd/2026-09-26-friendly-fire/progress.md`, gitignored):

- Task 1 (R-E1, R-E2): `checkScenarioSides` runs after the mission deck check. Three test fixtures now say `cv-1` is allied.
- Task 3: the end-to-end debrief tests use strike-range and free-flight, because `friendly-fire-range` did not exist until Task 6. `show()`'s DOM has no Tier 1 test, since the suite runs in Node; Tier 2 covers it.
- Task 4:
  - the status chip is a pure `pilotStatusChip`;
  - forfeits clamp at zero;
  - `applyMissionResult` is unchanged, because it already clears `discharged`.
- Task 5:
  - `flightPointsBanked` is a `Forfeit` (points *and* kills);
  - a discharge never reports a promotion;
  - the warning window is `[tick, tick + 300)`.
- Task 6: the wingman and bandit in `friendly-fire-range` have no AI pilot, so the Tier 2 flow is deterministic.

## 5. Merging

- **E1 (now on `main`):** only `src/render/main.ts` conflicts (`git merge-tree`, 2026-09-26). The impact debrief site is the likely hunk, where E1 removed `impactEffect`. Keep E1's removal and this branch's `withDischarge(...)` and `discharged` argument. `combat.ts`, `dist.test.ts`, README and §15 merge cleanly.
- **M2 (not yet executed):** see [the note for M2](../superpowers/notes/2026-09-26-friendly-fire-for-m2.md). It covers the radio line feed, dropping the readout's transient segment, denying the badge on a discharged flight, and the shared trailing parameter on `bankMissionResult`.
