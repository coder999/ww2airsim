# Campaign data, persistence and scoring

Standing reference for `src/campaign/` (plan F5A, written 2026-10-14). The types are authoritative
in code (`src/campaign/schema.ts`); the design history and the consumer table are the plan's
[Schema contract C1-C7](superpowers/plans/2026-10-14-f5a-campaign-data-scoring.md#schema-contract-frozen-at-the-end-of-task-3).
Player-facing rules are `GAMEPLAY.md`, "Planned Leyte campaigns"; this file does not restate them.
What the plan measured and what is still open is `handoff/2026-10-14-f5a-campaign-data-scoring.md`.

## Status of the contract

**Frozen at the end of Task 3 (2026-10-14).** `schemaVersion` is 1. A change to `schema.ts` shapes,
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
  beside them and must not reuse those two.
- **One transaction per sortie.** `bankSortie` is called exactly once per sortie (D12: a landing ends the sortie
  in campaign mode, no Continue). A sortie left pending at load is an abandonment (D7), applied by `loadCampaign`.

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
interrupted), `bankSortie` exactly once per sortie (a latch), abandon-as-lost, the stale-revision guard
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
