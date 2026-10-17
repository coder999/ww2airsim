# F10 campaign mission production: master plan (2026-10-17)

MASTER_PLAN Track F10 (plans 17-21 of the 22 in the
[F3 dependency table](../specs/2026-10-14-leyte-campaign-definition.md#11-dependency-checked-plan-count)), plus one prep plan F3 did not list.
**Status: plans only. Nothing in F10 is built.** Grilled with Mark 2026-10-17 (four rounds, every branch answered); the decisions below are binding.
The chapters' content is **F3 section 4** (start, badge graph, secondary, population, compression, state transition per chapter); this plan owns how it is built, not what it is.

## Header

- **Base:** `main` at `b310267f` (F9 merged, CI green 2026-10-17). Each batch is cut from `main` after F10-0 merges; F10-0 is cut from `b310267f`.
- **Worktrees:** `~/projects/ww2airsim-worktrees/f10-0-prep`, then `f10a-a1-a3`, `f10b-a4-a5`, `f10c-j1-j3`, `f10d-j4-j5`, `f10e-finales`.
- **Run mode: unattended** (Mark, 2026-10-17). **Viewing: one checkpoint per batch** (A-D together, then the finales): the windomlane link, plus a capture sheet per chapter
  (opening, mid-mission, recovery). His viewing is a checkpoint, never a test gate.
- **Merge rule:** a batch merges when its gates are green and the capture sheet is delivered; Mark then hand-flies the chapters on the primary dev server and rules; tuning rounds are short follow-ups on `main`.
  Headless tests prove the contract and the AI population, not feel: **a hand-flown pass is owed on every chapter and every handoff says so** (the standing practice in the escort, Surigao and Tank Buster handoffs).
- **Heavy jobs:** `remote-run` on ryzen (AGENTS.md); budget specs under `hwlock ryzen-budget`. Parallel batches count against the three ryzen slots: stagger full `verify` runs, and never run two full suites on nexus.
- **Delegation:** each batch runs as its own background agent in its own worktree, driven by the coordinating session. Codex drafts F10C's content (scenarios, scenes, test files); every test, `tsc` and lint
  run is done by Claude through `remote-run`, because a Codex sandbox cannot run `remote-run` (no network in F9; network was enabled 2026-10-17 and plain `ssh` then works only through the opt-in shim `~/.local/share/codex-shims`, but `remote-run` still needs write access to the hwlock directory and the repo's `.git`). Codex is not used for F10-0, A, B, D or E (engine work, new entities, shared files).

## Decisions (Mark, 2026-10-17)

| # | Decision |
| --- | --- |
| 1 | Unattended, one checkpoint per batch (above). |
| 2 | **The finale gate is measured and reported, never tuned.** F10E builds the locked 24 airborne / 10 ships / 16 close, measures under `hwlock ryzen-budget` (trees off and on, 6 interleaved loads, median), and records red or green; a red does not block the merge. The two-tier budget proposal stays unresolved. Changing the locked populations needs a new ruling. |
| 3 | Each batch authors its own openings in director mode (first-pass cameras by Claude, refined by Mark). F10E authors both victory scenes. `demo-opening` and `demo-victory` are deleted when the first real scene lands. |
| 4 | **Shape:** F10-0 prep branch (serial), then A, B, C, D, E in parallel worktrees. Merge order A-D, then E (finales last, per F3). |
| 5 | Claude places the invented starts (A1, A2, A5, J2, J4; A4 and J5 too where F3 gives none), each recorded as a chosen figure with the F3 limit it satisfies, and shown in the capture sheet. |
| 6 | Claude drafts briefings, history and honesty labels from the F3 source ledger (section 10). A claim beyond the ledger ships only as a flagged line for Mark. |
| 7 | Radio is text-only through F10 (`RADIO_LINES` maps to `null`). Each batch collects its new lines in its handoff. One voice run per language (US, JA), with a character count and cost, after Mark approves it. The ElevenLabs free tier is 10k characters a month. |
| 8 | Proof per chapter: headless success and failure plus the chapter's own edge paths. The nine generic paths (success, normal failure, abandon, KIA, POW, bailout, discharge, restart, retry) run data-driven across all twelve chapters at the reducer level, once. One e2e through Headquarters per batch. |
| 9 | **J2, J4 and J5 end at the egress gate, and crossing it is a real recovery** (a new outcome path). A landing at an allied field, or a ditching, is not a success in those chapters. |
| 10 | **A2's success writes Tacloban and Dulag to `buildup`.** After A1 the stored world holds them in `assault` (unserviceable), which makes A3's Tacloban landing and A5's field options illegal on the real campaign path. F3's "no transition on A2" is amended. |
| 11 | Chapters carry their own aircraft lists on their descriptors (authored airplane first). J6 offers Ki-43-IIb or A6M2. P-38, PBY and Ki-57 chapters work without joining a non-campaign list. |
| 12 | **Engine split:** F10-0 builds the shared vocabulary. Batch B owns the rescue actors (A4). Batch D owns the airdrop pipeline (J5). F10E merges last so it can use D's drop work. |
| 13 | **Continue Sortie after the badge-earning landing:** the mission state latches, the chapter is complete (transition applied), and Continue is a free sortie with no new waves or objectives. A non-qualifying landing leaves the script running. |
| 14 | The near-black player airplane at night stays open (F6A's ruling still owed); A4, J4 and J5 handoffs report how it plays. |
| 15 | LCVPs shuttle on water. Floating vehicles already move on waypoints (`stepVehicle`, `floats` in `src/sim/world/vehicles.ts`), so this is authoring plus a loop-over-water check. The beaches' budget cost follows afloat vehicles (F8C), so F10A measures it and reports it. |
| 16 | Chapters merge on a green gate; Mark flies afterwards (header). |

**Defaults taken (Mark may overrule):** scenario ids are slugs of the chapter title (`a1-over-the-beaches`); scene ids stay `a1-opening`, `a6-victory` and so on. A2, J1, J4 and J5 are authored
`coordinated: false` (F5A's "until F10 authors the flag"). J4's illumination flare is scheduled `LightSpec`s, not a flying actor, and the J4 and J5 openings use scheduled lights because no renderer consumes the `fx` cue.
A victory scene replays the scenario's fresh start, not the world the flight ended in. Chapter population caps are enforced by a validator, with timed route-group admission for A6 and J6.
The Ki-57's kill row is checked and fixed to 750 if it pays the 500 transport row.

## Verified starting facts (2026-10-17, `main` `b310267f`)

| Claim | Evidence | Consequence |
| --- | --- | --- |
| No chapter is wired to a scenario. | `grep chapterId` shows only campaign-state uses; `buildShellCatalog` (`src/render/campaignSession.ts:107-116`) keeps `pool === 'noncampaign'` rows only; `kind: 'campaign'` descriptors exist only in `tests/fixtures/`. | F10-0 builds the chapter registry once; the picker row id must equal a scenario file (`bootHq.ts:71` asserts non-null and throws otherwise). |
| `ScenarioPool` is `noncampaign \| training \| single`. | `src/render/titleScreen.ts:156`. | A new `campaign` pool, or a chapter registry beside the picker; either way not a `noncampaign` row, which would put a chapter in the repeatable pool. |
| `docs/campaign-data.md` says a chapter is "a row in `chapters.json` plus its aircraft in `mission-aircraft.json`". | Stale: chapter rows are not read into the catalog. | Corrected by F10-0. |
| Objective kinds are destroy, protect, deny, takeoff, land, reach, hold, state, release, approaches. | `src/sim/mission/schema.ts:70-90`. | Everything in F10-0's vocabulary list is new. |
| A badge needs a landing at a friendly base. | `src/sim/mission/outcome.ts:77-85`. | Decision 9. |
| `hold` accumulates and never resets; `state` is instantaneous and has no heading or ground speed. | `step.ts:147-151`, `state.ts:37`, `schema.ts:43-51`. | A4's dwell tests and J5's corridor need new tests. |
| Airfield `serviceable` and side are static content. | `airfields.ts:95`, `scenario.ts:278`; nothing mutates them mid-mission. | A6, J1, J6 need mutable field state. |
| Only a player-side `release` exists. | `step.ts:154-164` reads the player's combat record; bombs and torpedoes dropped are tracked for any aircraft. | AI release counts are a cheap read. |
| Parachutists exist but nothing consumes them. | `bailout.ts:60-62`, `withTestDrop` is a test hook (`scenario.ts:956-960`); drops are tick-scheduled `DropOrder`s, not recorded actions. | Batch D builds the airdrop pipeline, including a recorded player drop action. |
| Held groups spawn once, by one trigger each. | `scenario.ts` `checkMission`. | Timed route-group admission (A6, J6) needs a trigger predicate (F10-0). |
| `mission-fit.json` rows are keyed by chapter, not scenario, and prove arithmetic on mostly invented points. | `tests/sim/missionFit.test.ts`; the A5 row is `expectFail` (447 s against 420 s). | F10-0 links a row to the scenario's real start; A5's finding is reported, not tuned. |
| Hard-coded test lists a new scenario or scene breaks. | `tests/sim/mission/content.test.ts:41`, `tests/sim/scene/content.test.ts:17-20`, `tests/render/hq/missionAircraft.test.ts:32-38`, `tests/render/titleScreen.test.ts` (lines 121, 146, 171), `tests/sim/nightFacts.test.ts:47`, `tests/render/campaignSession.test.ts:71`. | F10-0 converts these to derive from the registry or directory. |
| A full stop at any friendly base raises a stop card (F5C). | docs/campaign-data.md "Legs". | Decision 13. |
| Floating vehicles move. | `vehicles.ts:63` (sea pose) and `stepVehicle`. | Decision 15. |

## Reconciliation items (F3 against what was built since)

Resolved by a decision above unless noted. Source: the drift survey of 2026-10-17 (F5A-C, F6A/B, F7A/B, F8A-C, F9 handoffs).

| Item | Resolution |
| --- | --- |
| Egress gate needs an outcome path (J2, J4, J5) | Decision 9; F10-0 builds it |
| Stored world makes Tacloban unusable in A3 and A5 | Decision 10; F10A writes the transition row |
| Coordinated-operations Commander gate hits A2, J1, J4, J5 | Defaults: author `coordinated: false`; F10-0 plumbs the flag |
| Japanese aircraft locked to the authored airplane | Decision 11 |
| Objective vocabulary missing (damage, window, dwell, corridor, drop, bundles, arrival, release) | F10-0 vocabulary; B and D own rescue and airdrop |
| Ki-57 kills may pay the 500 transport row | F10-0 task: verify against `targetType.ts`, fix to 750 |
| Bailout, POW, rescue: a death or capture banks what was earned since the last landing; only Abandon forfeits | No chapter change; the proof matrix (Decision 8) covers it |
| A4's rescue visuals are player-only and view-only | Batch B builds sim entities |
| Paratrooper drops are tick-scheduled and unrecorded | Batch D builds position-triggered drops and a recorded action |
| Night: perception, flare cap (4 flares, 8 lit slots), no AI flare-layer, no radar, torpedosight needs Lieutenant Commander | J4's flare-layer is scheduled lights; J4 and J2 have no torpedosight (GAMEPLAY already says so); B and D report night play |
| Site windows: J3's Burauen fields play `pre-invasion` (Mark, 2026-10-17); San Pablo serviceable in the endgame only | Honored as built; F3 section 5 is not amended beyond Decision 10 |
| Mission-fit gaps: A2 first action 189 s (F3: 2-3 min), A6 161 s (F3: 1-2 min), A5 recovery 447 s (F3: 420 s) | F10A and F10E place the actors to meet F3 where geometry allows; A5's is reported as a finding |
| Populations against measured rendering cost | Decision 2 |
| Multi-leg sorties: every chapter must be safe to Continue | Decision 13 |
| Landing craft are a vehicle `targetType` (250 points), not ships | Unchanged; LCVPs stay vehicles |
| Ground caps: F3 A6/J6 ground sets plus F8's per-site stationary vehicles are budgeted separately | F10E measures the sum |
| F9 scenes: a scene plays only on the scenario it names; victory replays the fresh start; no FOV or roll | Each batch authors against these |

## Batches

| Batch | Chapters | Owns | Needs | Driver |
| --- | --- | --- | --- | --- |
| **F10-0** | none | chapter registry, vocabulary, test-list fixes, proof matrix, outcome path | `b310267f` | Claude, serial |
| **F10A** | A1, A2, A3 | content on the vocabulary; A2's world transition; moving LCVPs; the moving vehicle column | F10-0 | Claude |
| **F10B** | A4, A5 | rescue actors, boarding and dwell, night start, escort-relative `hold` | F10-0 | Claude |
| **F10C** | J1, J2, J3 | content on the vocabulary | F10-0 | Codex drafts, Claude verifies |
| **F10D** | J4, J5 | airdrop pipeline, recorded drop action, scheduled illumination, night | F10-0 | Claude |
| **F10E** | A6, J6 | populations, route groups, field-state objectives, finale budget, 2 victories, both finale openings | F10-0; J6 waits for D | Claude |

A, B, C and D start together after F10-0 merges. E starts then too: A6 needs only F10-0, and J6 stops at the airdrop task until D merges. Each batch has its own plan file:
`2026-10-17-f10-0-campaign-engine-prep.md`, `2026-10-17-f10a-chapters-a1-a3.md`, `2026-10-17-f10b-chapters-a4-a5.md`, `2026-10-17-f10c-chapters-j1-j3.md`, `2026-10-17-f10d-chapters-j4-j5.md`, `2026-10-17-f10e-finales-a6-j6.md`.

## Rules for every batch

1. **Enroll, don't clone** (`docs/testing.md`, "Philosophy"). A batch edits its own new files (scenario, scene, mission test, handoff) plus its own row in a shared registry (`chapters.json`, `mission-fit.json`, `mission-aircraft.json`, `RIBBONS`). It does not edit `schema.ts`, `step.ts`, `outcome.ts`, `scenario.ts`, `titleScreen.ts` or any shared test list; those changes go through F10-0 or, for B and D, through the primitive that batch owns. A conflict in a shared file is a defect in this rule.
2. **The chapter task sequence** (C1-C8): C1 failing contract test first, red before the scenario exists. C2 scenario JSON and chapter registry row. C3 placement pass (every invented figure labeled with the F3 limit it meets). C4 headless tuning from measurements, geometry and counts only (a "no auto-complete" window; the player cannot win by the AI's own action; weapon margin against real specs; spacing; loops over water, `assertLoopOverWater`); no engine retuning. C5 headless success and failure, the chapter's edge paths, and recovery with the real approach helpers; each new test shown to fail without its fix. C6 enrollment: picker row from the registry, ribbon, the aircraft list, `coordinated`, `authoredBonus`, text-only radio lines, the `mission-fit` row linked to the scenario. C7 the opening scene (first-pass cameras) and its scene test. C8 the e2e case and three captures.
3. **Honesty.** Briefing, history and label per F3 section 10; compressions declared as F3 requires; anything beyond the ledger flagged for Mark.
4. **Night chapters** (A4, J4, J5) report how the near-black player airplane plays (Decision 14) and use scheduled lights, not `fx`.
5. **Every chapter is safe to Continue** (Decision 13): a one-shot spawn or timer must latch, and a badge-earning landing must not end the scripted state mid-script.
6. **The batch closeout** (the `closeout` skill, adapted): full `npm run verify` on ryzen gated on its exit status; the generic nine-path matrix green for the batch's chapters; the capture sheet; a handoff with `Tests updated`, `Tests still valid`, `Known gaps`, the invented figures and every ruling; the handoff emailed (AGENTS.md); merge on a green gate; CI; cleanup.

## Acceptance gates

- **Per chapter:** success, normal failure and its own edge paths pass headless; the chapter's `mission-fit` row passes or carries a reported `expectFail`; its opening plays on its own scenario; the picker row, ribbon, aircraft list and descriptor exist; the e2e passes for the batch.
- **Campaign level, once:** the nine-path matrix across all twelve chapters; every campaign descriptor's id is a picker row whose scenario file parses (no crash at `bootHq.ts:71`); no chapter is both in the campaign pool and the repeatable pool.
- **F10E:** the finale populations are validated (24 airborne, 10 ships, 16 close) and measured on ryzen (Decision 2). Red is recorded, not a blocker.
- **Final:** `npm run verify` green on `main` after each merge; CI green; deployment stays Mark's call.

## Risks

- **Five worktrees, one engine.** The prep branch exists to keep `schema.ts` and `step.ts` out of the parallel work. If F10-0 slips, the batches cannot start; it is the critical path.
- **Dev slots.** Three servers for five batches: batches take turns for capture and e2e runs; headless work needs none.
- **F10-0 size.** About 14 tasks of engine work. Split it into 0a (registry, fixtures, vocabulary) and 0b (field state, outcome, validator) if 0a is ready first; A, B, C and D need only 0a plus the outcome path.
- **Untested feel.** A chapter can pass every headless test and still be unfun. The tuning follow-ups after Mark's flights are expected, not defects.
- **Scale of the new objective vocabulary.** Each primitive is small, but the set touches the mission validator; every one gets a pure unit test and one mission using it before the batches rely on it.

## Out of scope

Deployment; the voice run (Decision 7); the quality ladder and budget ruling; the night-visibility fix (Decision 14); moving the player's airplane's night look; Midway and the other theaters (Track G); F11 validation (it follows F10E).
