# F5A handoff: campaign data, persistence and scoring

**Date:** 2026-10-14
**Branch:** `plan-f5a-campaign`, cut from `main` at `c3b8b299`, worktree `/home/mark/projects/ww2airsim-plan-f5a-campaign`
**Status:** built unattended; merged to `main` 2026-10-14 (the friendly-fire specs' 120-sample frame check awaits the nightly ryzen run); **not deployed**. Mark's rulings D1-D16 were binding throughout.
**Plan:** [2026-10-14-f5a-campaign-data-scoring.md](../superpowers/plans/2026-10-14-f5a-campaign-data-scoring.md) (two of its own numbers were wrong and are corrected in it, below).
**Reference:** [docs/campaign-data.md](../campaign-data.md). Ledger: `MASTER_PLAN.md`, F5.

## Result

Tasks 1-11 and 13 landed as code and tests; Task 12 is F5B's by ruling D1 (no code); Task 14 is this closeout. The contract
was **frozen at the end of Task 3 and not changed afterward**: there was no version bump (`schemaVersion` is 1). The only
additions after the freeze are new exports (`SortieReport`, `Result`, the catalog builder) and two reserved `SortieFacts`
keys (see Deviations).

`npm run verify` on ryzen (`REMOTE_RUN_OVERFLOW=0 remote-run bash -c 'npm run verify; ...'`, gated on the exit status):
**exit 0** (typecheck, lint with `--max-warnings 0`, depcruise, then 454 test files: 6,870 passed, 12 skipped by name, 0 failed; 371 s), on the tree snapshot of commit `HEAD` as of the commit that added this handoff. The first two runs failed honestly and were fixed: an unused-variable lint error, then `tests/audio/radio.test.ts` (the four new scenario messages needed table entries).

New tests: 218 across 11 files (`tests/campaign/*` 191, `tests/sim/weapons/destructionTags.test.ts` 22,
`tests/sim/mission/missions/field-patrol.test.ts` 5), plus 5 boundary tests and 2 sortie-rule tests added to existing files.

## What was built

- `src/campaign/` (about 1,100 lines, 10 modules) and its two dependency-cruiser rules plus an ESLint restriction, each
  shown to bite in `tests/architecture/boundary.test.ts`.
- Sim (Task 7): `AircraftCombat.tagged` / `tagCredits`, the credit sites for aircraft, structures, vehicles and ships,
  two new `TargetType` rows (`light-vehicle`, `landing-craft`), `withDischarge` keyed on `friendlyKills`, one scoring
  table (`debrief.ts` reads `SCORE_POINTS`). Mutation-checked: reverting the aircraft tag, the ship credit, the structure
  credit, or the discharge key each turns named tests red.
- Task 9: **Field Patrol**, an A6M2 Zero over Dulag against two waves of Hellcats, a `RIBBONS` design, a cited briefing,
  a `SCENARIO_OPTIONS` row with the new `pool` field on every row, and a headless verdict test. The Zero was already
  flyable and Dulag already had a recovery graph, so no stop condition triggered.
- Names: 96 given x 182 family (American), 77 x 169 (Japanese, with kanji), per-list source ledger in each file and in
  `ASSETS.md`.

## The exhaustive-search report (Task 10)

The model check enumerates every `(faction, chapters completed 0..6, multiset of five live tiers)`: 2 x 7 x 252 =
**3,528 states**, each built through the real reducers (`tests/fixtures/campaign.ts`), then applies every terminal outcome
(`SortieEndKind` x success x difficulty x friendly destruction, with identical sorties collapsed: 24 outcomes) for every
distinct pilot tier on one mission of each effect class (non-campaign, current chapter), through the real `launchSortie`
and `bankSortie`, then closes all five original pilots in consecutive sorties. After each step it asserts five live
active pilots, no broken invariant, a non-null `lifeline`, an open lock, and a `launchSortie` that accepts it.

| Catalog | States | Outcomes banked | Mass losses | Failures | Wall time (nexus) |
| --- | ---: | ---: | ---: | ---: | ---: |
| shipped (11 pooled rows) | 3,528 | 254,016 | 3,528 | 0 | 5.0 s |
| planned (shipped + GAMEPLAY.md's twelve chapters, parsed) | 3,528 | 411,264 | 3,528 | 0 | 7.1 s |

Collapsing the outcomes by effect class is stated in the test, not hidden: the 11 non-campaign rows share one post-launch
transition, so each is checked for launch acceptance (through `lifeline`/`offers`) but banked once as a class.

Layer 3, 200 seeds x 400 steps of random play, ran 80,000 steps with 22,985 pilots lost, with a save/load and an
export/import round trip every 61 steps (55 s on nexus; it is the slowest test in the new set).

**Mutation checks (the proof can fail):** removing the Japanese entry-rank row, removing every American entry-rank row,
emptying the name pool, and letting a closure skip the refill each turn the model check red with a message naming the
state (`ja chapter 0 tiers [1,1,1,1,1]: lifeline is null`, `threw ...`, `invariants broken: ... live-active`).

## Measured save size (Task 11)

Through the real reducers, `canonicalStringify(campaign)`, characters = bytes except for kanji:

| Campaign | American | Japanese |
| --- | ---: | ---: |
| new (5 pilots, nothing flown) | 3,118 B | 3,233 B |
| long career (20 closed dossiers of 50, five live pilots at 200, human log at 500, typical sorties) | **1.29 MB** | 1.28 MB |
| capped worst case (100 closed dossiers x 50, live at 200, human 500, every class counted, long ids) | **3.72 MB** | 3.71 MB (3.71 MB as UTF-8) |

**The plan's 1.5 MB worst-case claim was wrong and is corrected in the plan (C5, Task 11, R6).** A `LogEntry` with its
dense `counts` map is about 500 bytes and ruling D10's caps allow 6,500 entries, so 1.5 MB is unreachable without
changing the entry shape or the caps. The tests pin the capped worst case under 4 MB and a 20-death career under
1.5 MB. **Two capped careers do not fit one origin's quota (about 5 MiB).** Options for Mark/F5B, none taken: warn in the
UI from `listCampaigns` and offer export; store `counts` sparsely in a v2 bump (saves about a third, still about
2.4 MB); lower the D10 caps.

## Deviations from the plan

1. **Landing craft are a vehicle `targetType`, not a ship role.** The plan said to retarget `shipTargetType`; F4 put the
   LCVP under `content/vehicles/`, and a ship role would have touched ship collision, the scene and the Hangar for no
   content. `shipTargetType` is unchanged. An F10 plan that authors landing craft as hulls adds the role.
2. **`PendingSortie` has nowhere to put the aircraft and loadout the `LogEntry` needs.** `launchSortie` writes them into
   `pending.facts` under reserved keys `aircraft` and `loadout` (documented in `docs/campaign-data.md`). Not a shape
   change; F6/F7 must avoid those two keys.
3. **`eligibility()` takes the campaign faction as a fourth argument.** The plan's `eligibility(pilot, mission,
   aircraft)` cannot return its own `'faction'` reason because a pilot record carries no faction.
4. **Task 9 needed a sortie-rule change.** `eligibleAircraft` / `sortieRulesBroken` refused every non-allied airplane
   outside Dev, so a non-dev Japanese mission could not launch. The scenario's own authored player airplane is now
   exempt (`eligibleAircraft`'s fourth argument, `SortieFacts.authored`), plumbed through `sortieFlow.ts`,
   `devRecord.ts` and `main.ts` (three one-line call-site edits in `src/render/`, no screen changes). Without it the row
   would have been visible in the live title screen and failed on launch.
5. **Descriptors are built by `src/campaign/catalog.ts` from picker rows plus scenario facts**, not from `SCENARIO_OPTIONS`
   directly (campaign code may not import `src/render`). `coordinated` is derived (two or more friendly aircraft types or
   formations) until F10 authors it; that makes Escort and Flattop Hunt coordinated, so the American entry-rank rows are
   the other seven.
6. **Two plan numbers corrected in the plan:** `SCENARIO_OPTIONS` had 32 rows with 13 dev (the plan said 30 and 11), and 6
   unit test files import `roster.ts` (the plan said 7 and listed six).
7. **Plan claim "dishonorable discharge needs a destroyed friendly" holds, but the E2E needed more than an assertion edit.**
   See Tests updated.
8. Task order: the name lists and `createCampaign` landed with Task 3 (a campaign needs five named pilots), so Task 4's
   commit is combined with it.

## Tests updated / Tests still valid / Known gaps

**Tests updated** (assertion moved with the behavior):

- `tests/render/discharge.test.ts`: "a round into an allied ship discharges" is now "warns only", and a new test sinks the
  ship and discharges only at the bottom, 90 s later (D15). The tower-bomb tests still discharge because the bomb destroys it.
- `tests/render/debrief.test.ts`: transport 500 (was 400), destroyer 1,000 (was 750), 13 rows (was 11), and a test for the two new rows.
- `tests/sim/weapons/targetType.test.ts`: 13 rows.
- `tests/render/titleScreen.test.ts`, `tests/sim/mission/content.test.ts`: the 14th mission and its label, badge and history.
- `tests/render/mission/options.test.ts`: the "own aircraft is eligible with Dev off" check passes the authored aircraft.
- `tests/sim/sortie.test.ts`: the authored-aircraft rule, both ways.
- `tests/architecture/boundary.test.ts`: two rule names pinned, five probes.
- `tests/e2e/friendly-fire.spec.ts`: the range test now also finishes the ally (hold fire until it burns, wait for
  `friendlyKills`) before diving, since the first hit is only a warning; the field test is unchanged (the headless run of
  the same pass destroys the ally at tick 1,983 and lands at 2,783, so the discharge still lands before the debrief).
- `tests/e2e/harness.ts`, `tests/e2e/title.spec.ts`: Field Patrol is a "Missions" label and the last scenario row.
- `src/audio/radio.ts`: four new deliberately-silent entries (a table the audio test enrolls).

**Tests still valid** (searched, ran, unchanged): the flight-recorder suite (checksums are build-bound and compare only
against themselves; none pins a literal), the golden trajectory, the furball and AA soaks, `tests/sim/weapons/friendlyCredit`
and `friendlyFire`, the Hangar `stats` and `points` cards (they read `pointsForTargetType`), the dossier and roster suites
(they still use the old ladder, which F5B deletes), `insignia.test.ts` (enrolled the new ribbon without edits).

**Known gaps:**

- **E2E run on nexus's local GPU by the coordinator and then by me (2026-10-14).** `missions.spec.ts` 11/11 and `title.spec.ts` 2/2 pass; `sortie.spec.ts` passes. Two things the blind edits missed were fixed: (1) `title.spec.ts` "qualifications lead" exposed a real bug, a new pilot was led to the first mission row (Catalina Water Qualification) instead of Basic Flying; `titleScreen.ts` now picks the first `pool: 'training'` mission. (2) `friendly-fire.spec.ts` "then death" now keeps the trigger down through the warning and until the ally burns (it pulls out of the line after the first hit, so a released trigger never hits again), then waits for `friendlyKills` before the dive. Its assertions on KILLED, forfeit and K.I.A.-not-discharged are unchanged and pass. **Still red on nexus, environmental:** both friendly-fire tests reach their final `liveChecks` and fail `gpu.length > 120` (70 and 86 samples on the 680M); the field test also fails intermittently with `impact` in `flyPass` and does so on the base commit too (verified with the base spec). `scenarioPicker.spec.ts:148` and `meta-game.spec.ts:39` fail on gunnery-range's entity list (`f6f-2` vs `target-1/2`); **both fail identically on current main (`aafd50e7`)**, checked in a detached worktree, so they are pre-existing and untouched. `dossier.spec.ts` and `meta-game-relaunch.spec.ts` pass on this branch (nexus GPU). **The ryzen-GPU run of the two friendly-fire specs was not done:** starting the Playwright server in Mark's console session (a scheduled task over ssh) was denied by the permission classifier, so only the nexus runs above exist. Run them on ryzen to clear the 120-sample check. Re-run the two friendly-fire tests on ryzen's GPU for the sample count.
- Field Patrol is not exercised in the browser, and the title screen shows USN insignia for a Japanese flight until F5B.
- **Every `.ww2flight` exported before Task 7 stops verifying** (R3): new combat fields enter the world checksum. Records are
  build-bound already; any reference recording Mark keeps is invalidated.
- The American name list is compiled from recall of public rankings, not extracted, and needs Mark's review before F5B ships
  it (stated in `ASSETS.md` and in the file's `note`).
- `ScenarioOption.pool` is `single` for the two dev fixtures; no row is both. If "Single Missions" should mean the
  pooled missions played outside a campaign, that is a vocabulary call for F5B.
- Not built, by ruling: the Quit/Abandon button, headquarters, mid-flight save, the Wall of Fame.

## Handed to F5B (Task 12, ruling D1; no F5A code)

Delete `src/render/roster.ts` and its consumers, the roster-era assertions in `tests/render/{roster,dossier,devSortie,titleScreen}.test.ts`,
`insignia.test.ts`'s `RANK_LADDER` use, `debrief.ts`'s `RANK_LADDER` import (its promotion lookup by rank name), and clear or
ignore `ww2airsim.roster.v1`. Rewrite `startGame()`. Call `bankSortie` exactly once per sortie with no Continue (D12). Use
`makeCampaign` (`tests/fixtures/campaign.ts`) and the consumer example in `tests/campaign/fixture.test.ts`.
