# Campaign data, persistence and scoring

Standing reference for `src/campaign/` (plan F5A, written 2026-10-14). The types are authoritative
in code (`src/campaign/schema.ts`); the design history and the consumer table are the plan's
[Schema contract C1-C7](superpowers/plans/2026-10-14-f5a-campaign-data-scoring.md#schema-contract-frozen-at-the-end-of-task-3).
Player-facing rules are `GAMEPLAY.md`, "Planned Leyte campaigns"; this file does not restate them.

## Status of the contract

**Frozen at the end of Task 3 (2026-10-14).** `schemaVersion` is 1. A change to `schema.ts` shapes,
the `bankSortie` order, or `SCORING_RULES_VERSION` is a version bump with a migration and a note to
F5B, F6, F7, F8, F9 and F10. Nobody edits the shapes in place.

## Rules that are easy to break

- **Pure.** `src/campaign/` imports only itself, `src/sim/rng.ts`, `src/flightRecorder/canonical.ts`, zod and
  `content/campaign/`. No DOM, no `localStorage`, no clock, no `Math.random`. Enforced by
  `campaign-must-stay-pure` in `.dependency-cruiser.cjs` and an ESLint restriction; both are proven to
  bite in `tests/architecture/boundary.test.ts`. `src/sim` may not import `src/campaign`.
- **Integers only, SI internally.** Points and counters are non-negative safe integers; altitude is metres,
  speed metres per second (D9). Imperial is a display concern.
- **Derived, never stored:** pilot tier, adjusted score, command title, eligibility, mission locks.
- **Faction (`'us' | 'ja'`) is not sim `Side`.** A Japanese player flies axis-flagged aircraft.
- **Every state change is a reducer** that returns a new `Campaign` with `revision` + 1.
- **The old roster is not a campaign.** `ww2airsim.roster.v1` is never read as one (D1).

## Modules

| File | Owns |
| --- | --- |
| `schema.ts` | types, constants, zod validators, the named invariants (`INVARIANTS`) |
| `ranks.ts` | `tierOf`, `commandTitleOf`, `rankLabel`, `abilities`, `adjustedScore` |
| `names.ts` | seeded name draws over `content/campaign/names-{us,ja}.json` |
| `roster.ts` | `createCampaign`, entry-rank pilots |

Later tasks append their modules here as they land.
