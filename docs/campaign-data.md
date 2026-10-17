# Campaign data, persistence and scoring

Standing reference for `src/campaign/` (plan F5A, written 2026-10-14). The types are authoritative
in code (`src/campaign/schema.ts`); the design history and the consumer table are the plan's
[Schema contract C1-C7](superpowers/plans/2026-10-14-f5a-campaign-data-scoring.md#schema-contract-frozen-at-the-end-of-task-3).
Player-facing rules are `GAMEPLAY.md`, "Planned Leyte campaigns"; this file does not restate them.
What the plan measured and what is still open is `handoff/2026-10-14-f5a-campaign-data-scoring.md`.

## Status of the contract

**Frozen at the end of Task 3 (2026-10-14); bumped to `schemaVersion` 2 by F5C (2026-10-16, "Legs" below).** A change to `schema.ts` shapes,
the `bankSortie` order, or `SCORING_RULES_VERSION` is a version bump with a migration and a note to
F5B, F6, F7, F8, F9 and F10. Nobody edits the shapes in place. Nothing was changed after the freeze;
the additions that follow it (`SortieReport`, `Result`, the `aircraft`/`loadout` fact keys) are new
exports, not edits to a persisted shape.

## Rules that are easy to break

- **Pure.** `src/campaign/` imports only itself, `src/sim/rng.ts`, `src/flightRecorder/canonical.ts`, zod and
  `content/campaign/`. No DOM, no `localStorage`, no clock, no `Math.random`. Enforced by
  `campaign-must-stay-pure` in `.dependency-cruiser.cjs` and an ESLint restriction; both are proven to
  bite in `tests/architecture/boundary.test.ts`. `src/sim` may not import `src/campaign`
  (`sim-must-not-import-campaign`). `src/render` may, and does (`debrief.ts` reads `SCORE_POINTS`).
- **Integers only, SI internally.** Points and counters are non-negative safe integers; altitude is metres,
  speed metres per second (D9). `bankSortie` rounds the sim's floats. Imperial is a display concern.
- **Derived, never stored:** pilot tier, adjusted score, command title, eligibility, mission locks.
- **Faction (`'us' | 'ja'`) is not sim `Side`.** A Japanese player flies axis-flagged aircraft.
- **Every state change is a reducer** that returns a new `Campaign` with `revision` + 1, or
  `{ ok: false, error, campaign }` carrying the SAME reference. Unchanged nested objects are shared with the
  input, so a caller must not mutate a campaign.
- **The old roster is not a campaign.** `ww2airsim.roster.v1` is never read as one (D1); `importCampaign`
  rejects a bare roster array with a message.
- **`SortieFacts` reserved keys.** `launchSortie` writes `aircraft` and `loadout` into `pending.facts` (the
  frozen `PendingSortie` has no field for either, and the log entry needs both). F6 and F7 hang their own keys
  beside them and must not reuse those two. F6B writes `sights` (boolean, `abilities(tier).sights` at launch).
- **F7A recovery boundary (2026-10-15).** The simulator resolves a bailout to `rescued`, `captured` or `killed`
  and the shell banks it through `session.bank` (`SORTIE_END_OF`, `src/render/campaignSession.ts`). **`bankSortie`
  already does the campaign half**: `captured` closes the pilot as `pow` and refills the roster in the same call,
  `rescued` keeps the pilot and counts a rescue (`tests/render/campaignBank.test.ts`, "after a bailout"). A bailout
  is never a success: the sim decides (`missionOutcome`), and `bankScored` forces `success` false for every end but
  `landed`. F7A writes no `SortieFacts` key and `src/campaign/` is untouched. The seed and the resolver evidence live
  in the debrief and the Dev flight record, not the campaign log (`LogEntry` has no field for them; persisting them
  would be a `schemaVersion` bump). The POW and replacement were already shown
  by F5B (`src/render/campaignBank.ts`, the archive's P.O.W. filter; verified 2026-10-16). F7B (2026-10-16) added the
  water-rescue raft and launch and the paratrooper drop primitive (`dropStick`, `World.drops`, `ParachutistEntity.kind`),
  and touched nothing here.
- **One closing transaction per sortie.** `bankSortie` is called exactly once per sortie and closes it; since F5C a
  landing at a friendly base first calls `bankLeg` (see "Legs"). A sortie left pending at load is an abandonment (D7),
  applied by `loadCampaign`; what its landings banked stays.

## Legs (F5C, 2026-10-16)

A **sortie** is launch to close; a **leg** is take-off to a full stop on a friendly airfield, carrier deck or anchorage
(`GAMEPLAY.md`, "The sortie, the stop and the recovery rule"). Decisions D1-D12 are in
[the plan](superpowers/plans/2026-10-16-f5c-multi-leg-sorties.md); this section is the data contract.

- **Schema version 2.** `SCHEMA_VERSION` is 2. A version-1 campaign or export is refused with an "older version"
  message and left untouched in storage; there is no migration (D12, as F5A did with the old roster). The index
  file keeps its own `INDEX_VERSION` 1 (its shape did not change), so an old campaign still lists and says why it cannot open.
- **`PendingSortie` gains `legs` and `banked`.** `legs[]` is `{ place, at, counts, pilotPoints, humanPoints }` per banked
  landing (`counts` cumulative at the landing). `banked` is the running total every later bank is measured against:
  cumulative `counts` and `flightSeconds`, the pieces `destruction`/`difficulty`/`completion`/`roster`, `pilotPoints`,
  `humanPoints`, and `qualified`. Invariant `pending-legs`: the pieces sum to `pilotPoints` and the legs sum to the totals.
- **`LogEntry` gains `legs: { place, points }[]`.** One entry per sortie (D10), written by the closing call; empty
  when the sortie banked only at its end. `counts`, `destruction`, `bonuses` and `points` are what the ledgers actually received.
- **`SortieReport` is cumulative for the sortie** (counts, flight seconds, maxima). Every bank takes the delta against `pending.banked`.
- **`bankLeg(c, LegReport, now)`** where `LegReport = SortieReport & { leg, place }`. Banks the delta (destruction points)
  to the pilot and commander ledgers, and the pilot's career (the landing, flight seconds, maxima). At the **first qualifying
  bank** (`success`, the sim's verdict, and `banked.qualified` still false) it also applies the badge, the difficulty and
  completion bonuses, the commander roster bonus and the chapter, once (D4). Keeps `pending` open. It does not touch
  `pilot.sorties`, `ledger.sorties`, `banked` counters, the log, the roster or the attempts. Refused with the same
  campaign reference: `leg` is not the next one (`leg-mismatch`, so a repeat banks nothing), a report that is not a
  landing, a destroyed friendly, counts that went down.
- **`bankSortie(c, SortieReport, now)`** is the closing call. It banks any remaining delta, applies the end kind, closure,
  replacement, the attempts (a failure or abandonment counts only if the sortie never qualified), the stats and the log
  entry, and clears `pending`. With no leg banked it is the whole sortie in one call.
- **What a close forfeits (D5).** `FORFEITING_ENDS` in `scoring.ts`: `abandoned` and any destroyed friendly forfeit
  the **unbanked** part only; banked stays banked. `killed`, `captured`, `ditched` and `rescued` bank their delta as before
  F5C (Mark ruled 2026-10-16, after the first F5C build had made a death forfeit it too); the single constant is the switch.
- **`resolveInterrupted`** is `bankSortie` with an abandon report: banked legs stay, the pilot is not killed (D11).
- **Where the shell calls them.** `session.bankLeg` at each friendly stop, `session.bank` (the close) at the end; see "The shell".

## Modules

| File | Owns |
| --- | --- |
| `schema.ts` | types, constants, the zod validators, the named invariants (`INVARIANTS`, `validateCampaign`), `SortieReport` |
| `ranks.ts` | `tierOf`, `commandTitleOf`, `rankLabel`, `abilities`, `adjustedScore` |
| `scoring.ts` | the difficulty bonuses, `rosterBonusOf`, `scoreSortie` |
| `names.ts` | seeded name draws over `content/campaign/names-{us,ja}.json` (sources in `ASSETS.md`) |
| `roster.ts` | `createCampaign`, entry-rank pilots |
| `eligibility.ts` | `MissionDescriptor`, `eligibility`, `missionLock`, `offers`, `lifeline`, `missionProblems`, the advanced-aircraft list |
| `catalog.ts` | `describeScenario` / `buildCatalog`: descriptors for the shipped non-campaign pool, from picker rows plus scenario facts |
| `bank.ts` | `launchSortie`, `bankSortie`, `resolveInterrupted` |
| `exchange.ts` | `exportCampaign`, `importCampaign`, `campaignFromJson` |
| `storage.ts` | `saveCampaign`, `loadCampaign`, `listCampaigns`, `deleteCampaign`, the profile, over an injected `StoragePort` |

## The shell (F5B, 2026-10-15)

`src/render/campaignSession.ts` is the only code that touches storage and the reducers. It owns the
open campaign, `launchSortie` before takeoff (the pending sortie is persisted so a reload resumes as
interrupted), `bankLeg` once per landing and `bankSortie` once per sortie (two latches, F5C), abandon-as-lost, the stale-revision guard
and the purge of the legacy roster key. `campaignBank.ts` turns a finished sortie into the debrief's
Campaign Ledger. `src/render/hq/` is the UI: `model.ts` (screen state), `launchRules.ts` (what a row,
pilot and aircraft allow), `missionAircraft.ts` (reads `content/campaign/mission-aircraft.json`),
`chapters.ts` (reads `content/campaign/chapters.json`).
**Unscored rule:** Training, Single and any Dev override never call `launchSortie` (`unscoredReason`).
**F6/F7 seam:** a new chapter or mission is a row in `chapters.json` plus its aircraft in
`mission-aircraft.json`; `tests/render/hq/missionAircraft.test.ts` fails if any offered aircraft is
refused by `eligibility`. Nothing in `src/campaign/` changed for F5B.

## How the sim feeds it

`AircraftCombat.tagged` and `tagCredits` (`src/sim/weapons/combat.ts`) are the sim half of destruction credit.
The shell builds `SortieReport.counts` from the player's `tagCredits`, `friendlyDestroyed` from
`friendlyKills > 0` (`friendlyDestroyedBy`, `src/render/discharge.ts`) and `warnings` from `friendlyFire !== null`.
Credit is at the destruction moment; for a ship that is the bottom of its 90 s sinking (ruling D15), so a sortie
that ends inside the window credits nothing for that hull and a friendly hull destroyed inside it does not
discharge. Both are pinned by `tests/sim/weapons/destructionTags.test.ts`. `AircraftCombat.killsByType` keeps its
last-blow rule beside the tags until F5B retires it.

Landing craft enter as a **vehicle** `targetType` (`landing-craft`), because F4 put the LCVP under
`content/vehicles/`. There is no landing-craft ship role; an F10 plan that authors them as hulls adds one.

## The non-campaign pool

`ScenarioOption.pool` (`src/render/titleScreen.ts`) is `noncampaign`, `training` or `single` (ruling D2). Only
`noncampaign`, non-dev rows become descriptors. The authored player airplane of a scenario is never an "enemy
airplane" for the Dev rule (`SortieFacts.authored`, `eligibleAircraft`'s fourth argument), which is what lets the
Japanese **Field Patrol** (`content/scenarios/field-patrol.json`) launch without Dev.

## Proof, and what it does not cover

`tests/campaign/noDeadlock.test.ts` is the acceptance gate: a static per-faction check, an exhaustive model check
(2 factions x 7 chapter positions x 252 tier multisets = 3,528 states, against the shipped and the planned
catalog), and 200 seeds x 400 steps of random play, each with a mutation check that turns it red. It proves the
reducers and the catalog. It does not prove a UI can show the lifeline; that is F5B's headquarters test.
