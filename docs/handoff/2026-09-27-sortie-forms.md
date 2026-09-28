# Sortie forms handoff (2026-09-27)

Branch `worktree-sortie-forms`, **merged to `main` 2026-09-27** (Mark), after this
handoff was written; not deployed. Plan:
[2026-09-27-sortie-forms.md](../superpowers/plans/2026-09-27-sortie-forms.md).
Spec: [2026-09-27-sortie-forms-design.md](../superpowers/specs/2026-09-27-sortie-forms-design.md),
amendments A1-A6. Ledger:
`.superpowers/sdd/2026-09-27-sortie-forms/progress.md`.

**Viewing checkpoint: the final product only. Run: unattended (Mark,
2026-09-27).** The captures in §4 are the checkpoint. Tasks 1-7 and most of
Task 8 were executed by one session (Codex); a second session resumed Task 8
from its uncommitted state, and finished it.

The title is now four forms: Squadron Roster, Sortie Orders, Aircraft
Assignment and Ordnance Requisition. A **Dev** checkbox on the roster lifts
every eligibility rule. A sortie that needed Dev is not recorded, and its
debrief says so. The player is drawn as the aircraft chosen; the default
Hellcat now uses its own model, not the Wildcat's. `?scenario=<id>&launch`
skips the forms (always a Dev sortie).

## 1. What changed

| Commit | Task | What |
| --- | --- | --- |
| `9cb2222` | 1 | `side` and `carrierCapable` on every aircraft spec; `src/sim/sortie.ts`, the pure rules (eligibility, validation, the Dev-sortie test, the player-spec swap, the Dev stores layout). A default sortie is pinned bit-identical to the old world for every shipped scenario. |
| `49d5c57` | 2 | Scenario facts restated in `SCENARIO_OPTIONS` and pinned against each file (SF-R7); the `dev-` fixtures and test ranges become Dev-only (A1); the flyable catalog; `src/render/sortieFlow.ts`, the pure form model. |
| `0b1dd04` | 3 | One `SortieChoice` into the flight: the chosen spec, Dev stores, validation, and the Hellcat drawn with its own R3 model (A4). |
| `8924510` | 4 | A Dev sortie records nothing and its debrief says `Dev sortie: not recorded` (A5); DEV-build-only `?recordDevSorties` (SF-R6). |
| `e9b07f5` | 5 | The four forms, the Dev checkbox, descriptions on every form. |
| `dd3d7ec` | 6 | `?launch` quick launch, always a Dev sortie (A6). |
| `cc30211` | A4 follow-up | A rigged airframe hangs its flying spec's stores; the R3 guard that refused this failed the first GPU boot. |
| `e76cf03` | 7 | The Tier 2 harness walks four forms; `quickLaunch`; every existing spec migrated. |
| This commit | 8 | `tests/e2e/sortie.spec.ts`; `cloudShadow.spec.ts`'s blank-frame race fixed; the `playerModel()` / `sceneAirframeModels()` diagnostics; a new airframe root primed before its first frame; `ordnance.spec.ts` re-tuned for the Hellcat's own racks, with its pause race fixed; captures, this handoff, §15 and README. |

## 2. Measured numbers

- **`remote-run npm run verify`: rc=1, and not because of this branch.**
  285 files: 283 passed; 3,269 tests passed, 1 skipped (the pre-existing
  one), 2 failed. Both failures are 120 s timeouts in sky-noise inflation
  (`gunzip.test.ts`, `skyLoad.test.ts`) while another worktree was rendering
  FX on ryzen. Both files pass alone on nexus (4/4, 114 s), and the branch
  touches none of their code. Typecheck, lint and depcruise were green. An
  earlier `verify` run beside this session's own Tier 2 run timed out in
  four files the same way. On the merge, `verify` again failed only on
  timeouts, and each file passed when re-run alone. These load-dependent
  timeouts are not tracked as an open item (Mark, 2026-09-27).
- **Tier 2, targeted** (`sortie.spec.ts`, `ordnance.spec.ts` and the nine
  specs Task 7 touched: title, mission-ui, friendly-fire, furball,
  scenarioPicker, meta-game, meta-game-relaunch, dossier, missions; 25 tests)
  on the RX 6700 XT through slot `ww2airsim-2`:

  | Run | Result | Duration | Note |
  | --- | --- | --- | --- |
  | 1 | 24/25, rc=1 | 15.8 min | `ordnance` failed on its own race (below), fixed |
  | 2 | 24/25, rc=1 | 16.3 min | `mission-ui`'s 15 s wall-clock `landAndStop` timed out while this session's own `verify` loaded ryzen; passed 2/2 alone right after (1.9 min each) |
  | 3 | **25/25, rc=0** | 14.7 min | quiet machine |
  | full suite | 179 passed, 8 failed, 2 skipped, rc=1 | 51.3 min | 44 spec files; `strike.spec.ts` excluded (§5) |

- **GPU budgets, before (`main`) and after (this branch), back to back under
  `hwlock ryzen`:**

  | Spec | Gate | `main` (`c1c4a59`) | branch (2 runs) |
  | --- | --- | --- | --- |
  | `terrain.spec.ts` 1440p | p95 < 6.0 ms | 6.468 ✗ | 6.329 / 6.406 ✗ |
  | `entities.spec.ts` 1440p | p95 < 8.33 ms | 7.160 | 7.174 / 7.141 |
  | `budget4k.spec.ts` High, `in-deck-1900` | p95 ≤ 20 ms | 20.136 ✗ | 21.329 / 21.707 ✗ |
  | `budget4k.spec.ts`, the other 17 views | | | each within 0.1 ms of `main` |

  The Hellcat's own model costs nothing measurable, except in the in-cloud
  4K High view, where the branch reads about **1.2-1.6 ms slower** (one
  `main` sample, two branch samples; this view has the fewest samples and the
  widest spread). That view is over its gate on `main` as well.

- **The full suite's 8 failures, checked against `main`** (`bc64642`, the
  same specs on the primary slot, under `hwlock ryzen`):

  | Failure | On `main` | Verdict |
  | --- | --- | --- |
  | `terrain.spec.ts` 1440p budget | fails (6.468) | pre-existing |
  | `budget4k.spec.ts` High `in-deck-1900` | fails (20.136) | pre-existing, branch +1.2-1.6 ms |
  | `motionBudget.spec.ts` (4.19 vs ≤ 3.745) | fails (4.23) | pre-existing |
  | `terrainTextures.spec.ts` runway and low-land-600 | both fail (8.05, 7.64) | pre-existing |
  | `sun.spec.ts` "noon sky is blue" | fails | pre-existing |
  | `cloudShadow.spec.ts` deck darkens | passed, **by accident** | test race, fixed on this branch (§3) |
  | `ai-pursuit-difficulty.spec.ts` "never got behind" | 4/4 green | known flake (§5); branch 3/5 |

## 3. Rulings

### Plan rulings

- **SF-R1** `side` is `'allied' | 'japanese'` and gates eligibility only;
  combat sides still come from `sideOf`, and a grep test pins that
  `src/sim/weapons/` and `src/sim/ai/` never read it.
- **SF-R2** The Dev stores layout is read from `f6f-hellcat.json`, not copied.
- **SF-R3** A dev-stores player gets a derived spec key
  (`<id>~dev-stores`) with `spec.id` unchanged, so credit and the Dossier are
  unaffected and an AI of the same type keeps its stores-free spec.
- **SF-R4** Default loadout: the recommendation if allowed, else `both` if
  allowed, else `clean`, so `startGame(page)` still flies the old sortie.
- **SF-R5** Changing the mission resets the aircraft to that mission's own.
- **SF-R6 — kept (Mark, 2026-09-27).** `?recordDevSorties` is a **DEV-build-only**
  switch that makes a Dev sortie record anyway. It exists only so Tier 2 can
  still prove the banking chain end to end from the now Dev-only test beds:
  friendly-fire K.I.A. and discharge, and the `dev-mission-ui` fixture's
  badge. A production build ignores it (pinned by a Tier 1 test). The
  alternative, dropping it and asserting `Dev sortie: not recorded` instead,
  would have lost the only end-to-end banking proof.
- **SF-R7** Scenario facts the forms need before any fetch are restated in
  `SCENARIO_OPTIONS` and pinned against each file (M2 R5's pattern).
- **SF-R8** The `(dev)` labels stay.
- **SF-R9** A quick launch builds the title and hides it at once, so
  Return to title works normally.

### Addenda

- **AD-1** The harness picks the mission by whole label. `exact: true` could
  not find a *checked* row (its accessible name carries the box's `✕`), so it
  uses `wholeLabel()`, a regex anchored at the end.
- **AD-2** A K.I.A. or discharged pilot launching a Dev sortie is not
  resurrected. It is covered by `sortie.spec.ts` (both statuses, with a
  control case proving the test can see a resurrection).
- **AD-3 — declined.** Forms 2-4 stay in `titleScreen.ts`. They share the step
  machine, focus, Enter handling and boot lock; splitting them out would mean
  threading that state through a new interface.

### Execution rulings (full text in the ledger)

- **Task 2** `storesLine` takes a store-id-to-name map from the Library
  ordnance entries, because stores types carry no name.
- **Task 3: A4 moved content.** Drawing the Hellcat with its own model broke
  two assertions the plan did not foresee, and the content was fitted to the
  drawn model (R3's rule: the assertion wins): `gear.heightM` 2.2 → **2.42**
  (it was an estimate) and the racks and rails re-measured on the Hellcat's
  own wing. Two pins were re-recorded, each proven content-caused: the strike
  bomb fall (1061 → 1060 ticks) and the Tacloban landing rest point (+1.1 m).
  The Hellcat's `view.eyePointM` is unchanged from the Wildcat era and was not
  re-measured (see §5).
- **Task 4** The Dev stamp is applied once, in `showDebrief`, the single
  merge point for all three debrief sites. A Dev sortie shows its would-be
  score with no banked total.
- **Task 5** An empty flyable catalog (only the constructor default) shows no
  aircraft rows with Next disabled, rather than a fake row; `main.ts` always
  passes the real catalog.
- **Task 6** A quick launch leaves audio suspended until the first click,
  because there is no New game gesture.
- **Task 7** `launchFromOrders` (Next, Next, Launch) was added and the
  simple specs converted mechanically; mission-ui, friendly-fire and missions
  were migrated by hand.
- **Task 8, test shape.** The quick-launch test flies `pursuit-range`, not the
  plan's `free-flight`: `diveToSea` can only end an airborne flight. The model
  test and the Dev-Zero bomb test fly from the DEV spawn override for the same
  reason. The bomb test asserts a projectile exists and the stores drop to 1.
- **Task 8, the stale root.** `buildScenarioEntities` now calls
  `updateWorldMatrix(true, true)` on each new airframe root as it is added. An
  aircraft-only switch replaces the root between two rendered frames, and the
  first frame otherwise reused the outgoing model's world state. A Tier 1 test
  pins the call; `sceneAirframeModels()` proves in Tier 2 that no stale root
  is left in the scene.
- **Task 8, `ordnance.spec.ts`.** The Hellcat's own racks sit 1.9 m lower and
  further aft than the Wildcat-measured ones, so the falling bomb crossed the
  tailplane and then the follow-view bar. The spec now hides the bar (`I`)
  and samples at 66 ticks. The resuming session also found a race: the test
  read the bomb's position immediately after `Escape`, but pause is latched to
  a later frame, so in run 1 the sim ran 11 ticks further (66 → 77) and the
  sampled disc sat on the wing root, which scored 0.938 "contrast". The spec
  now waits for the tick counter to stop before sampling. Four runs since:
  bomb at NDC (-0.10 to -0.11, -0.81 to -0.84), contrast **0.198-0.210**, and the empty-sea
  control rings read under 0.02.
- **Task 8, `cloudShadow.spec.ts`.** Its `fixedView` hid the title and waited
  a fixed second, and the canvas was still flat gray (mean 126.3, sd 0.0002)
  when it took the capture. On `main` the `off` capture of the deck test is
  that blank frame too, so the test compared a blank frame with a real one and
  passed by accident. On the branch both captures were blank, and it failed.
  `fixedView` now waits until the band below the HUD shows structure
  (sd > 2). Two runs since: deck mean gray 48.8 → 19.7 under the cloud.

## 4. Captures

All at 2560×1440 on the reference GPU, in
[`2026-09-27-sortie-forms-shots/`](2026-09-27-sortie-forms-shots/). Each was
looked at before this was written.

- [`sortie-form-1.png`](2026-09-27-sortie-forms-shots/sortie-form-1.png) —
  Squadron Roster, `Form 1 of 4`, with the Dev checkbox under Enlist.
- [`sortie-form-2.png`](2026-09-27-sortie-forms-shots/sortie-form-2.png) —
  Sortie Orders: Missions and Ranges, and Carrier Qualification's briefing,
  history, objectives and conditions.
- [`sortie-form-3.png`](2026-09-27-sortie-forms-shots/sortie-form-3.png) —
  Aircraft Assignment on a carrier mission without Dev: Wildcat and Hellcat
  only, with the Hellcat's particulars.
- [`sortie-form-4.png`](2026-09-27-sortie-forms-shots/sortie-form-4.png) —
  Ordnance Requisition: `Clean (recommended)` preselected.
- [`sortie-hellcat-parked-tacloban.png`](2026-09-27-sortie-forms-shots/sortie-hellcat-parked-tacloban.png)
  — the default Hellcat, its own model, parked at Tacloban with bombs and
  rockets hung. The wheels sit on the strip; nothing floats.
- [`sortie-hellcat-on-essex.png`](2026-09-27-sortie-forms-shots/sortie-hellcat-on-essex.png)
  — the same on the Essex (`deck-quals`). The wheels sit on the deck.
- [`sortie-dev-zero-bombs.png`](2026-09-27-sortie-forms-shots/sortie-dev-zero-bombs.png)
  — the Dev Zero, drawn as the Zero, with two bombs at the Hellcat stations,
  in flight.

## 5. Open items

- **The Hellcat's eye point was not captured** (no cockpit-view capture);
  Mark expects it to be fine (2026-09-27).
- **The Essex deck reads very dark** (deferred: ship visuals need a pass generally, Mark 2026-09-27) in the deck capture, on `main` too
  (the same view in `cloudShadow.spec.ts` reads mean gray 19.7 under cloud).
  `deckQuals.spec.ts`'s deck-brightness assertion passed in the full run, but
  it had failed (1.89 against ≤ 1.5) in the interrupted run before this
  session resumed.
- **`ai-pursuit-difficulty.spec.ts` is a known flake**, not a regression here:
  the Plan 7e handoff (§ open item 5) records it red in 1 of 3 runs on the
  code this branch was cut from. It holds keys for wall-clock durations while
  the world flies through the terrain load. It was red in 2 of 5 runs on the
  branch and green in 4 of 4 on `main`, which also has Plan 7f's AI changes
  the branch lacks. Mark's ruling (2026-09-27): a weak test by design (see
  the 7c handoff §5), left as a known flake; not investigated further.
- **Six Tier 2 budget and visual tests fail on `main` too** (§2): terrain
  1440p, budget4k `in-deck-1900`, motionBudget, both terrainTextures budgets,
  and `sun.spec.ts`'s noon-sky check.
- **Friendly-fire's landing case is intermittent after the merge:** red in 1
  of 5 runs. It landed cleanly ("back on the wheels, not a crash") and braked,
  but the landing debrief did not appear within `landAndStop`'s 30 s.
  Not investigated.

### Closed after this handoff was written (2026-09-27)

- **Merged** as `cab7fa1` (one §15 conflict, resolved by keeping `main`'s
  rows and adding the sortie-forms sentence). On the merge, the 12 specs where
  the two sides overlap ran 31/32. The failure was friendly-fire's death case,
  which held full nose-down and flew an outside loop (bottomed at 99 m, 3/3
  runs); it now uses `diveToSea` (`1bb34b8`).
- **`tests/e2e/strike.spec.ts` loads and passes again** (`af8ed17`,
  `3e75168`). It had imported `src/render/content.ts`, whose module-scope
  `import.meta.env` crashes Playwright's Node loader and aborted any run that
  included it; the two values it needed moved to `src/render/fetchedLevel.ts`.
  Its Restart test then failed on a stale 120 HP (Tacloban's hangars); Dulag's
  hangar has been 90 HP since Plan 13d. 5/5 twice, gpu p95 3.48 ms.
- A quick launch starts with audio suspended until the first click (Task 6).
