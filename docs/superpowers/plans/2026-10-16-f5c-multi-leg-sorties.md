# F5C: multi-leg sorties, any-friendly-base recovery, and the unscored pilot skip

Written 2026-10-16 from a grilling session with Mark (AskUserQuestion, 16 questions, every answer below is his).
Master-plan track F5 (campaign foundation); size **M**; runs **before F8**.

## Header

- **Branch:** `plan-f5c-multi-leg`, worktree `/home/mark/projects/ww2airsim-plan-f5c-multi-leg`.
- **Order:** starts after **F7B** merges (both touch `src/render/debrief.ts`, `campaignSession.ts` and the bank mapping). F5B and
  F7A are on `main` (2026-10-15).
- **Viewing checkpoints (Mark, 2026-10-16): final product only, unattended.** The run goes to completion in the worktree;
  captures of the stop card, the three repositionings (runway, carrier deck, water) and the debrief are collected in the
  handoff for Mark to view on `ww2airsim.windomlane.org` when he is back. His viewing is never a test gate.
- **Heavy jobs** go through `REMOTE_RUN_OVERFLOW=0 remote-run` on ryzen; budget specs under `hwlock ryzen-budget`. No `pkill -f`, no `rm -rf`.
- **Budget:** this plan adds no per-frame rendering cost. Budget gates are red on `main` for reasons recorded in
  [`docs/handoff/2026-10-16-budget-reevaluation.md`](../../handoff/2026-10-16-budget-reevaluation.md); F5C neither fixes nor
  changes them (Mark, 2026-10-16: leave them failing, do not tune to them).
- **Mode:** worktree, unattended. Closeout is the `/closeout` skill.

## What changes, in Mark's words (decisions, 2026-10-16)

| # | Decision |
| --- | --- |
| D1 | **Unscored missions skip the pilot step.** Training and Single go from mission pick straight to Flight Conditions, Aircraft and Ordnance, gated by a fixed entry rank (what the tutorial uses). **Dev keeps the pilot step.** |
| D2 | **Landing and stopping on a friendly airfield, carrier deck or anchorage ends a leg, not the sortie.** A **full debrief** card appears at every such landing with **Continue Sortie** and **End Sortie**. Unscored missions get the same behavior (nothing banks either way). Only a full stop on a friendly site prompts; touch-and-go and go-around never do; a landing off a field (open ground, water not at a friendly anchorage) ends the sortie as today. |
| D3 | **Recovery rule: any friendly base counts, always, for every mission.** No "lesser successes"; every multiplier is already x1.0 (`GAMEPLAY.md`). The authored recovery point is only the suggested one. Once the primary objective is met the objective line reads "Land at any friendly base" and the steering cue points to the nearest friendly site. Friendly means held by the player's side in the mission's world state at that time. |
| D4 | **Checkpoint banking.** Each landing banks the points earned since the last bank, permanently, with the badge and promotions announced then. The **chapter completes at the first qualifying landing** (primary objective met plus a friendly recovery); later flying earns secondary points and cannot undo it. The badge needs the **primary objective** only (one badge per mission per pilot, as today). |
| D5 | **Banked stays banked.** Abandon, a friendly kill, a closed tab or a death forfeit only the **unbanked** points; a killed or captured pilot is still lost (roster closure and replacement as today). The adjusted-score denominator counts the sortie once. |
| D6 | **A promotion takes effect from the next sortie.** Rank gates (aircraft, bombsight, torpedosight) are fixed at launch for the whole sortie. |
| D7 | **Continue:** same aircraft and pilot, instant refuel, repair and rearm, with a **loadout choice** from the aircraft's allowed loadouts (the Ordnance form). **No mission-clock jump**: the clock, time of day, weather, AI and ships resume where they were. Taxiing is not modeled: the aircraft is repositioned, with a short fade. |
| D8 | **Repositioning.** Runway: threshold of the end that faces the wind (stationary, engine running, flaps up, brakes held; the start state the AI takeoff and the launch sequence already use). Carrier: the carrier's launch spot on the moving deck, heading into the wind, ready for deck speed plus wind; the carrier keeps steaming. Water (flying boats and floatplanes at a friendly anchorage or ship): on the water at the stop point, into the wind; if the spot is unsafe the card says why and offers End Sortie only. |
| D9 | **Recorder:** one continuous `.ww2flight` per sortie; the ground stop is a recorded action carrying the loadout id; replay reproduces leg 1, the stop and leg 2 exactly. |
| D10 | **Log:** one mission-log entry per sortie with its legs listed inside (landing place, points at that landing); "sorties flown" and the denominator count sorties, not landings. |
| D11 | **Interrupted sortie** (closed tab, crash) after a bank: banked points stay, the unbanked part is lost, the pilot returns to the roster (not killed). Same as Abandon. |
| D12 | **Schema version bump; old campaigns discarded** (as F5A did with the old roster). No migration code. |

## Facts this plan builds on (checked 2026-10-16)

- `bankSortie` (`src/campaign/bank.ts`) is one transaction per sortie and clears `pending`; `launchSortie` increments the
  denominator and `pilot.sorties` at launch, so legs after the first must not call it again.
- `scoreSortie` (`src/campaign/scoring.ts`), `SortieReport` and `SortieEndKind` (`src/campaign/schema.ts`) carry cumulative
  counts per sortie; `resolveInterrupted` already banks an abandoned sortie with zero counts.
- The shell's bank-once latch and `buildReport` live in `src/render/campaignSession.ts`; the end mapping is `SORTIE_END_OF`.
- Mission success today needs the primary objective and the authored recovery (`GAMEPLAY.md`, "Campaign structure and missions");
  the sim decides it in `src/sim/mission/outcome.ts`; `convoy-strike` has a home objective `land at bayug after sink`.
- The landed test is `supportedContact` plus a full stop (`src/sim/ground.ts`); the AI takeoff start state is 7h's.
- Flap-landing, bailout (`J`) and `rescued` are never a mission success (F7A) and keep that behavior.

## Tasks

Each task lists the tests it adds, and **each new test is shown to fail without its change**.

1. **Contract and schema (D4, D5, D10, D12).** Write the leg model into `docs/campaign-data.md` first. `pending` gains `legs`
   (landing place, cumulative counts at the landing, points banked at it) and `banked` running totals; the log entry gains
   `legs`; `SCHEMA_VERSION` bumps and old saves are rejected with the existing "saved by another version" message path.
   Tests: schema round-trip, rejection of the old version, exports/import of the new shape.
2. **Reducers (D4, D5, D11).** `bankLeg(c, report, now)` banks the delta since the last bank (cumulative counts minus
   `pending.banked`), applies the badge and chapter completion **once, at the first qualifying leg**, updates pilot and human
   ledgers, and **keeps `pending` open**. `bankSortie` becomes the closing call: it banks any remaining delta, applies the end
   kind (killed, captured, abandoned, friendly kill: unbanked only), closure and replacement, then clears `pending`.
   `resolveInterrupted` keeps banked legs. Tests: an exhaustive model check over `SortieEndKind` x leg count x banked state
   (extends the existing one); the Mark example (leg 1 +500 landed, leg 2 +200 then killed banks 500 only); idempotence of a
   repeated `bankLeg`; denominator and `pilot.sorties` unchanged by legs; badge once; chapter completion once.
3. **Unscored pilot skip (D1).** The HQ flow for Training and Single removes the Assign step and uses a fixed practice rank;
   Dev keeps Assign. `unscoredReason` is unchanged. Tests over the picker rows and the HQ E2E (no pilot step for Training and
   Single; present for Dev, Non-campaign and Campaign).
4. **Recovery rule and cue (D3).** `missionOutcome` accepts any friendly airfield, carrier or friendly anchorage as recovery;
   the mission schema keeps the authored recovery point as a suggestion (`suggestedRecovery`) and drops the requirement;
   `convoy-strike` and the other authored missions are updated; the objective line and the steering cue read "Land at any
   friendly base" and aim at the nearest friendly site once the primary objective is met. Tests: unit tests over
   `outcome.ts` (landing at a non-authored friendly base succeeds, an enemy or unowned field does not), and a content check
   that every scenario declares which sites are friendly.
5. **Leg boundary event (D2).** The sim raises `legEnd` when the aircraft has fully stopped on a friendly site (same
   `supportedContact` and stop test; touch-and-go and go-around never; open ground and unfriendly water never). The mission
   is not terminal at `legEnd`; the world is paused for the card. Tests: headless landing scenarios at an airfield, a
   carrier deck and a friendly anchorage, plus the negative cases above.
6. **Ground stop and repositioning (D7, D8, D9).** A recorded `groundStop` action `{ loadout }` refuels, repairs, rearms to
   the chosen loadout and repositions per D8 by reusing the AI takeoff and launch start states; no clock jump. Tests: runway,
   moving carrier and water placement (heading into the wind, deck speed), loadout validity, determinism, and a recorder
   replay across two legs that verifies bit-for-bit (extends `tests/flightRecorder/`).
7. **Debrief per landing (D2, D4, D10).** The full debrief renders at each landing with Continue Sortie, End Sortie and the
   Ordnance (loadout) form; the Campaign Ledger shows the leg's bank, badge and promotion; the mission log shows legs inside
   an entry. Tests over `debrief.ts` models and the HQ log screen, and an E2E for the card.
8. **Shell bank flow (D5, D6, D11).** `session.bankLeg` and `session.close`; the bank-once latch becomes one bank per
   landing and one close per sortie; Abandon and a friendly kill zero only unbanked points; rank gates read the rank at launch.
   Tests: the latch under double clicks and a late render, Abandon after a bank, interrupted-sortie load after a bank.
9. **Unscored legs (D2).** The stop card for Training and Single uses the same flow with nothing banked. Test: the Training
   mission continue path.
10. **Test reconciliation** (`docs/testing.md`, "Worktree closeout"): name every changed player-facing contract (the Assign
    step for unscored missions, "Land at <base>" objective text, the debrief's single-landing assumption, the bank-once
    wording, the log shape, the Campaign Ledger), search the tests for the old labels, and update them in the same work. Record
    `Tests updated`, `Tests still valid` and `Known gaps` in the handoff. Self-enrolling lists (mission-aircraft, scenario
    pools) are re-run, not just unit-tested.
11. **Docs and closeout.** `GAMEPLAY.md` (the sortie, the stop, the recovery rule), `docs/campaign-data.md`, `docs/night.md` if
    night stops differ, `MASTER_PLAN.md` entry, the handoff with captures (stop card, three repositionings, debrief), then
    `/closeout`. Email the handoff to marktuttle1@gmail.com.

## Acceptance gate

A Dev sortie can: take off, sink a target, land and stop at a friendly field other than the authored one, see a full debrief with
the badge and a promotion banked, Continue with a new loadout (repositioned, no clock jump), score again, and End; the
chapter is complete after the first landing and the second leg's points add. The same on a carrier deck and at a friendly
anchorage. A death after a bank keeps the bank. Training and Single skip the pilot step. One `.ww2flight` per sortie replays
exactly across the stop. All of it under unit, headless, recorder, model-check and E2E tests, with no new red budget spec.

## Not in F5C

- Timed service or per-field service limits (needs F8 base data; revisit then). Aircraft swap at a stop. Multipliers for
  recovery quality. Taxi controls. Per-leg recorder files. Mid-sortie rank gates. Enemy-held field takeover (F8).

## Open items to resolve while building

- Which sites are friendly in each shipped scenario before F8 (a per-scenario list on the airfield and ship data).
- Exact copy for the card and the objective line (US spelling, imperial units, the existing debrief style).
