# F10-0: campaign engine prep (plan, 2026-10-17)

Part of [F10](2026-10-17-f10-campaign-missions-master.md); read its Decisions and Rules first. **Status: built 2026-10-17 on `f10-0-prep`; the as-built contract is `docs/campaign-data.md`, "Chapter missions", and the deviations are in the handoff.**

## Header

- **Branch:** worktree `~/projects/ww2airsim-worktrees/f10-0-prep`, cut from `main` `b310267f`. **Serial: it is the critical path.** No batch starts until it merges.
- **Run mode:** unattended; viewing checkpoint: none (an engine and registry plan, nothing a player sees). **Driver:** Claude, no Codex.
- **Size:** about 14 tasks. Split at the 0a / 0b line if 0a is green first: 0a = T0.1-T0.9, T0.12; 0b = T0.10, T0.11, T0.13, T0.14. A, B, C and D need only 0a plus T0.8 and T0.10.
- **What this plan is for:** every shared file the five batches would otherwise collide in (`schema.ts`, `step.ts`, `state.ts`, `outcome.ts`, `scenario.ts`, `titleScreen.ts`, the hard-coded test lists), done once, with a pure unit test for each primitive and one mission-level use before any batch relies on it.

## Verified starting facts

Those in the master plan's table, plus: the objective kinds are the ten in `src/sim/mission/schema.ts:70-90`; trigger `when` is at, completed, failed, enters, state; trigger `then` is spawn and message only;
`protect` and `deny` complete at mission end if still active (`outcome.ts:48`); `destroy` counts a target killed any time since tick 0 (`step.ts:116-121`); `reach` and `hold` read the player's position only (`step.ts:145-151`).
`combat.aircraft[id].bombsDropped` and `torpedoesDropped` exist for any aircraft; `combat.ships[id].hp` and `hullHp` exist for any ship (`combat.ts:145-150`). **Re-verify these on the branch before T0.3; a changed number is a plan defect, not a surprise.**

## The vocabulary this plan adds

All additions are optional fields or new kinds, so every existing scenario parses and plays unchanged (proved by the existing mission tests, the golden recordings and the flight-recorder suites, which must stay green untouched).

| Name | Meaning | First chapters that use it |
| --- | --- | --- |
| `arrive {targets, count, zone}` | at least `count` of the named AI entities (ids or tags) are inside `zone` (a station) | A5 rally gate, J1 (Ki-21 crosses Buri), J3 (vehicles enter the dispersal zone) |
| `released {targets, store, count}` | at least `count` of the named aircraft have released `store` (bomb, rocket, torpedo), read from their combat records | A5, J6 (bomber pair release), A6 (effective release, with D's drop) |
| `damage {targets, belowHpFraction, anyOf?}` | a named ship's hull points are below the fraction (a hit, not a sinking) | A2, J2, J4 |
| `window {from?, until}` on an objective, and trigger `then` actions `complete`, `fail` | a `protect`, `deny` or `destroy` is judged only inside the window and completes or fails when it closes, not at mission end | A1, A2, J4, A6, J6 |
| `atLeast {n, of: [objectives]}` (with `any` = 1 and `all` = every child as sugar) | an objective that completes when at least `n` children do | J2 (Maru or Fletcher half hull: `any`), J1 (three of five groups intact) |
| a station may be an annulus (`innerRadiusM`), and `hold {…, relativeTo: <tag>}` | "outside the flare"; an escort station that follows a moving group's centroid | J4; A5 and J6 |
| trigger `when`: `departed`, `landed`, `groupGone {tag}`, `arrived`; | spawn conditions on entity-set events | A6, J6 (timed route-group admission), A4 (rescue secure) |
| plane state: `headingDeg` range, `groundSpeedMps` range; `dwellS` and `hold` with `resetOnExit` | a condition held continuously, reset when it breaks | A4 (below 2 kt for 20 s; below 1 kt, engines idle, 10 s), J5 corridor |
| `field {airfields, state, min}` objective; `land.at` as a set with a state condition; trigger `then` `setServiceable`, `setSide` | mutable airfield state: serviceable derived from the field's own tagged structures (a threshold), a conditional recovery graph | A6, J1, J6 |
| `recovery: {kind: 'egress', gate}` on a scenario | crossing the gate is the authored recovery; `missionOutcome` awards the badge without a landing | J2, J4, J5 |
| `population {airborne, ships, close}` and a validator; route-group admission | simultaneous maxima checked at load; groups admitted when the group ahead is gone | A6, J6 |

## Tasks

Each task: the failing test first (red before the code), then the change, then green on ryzen.

**T0.1 Chapter registry and campaign pool.** `content/campaign/chapters.json` gains per chapter: `scenario` (the slug id), `badge {id,name}`, `start`, `aircraft` (the authored airplane first), `recommendedLoadout`, `coordinated`, `authoredBonus` (A4 2500), `minTier`. A new `src/campaign/chapterMissions.ts` returns the campaign descriptors; `buildShellCatalog` (`src/render/campaignSession.ts:107`) appends a chapter only when its scenario file exists (fail-safe, named). `ScenarioPool` gains `campaign`; `SCENARIO_OPTIONS` appends chapter rows derived from the registry, so no batch edits `titleScreen.ts`. Tests: a descriptor with a missing scenario file is not enrolled; every enrolled id is a picker row and its scenario parses (the `bootHq.ts:71` guard); a chapter is never in the `noncampaign` pool (`catalog.ts:48,61`); `missionProblems` is clean for every descriptor; `tests/render/hq/model.test.ts:198` still matches the GAMEPLAY table. Also fix the stale line in `docs/campaign-data.md:203-205`.

**T0.2 Hard-coded lists become derived.** `tests/sim/mission/content.test.ts:41` (`MISSION_IDS`), `tests/sim/scene/content.test.ts:17-20`, `tests/render/hq/missionAircraft.test.ts:32-38`, `tests/render/titleScreen.test.ts` (121, 146, 171), `tests/sim/nightFacts.test.ts:47`, `tests/render/campaignSession.test.ts:71`, `tests/campaign/eligibility.test.ts:143`, `tests/campaign/noDeadlock.test.ts:31` derive from the registry or the directory, with the two demo scenes still accepted until deleted. Each converted test is shown red against a deliberately bad entry. `tests/build/dist.test.ts` keeps its short list (it need not pin every scenario).

**T0.3 `arrive` and `released`.** Pure functions over `combat` records and entity positions in `step.ts`; schema, `checkMission` (targets resolve to entities or tags; a station) and `create.ts` resolution. Tests: arrival counts only the named entities; a tag minimum composes with a second objective ("two tanks" plus "ten powered"); `released` reads AI releases; neither fires from the player's own actions unless named. One mission-level test per primitive on a small fixture (`tests/sim/mission/fixture.ts`).

**T0.4 `damage`.** Reads `combat.ships[id].hp` against `hullHp`; `anyOf` over a set. Tests: a ship at 60 percent is not below 0.5; at 49 percent it is; a sunk ship counts; the objective does not complete from a different ship.

**T0.5 Windows, `atLeast`, annulus stations, `hold relativeTo`, trigger predicates and `then` actions.** `window` on `protect`, `deny` and `destroy`; `then` actions `complete: id` and `fail: id`; `when` predicates `departed`, `landed`, `groupGone`, `arrived` over tag sets. A window that never closes behaves exactly like today (the default). Tests: `protect` with `maxLost: 1` goes green at the window's end, not at mission end; a loss past the cap inside the window fails it immediately; a loss after the window does not; `atLeast` completes on the n-th child (`any` on the first, `all` on the last); `groupGone` fires on the tick the last member departs, lands or dies; an annulus station is satisfied only outside its inner radius; `hold relativeTo` follows the group's centroid as members die; the trigger log order is deterministic across two runs.

**T0.6 Dwell, corridor, ground speed, heading.** Extend `planeStateShape` (`schema.ts:43-51`): `headingDeg`, `groundSpeedMps` (ground speed over the surface, including water), engine idle as a throttle range (exists). `dwellS` requires a continuous match and resets on exit; `hold` gains `resetOnExit`. `PLANE_STATE_FIELDS` and the empty-check follow. Tests: a dwell breaks and restarts; a corridor fails (not merely un-completes) when left, when the objective says so; ground speed on water reads 0 when drifting at 0 relative to the surface; existing `state` and `hold` behavior is unchanged (the 405 mission tests stay green).

**T0.7 Mutable airfield state.** A field's serviceability and side become mission state (a map on `MissionState`, absent unless a mission declares it, so unchanged worlds carry no new field): `serviceable` is derived from the fraction of the field's tagged structures still alive against a threshold, or set by a trigger `then`. `friendly.ts:59` and the landing and recovery readers go through one accessor. `field {airfields, state, min}` and `land.at` as a set with a state condition (J1: Buri, or Bayug only when Buri is not serviceable; A3: Tacloban only; A6: any of three while serviceable). `worldChecksum` is only affected for worlds that declare it (proved by the golden recordings). Tests: destroying structures drops a field below the threshold at the right tick; the conditional landing set accepts only the legal field; a landing at an ineligible field is not a recovery; the accessor equals the static value for every shipped scenario.

**T0.8 Egress outcome.** `recovery: {kind: 'egress', gate}` on a scenario; `missionOutcome` (`outcome.ts:69-90`) awards the badge when every primary is complete and the player crossed the gate alive, with no landing. A landing at an allied field, or a ditching, in a chapter that declares egress is not a success. `suggestedRecovery` and the bank's leg logic stay as they are. Tests: gate crossed with all primaries green is `success`; crossed with a primary short is `no-badge` naming it; crossed after death is not recovery; every existing mission's outcome is unchanged. GAMEPLAY gets the "friendly egress boundary" line.

**T0.9 Population validator and route groups.** `population {airborne, ships, close}` is a load-time check on the simultaneous maximum (held groups count from their admission rule, replacements wait for the group ahead); `checkMission` rejects a scenario whose peak exceeds it. Route-group admission uses T0.5's `groupGone`. Tests: A6's 24/10/16 fixture passes; one extra airplane fails; a replacement admitted before its predecessor is gone fails.

**T0.10 Descriptor flags, aircraft lists, and the Continue latch.** `coordinated` is read from the chapter registry (F5A's `isCoordinated` only derives it for pool missions); the sortie rule (`src/sim/sortie.ts:47-71`) accepts the chapter's own aircraft list, authored first, for a campaign sortie only (J6 offers two). The latch (Decision 13): after the chapter's qualifying landing banks, a Continue relaunch carries no scripted spawns or objectives; a non-qualifying landing's Continue resumes the script as it stands. **Research first:** read `groundStop` and the F5C relaunch path to find where mission state survives a leg, then test both outcomes. Tests: a chapter descriptor with an unlisted airplane refuses; J6 accepts both; after a qualifying landing and Continue no held group spawns and no objective changes status; after a non-qualifying one the attack window continues.

**T0.11 Ki-57 scoring.** Check how an aircraft's role maps to a `TargetType` (`src/sim/weapons/targetType.ts`); A6, J5 and J6 kill Ki-57s and GAMEPLAY says a bomber or transport pays 750. Test the real mapping and fix to 750 if it pays the 500 transport row. Record in the handoff either way.

**T0.12 Mission-fit linked to the scenario.** A fit row gains an optional `scenario`; when set, the harness reads the scenario's real start and first-action point instead of the hand-transcribed invented ones, so a chapter's row stops proving arithmetic only. Existing rows are unchanged until a batch links its own. Tests: a linked row uses the scenario's start; an unlinked row is as before; the A5 `expectFail` still fails the same check.

**T0.13 The generic nine-path matrix.** One data-driven test over the chapter registry at the reducer level: success, normal failure, abandon, KIA, POW, bailout, discharge, restart and retry, each asserting the banked score, the ledger, the pilot's fate, the chapter state and the `scenesSeen` result. Chapters with no scenario yet are a named skip, so each batch turns its rows on by landing a scenario. Tests prove the matrix can fail (a perturbed reducer result goes red).

**T0.14 Docs and closeout.** `docs/campaign-data.md` (registry, vocabulary, egress, latch), `MASTER_PLAN.md` F10 status, handoff with the three test lists, then the closeout: `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on ryzen gated on its exit status, merge, CI, cleanup.

## Gate

`npm run verify` exit 0; every existing mission, golden-recording and flight-recorder test green and unedited; each new primitive has a unit test and one mission-level use; the registry guards pass with zero chapters enrolled (F10-0 enrolls none) and with a fixture chapter.
