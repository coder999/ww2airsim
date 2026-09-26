# M1 handoff: the mission engine (2026-09-25)

Branch `worktree-missions-track`, cut from `main` at `d68a652` (`git merge main` at the start was already up to date). Not merged, not pushed. Plan: [2026-09-25-m1-mission-engine.md](../superpowers/plans/2026-09-25-m1-mission-engine.md). Spec: [2026-09-25-missions-design.md](../superpowers/specs/2026-09-25-missions-design.md) §9 item 1.

A scenario that declares `objectives` now gets a `World.mission`, stepped once per tick inside `advance` after combat resolves. A scenario without objectives gets `mission: null`, and the new code path is skipped entirely. No shipped scenario declares an objective, so nothing a player sees has changed.

## What changed

- `f96e0b5`: `src/render/landing.ts` moved to `src/sim/landing.ts`; `LandingReport.at` is now `LandingAt = { kind, id, name }`. `id` is the content id (`tacloban`), `name` is still the display name (`Tacloban`), so the debrief text is unchanged.
- `19993e3`: `src/sim/mission/schema.ts` (station, seven objective kinds, triggers, badge); scenario `tags` on aircraft and ships, `objectives`/`triggers`/`heldGroups`/`badge`, and `checkMission` in `src/sim/scenario.ts`; optional `tags` on airfield buildings; both loaders fetch held groups' specs (`scenarioAircraftSpecIds`, `scenarioShipSpecIds`).
- `9659d5a`: `MissionState` and `ticksFor` (`src/sim/mission/state.ts`); `createMission` and `resolveRefs` (`create.ts`), which resolve ids and tags when the world is built and throw on a reference that matches nothing, is ambiguous, or asks for more than exist; `World.mission`; `buildShip`/`buildAircraft` extracted from `worldFromScenario` so held groups are built by the same code as start entities.
- `aa7c748`: `spawnInto` and `spawnHeldGroup` (`spawn.ts`), the only way an entity appears after tick 0. Entities are appended, so existing indices do not move.
- `bcb76e0`: `stepMission` (`step.ts`) evaluates all seven objective kinds every tick and runs the player's landing tracker per tick; the hook in `advance`.
- `194b10e`: triggers (`at`, `completed`, `failed`, `enters`), each once, in file order, after objectives; `spawn` and `message` actions.
- `23d7003`: `recoveryOf`, `finalStatus` and `missionOutcome` (`outcome.ts`); `recoveryAgreement.test.ts` pins that the render banking path and the mission agree on landed-at-airfield, landed-on-carrier, off-field, ditched, killed by impact and destroyed in the air.

`npm run verify` (run as typecheck, lint, depcruise and the full vitest suite, under a lock shared with a concurrent session) gave `rc=0` after every commit. After `23d7003`: 1735 passed, 12 skipped (the missing terrain tiles).

## Bit-identity evidence (node v22.22.1)

The probe builds every shipped scenario with no terrain, advances 1,800 ticks, and hashes `{tick, aircraft, ships, combat, accumulatorSeconds}`. It ran before any change and after Tasks 1, 3, 5 and the final commit. Every run matched the baseline character for character.

| Scenario | sha256 at tick 1800 (baseline = final) |
| --- | --- |
| deck-quals | `b5f020f785220cf082bb553e2fc2636434682a362d9291f021a42525873ba138` |
| free-flight | `d65f17b91698e3cafd425597c77a5f5e8f54e2fd00395bef1589c8c2b23c99cc` |
| gunnery-range | `6299059e222112c1c47e22ab416333d1b71c0292d28235ff654030d41acee7d6` |
| pursuit-range | `9c3eda2cec975dd742a8c50381bc420284b6414a3daceb3930952f44db649aad` |
| pursuit-range-veteran | `90ff735cfef50146b501b66ed2f4e0fa4afadd3ce02c675b1109c8c432b3a2ec` |
| strike-range | `be954f43d735ecef64fd38b88dacd32a0205c88cb9c5b152d72cada27593fd0f` |

## Rulings

The plan's rulings, with the reasoning in the plan's "Rulings this plan makes":

- R1: one landing tracker, two callers (the frame per frame, the mission per tick).
- R2: `LandingReport.at` gains `id`.
- R3: held aircraft must start airborne.
- R4: ids and tags resolve when the world is built; a bad one fails the load.
- R5: the step reads `MissionTick`, not `World`, and returns spawn requests.
- R6: `HeldGroupObject` lives in `scenario.ts`, not `mission/schema.ts`.
- R7: radio messages are an append-only, tick-stamped log.
- R8: `after` must name an earlier objective.
- R9: distances are horizontal.
- R10: time counts in ticks.
- R11: impossible missions fail at parse.
- R12: player-relative evaluation stops when the player is gone.
- R13: what counts as destroyed.
- R14: one landing advances every matching `land` objective.
- R15: `briefing` and `history` are M2's.
- R16: outcome reasons in a fixed order.

The executor's own:

- `ticksFor(0)` returned `-0` (`ceil(0 - 1e-6)`), which fails `toBe(0)`; it is wrapped in `Math.max(0, …)`. No positive input changes.
- The plan's hook in `advance` failed typecheck: `mission` is a reassigned `let`, so TypeScript drops the `!== null` narrowing inside the spawn loop. The stepped mission is held in a non-null local and assigned back. Same behavior.
- `docs/superpowers/specs/2026-09-25-missions-design.md:61` still names `src/render/landing.ts`. It is the approved spec arguing for this move, so it was left as written.

## Forward notes for M2

- **Spawned entities have no mesh.** `src/render/scenarioEntities.ts` builds one airframe per `world.aircraft` entry at load, and `main.ts` indexes `smokes[i]!`. A spawned aircraft is appended at the end and would throw there. M2 must build meshes for held groups at load, hidden until spawned, before any mission with a held group ships. M3's Airfield Strike is the first.
- **Intermediate landings.** The frame's tracker still latches `frame.landing.report` until `acknowledgeLanding`. M2 reads `lastLanding(world.mission)`: when `intermediate` is `true`, it shows the radio line and acknowledges instead of opening the debrief.
- **Recovery.** Call `recoveryOf(world)` at the moment the frame shows a debrief, then `missionOutcome(mission, recovery)` for the objectives block, the badge and `reasons`.
- **The radio line** reads `radioMessages(mission)`, keyed by `tick` (R7).
- **`briefing` and `history`** keys are M2's to add (R15).

## Forward notes for M3

- Deck Quals' secondary objective, "no wave-offs", has **no objective kind** in spec §2.1's vocabulary. M3's plan must decide how to express it, and first confirm that the Paddles `wave-off` cue can be counted by its edges (spec §4.1). Adding a kind is a vocabulary change under spec §0.3's "objectives + simple triggers".
- Dulag's buildings need `tags` (`dulag-hangars`, `dulag-aaa`) when M3 adds its AAA content.
- `tests/sim/mission/content.test.ts` builds each new mission file automatically.

## For Lane A (7e)

`spawnHeldGroup(world, groupId)` is the insertion path its "spawn a pilot at tick 3,000" test needs. `pilotAssignmentFrom` is unchanged, and no `side` field was added.

## No Tier 2

M1 is Tier 1 only (spec §9), and nothing in it is visible in a browser.
