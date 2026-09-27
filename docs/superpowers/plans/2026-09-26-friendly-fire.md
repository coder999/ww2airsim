# Friendly fire and dishonorable discharge: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Viewing checkpoints (Mark, 2026-09-26):** final product only.
**Attended:** no, unattended. Open questions get a default, recorded as a dated ruling below and in the ledger. The run stops only for a question that would change what Mark asked for.
**Execution:** native (the writer executes), then one fresh whole-branch reviewer.

**Goal:** Every damageable entity has a side. The player never scores against his own side. Any damage he does to it ends the flight in DISHONORABLE DISCHARGE at every debrief. The roster records DISCHARGED, and the pilot can be resurrected. The first friendly hit gets a radio warning on the existing HUD surface.

**Spec:** `docs/superpowers/specs/2026-09-26-friendly-fire-design.md`, emailed 2026-09-26. Also read:
- master spec §15;
- `docs/handoff/2026-09-26-plan7e-sides.md`;
- `docs/superpowers/specs/2026-09-23-meta-game-design.md`;
- `docs/superpowers/specs/2026-09-25-missions-design.md` §3 and §6.3.

**Where:** worktree `/home/mark/projects/ww2airsim/.claude/worktrees/friendly-fire`, branch `worktree-friendly-fire`, cut from `main` at `7d8dc22`. The branch may be pushed. Nothing is merged into `main`, and `main` is never pushed or deployed.

**Ledger:** `.superpowers/sdd/2026-09-26-friendly-fire/progress.md` (gitignored).

## Global constraints

- **Running tests.**
  - On nexus, run only named files: `npx vitest run <files> --maxWorkers=2`.
  - Run full suites through `remote-run npm run verify`, capturing `rc=$?` directly. The Blender tests (M0) skip on ryzen; that is expected.
  - Never run `git clean -fdx`.
- **The sim boundary.** `src/sim/` imports nothing from `render/`. The new `src/sim/weapons/friendlyFire.ts` imports only `sides.ts`.
- **Collisions with parallel work.**
  - Keep `src/render/main.ts` and `src/sim/weapons/combat.ts` edits small and local; E1 edits both.
  - New logic goes in new modules: `src/sim/weapons/friendlyFire.ts`, `src/sim/sidesCheck.ts` and `src/render/discharge.ts`.
  - Do not touch `scenarioEntities.ts`, the fx code, or `tools/models`.
- **Bit-identity.** No shipped trajectory may change. After every sim task, the stripped and motion digests from `.superpowers/ff/hash.ts` must equal the baseline below. That probe is 7e's, extended with `furball-range` and with `friendlyFire` added to the stripped keys.

  Baseline (2026-09-26, node v22.22.1, `7d8dc22`, 1,800 ticks):

  | Scenario | Stripped | Motion |
  | --- | --- | --- |
  | deck-quals | f5be48c2c641bea5 | 7f4c3d1cf6dedf23 |
  | free-flight | 1bf07decdd1d0f54 | 4e0adbda05f8b7bb |
  | gunnery-range | acb6072ebe4b353f | 23b35004d989ced8 |
  | strike-range | ace29a5a21bac2bf | 70d665f20e4daa95 |
  | pursuit-range | 16aa3f198047656f | 04d3fd22a6ad9650 |
  | pursuit-range-veteran | c8d83c84b6ac1514 | ff8dab07f7919c50 |
  | furball-range | cd40324b566d6ffe | e17ba29ad3422e55 |
  | fx:pursuit-tail-chase | 7669d8e8b175a5d9 | 3aa28bea1ae419a6 |
  | fx:zero-merge | 3b4af75fc98b58e2 | fe3597370beaaac2 |

- **Commits.** Every commit ticks its task's checkboxes and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Rulings (writer, 2026-09-26)

Each ruling is listed with what it costs if it is wrong.

- **FF-1. Where sides live.**
  - Ships carry the scenario key `ships[].side`.
  - Structures inherit their airfield's side: the base-content key `side`, overridden per scenario by `airfieldSides`.
  - Absent means axis, through `sideOf`.

  *Cost:* a per-building side would need a schema key on `BuildingObject`. That is additive, and no content needs it today.
- **FF-2. Tacloban is allied, Dulag is axis.**
  - Tacloban is the player's home field in every shipped range and never an `enemyAirfields` entry. The missions design flies from it as friendly.
  - H1's `japanese` is the building type's ownership in the Hangar, not this instance's.

  *Cost:* a stray round into Tacloban's tower during a gunnery pass now discharges. Task 2 measures the shipped gunnery sortie for this.
- **FF-3. Friendly fire is damage actually applied.** It is damage to an own-side entity that is not yet destroyed, by a round, bomb, rocket or blast.
  - Self-damage is excluded.
  - Collisions are excluded (there is no path for them).
  - Rounds into wreckage are excluded.

  *Cost:* a pilot who shoots only already-sunk wreckage of his own carrier is not discharged.
- **FF-4. Own-side destructions go to `friendlyKills`.** An own-side ship sunk or structure destroyed counts there, never in `shipsSunk`, `structuresDestroyed` or `killsByType`. `friendlyHits` stays rounds on aircraft.
- **FF-5. The debrief's `outcome` stays physical.** Discharge is an overlay (`DebriefModel.discharge`), so the mission engine and the debrief still agree (`recoveryAgreement.test.ts`). A discharge debrief has no Continue.
- **FF-6. The forfeit covers the current sortie only** (*superseded 2026-09-26*). As written, the forfeit covered the whole flight since New game or Restart: points and kills banked earlier in the same flight were subtracted and the rank recomputed. **Amended by Mark, 2026-09-26:** only the kills since the last landing are forfeit. "Say I take off, kill an enemy, then land; then I take off again, kill an enemy and also kill a fellow Hellcat. Only the second enemy kill is forfeit." What an earlier landing banked stays on the career, so a discharge never lowers score, kills or rank. Physical career totals still fold: hours, landings and peaks.
- **FF-7. Discharge beats K.I.A.** When a discharged flight also ends in death, `status` is `discharged`. There is one `resurrections` counter, bumped by `startSortie` for either status.
- **FF-8. The radio warning goes through the combat readout.** The readout is the existing top-center HUD text surface. The warning shows as its first segment for 5 s of sim time, then as a persistent `FRIENDLY FIRE` tag. M2 gets a committed note with the proposed radio-line edit. No new DOM element is added.
- **FF-9. AI friendly fire never discharges the player.** It is recorded on the AI's own record.
- **FF-10. `friendly-fire-range` is a dev scenario.** It is listed in the picker as "Friendly Fire (dev)", as 7e did for the furball, because `?scenario=` only boots listed ids.

## Tasks

### Task 1: Ship and structure sides, content defaults, and validation

**Files:**
- modify `src/sim/sides.ts`, `src/sim/scenario.ts`, `src/sim/world/airfields.ts`, `src/sim/weapons/structures.ts` and `src/sim/loop.ts` (`ShipEntity.side?`, `createWorldOf` parts `airfieldSides?`, the enemy-airfield check);
- create `src/sim/sidesCheck.ts`;
- set content in `content/bases/{tacloban,dulag}.json` and `content/scenarios/{free-flight,deck-quals,strike-range}.json`;
- add tests in `tests/sim/sides.test.ts`, plus fixture sides in `tests/sim/ai/ingress.test.ts` and `tests/sim/mission/recoveryAgreement.test.ts` where they land on or raid `cv-1`.

Steps:
- [x] Write failing tests:
  - `sideOf` on a ship without a side is axis, and with `side: 'allied'` is allied;
  - `airfieldSideOf(airfield, overrides)`: an override wins, then the base `side`, then axis;
  - a structure takes its airfield's side through `createWorldOf`;
  - shipped content resolves to cv-1, dd-1 and dd-2 allied, maru-1 axis, Tacloban's five structures allied and Dulag's two axis;
  - each validation rule rejects, and names the entity in the message:
    - `enemyAirfields` on the player's side (in `createWorldOf`);
    - the player parked on an axis ship;
    - `land` at an axis ship or field;
    - an ingress destination on the raider's side;
    - an `airfieldSides` key that is not an airfield (schema).
- [x] Implement:
  - `airfieldSideOf`;
  - `ScenarioShipObject.side`, `ScenarioShape.airfieldSides` and the airfield `side`;
  - `buildShip` spreads `side` only when content has one, as `sideFrom` does;
  - `createWorldOf` stamps structure `side` and throws on a friendly enemy airfield;
  - `checkScenarioSides(bundle)` is called by `worldFromScenario`.
- [x] Set the content sides (spec §3).
- [x] Run the touched tests with `--maxWorkers=2`.
- [x] Run the digest probe. Stripped and motion must equal the baseline.
- [x] Commit.

### Task 2: Friendly-fire record and own-side credit

**Files:**
- create `src/sim/weapons/friendlyFire.ts` (`FriendlyFire`, `TargetSides`, `isFriendly`, `noteFriendlyFire`);
- modify `src/sim/weapons/combat.ts`:
  - the `AircraftCombat.friendlyFire` field and its `createCombat` literal;
  - a trailing `targetSides` parameter on `stepCombat`;
  - `damageAircraftAt`, `damageStructureAt` and `damageShipAt`;
  - the sinking credit loop;
- modify `src/sim/loop.ts` (`advance` builds `targetSides` and passes it);
- add tests in `tests/sim/weapons/friendlyFire.test.ts`.

Steps:
- [x] Write failing tests. Unit tests use hand-built `stepCombat` inputs; production tests go through `worldFromScenario` and `advance`:
  - A round into an allied hull sets the shooter's `friendlyFire` to `{ kind: 'ship', target: 'cv-1', tick }` on the first hit, and a second hit does not overwrite it.
  - A bomb direct hit and a blast on an allied structure (kind `structure`) score no `structuresDestroyed` or `killsByType.building`, even when the id is in `enemyStructureIds`. The destruction goes to `friendlyKills`.
  - A blast on an allied aircraft is kind `aircraft` (7e's `friendlyHits` counts rounds only).
  - Sinking the allied carrier to the bottom puts `shipsSunk` and `killsByType.carrier` at 0, with `friendlyKills` 1. The same on an axis maru scores as before.
  - Own bomb blast on the shooter itself leaves `friendlyFire` null (FF-3). So do rounds into a hull already destroyed.
  - An AI shooting an allied ship sets the AI's record, and the player's stays null (FF-9).
  - `targetSides: null` is the old behavior.
  - Measure the shipped gunnery sortie through `nextFrameState`: hold Space from the parked spot until target-1 dies. Tacloban's structures must take no damage and `friendlyFire` must stay null. If this fails, stop and re-rule FF-2.
- [x] Implement.
- [x] Run the touched tests, plus `tests/sim/weapons/*.test.ts` and `tests/sim/ai/sidesTick.test.ts`, with `--maxWorkers=2`.
- [x] Run the digest probe (stripped and motion equal).
- [x] Commit.

### Task 3: The discharge debrief

**Files:**
- create `src/render/discharge.ts` (`friendlyFireOf`, `withDischarge`, `DISCHARGE_HEADLINE`);
- modify `src/render/debrief.ts`:
  - add `DebriefModel.discharge?`;
  - `show()` renders the red stamp and the forfeit recovery line;
- add tests in `tests/render/discharge.test.ts`.

Steps:
- [x] Write failing tests:
  - `withDischarge` on the three real builders (a landing report, an impact that is killed or ditched, a destruction) gives the headline DISHONORABLE DISCHARGE, `score.total` 0, every row at 0 points, no `continueLabel`, a "Friendly fire" figure and an unchanged `outcome`.
  - A world with no friendly fire returns the model unchanged (`toBe`).
  - End to end through production `advance`: the player strafes the allied carrier in `friendly-fire-range`. Then, from the same world, a landing model, an impact model and a destruction model are all discharged, and each has total 0.
  - The same flight against the axis maru is not discharged and scores above 0.
- [x] Implement.
- [x] Commit.

### Task 4: The roster, the Dossier and the title

**Files:**
- modify `src/render/roster.ts`:
  - `status` gains `'discharged'`;
  - `startSortie`;
  - `applyMissionResult` keeps `discharged` only through a new bank;
  - add `dischargePilot` and `dischargeInRoster`;
  - validation, including the log entry's `discharged?: true`;
- modify `src/render/dossier.ts` (status and log label) and `src/render/titleScreen.ts` (`pilotButtonLabel` and the status chip);
- add tests in `tests/render/roster.test.ts`, `tests/render/dossier.test.ts` and `tests/render/titleScreen.test.ts`.

Steps:
- [x] Write failing tests:
  - `dischargePilot` sets `discharged`, adds 0 points, subtracts the forfeit points and kills, recomputes rank, increments `missionsFlown`, folds the career and logs 0 points and zero kills with `discharged: true`.
  - `startSortie` on a discharged pilot gives `active` with `resurrections` + 1.
  - A Restart-ed clean landing clears `discharged`.
  - Validation: a stored `status: 'bogus'` loads as active without throwing; a stored `discharged` pilot round-trips; a log entry with `discharged: 'yes'` drops the flag, not the entry.
  - The Dossier shows "Discharged" (with "resurrected n×") and the log outcome "Field landing · Discharged".
  - The title label and the chip read DISCHARGED.
- [x] Implement.
- [x] Commit.

### Task 5: `main.ts` wiring and the radio warning on the combat readout

**Files:**
- modify `src/render/main.ts`:
  - wrap the three builders in `withDischarge`;
  - `bankMissionResult` takes `discharged`;
  - add `flightPointsBanked`, reset where `scoredThroughKillsByType` resets;
  - `combatReadout.setRecord(rec, tick)`;
- modify `src/render/combatReadout.ts`: the `combatReadoutLabel(rec, tick?)` warning segment, and `CombatDiagnostics.player.friendlyFire`;
- add `friendlyFireRadio(world)` in `src/render/discharge.ts`;
- add tests in `tests/render/combatReadout.test.ts` and `tests/render/discharge.test.ts`.

Steps:
- [x] Write failing tests:
  - the label shows `CEASE FIRE! YOU'RE HITTING FRIENDLIES!` first from the hit tick until 300 ticks after it, and then `FRIENDLY FIRE`;
  - with no friendly fire the label is byte-identical to before;
  - `friendlyFireRadio` gives `{ tick, text }` or null;
  - diagnostics expose `friendlyFire`.
- [x] Implement.
- [x] Wire `main.ts` in place. Touch only the three debrief sites, `bankMissionResult`, the two baseline resets and the `setRecord` call.
- [x] Run `npx tsc --noEmit -p .` locally, then the touched tests.
- [x] Commit.

### Task 6: The `friendly-fire-range` scenario, Tier 2 spec, and the M2 note

**Files:**
- create `content/scenarios/friendly-fire-range.json`:
  - the player airborne 250 m behind an allied Hellcat on the same heading and speed;
  - an axis Hellcat 400 m to his right;
  - the allied `cv-1` and the axis `maru-1` anchored within 3 km, with bombs available through the loadout;
- modify `src/render/titleScreen.ts` (the picker row), `tests/render/titleScreen.test.ts` and `tests/build/dist.test.ts`;
- create `tests/e2e/friendly-fire.spec.ts` and `docs/superpowers/notes/2026-09-26-friendly-fire-for-m2.md`.

Steps:
- [x] Write a Tier 1 test (in `tests/render/discharge.test.ts`): through `nextFrameState` with Space held, the allied Hellcat takes a friendly hit within 2 s, `friendlyFire.kind` is `aircraft`, and the axis Hellcat is untouched.
- [x] Write the Tier 2 spec. It covers:
  - the roster flow, the scenario, and holding Space until `friendlyFire`;
  - the readout text, and a capture;
  - a dive into the sea, the debrief DISHONORABLE DISCHARGE and `score 0`, and a capture;
  - Return to title, the roster row DISCHARGED, and the Dossier "Discharged", with a capture;
  - zero validation errors and gpu p95 under 6.0 ms.
- [x] Write the M2 note: the event, the proposed `nextRadioLine` feed merge by tick, the badge denial, and the readout's transient segment to drop.
- [x] Commit.

### Task 7: Verify, Tier 2, review, and handoff

- [x] Run `remote-run npm run verify` and capture `rc=$?`. Record rc, file count and pass count.
- [x] Run the digest probe one final time.
- [x] Run Tier 2 on the reference GPU from a spare slot. Check `ss -ltnp` first; the `vite.config.ts` edit is local scratch. Run `friendly-fire.spec.ts`, plus `meta-game.spec.ts` and `meta-game-relaunch.spec.ts`, which read debrief text. Read every capture.
- [x] Get a whole-branch review from a fresh subagent, then fix what it finds.
- [x] Write the handoff `docs/handoff/2026-09-26-friendly-fire.md`. Include:
  - a viewing URL on a spare slot, asserted to return 200;
  - the E1 and M2 intersections;
  - the rulings.
- [x] Update the §15 row, add the README pointer, and update the 7e handoff's open item.
- [x] Push the branch and email the handoff.
- [x] Append to the parallel-tracks ledger.
