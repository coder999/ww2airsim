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
| 4 | Roster status `discharged`; `dischargePilot` scores nothing for the sortie and keeps what earlier landings banked (FF-6 as amended by Mark, 2026-09-26); resurrection works as it does for K.I.A. The title row and chip read DISCHARGED; the Dossier reads "Discharged" and "… · Discharged". | `71ab0e9` |
| 5 | `main.ts` wraps the three debrief builders and banks a discharge through `dischargeInRoster`. The combat readout leads with `CEASE FIRE! YOU'RE HITTING FRIENDLIES!` for 300 ticks (5 s), then a persistent `FRIENDLY FIRE` tag. | `71a5c40` |
| 6 | `friendly-fire-range` ("Friendly Fire (dev)"), its Tier 1 test and Tier 2 spec, and [the note for M2](../superpowers/notes/2026-09-26-friendly-fire-for-m2.md). | `6bb79da` |
| 7 | Shape-pin fix found by verify; these docs; Tier 2. | `078ac18`, `aab2d27`, this commit |
| — | Mark's ruling: `f6f-2` moved and declared axis. | `75db4b5` |

## 2. Verification

- **Tier 1:** `remote-run npm run verify` at `75db4b5` (after the `f6f-2` move): rc=0. 233 files (232 passed, 1 skipped); 2,427 tests passed, 21 skipped. The skips are the M0 Blender tests; ryzen has no Blender. The first run, at `6bb79da`, failed one test: `gunneryFrame.test.ts` pins the exact diagnostics shape and lacked the new `friendlyFire: null`. That is fixed in `078ac18`.
- **Sim bit-identity:** the 7e digest probe (`.superpowers/ff/hash.ts`, gitignored) ran at `6bb79da`. Stripped and motion digests are identical to the `7d8dc22` baseline for all nine runs (seven shipped scenarios plus two fx runs, 1,800 ticks each). No shipped trajectory changed.
- **Tier 2 (reference GPU, RX 6700 XT, 1440p), 2026-09-26, from slot 2 after `ai-7e`'s dev server was stopped on Mark's instruction.** Final run, after Mark's FF-7 amendment:
  - `friendly-fire.spec.ts`, two tests, both passed with zero validation errors:
    - **Death** on `friendly-fire-range`: fire on the wingman, then dive into the sea. The run shows the radio call, then KILLED, `KILLED — forfeit (×0)`, score 0 and no Continue. The roster row reads "— KIA" and the Dossier "K.I.A.". gpu p95 **2.422 ms**.
    - **Survival** on `friendly-fire-field`: fire on the parked ally, then hop and land. The run shows DISHONORABLE DISCHARGE, `LANDED — forfeit (×0)`, score 0 and no Continue. The roster row and chip read DISCHARGED, and the Dossier "Field landing · Discharged". gpu p95 **2.103 ms**.
  - `meta-game.spec.ts` and `meta-game-relaunch.spec.ts`, which read debrief text: both passed (earlier run).
  - `entities.spec.ts`, re-run for the `f6f-2` move: 3 passed, including its frame budget.
  - Captures:
    - [warning](2026-09-26-friendly-fire-shots/friendly-fire-warning.png)
    - [killed](2026-09-26-friendly-fire-shots/friendly-fire-killed.png)
    - [discharge](2026-09-26-friendly-fire-shots/friendly-fire-debrief.png). This one is from the run before the last text fix: its detail still ends "Nice job. You brought her back in one piece.", which is now dropped and pinned by Tier 1.
    - [Dossier](2026-09-26-friendly-fire-shots/friendly-fire-dossier.png)
  - **Two measurements that led somewhere else.**
    - The first two runs failed the budget at 8.50 and 8.53 ms. A phase probe found the cause in the entry path, not in friendly fire. The same scenario measures 2.0–2.4 ms booted by URL and 6.9 ms switched to from the title (open item 2).
    - A back-to-back `furball.spec.ts` control on the same slot read 2.06 ms.
  - Both tests boot by URL.
- **Whole-branch review** (fresh context, most capable model): ready to merge with fixes; no Critical findings. Its one Important finding is open item 1 below.

## 3. Open for Mark

1. **RESOLVED (Mark, 2026-09-26): `f6f-2` moved and made an enemy** (`75db4b5`). The review found the parked gunnery target 56 m in front of now-allied `tacloban-hangar-3`, with the AAA 58 m past it heading north.
   - It now stands at runway-local (40, −500): beside the strip's east edge, 502 m up it, in the tree-free runway corridor, on dry, flat ground.
   - `"side": "axis"` is declared in free-flight and deck-quals.
   - A line-of-fire test (`tests/sim/entitySides.test.ts`) checks 16 approach directions and 400 m of overshoot. It failed on the old spot and passes on the new one.
   - As you accepted, the free-flight and deck-quals digests change. The other seven runs are unchanged.
2. **NEW, pre-existing, also on `main`: an in-place scenario switch keeps the boot scenario's clouds.** `main.ts` sets `cloudLayers` once, at boot, from the boot bundle (`main` line 1077); `loadScenario` never resets it.
   - Every scenario launched from the title therefore flies under free-flight's cumulus and cirrus, even one that declares no clouds.
   - This also costs GPU: friendly-fire-range at 800 m reads 6.9 ms p95 under the leaked deck, against 2.0 ms without it.
   - It belongs to the cloud system (`docs/clouds.md`), so it is not fixed here.
3. **RESOLVED (Mark, 2026-09-26): an Essex now takes rounds below its flight deck, and not below the waterline.**
   - The cause: a flight deck read as solid all the way down, and the deck (32.9 m) overhangs the hull (28.3 m), so a round from abeam died on that column before reaching the hull.
   - A deck now stops a round only where it crosses the deck's top surface from above (`deckHit`, closed form). That crossing is a hit on the ship, overhang included.
   - Below the deck, the hull box, which starts at the waterline, is what a round meets. The sea stops any round that reaches it first.
   - Tests: `tests/sim/weapons/hullBelowDeck.test.ts`. It passes 8 of 8; on the old code, 4 fail (abeam at 5, 10 and 15 m, and the overhang).
   - Weapons, strike and contact tests pass, and all nine digests are unchanged.
4. **RESOLVED (Mark, 2026-09-26): the dead cannot be discharged.** A friendly-fire death is stamped KILLED and banks the pilot K.I.A. The sortie is still forfeit: 0 points, and none of its kills credited. Only a survivor, landed or ditched, is discharged. This supersedes FF-7 ("discharge beats K.I.A."). A discharge debrief also no longer appends the landing's "Nice job" sentence. `friendly-fire-field` ("Friendly Fire: Field (dev)") is the survivable test bed.
5. **For later (Mark, 2026-09-26): posthumous promotion**, a feature of the 1991 *Hellcats Over the Pacific*. A pilot whose points earn a promotion, and who then crashes or dies, should still be promoted posthumously. Today a death banks nothing: `RECOVERY_MULTIPLIER.killed` is 0 in `src/render/debrief.ts`, so a killed sortie scores 0 whatever it destroyed. So this needs a scoring decision first:
   - credit a killed sortie's points at some multiplier, then promote on them;
   - or promote on the points without banking them.

   Not started. It is also listed in §15's meta-game row.
6. **`npx playwright test <name>` currently collects nothing.** `strike.spec.ts` imports `src/render/content.ts`, which reads `import.meta.env` and cannot load in Node, and one unloadable file aborts collection of every file. Passing spec *paths* works. This is pre-existing and not changed here.
7. **Deferred minors from the review.**
   - `friendly-fire.spec.ts`: a failure message says "the axis Hellcat was hit" for an assertion that it was *not* hit.
   - *Resolved 2026-09-26 by Mark's FF-6 amendment:* the Dossier log no longer disagrees with the career after a forfeit, because a discharge no longer takes back what an earlier landing banked.
8. **Spec §9 leftover:** mission `destroy` objectives aimed at an allied entity are unchecked (for M3/M4).
9. **Viewing:** `https://ww2airsim-2.windomlane.org/?scenario=friendly-fire-range` (returned 200 at handoff).
   - Boot it by URL, for the cloud reason in item 2.
   - For `f6f-2`'s new spot, use `https://ww2airsim-2.windomlane.org/` (free-flight).
   - The page is served live from this worktree's dev server on port 5175, with a local-only `vite.config.ts` edit. That server stops if nexus reboots.

## 4. Rulings

FF-1 to FF-10 are in the plan. Rulings made during execution are in the ledger (`.superpowers/sdd/2026-09-26-friendly-fire/progress.md`, gitignored):

- Task 1 (R-E1, R-E2): `checkScenarioSides` runs after the mission deck check. Three test fixtures now say `cv-1` is allied.
- Task 3: the end-to-end debrief tests use strike-range and free-flight, because `friendly-fire-range` did not exist until Task 6. `show()`'s DOM has no Tier 1 test, since the suite runs in Node; Tier 2 covers it.
- Task 4:
  - the status chip is a pure `pilotStatusChip`;
  - `applyMissionResult` is unchanged, because it already clears `discharged`.
- Task 5:
  - a discharge never reports a promotion;
  - the warning window is `[tick, tick + 300)`.
- Task 6: the wingman and bandit in `friendly-fire-range` have no AI pilot, so the Tier 2 flow is deterministic.

## 5. Merging

- **E1 (now on `main`):** only `src/render/main.ts` conflicts (`git merge-tree`, 2026-09-26). The impact debrief site is the likely hunk, where E1 removed `impactEffect`. Keep E1's removal and this branch's `withDischarge(...)` and `discharged` argument. `combat.ts`, `dist.test.ts`, README and §15 merge cleanly.
- **M2 (not yet executed):** see [the note for M2](../superpowers/notes/2026-09-26-friendly-fire-for-m2.md). It covers the radio line feed, dropping the readout's transient segment, denying the badge on a discharged flight, and the shared trailing parameter on `bankMissionResult`.
