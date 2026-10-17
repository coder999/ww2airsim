# F5C handoff: multi-leg sorties, any-friendly-base recovery, unscored pilot skip

Branch `plan-f5c-multi-leg`, run unattended 2026-10-16 (plan: [`docs/superpowers/plans/2026-10-16-f5c-multi-leg-sorties.md`](../superpowers/plans/2026-10-16-f5c-multi-leg-sorties.md)). Not deployed. F7B was merged into the branch (main `3de7fce3`) before closeout.

## What changed

| Area | Change |
| --- | --- |
| Campaign (schema 2) | `PendingSortie.legs` and `banked`; `LogEntry.legs`; `bankLeg` banks a landing and keeps the sortie open; `bankSortie` is the closing call; `resolveInterrupted` keeps banked legs. Version-1 campaigns and exports are refused with an "older version" message (no migration). `docs/campaign-data.md`, "Legs" |
| Recovery rule | `src/sim/friendly.ts` (`friendlyBaseAt`, `friendlySites`, `nearestFriendlySite`); every `home` objective is `suggestedRecovery` and completes on any friendly base; `missionOutcome` needs a friendly base; the objective line reads "Land at any friendly base"; the steering cue aims at the nearest friendly site the airplane can use |
| Leg end | A full stop at a friendly base is a `landing` log entry with `base` set (the "legEnd"); nothing else is. Touch-and-go, go-around, open ground, an enemy field, a hostile deck and water outside an anchorage are not |
| Ground stop | `src/sim/groundStop.ts` (`checkGroundStop`, `groundStop`): refuel, repair, rearm to a loadout, reposition. Recorded as a `ground-stop` action; `verify.ts` replays it |
| Shell | Stop card in `debrief.ts` (`withLegCard`, loadout radio), `legCard.ts`, `campaignBank.bankLegScored`, `session.bankLeg`, fade, `withGroundStop` in `frame.ts`, DEV hook `__ww2.groundStop` |
| HQ | Training and Single skip the pilot step (steps 2 to 4 of 4, `ENS (practice)`); Dev keeps it; the mission log shows landings inside an entry |
| Content | Eleven `home` objectives renamed and flagged; `water-quals` declares the San Pedro Bay anchorage |

## Decisions I made

1. **Death and capture bank the unbanked points (Mark's ruling, 2026-10-16, applied after merge).** The first build followed Task 2's example literally and made killed and captured forfeit them; Mark reversed it. Only `abandoned` (and a destroyed friendly, as in D5) forfeits what no landing banked; killed, captured, ditched and rescued bank their delta; banked always stays. `FORFEITING_ENDS` is `['abandoned']`; F7A's capture text is back to "the points you earned stay on your file". The Task 2 example now reads leg 1 +500, leg 2 +200 then killed banks 700.
2. **Refuel means the sortie's launch load, not a full tank.** Every scenario aircraft launches with `createState`'s default 400 kg, so a full tank made leg 2 heavier than leg 1 (a Dev hop never rotated). `groundStop` tops up to `max(fuel left, launch fuel)`, never past the tank. Say so if you want full tanks.
3. **Anchorage** = a circle the scenario declares (`Scenario.anchorages`; the smallest per-scenario data, F8 replaces it) or a friendly ship within 2,000 m (about 1.2 mi). Only `water-quals` declares one. The relaunch is unsafe (End Sortie only) within 300 m of a ship.
4. **`suggestedRecovery`** is a flag on the `land` objective, not a scenario field, so the `after` chains, the debrief rows and the HUD line kept working. The training `land` objectives (tutorial, deck quals, torpedo qualification, water quals, the circuit fixture) still name their place.
5. **The aircraft is not turned into the wind on a deck:** it faces the bow of the steaming ship, at the launch spot 21 m forward of the stern (the spot the scenarios already use). The ship is never touched.
6. **Runway start** is 25 m in from the threshold of the end facing the wind (calm: the runway heading). A roll-out that ends up to 400 m past the strip's end or beside it still counts as stopped at the field (found by the browser spec: touchdown credits the field, the roll can leave it).
7. **Unscored stops off a friendly base keep today's plain Continue** (no repositioning); only a friendly stop gets the card. The stop card has no Restart even when unscored; the pause screen still has it.
8. **Dev keeps the pilot step** was read as "the Dev checkbox on keeps it for every row"; a practice pilot gets no bombsight (entry rank).
9. The picker and memo step counts follow the path ("Step 2 of 4").
10. Old campaigns stay listed (the index format did not change) and say why they cannot open; delete removes them.

## Tests

Each new test was shown to fail under a deliberate mutation of its change (13 mutations, all red; the one exception is the session's landing latch, which is belt and braces: the reducer's own `leg-mismatch` refusal catches the same repeat, so the session test passes with the latch removed).

**Tests updated** (contract moved): `tests/campaign/{bank,schema,scoring,storage}.test.ts` (version 2, death forfeit, old-version refusal), `tests/fixtures/walk.ts` (random walks bank legs), `tests/render/campaignBank.test.ts`, `campaignSession.test.ts`, `hq/model.test.ts`, `mission/{briefing,hud,steeringCue}.test.ts` (labels, suggested recovery), `tests/sim/mission/{outcome,objectives,recoveryAgreement}.test.ts` and the mission tests (`airfield-strike`, `combat-air-patrol`, `convoy-strike`, `flattop-hunt`, `single-combat`, `surigao-strait`, `tank-buster`, `tutorial`) for "Land at any friendly base" and `base`; E2E `campaignSortie`, `meta-game`, `meta-game-relaunch`, `mission-ui` (End Sortie, the new objective line), `missions` (no pilot step on Training rows), `title` (Step 2 of 4), `harness.toConditions`.
**New:** `tests/campaign/legs.test.ts` (reducers + a 144-state end x legs x qualified x unbanked model check), `tests/sim/friendly.test.ts` (enrolled from every scenario file), `tests/sim/groundStop.test.ts`, `tests/sim/mission/legEnd.test.ts` (airfield, deck, anchorage, and the negatives), `tests/flightRecorder/legs.test.ts` (leg 1, stop, leg 2 verify bit for bit through gzip), `tests/render/{legFlow,legCard}.test.ts`, `tests/e2e/legSortie.spec.ts`, `legCapture.spec.ts`, an `hq.spec` case.
**Still valid, re-run:** `noDeadlock` (model check over the shipped catalog), `recorder`, the self-enrolling scenario lists (`friendly.test.ts` enrolls all 38 scenario files), `e2eClassification`.
**Known gaps:** no browser spec flies a water landing (headless only; the browser reaches the water placement with the DEV hook); the mission-ui "briefing ... dossier" spec's landing pilot is flaky on the RDP route (1 of 2 on its own, before and after; the landing floats 8 s and runs off the strip), unrelated to the stop; per-scenario anchorages are placeholders for F8; the sortie report's `warnings` count once at the close.

## Captures (ryzen GPU, RDP route, `legCapture.spec.ts`)

`docs/handoff/2026-10-16-f5c-shots/`: `01` stop card with the Campaign Ledger and the Ordnance choice, `02` Clean selected, `03` repositioned on the runway, `04` the second landing's card ("number 2"), `05` Headquarters after End Sortie, `06` to `08` the moving carrier deck before the stop, at the launch spot and three seconds later, `09` the Catalina on the water into the wind. View them with the dev server on `ww2airsim.windomlane.org` when it is up.

## Measurements

F5C adds no per-frame rendering cost (a fade overlay and DOM only); no budget spec was added or run, and the known-red ones were left alone.

## Not done

Timed service or field limits, an aircraft swap at a stop, taxi controls, mid-sortie rank gates and enemy-field takeover (F8) are outside the plan. `docs/night.md` needed no change: a night stop uses the same code and the aircraft keeps its lights switch (pinned in `groundStop.test.ts`).
