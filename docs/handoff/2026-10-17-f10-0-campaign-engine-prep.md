# F10-0: campaign engine prep

**Date:** 2026-10-17 (one session, unattended; Claude built all of it, no Codex)
**Branch:** `f10-0-prep`, cut from `main` `303f9d2e`. Plan: `docs/superpowers/plans/2026-10-17-f10-0-campaign-engine-prep.md`; master plan: `2026-10-17-f10-campaign-missions-master.md`. The as-built contract is `docs/campaign-data.md`, "Chapter missions".
**Viewing:** none (an engine and registry plan; nothing a player sees changed, apart from the egress debrief, which no chapter uses yet). Full `npm run verify` on ryzen: **exit 0, 519 files, 8,012 tests passed, 14 skipped** (7,837 before; +175).

## What changed, against the plan

| Plan task | What exists now |
| --- | --- |
| T0.1 Registry and campaign pool | `content/campaign/chapter-missions.json` (12 empty entries), `src/campaign/chapterMissions.ts`, `buildShellCatalog` enrolls a chapter only when its entry is complete and its scenario loads, `ScenarioPool` gains `campaign`, `SCENARIO_OPTIONS` derives chapter rows (`chapterOptions`), `bootHq.ts` no longer asserts non-null on a missing option. The stale line in `docs/campaign-data.md` is corrected. |
| T0.2 Test lists derived | `content.test.ts`, `scene/content.test.ts`, `titleScreen.test.ts`, `campaignSession.test.ts`, `friendly.test.ts`, `nightFacts.test.ts`: chapter files are derived from the registry. Proved with a temporary stand-in chapter (see below). |
| T0.3-T0.6 Vocabulary | `arrive`, `released`, `damage`, `atLeast`; `until` windows; `fresh`; `dwellS`/`failOnExit`; `headingDeg`/`groundSpeedMps`; annulus stations; `hold` `resetOnExit`/`relativeTo`; `when.gone`; `then` `complete`/`fail`. 30 unit tests, each shown red under a mutation. |
| T0.7 Field state | `src/sim/mission/fields.ts`; `setServiceable`/`setSide`; `fieldRules`; `land.requires`; the `field` objective (positive, or `keep` as a standing order). |
| T0.8 Egress | scenario `recovery: {kind:'egress', objective}`; `recoveryOf` returns `egressed`; `missionOutcome` rule; `egressModel` debrief and the `main.ts` hook (no Continue). |
| T0.9 Population | scenario `population`; worst-case simultaneous count with `gone`-gated groups never overlapping. |
| T0.10 Aircraft lists and latch | `ScenarioOption.aircraftList`, `eligibleAircraft`/`sortieIsDev`/`aircraftFor` take it; `freezeOnSuccess` and `MissionState.latched`. |
| T0.11 Ki-57 | `aircraftTargetType` (a transport aircraft scores the bomber row, 750); an unarmed `combat` block for the Ki-57. |
| T0.12 Fit link | `mission-fit.json` rows may name a `scenario`; `linkProblem` holds the start to the scenario's real one. |
| T0.13 Matrix | `tests/campaign/chapterMatrix.test.ts`: nine paths x twelve chapters x (fixture, and real once authored): 109 tests. |

## Decisions and deviations (Mark may overrule)

1. **The registry is its own file**, not new fields in `chapters.json`: that file is pinned to GAMEPLAY.md's table by `chapters.test.ts`, and a second concern in it would make every batch edit a shared, test-pinned file.
2. **Egress names an objective, not a gate.** The plan said `recovery: {kind:'egress', gate}`; as built it is `{kind:'egress', objective}` naming a `reach` objective, so the gate keeps the station, `after` chaining and HUD/steering support it already has.
3. **Two things the plan did not list, added because the plan's chapters need them:** `fieldRules` (derive a field's serviceability from its structures: A6, J1) and the `field` objective (A6 "keep two of three", J6 "drive both to Japanese control"); and `land.requires` (J1's conditional recovery graph).
4. **The latch is opt-in** (`freezeOnSuccess`), so every pooled mission keeps today's Continue behavior. A chapter must set it (an egress chapter instead ends at the gate); `friendly.test.ts` asserts this for every authored chapter.
5. **Windows close a standing order as complete and everything else as failed.** `protect`/`deny` read complete at the close; a `destroy`, `arrive`, `released`, `damage`, `field` (non-keep) or `atLeast` that is still active fails.
6. **Ki-57 combat zones are ESTIMATES** fitted to the glb's measured extents (a Hangar-style fit, not a drawing): `structureHp` 400 sits between the Zero (320) and the bombers (480). The zone edges are boxes only the overall drawn bounds constrain (`combatFit.test.ts`). Mark has not seen how a Ki-57 takes fire.
7. **F3's "late Oct-Nov" site windows are unreachable without A2's transition** (Mark ruled it, 2026-10-17); F10A writes that row.

## Findings

- **A Ki-57 kill paid 500 (the merchant ship row), not 750** (GAMEPLAY.md: "Bomber or transport aircraft 750"): combat credited `spec.role` directly. Fixed (`aircraftTargetType`).
- **The Ki-57 could not be hurt at all.** It had no `combat` block (ki57-onboard D7/D11), so `damageFromHit` returned the damage unchanged: A6, J5 and J6 could not work. It now has an unarmed block (no guns, no gunners, so the AI never picks it a target and it cannot fire).
- **The reducer trusts `report.success` after a bailout.** It rejects a success only after a death, a capture or an abandon. The lock is upstream (`missionOutcome` reads a bailout as no badge; `bankScored` banks `success && end === 'landed'`). Unchanged (the F5A contract is frozen); recorded as a gap.
- **What a chapter's arrival breaks, measured** with a temporary stand-in chapter (a copy of Escort registered as A1): after T0.2 the only failing test was `insignia.test.ts`, which wants a unique ribbon per chapter badge. That is intended: **each batch adds one `RIBBONS` entry in `src/render/insignia.ts`** (a design choice, not derivable).

## Tests

**Tests updated:** `tests/render/flightRecord.test.ts` (the egress debrief is a sixth banking site and a seventh baseline reset), `tests/sim/damage/stages.test.ts` (the Ki-57 now has a combat block), and the six lists above.
**Tests still valid:** every existing mission, golden-recording, flight-recorder, replay, scene and architecture test passed unedited after each change (the 405 mission tests among them); the dependency-cruiser boundary caught one real violation (`sim/scene` imported `campaign/`), fixed in F9.
**New:** `tests/sim/mission/{vocabulary,egress,population,latch}.test.ts`, `tests/campaign/{chapterMissions,chapterMatrix}.test.ts`, `tests/sim/weapons/transportKill.test.ts`, and additions to `missionFit.test.ts`.
**Known gaps:**
- the AI's home choice and steering still read a field's content serviceability, not the mission's override;
- the Ki-57 zone boxes and `structureHp` are estimates;
- the egress debrief is not browser-tested (it needs a chapter that uses it; batch D's first e2e proves it);
- an AI Ki-57 cannot yet drop troops (batch D);
- the reducer bailout-success trust above.

## For the batches

Read `docs/campaign-data.md`, "Chapter missions". To add a chapter: fill its `chapter-missions.json` entry; write its scenario (set `freezeOnSuccess`, or `recovery: egress`; add `population` if capped); add one `RIBBONS` entry; add its mission test, scenes and mission-fit link; turn on nothing else, because the rest derives. The nine-path matrix picks the real descriptor up on its own.
