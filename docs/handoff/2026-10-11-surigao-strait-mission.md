# Surigao Strait mission: handoff (2026-10-11)

**Plan:** `docs/superpowers/plans/2026-10-11-surigao-strait-mission.md`.

**Branch:** `surigao-strait-mission`, worktree `/home/mark/projects/ww2airsim-surigao-strait`, cut from `main` `b8c17fb7e09cb3a44e668ad5568e0678736aff39`. Pending review and merge; no deployment was attempted.

**Run:** unattended. Mark's checkpoint is the final product below.

## Look at it

The branch is not served on a shared windomlane slot. After merge, pick **Surigao Strait** on Sortie Orders. The mission opens at 06:30 with the F6F airborne, about 8.7 miles north of *Mogami* and pointed within five degrees of her. Use the recommended **Both** loadout, sink *Mogami*, then turn north and recover aboard Essex. The battle line behind you exchanges real main-battery fire with the representative Japanese rear guard.

No review captures were accepted. A local-nexus Playwright attempt reached Sortie Orders but exposed an old selector mismatch: ribbon SVG text is part of each custom radio's accessible name, and the helper first used native `check()` on a `div[role=radio]`. Its first correction still passed a title-rooted locator to Playwright's relative `has` filter, so review correctly found that it could never match inside a candidate radio. The follow-up now filters each radio by its own `hasText`, asserts exactly one match, and clicks it. Per instruction this correction was not rerun in a browser; the headless product contract is complete, and the three captures remain a review task after merge or on the reference Windows GPU.

## Mission result

`content/scenarios/surigao-strait.json` adds the tenth shipped mission without a new model, AI mode, objective kind or sound asset.

- *Fuso* and *Yamashiro* do not appear: both are already sunk by dawn.
- Player: F6F-5 Hellcat, airborne at 1,500 m, heading south at 120 m/s.
- Recommended loadout: **Both**. Bombs alone provide 240 damage and cannot complete the primary objective. A production `stepCombat` regression deliberately misses one bomb and one rocket, then proves the remaining bomb, five rockets and 30 direct .50-cal hits sink *Mogami* with 20 HP of margin; those hits use only 1.25% of the F6F's 2,400 rounds.
- Primary objectives: sink *Mogami*, then recover aboard Essex.
- Secondary objective: destroy two ships in the representative rear guard.
- Allied battle line: Pennsylvania, Cleveland and Fletcher classes.
- Rear guard: Abukuma, Shiratsuyu and Kagero classes.
- Weather: dawn at 06:30, light cumulus and cirrus, light northeast wind.
- Three mission calls are deliberately text-only and enrolled in `RADIO_LINES`.
- A unique 44-unit Surigao ribbon is enrolled with the picker badge.

## Geometry and anti-auto-complete contract

The mission stages the action near the committed Surigao Strait orientation point, 9.08 km east and 70.39 km south of the world centre (about 5.6 by 43.7 miles).

The surface action and pursuit are separated deliberately:

- every Allied battle-line ship explicitly targets only `abukuma`, `shigure`, and `rear-destroyer`;
- every Japanese rear-guard ship explicitly targets only the three Allied combatants;
- *Mogami* starts roughly 36 km from the leading battleship, beyond the 25 km main-battery fire-control cap;
- the player starts roughly 14 km from *Mogami* on the pursuit bearing.

A five-minute production simulation proves both groups fire while *Mogami* keeps full health, has no attacker, and remains outside the fire-control cap. All eight ship loops build over the real terrain field.

## Historical and gameplay abstraction

The cited history uses two Naval History and Heritage Command sources: H-Gram 038-2 for Surigao Strait and DANFS *Manila Bay* for the post-sunrise carrier-air pursuit and strikes on *Mogami*.

This is explicitly inspired by the dawn aftermath, not a reconstruction. The six surface combatants represent scattered survivors and Oldendorf's force; the F6F and staged Essex compress escort-carrier aircraft, separate formations and several hours into one playable sortie. The current *Mogami* asset is also a class-level visual representation, not a battle-damage reconstruction.

## Verification

Tests were written red-first. Before the scenario existed, the new mission suite reported six missing-content failures; after the content and one mission-step lifecycle correction it is green.

Focused on nexus:

- `npx vitest run tests/sim/mission/missions/surigao-strait.test.ts` — **7 passed**.
- `npx vitest run tests/sim/mission/content.test.ts tests/render/titleScreen.test.ts tests/render/mission/options.test.ts tests/audio/radio.test.ts tests/render/insignia.test.ts` — **154 passed**.
- `npm run typecheck` — passed after E2E enrollment and again after the reviewed selector/damage-evidence correction.
- `git diff --check` — passed.
- Post-review focused rerun: Surigao mission plus title-screen model, **2 files / 37 tests passed**.

Required Ryzen run:

- `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` — typecheck, lint and dependency-cruiser passed. Vitest reported **412 files / 5,708 tests passed, 11 skipped, 2 timed out** at the global 30-second limit after 464.67 s.
- The timeouts were unrelated existing load-sensitive tests: `tests/render/aiLethality.test.ts` and the entity case in `tests/sim/soak.test.ts`.
- The immediate isolated Ryzen rerun of those two files passed: **2 files / 15 tests**, with the formerly timed-out assertions taking 16.5 s and 14.4 s.
- The Surigao suite itself passed **7/7** inside the full Ryzen run.

Browser flow:

- The earlier local-nexus attempts exposed the custom-radio selector sequence described above and produced no captures.
- The reviewed relative-selector correction typechecks; it was not browser-rerun, as explicitly requested.

## Files and overlap

The functional delta is the scenario plus enrollment in the title picker, ribbon and text-radio registries. Tests cover content honesty, picker parity, radio parity, ribbon width, mission geometry, production bomb/rocket/round damage margin, live surface fire, success/failure and the browser-flow declaration. `MASTER_PLAN.md` and `GAMEPLAY.md` describe the branch as pending merge.

Overlap with the other 2026-10-11 tracks is low. C4 asymmetric engine-loss yaw should touch flight/damage code and tests, none used here. Drivable ground vehicles may touch title/product tests and the standing docs, so expect ordinary textual conflicts in `MASTER_PLAN.md`, `GAMEPLAY.md`, and possibly exact scenario-option arrays; the Surigao scenario and mission suite are isolated.

## Remaining review risks

1. Run the single Surigao mission E2E on the reference Windows GPU and retain `f-surigao-strait-{briefing,chart,debrief}.png`.
2. Human-fly the mixed-weapon attack and carrier recovery; production tests prove the damage margin and outcomes, not that the sortie feels well paced.
3. The representative fleet composition and Essex staging are deliberate abstractions and should remain named as such in player-facing history.
