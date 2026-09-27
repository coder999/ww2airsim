# M2 handoff: the mission UI (2026-09-27)

Branch `worktree-missions-track`, pushed, **not merged**: merging into `main` is Mark's call. Plan: [2026-09-26-m2-mission-ui.md](../superpowers/plans/2026-09-26-m2-mission-ui.md). Spec: [2026-09-25-missions-design.md](../superpowers/specs/2026-09-25-missions-design.md) §9 item 2. The branch contains `main` up to `b1aa7c6` (friendly fire, O1, R1, R2), so it merges without conflicts as of this handoff.

M1's headless mission engine is now visible and playable:
- the orders memo splits Missions from Ranges and shows a mission's briefing;
- an objective line and a radio line appear in flight;
- an intermediate landing continues the flight;
- the chart shows objectives;
- the debrief has an objectives block and a badge verdict;
- a success writes the badge to the pilot.

No shipped scenario is a mission yet (that is M3). In a production build nothing a player sees changes except the friendly-fire call, which moved to the radio line. The UI is proven on the reference GPU against two DEV-only fixtures, `dev-mission-ui` and `dev-mission-circuit`.

**Viewing checkpoint: final product only. The run was unattended.** The captures are in [2026-09-27-m2-shots/](2026-09-27-m2-shots/). To fly it, use a DEV server: pick **UI Fixture (dev)** or **Circuit Fixture (dev)** under Missions on the orders memo. A production build does not list them.

## 1. What changed

| Commit | What |
| --- | --- |
| `50a4299` | Task 1: optional `briefing` and `history` scenario keys (`src/sim/mission/schema.ts`, `checkMission`); the two DEV fixtures; `loadScenarioFile`. |
| `e2d06bb` | Task 2: held-group meshes are built hidden at load, keyed by entity id (R1). `entityViews` returns world-ordered views, so a mid-flight spawn draws. |
| `fc404c6`, `b674b60` | Task 3: the objective line and the radio line (`src/render/mission/hud.ts`), a pure half with thin DOM; review fix: the radio countdown freezes under any debrief. |
| `34c6014` | Task 4: an intermediate landing plays "`<label> n of count`" on the radio line and the flight continues, unpaused and unbanked (`landingFlow.ts`, R2/R3). |
| `d02d53f`, `047d568` | Task 5: the debrief's objectives block and verdict (`debriefMission.ts`); a success writes the badge id to the roster (`awardBadge`); review fix pins reasons non-empty iff no badge. |
| `daebbc1` | Task 6: the orders memo's Missions/Ranges split, the briefing (situation, history, objectives, conditions, badge, recommended loadout applied per R10), the AWARDED stamp, and badge names in the Dossier. |
| `dc2ae8f` | Task 7: the navigation chart marks objective targets and stations, and lists every objective with its status. |
| `9f60659` | Task 8: `__ww2.mission()`; `hopAndLand` split into `hopClear` and `landAndStop('debrief' \| 'stopped')`; `tests/e2e/mission-ui.spec.ts`; fixture fixes (T8-R1/R2). |
| `8293e71` | Merge of `main` (friendly fire, O1, R1): six conflicts, plus the [friendly-fire note for M2](../superpowers/notes/2026-09-26-friendly-fire-for-m2.md) taken up (M-R2, M-R3). |
| `9c9d550` | `friendly-fire.spec.ts` waits for the radio call to clear before its dive (see §4). |
| `c37a3c7` | Merge of `main` (R2 ship roster), clean. |

## 2. Rulings

The plan's rulings, with their reasoning and costs in the plan:

- **R1:** held-group meshes are keyed by entity id, not by index.
- **R2:** the intermediate-landing decision reads the mission log, never the frame.
- **R3:** an intermediate landing banks nothing.
- **R4:** the roster stores badge ids; the Dossier names them.
- **R5:** the scenario option list carries `kind` and `badge`, pinned against content by a Tier 1 test.
- **R6:** `briefing`/`history` are optional in the schema, and required by content tests.
- **R7:** the objective line shows up to two active primaries, excluding `protect`/`deny`.
- **R8:** the radio line plays the log's messages verbatim.
- **R9:** the verdict line is `BADGE AWARDED: <name>`, `MISSION COMPLETE`, or `<reason> — no badge` followed by the rest.
- **R10:** the recommended loadout applies only if the same mission is still selected and untouched.

The executor's own, from the ledger (`.superpowers/sdd/2026-09-26-m2-mission-ui/progress.md`):

- **PF1-PF15 (preflight):**
  - PF2/PF3: the HUD overlap check looks inside `#app`, asserts both elements exist first, and runs at 1440p and 1080p.
  - PF4: AWARDED uses `.stamp stamp--sm`, not the chip the plan's self-review names.
  - PF8: M1's `isDestroyed` param was widened to a `Pick` (type-only, in `src/sim`).
  - PF9: `landAndStop('stopped')` waits for the landing count to rise.
  - PF10: a `deny` objective's entity gets a station ring on the chart.
  - PF11: the entity-view cache key includes spawned ship ids.
- **T1-R1:** the schema test's objective is `land`, because the base fixture starts airborne.
- **T3-R1:** the radio countdown freezes under any debrief, not only on pause.
- **T4-R1:** the `main.ts` footprint is reported both whitespace-ignored and raw.
- **T5-R1:** the remaining verdict reasons render as plain rows.
- **T8-R1, T8-R2:** the DEV fixtures are **calm** and park the player at spot `z: 700`. Measured on the reference GPU:
  - The planned 12 kt crosswind from 090 weathervaned the takeoff roll into the sea.
  - The same wind as a headwind kept the hop airborne past the landing window.
  - From `z: 300` the hop touched down 40 m past the north end: off-field, so no `land` objective completed.

  The spec reads the briefing's wind text from the fixture itself.
- **T8-R3:** each test asserts that the recommended Clean loadout was preselected, then flies with Both. The hop is measured at Both; a clean airplane balloons.
- **T8-R4:** `strike.spec.ts` is not in the regression set. It fails at *collection*, on `main` too (see §5).
- **M-R1:** `main` was merged in before this handoff. It had moved 53 commits with six conflicts, and friendly fire had left a note addressed to M2.
- **M-R2:** the friendly-fire note, done:
  - The "Cease fire!" call plays on the radio line: `radioFeed` merges it with the mission's messages by tick, and works on a flight with no mission.
  - The readout keeps only the `FRIENDLY FIRE` tag.
  - All three debrief sites apply `withMissionDebrief(withDischarge(…))`. A forfeit sortie reads "Friendly fire: sortie forfeit — no badge", followed by the mission's own reasons.
  - `bankMissionResult` takes both `friendlyFire` and `badgeId`, and writes no badge unless `friendlyFire` is null.
- **M-R3:** a landing after friendly fire always opens the debrief, even one the mission counts as intermediate. The discharge has no Continue, and otherwise a discharged pilot would fly on.
- **M-R4:** the two friendly-fire ranges are listed as `kind: 'range'`.

## 3. Mark's answers to the five open questions

All five defaults were accepted on 2026-09-26 ("looks good"):
- the fixtures are DEV-only;
- the objective line is centered at `top: 72px`;
- the in-flight elements use the dark HUD-badge style;
- a radio message shows for 5 s, and pause or a debrief freezes the countdown;
- one Scenario radiogroup with Missions and Ranges subheadings.

## 4. Results

**Tier 1** (`remote-run npm run verify`, ryzen), at the final tree `c37a3c7`: rc=0, 260 files, **2,775 passed**, 29 skipped. The skips are the Blender tests, which skip on ryzen because it has no Blender.

**Determinism.** Every production scenario was advanced 1,800 ticks and hashed (probe `.superpowers/m2/digest.ts`). All nine equal `main`'s at `b1aa7c6`, so M2 changes no sim behavior. The two DEV fixtures hash stably across runs; their hashes changed in Task 8 with their weather and parking spot.

**`main.ts` footprint** (plan target: under 60 changed lines):
- Against `main` at the end: **64 whitespace-ignored, 104 raw.**
- Before absorbing the friendly-fire note it was 56. The extra 8 are the nested `withDischarge`, the `friendlyFireBank`/`badgeId` arguments, the `forfeit` argument, and the radio feed's argument.
- The raw count is higher because Task 4 re-indented the landing debrief into an `else` branch.

**Tier 2** (reference GPU, RX 6700 XT, dev slot `ww2airsim-3`, `--retries=2`):

| Run | Result |
| --- | --- |
| `mission-ui.spec.ts`, before the merge | 2 passed |
| Regression set, before the merge (adapter, meta-game ×2, dossier, scenarioPicker, title, missionMap, entities, deckQuals, fx) | 27 passed, 1 flaky |
| Same set plus mission-ui, friendly-fire and ordnance, after the first merge | 31 passed, 1 flaky, 1 failed: friendly fire "then death" (fixed in `9c9d550`) |
| `friendly-fire.spec.ts` after the fix | 2 passed on the first try |
| Final set on `c37a3c7` (all of the above) | **32 passed, 1 flaky** (deckQuals, below), rc=0 |

- **The flaky test** is `deckQuals` "sails with the carrier". It saw 2.97 s of ticks inside a 5 s wall wait, against a 3 s floor, and passed on retry. M2 does not touch that spec. It is a wall-clock versus tick-rate margin, and it hit in both runs, so it is worth a look.
- **The friendly-fire failure was a timing dependency, not a regression.** A probe logged the altitude through the dive. On `main` and on this branch the trajectory is identical: a phugoid that bottoms out 70-140 m above the sea. `main`'s spec only reached the sea because it dived about 5 s after the hit, while it waited for the readout's transient call to clear. With the call moved to the radio line the test dived at once. It now waits for the radio line to clear, which restores the measured timing and asserts the 5 s show.

**Captures** (read before claiming a pass; [2026-09-27-m2-shots/](2026-09-27-m2-shots/)):
- [briefing](2026-09-27-m2-shots/m2-briefing.png): Missions/Ranges, the briefing, conditions "Calm", the badge;
- [chart](2026-09-27-m2-shots/m2-chart.png): target-1 set as the destination, the objectives list ACTIVE/PENDING;
- [airborne](2026-09-27-m2-shots/m2-airborne.png): RECOVER on the objective line, "Tower: a friendly is passing overhead." on the radio line;
- [debrief](2026-09-27-m2-shots/m2-debrief.png): the objectives block and the BADGE AWARDED stamp. The tilted stamp's lower edge touches the button row; that is cosmetic, and yours to judge;
- [intermediate](2026-09-27-m2-shots/m2-intermediate.png): CIRCUIT 1/2, the "Circuit 1 of 2" radio line, no debrief;
- [friendly-fire call](2026-09-27-m2-shots/ff-radio.png): "Cease fire!" on the radio line, the `FRIENDLY FIRE` tag on the readout.

## 5. Open items and deferred minors

- **`strike.spec.ts` cannot be collected by Playwright, on `main` too.** It imports `src/render/content.ts`, whose `import.meta.env.BASE_URL` is undefined under Playwright's Node loader. So any Tier 2 run that lists it fails before a test runs. The fix belongs to whoever owns strike/E1, not M2.
- **Deferred review minors** (from the ledger; none blocks a merge):
  - Held-*ship* load, hide and teardown paths are untested, because no fixture has a held ship.
  - Teardown in `scenarioEntities.ts` uses three loop shapes.
  - `entityViews` builds its cache-key string every frame.
  - `debrief.ts` detects a success verdict by string-matching it. An explicit field would survive a wording change.
  - R10's title-side guards have no automated test.
  - `titleScreen.ts` keeps a private `sectionTitle`.
  - A `titleScreen.test.ts` comment still says "five shipped scenarios".
  - An empty hidden briefing host is appended even in production.
  - A `MapPoint.objective` doc comment omits `'station'`.
  - The chart's deny ring and reach/hold stations are unit-tested only.
  - The radio countdown counts one frame before a landing debrief freezes it.

## 6. Forward notes for M3

- Add each mission to `SCENARIO_OPTIONS` with `kind: 'mission'` and its `badge`. `options.test.ts` fails until the option list and the file agree.
- Every shipped mission needs `briefing` and `history`.
- Deck Quals' radio line "Trap n of 3" is the engine's own message, so the objective's label must be `Trap`.
- The Tier 2 per-mission specs can reuse `mission-ui.spec.ts`'s `orders` and `onStrip`, and `landAndStop(page, 'stopped')` for intermediate landings.
- **The scripted hop (`hopClear`/`landAndStop`) is measured in calm air, at the Both loadout, from a spot 50 m inside Tacloban's south threshold.** Wind, a clean loadout, or the old gunnery spot all break it (T8-R1..R3).
- `dev-` fixtures stay DEV-only (open question 1).
- A mission debrief after friendly fire shows the discharge overlay with the objectives block and no badge. M3's specs should expect that combination if they cover it.
