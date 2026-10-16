# F7A bailout and rescue: revised plan (2026-10-15)

Supersedes the task list of [2026-10-14-f7a-bailout-rescue.md](2026-10-14-f7a-bailout-rescue.md), which stays as
history. That plan's implementation is one commit, `ac6600bd` ("Add F7A bailout and rescue foundation"), based on
`b1dda8a4`. **This plan does not touch `ac6600bd`.** It is a review of that commit against the frozen F5A contract
and current `main` (`d477d854`, 2026-10-15), plus the rework that runs after F5B merges.

## Header

- **Branch:** `plan-f7a-bailout-rescue`, worktree `/home/mark/projects/ww2airsim-plan-f7a-bailout-rescue`.
- **Order (Mark, 2026-10-15):** F5B merges first (it deletes `src/render/roster.ts`, rewrites `startGame`, the title
  screen, the debrief and the main.ts bank calls, and calls `bankSortie` once per sortie with no Continue). F6B is
  parallel. F7A rebases onto F5B. **Nothing in Tasks 1-12 starts until F5B is on `main`.** F5B delivers `session.bank(SortieEndKind)`; Dev play uses the same UI as production, with the Dev checkbox unlocking dev features (Mark, 2026-10-15).
- **Rulings applied 2026-10-15:** every ambiguity in the first draft of this plan is resolved; see "Decisions (Mark, 2026-10-15)". The first draft's speed rule (Ambiguity 2 option B) and its proposed reducer tightening (S1) were **not** adopted.
- **Viewing checkpoints:** final only, attended at the end. Reference captures are collected in the handoff for Mark;
  his viewing is never a test gate.
- **Run mode:** attended final review.
- **Heavy jobs** go through `REMOTE_RUN_OVERFLOW=0 remote-run` on ryzen (AGENTS.md). No `pkill -f`, no `rm -rf`.
- **Not in F7A (Mark):** campaign status fields, replacement logic, POW closure code, paratroopers, rescue visuals. F7B owns the last three's presentation (see "F7B's remaining scope").
  Only the player pilot bails out; other crew in multi-crew aircraft are not modeled.

## Two corrections to the premise, found while reviewing

1. **F5A is already in this branch's base.** `9206feb7` ("F5A: status text after merge") is an ancestor of `b1dda8a4`
   (`git merge-base --is-ancestor`). What the base lacks is the 29 commits since: the rest of F6A (lights, the `N`
   control, the F6A closeout). So `src/campaign/` exists on the branch and the review below ran against it.
2. **F5A already implements POW closure and replacement.** `bankSortie` maps `captured` to a `pow` closure and refills
   the vacated slot in the same call (`src/campaign/bank.ts:106` and `:117-120`; tests
   `tests/campaign/bank.test.ts:78,100,317`; the exhaustive model check runs every `SortieEndKind`). The old handoff
   and the branch's `docs/campaign-data.md` paragraph say F7B owns "translating `captured` into a permanent POW
   archive and filling the five-pilot roster vacancy". That is false: F7A needs only to hand `bankSortie` the right
   `end`. F7B's accurate remaining scope is under "F7B's remaining scope" below. Mark's ruling stands (F7A adds no
   campaign code); the false claim must not be repeated.

## Review verdict on `ac6600bd`

**Keep the simulation and recorder core; rework the shell.** About 70% of the 1,249 added lines survive: the sim
(`bailout.ts`, `recovery.ts`, the `loop.ts` hooks), the recorder wiring, the rig view and the sim tests. The part that
does not survive is everything that talks to the old roster and the old debrief, because F5B deletes those; and four
defects the old handoff does not mention (below, D1-D4).

### What to keep, with evidence

| Keep | Evidence |
| --- | --- |
| `ParachutistEntity` as a generic world entity with `sourceAircraft`, `side`, `previous`/`state` | Reusable by F7B's J5 drop with no new entity type. `World.parachutists?` is optional and omitted when empty, so every pre-F7A world is byte-identical (`loop.ts` spreads it only when non-empty). |
| Bailout as a tick-boundary recorder **action**, not a `Controls` field | `verify.ts` replays it through `requestBailout` at the same tick boundary the live edge used (`world.tick` before the step, packet tick = that + 1). `tests/flightRecorder/recorder.test.ts` "records and exactly verifies a bailout" passes on the branch and exercises the **contested roll** (no airfields or ships in the fixture, so control is `contested`). |
| Recorder checksum covers the lifecycle | `worldChecksum` canonicalizes the whole world minus terrain and the accumulator (`src/flightRecorder/checksum.ts`), so `parachutists` is included with no checksum edit. The old handoff's "checksum the generic bailout state" is true, by that mechanism. |
| Additive, version-1 record | The action union gains one member; F6A's own addition (`control: 'lights'`) is a different union member and the two auto-merge (dry run: `git merge-tree` conflicts only in `tests/flightRecorder/recorder.test.ts`). |
| No unrecorded randomness | `src/sim/bailout.ts` and `recovery.ts` contain no `Math.random`, `Date.now` or clock read; the roll is `recoveryRoll(seed)`, a pure integer mix. `Math.random` and `Date.now` in `src/sim` are lint errors already (`tests/architecture/boundary.test.ts:390`). The environment (daylight, visibility, weather, sea state) is read at the browser edge and **written into the recorded action**. |
| Abandoned airplane stays in the world under neutral controls | `loop.ts` swaps its controls for zeros once a parachutist names it; the unit test asserts controls and a separated position. |
| `J`, edge-triggered with `!e.repeat` | `KeyJ` is free on current main (`git grep KeyJ origin/main -- src` is empty; F6A removed the dimmer). One press, as ruled. |
| The approved `parachuting-person-rig` through the shared model cache | F6A's `parseGltf` now adds gameplay-light terms to every GLB material (`modelCache.ts`), so the rig is lit by night lights with no F7A work. |
| Tests that drive the real `J` key and read `__ww2.bailout()` | Wiring tests per `docs/testing.md` ("read `__ww2` state, not pictures"). |

### What to change, and why

| # | Finding | Evidence | Change (Task) |
| --- | --- | --- | --- |
| C1 | **Rescued and captured bank at 1.0 and the debrief treats them as outcomes of the old table.** Mark's ruling: a rescued sortie is never a mission success. | `debrief.ts` adds `rescued: 1.0, captured: 1.0` to `RECOVERY_MULTIPLIER`; `GAMEPLAY.md` gets two rows in the old "Recovery multiplier" table. F5A has **no multiplier** (`scoreSortie`, `src/campaign/scoring.ts`): points are destruction counts, and difficulty and completion need `success`. The rows are dead and wrong-sounding. | Drop them. Map by `SortieReport` (Tasks 3-4). |
| C2 | **Nothing stops `rescued` with `success: true`.** | `bank.ts:77` rejects `success` only for `killed`, `captured`, `abandoned`. The branch gets "no badge" only by accident: its bailout path skips `withMissionDebrief`. | Make `missionOutcome` the single owner (Task 3). Mark **declined** a reducer tightening (S1): the sim is the only lock. |
| C3 | **`roster.ts` / `dossier.ts` edits.** | `LogOutcome` + `OUTCOME_LABEL` + `foldCareer` changes. F5B deletes both files. | Dropped at rebase (Task 1). |
| C4 | **The four hand-written bank sites.** | `tests/render/flightRecord.test.ts` greps `main.ts` source for `bankMissionResult(...sortieFacts(` and counts 3 -> 4, and `scoredThroughKillsByType =` 5 -> 6. These source-regex tests die with F5B's rewrite. | Re-implement the bailout bank against F5B's single bank function; do not re-increment regex counts (Task 4). |
| C5 | **The constants are scattered and not all declared.** | Four exported constants, but `0.75` (separation), `1.25` (deploy), `0.9`/`2.2` (canopy rates), `-9` (survivable contact speed), `3` m (airborne), `25 000`/`15 000`/`10 000` m (support ranges) and every probability weight in `assessRecovery` are inline literals. | One tuning object (Task 2). |
| C6 | **User-facing text is partly metric.** | `bailoutEvidence` prints `m/s` and `km`; the factors list prints `friendly support N km`; the old GAMEPLAY text says "15 m" and "75 m"; `bailoutModel` shows contact speed in mph. | Imperial everywhere user-facing (Tasks 2, 5, 11). |
| C7 | **The HUD cue ignores the real environment and the real landing place** (D1 below). | Task 7. |
| C8 | **A rule overrides the physics, with no test relating them** (D2). | Task 2. |
| C9 | **The seed is derived, not recorded** (D4). | Task 6. |
| C10 | **`autopilotBadge.setStatus` gains a fourth positional string parameter.** | Positional `(status, bayDoorsNoticeS, torpedoNoticeS, bailout)` is how the next HUD feature breaks it (F6B sights are due to touch HUD rows). | Pass an object; one notice priority list (Task 7). |
| C11 | **Five reference PNGs (about 5.7 MB) were captured against the old roster debrief.** | `docs/handoff/2026-10-14-f7a-bailout-rescue-shots/`. They are stale after F5B. | Replace at the final capture; leave the old ones out of the rebased tree where possible (R5). |

### Defects the old handoff does not mention (found by reading and by one measurement)

- **D1. The pre-bailout cue is computed with the wrong inputs.** `main.ts` calls
  `assessRecovery(recoveryFactsAt(world, player.position, under.surface, 0))` with no environment argument, so it uses
  `DEFAULT_RECOVERY_ENVIRONMENT` (full daylight, 0.8 visibility, 0.1 weather) while the real resolution uses the
  frozen live environment. At night the HUD says "RESCUE LIKELY" where the resolver then rolls against darkness. It
  also evaluates the surface and support distances **under the aircraft now**, not where the canopy will land
  (a descent from 3,000 ft in a 25 kn wind drifts well over a mile), and does so every frame.
- **D2. The 246 ft rule and the physics disagree, by a lot.** Measured 2026-10-15 on ryzen with the branch's own
  `requestBailout` + `advance` (Hellcat spec, flat 10 m terrain, level exit at 45, 100 and 200 m/s; a probe test, deleted
  after use):

  | Exit height AGL | Result | Contact descent |
  | --- | --- | --- |
  | 16 m (52 ft) | dead (canopy never inflates) | 54 ft/s |
  | 25 m (82 ft) | dead by the rule; **the physics would have survived** | 23 ft/s, inside the 30 ft/s limit |
  | 40 m (131 ft) | dead by the rule | 18 ft/s (full canopy) |
  | 74 m (243 ft) | dead by the rule | 18 ft/s |
  | 76 m (249 ft) | survives | 18 ft/s |

  So `lowAltitude` (below 75 m) is a **rule**, not an outcome of the model; the model alone would allow a level exit
  from about 80 ft. The ruling keeps 246 ft as the safe-descent default, which is fine as a gameplay rule, but nothing
  relates it to the model, so a tweak to the sink rate or deployment time would silently leave the rule contradicting
  the physics. Separately the model **does** respect a dive: a 656 ft/s forward, 328 ft/s sinking exit survives only from about
  300 m (980 ft; it dies from 200 m), and a 328 ft/s forward, 197 ft/s sinking exit dies at 500 ft AGL (contact 240 ft/s) and survives from 650 ft.
  The model, not the 246 ft rule, is what kills a diving exit; Task 2's cross-check keeps the two honest.
- **D3. A 390 kt exit with a fully opened canopy is survivable in the model** (200 m/s level exit: canopy, 18 ft/s
  contact). There is no speed limit. **Mark ruled this stays** (Decision 9): the existing physics model decides.
- **D4. The "roll not undefined" assertion is vacuous.** `tests/sim/bailout.test.ts` checks
  `survivor.recovery?.roll` `.not.toBeUndefined()`; `null` (an extreme) passes. And no test relates the seed to the
  moment of the press or shows the same inputs resolving the same way after a replay with a *contested* result that
  is not 50/50-prone (the recorder test only asserts the outcome matches `/rescued|captured/`).

### Claims in the old plan, handoff and docs that are wrong against the repo

| Claim (where) | Verdict |
| --- | --- |
| "F7B owns ... automatic five-pilot roster replacement" (handoff, "What landed"; `docs/campaign-data.md` F7A paragraph; GAMEPLAY F7A paragraph) | **Wrong.** `bankSortie` already does POW closure and the same-call refill (see correction 2). |
| "Rescued and captured outcomes bank ... at the existing 1.0 recovery multiplier" (handoff) | **Wrong** under F5A (no multiplier) and under Mark's 2026-10-15 ruling for `rescued` (no success). |
| "approved 28-foot wartime canopy asset" (old plan, scope) | **Stale.** The F4R rework (2026-10-14, after F4) made the person's bell **8.0 m (26 ft)** wide, apex 7.05 m, all ESTIMATES (`2026-10-14-f4r-airborne.md`). `ASSETS.md` still cites TM 1-440 for a 28 ft canopy size only; **no cited source gives a descent rate** or a deployment time. |
| "contested cases use a recorded seed" (plan, handoff, `docs/flight-recorder.md`) | **Imprecise.** The seed is a hash of the press tick, aircraft id and position (`bailoutSeed`), stored in checksummed world state. The recorded **action** carries the environment, not the seed. Replay agrees only because the sim is deterministic. Task 6 makes the claim true. |
| "Nothing was deployed or pushed to an external remote" (handoff) | **Stale.** The branch is pushed to `origin/plan-f7a-bailout-rescue`. |
| MASTER_PLAN F7 and the F5A contract table: "`SortieFacts` for the bailout seed" | **Cannot work as written.** `SortieFacts` is written into `pending.facts` at **launch** (`launchSortie`); `SortieReport` has no facts field and `LogEntry` no evidence field. A seed known only at the moment of the press has no campaign home. See S2. |
| "Rescued after bailout: 1.0" rows added to GAMEPLAY's "Recovery multiplier" table | Remove (Task 11). |

## Contract mapping (the exact proposal)

F7A is **sim + shell only**. `src/sim` may not import `src/campaign` (`sim-must-not-import-campaign`), so the sim speaks
its own words and the shell builds the frozen `SortieReport` (`src/campaign/schema.ts`). After F5B the shell has one
bank entry point; the mapping below is a pure function the F5B shell calls (Task 4).

| Sim terminal state (`ParachutistState`) | `SortieReport.end` | `success` | `flight.landing` | What the **existing** F5A reducer then does (read from `bank.ts`, pinned by a test in Task 4) |
| --- | --- | --- | --- | --- |
| `phase 'down'`, `outcome 'rescued'` | `'rescued'` | **`false`, always** | `null` | Pilot stays active. Destruction points kept. No difficulty bonus, no completion bonus, no roster bonus, no badge, no chapter advance. `attempts.failed` +1. `career.rescues` and `human.stats.rescues` +1. |
| `phase 'down'`, `outcome 'captured'` | `'captured'` | `false` (the reducer already refuses `true`) | `null` | Destruction points kept on the pilot's closed dossier. Pilot closes as `pow`; vacancy refilled in the same call; `human.stats.losses.pow` +1. No F7A code. |
| `phase 'dead'`, `outcome 'killed'` (too low, or struck the ground before the canopy filled; no speed rule exists, Decision 9) | `'killed'` | `false` | `null` | KIA closure and refill, as any death. |
| Exit refused (`BailoutRejection`) | none: no sortie end | n/a | n/a | The pilot is still flying. |
| Anything while the parachutist is in flight (`separating`, `deploying`, `canopy`) | none yet | n/a | n/a | Nothing banks until contact. |

Rules that fall out of this, each with a test (Task 4):

1. **`landing: null`.** A parachute touchdown is not a landing of the aircraft; `Career.landings` (trap, field,
   ditched, water) counts aircraft landings only.
2. **`counts`, `friendlyDestroyed`, `warnings`** come from the same sources as any other sortie (the player's
   `tagCredits`, `friendlyKills > 0`, `friendlyFire !== null`). The abandoned airplane keeps the player's combat
   record (Decision 10), so a friendly it destroys after the jump still discharges, and the discharge flag is
   independent of `end`.
3. **`flightSeconds`, `maxAltitudeM`, `maxTrueAirspeedMps`** are the flight to the bailout press, plus the descent
   time (the sortie ends at contact; Decision 13). The abandoned airplane's later crash is **ignored** for `end`: the
   pilot's fate decides it.
4. **`success` is decided in the sim, not the shell.** `Recovery` in `src/sim/mission/outcome.ts` gains
   `{ kind: 'rescued' }` and `{ kind: 'captured' }`; `missionOutcome` returns `result: 'no-badge'` with reason
   "Bailed out" for both, whatever the objectives say. `recoveryOf` reads the player's parachutist first (so the
   abandoned airframe's `impact` cannot masquerade as `killed`). The shell cannot get it wrong without the agreement
   test failing.
5. **`badgeId: null`** for all three. `authoredBonus` is passed as authored; `scoreSortie` zeroes it because
   `success` is false (existing behavior, pinned).
6. **Dev sorties bank nothing**, exactly as F5B's Dev path does today; the bailout path reuses that gate, it does not
   add one.
7. **`SortieFacts` / `pending.facts`: F7A writes nothing.** The two reserved keys stay `aircraft` and `loadout`. F7B
   may add a launch-time key; F7A does not.

## Decisions (Mark, 2026-10-15)

Binding rulings given with this assignment, recorded so they are not re-asked:

1. **Order:** F5B first, F6B parallel, F7A rebases onto F5B. Drop this branch's `roster.ts`/`dossier.ts` edits and the
   old-roster `LogOutcome`/`OUTCOME_LABEL`.
2. **A rescued sortie never counts as a mission success.** Points already earned are kept; no badge, no campaign
   progress. A captured pilot is closed as a POW (by F5A's reducer today; F7B owns what it looks like).
3. **Bailout input is a single press of `J`** (free since the night dimmer was removed).
4. **Starting values accepted as defaults, but tunables in one place and imperial in user-facing text:** 2 s parachute
   deployment; rejection below about 49 ft (15 m); 246 ft (75 m) minimum for a safe descent; about 18 ft/s (5.5 m/s)
   descent. Checked against sources 2026-10-15: **none of the four has a cited source** (ASSETS.md cites TM 1-440
   only for the 28 ft canopy size), so each is labeled **ESTIMATE** in code, docs and the debrief help text. For scale
   only (from general knowledge, not verified against a repo source): round personnel canopies of this class are
   usually quoted nearer 20 to 25 ft/s, so 18 ft/s is on the gentle side; Mark accepted it.
5. **Only the player pilot bails out.** Other crew in multi-crew aircraft are not modeled.
6. **Viewing checkpoints: final only, attended.** Reference captures are collected in the handoff; viewing is not a gate.
7. **F7A adds no campaign status fields and no replacement logic.** F7B owns POW closure presentation, replacement
   display and paratroopers.

Rulings on the first draft's ambiguities (Mark, 2026-10-15):

8. **Seed = option C.** The seed is computed at the key press and written into the recorded bailout action; the
   replay reads it from the action, so records verify even if the formula changes later. (Option B, a launch-time
   seed in `SortieFacts`, stays available to F7B and is not needed.)
9. **"Impossible" bailout is CHANGED: only a too-LOW jump is refused**, with an on-screen message (about 49 ft, an
   ESTIMATE; message text built from the tuning, imperial). Inverted, stalled and too-fast exits are **allowed**, even
   when physically dubious ("arcade game"). **No speed kill and no ~300 mph rule.** The existing physics model decides
   the outcome; the 246 ft safe-descent rule stays as a labeled-ESTIMATE rule, and the physics cross-check test
   (Task 2) stays, tying that rule to the model. Still refused as before (not "too low", but not a jump at all): on
   the ground or parked, airplane already destroyed or crashed, a second jump.
10. **The abandoned airplane's friendly fire and credit still count for the player** (option A): it is still the
    player's airplane, attribution is keyed on its id, no new attribution code.
11. **Rescue visuals (raft, rescue boat, mooring buoy): nothing in F7A.** F7B owns generic rescue visuals; F10 owns the
    A4 scripted chapter's own raft, boat and buoy.
12. **Small view-only canopy sway now** (option A): driven by wind and the tick, never touches the simulation, so
    replays are unaffected; J5's many canopies reuse it.
13. **The sortie ends at touchdown** (one bank, no Continue). Any pickup visuals are cosmetic after the fact.
14. **S1 DECLINED.** Do **not** touch `bank.ts` or any frozen F5A reducer. The sim (`missionOutcome`) is the only lock
    that keeps a rescued sortie from being a success; its agreement test is therefore the sole guard and is
    mutation-checked.
15. **A single press of `J` stays;** no hold-to-confirm.
16. **Global (Mark, 2026-10-15):** F5B merges first and delivers `session.bank(SortieEndKind)`; Dev uses the same UI as
    production with the Dev checkbox unlocking dev features; a rescued sortie never counts as success.

### F7B's remaining scope (accurate after the F5A review)

F5A's `bankSortie` already closes a `captured` pilot as `pow`, refills the five-pilot roster in the same call, and
counts rescues (`src/campaign/bank.ts`). **F7B does not build POW archival or replacement.** F7B owns:
(a) presenting those results (a POW line and the new pilot in the debrief, the dossier archive showing the POW
closure); (b) generic rescue visuals (a raft or launch at a water touchdown, the pickup); (c) J5's mass paratrooper
drop, reusing F7A's `ParachutistEntity` and the canopy sway; (d) any launch-time campaign facts it wants beside the
reserved `aircraft` and `loadout` keys; (e) the F7 acceptance gate's archive/replacement proof, which is mostly
already covered by F5A's tests and needs only the UI path. **Proposed wording** for `MASTER_PLAN.md` F7 and
`GAMEPLAY.md`: replace "permanent initial-campaign POW archives and five-pilot roster replacement" as F7 *work* with
"presentation of the POW and replacement results F5A already banks", and in GAMEPLAY say only that a captured pilot is
a POW and is replaced automatically (already stated in the campaign section), with "F7B: rescue and prisoner
presentation, and J5's paratrooper drop" as the remaining work.

## Tasks (all run after F5B is on `main`)

TDD throughout: each task names the failing test first, and each "mutation" line is a change that must turn a named
test red before the task is called done (docs/testing.md: a test must be able to fail).

### Task 1. Rebase and reconcile (no new behavior)

- `git fetch`, then `git rebase origin/main` on the branch (one commit, so one conflict resolution). Expected
  collisions, in order of pain: `src/render/main.ts` (F5B rewrites `startGame`, the title and all bank sites), `src/render/debrief.ts`
  and `tests/render/debrief.test.ts` (F5B removes the `RANK_LADDER` import and the roster imports the branch's
  test also uses), `src/render/roster.ts` and `dossier.ts` (deleted by F5B: take F5B's deletion, **do not resurrect**),
  `tests/render/flightRecord.test.ts` (source-regex counts), `tests/flightRecorder/recorder.test.ts` (F6A and F7A each
  added a test in the same region: keep both).
- The branch must **compile and pass its own sim, recorder and architecture tests** after this task with the shell
  bank site stubbed to a `TODO` that throws only if reached (it is replaced in Task 4). No behavior change besides
  removing the roster hunks.
- Gate: `REMOTE_RUN_OVERFLOW=0 remote-run npx tsc --noEmit` exit 0; `tests/sim/bailout.test.ts`,
  `tests/sim/recovery.test.ts`, `tests/flightRecorder/recorder.test.ts`, `tests/architecture/boundary.test.ts` green.

### Task 2. Tunables in one place, and relate the rule to the physics

- New `src/sim/bailoutTuning.ts` (pure, no imports from render): one frozen `BAILOUT_TUNING` object holding every
  number now inline: minimum exit AGL (the only refusal-by-height; Decision 9), safe-descent AGL, deployment seconds and its split (separation 0.75 s,
  opening the remaining 1.25 s, derived so they sum to the deployment time), sink rate, canopy horizontal and
  vertical settling rates, survivable contact speed (30 ft/s today), the airborne threshold (10 ft today), the support
  ranges (15.5, 9.3 and 6.2 mi today), and the probability weights. Each carries a `// ESTIMATE` and the unit in
  its name (`...M`, `...Mps`), SI inside per the standing rule (a display layer converts).
- Imperial display helper reused from the debrief's `feet`/`mph` (a small shared `src/render/units` export if F5B
  has not made one): `"49 ft"`, `"246 ft"`, `"18 ft/s"`. All player-facing bailout strings are built from the tuning
  object, never typed.
- Tests (behavior, not constants):
  - the deployment phases **sum** to the deployment time (relationship test);
  - **physics cross-check:** over a table of exit speeds and sink rates, the lowest exit height at which the model
    survives with the rule disabled is `<=` `safeOpenAglM` for every level exit (the rule is never *less* strict than
    the model), and a **dive** table asserts the model kills where the rule alone would let it through (the D2 numbers:
    a 328 ft/s sinking exit at 650 ft AGL dies). This is the test that fails if someone halves the sink rate and
    forgets the rule;
  - **no speed, attitude or stall refusal exists:** an exit at 390 kt, inverted, and in a stall each returns `ok`, and
    the outcome comes only from the model (Decision 9). A negative test pins that no 'too fast' rejection reason is in
    `BailoutRejection`;
  - every bailout string in the shell changes when a tunable changes (one parameterized test that swaps the tuning and
    reads the string).
- A refused too-low press shows an on-screen message built from the tuning ("TOO LOW TO BAIL OUT: about 49 ft needed, estimate"); test reads it.
- Mutation: add a speed refusal: the no-speed-refusal test goes red. Set the safe-descent AGL to 5 m: cross-check red. Set the sink rate to 8 m/s: the cross-check or the
  contact tests go red.

### Task 3. `success` lives in the sim: `Recovery` and `missionOutcome`

- Failing tests first: extend `tests/sim/mission/recoveryAgreement.test.ts` (the existing "render banking path and
  mission outcome agree on every recovery kind" pin) with a bailout path per outcome; add
  `tests/sim/mission/outcome.test.ts` cases: every primary objective complete **and** `rescued` yields
  `result: 'no-badge'`, `badge: null`, reason "Bailed out"; likewise `captured`.
- Implement `Recovery` + `recoveryOf` (parachutist first, impact second). `RecoveryOutcome` in the (post-F5B) debrief
  gains the same two words; the agreement test pins the equality.
- Mutation: make `missionOutcome` treat `rescued` like `landed at a field`: the "no badge with all objectives
  complete" test goes red.

### Task 4. The bank site, against F5B's single bank entry point

- A pure `bailoutReport(world, parachutist, ...)` that returns the `SortieReport` fields in the mapping table, in the
  same module F5B uses to build reports for the other three endings (read F5B's handoff for the name; do not create a
  second report builder).
- Wire the bailout debrief and F5B's `session.bank(SortieEndKind)` (not a direct `bankSortie` call; Dev goes through the same path as production) at contact (guarded by the existing once-per-contact tick
  guard, `shownBailoutTick` today). **One call, no Continue.** The old `dispatch({ kind: 'crashBanked' })` equivalent in
  F5B's flow.
- Tests, through the **real reducers** (`tests/fixtures/campaign.ts`, `makeCampaign`; consumer example in
  `tests/campaign/fixture.test.ts`), table-driven over `rescued`, `captured`, `killed`:
  - pilot status, closure reason, `roster.live.length === 5` all active, points kept (destruction counted once);
  - no badge, no completion or difficulty or roster bonus, `progress.completed` unchanged, `attempts.failed` +1;
  - `rescues` counters on rescued only; `losses.pow` on captured only;
  - the friendly-destroyed case: a bailout then a destroyed friendly still forfeits and discharges;
  - a **second** `bankSortie` call for the same pending sortie is rejected (`no-pending`): the once-per-sortie proof.
- Mutation: pass `success: true` for rescued in the shell: red. With S1 declined this and Task 3's agreement test are the **only** locks, so both must be demonstrated red. Swap `captured` and `rescued`: red. Drop the contact-tick guard: a double bank is red.

### Task 5. Debrief

- `bailoutModel` rewritten against F5B's debrief shape. Content: the outcome headline, the surface ("at sea",
  "on land", "on a carrier deck"), the contact descent in **ft/s**, the resolver evidence in imperial miles, and one
  line stating the consequence in plain words: rescued "mission not credited, points kept"; captured "taken
  prisoner; a new pilot takes your place". No multiplier row.
- `RECOVERY_MULTIPLIER` and `RECOVERY_LABEL` get no rescued/captured rows unless F5B kept those tables; if it kept
  them, the rows exist only so the type stays total and a comment says the value is not a scoring input.
- Tests: text assertions on the evidence strings (imperial units present, no `km` or `m/s` anywhere in the model);
  the stamp class for each outcome.

### Task 6. Seed and recorder (the "no unrecorded random call" stop condition)

- The seed is computed at the browser edge (as the environment already is) and **carried in the recorded action**;
  `requestBailout` takes it as a parameter; `verify.ts` replays the recorded seed. The sim never derives it.
  (Mark chose this, Decision 8.)
- `bailoutSeed()` stays a pure helper at the edge; its inputs are the press tick, aircraft id and position (already
  deterministic world state), so the formula can change later without invalidating a record's replay.
- Tests: (a) record, replay, `verifyFlightRecord` ok, for a contested roll **and** assert the roll is non-null (fixes
  D4); (b) two recordings with different recorded seeds both verify and produce different contested results over a
  set of seeds; (c) tamper the recorded seed in the packet: verification fails at the contact tick or the next
  checksum; (d) a determinism test that runs the whole lifecycle twice with `Math.random` and `Date.now` spied to
  throw: identical per-tick checksums; (e) the strict parser rejects a `bailout` action without `seed`.
- Mutation: make `verify.ts` ignore the action's seed and recompute: (c) goes red.
- Version stays 1, additive (the union member only exists on this branch, so it is not yet a released shape; if
  F5B/F6B merge a record schema change first, re-dry-run `git merge-tree`).

### Task 7. HUD: one environment, the right place, imperial, a notice object

- One function `recoveryEnvironmentFor(frame)` used by **both** the press (what is recorded) and the pre-bailout cue,
  so the two cannot disagree again (D1).
- The cue predicts the touchdown point by drifting the current position along the wind for the descent time implied
  by the tunables (descent = height above ground over the sink rate), then evaluates surface and support there.
  Recomputed at most 4 times a second, not per frame. This is a prediction for a qualitative cue only: it never feeds
  the sim, and the resolver still uses the real contact.
- The `autopilotBadge` row takes a notice object `{ kind, text }` with one priority order instead of a fourth
  positional parameter (C10).
- Tests: night (daylight 0) moves the cue from "RESCUE LIKELY" toward "CONTESTED" for an otherwise contested fixture
  (a behavior test; mutation: pass the default environment: red); the cue's text contains the imperial exit rule
  ("246 ft") built from the tuning.

### Task 8. The abandoned airplane (pinned, not redesigned)

- Existing behavior kept: neutral controls, the airframe flies on, nothing fires. Add pinned tests:
  the abandoned airplane cannot fire (`fire` forced false); a collision with a friendly ship after the jump sets
  `friendlyKills` on the player's record (the discharge flag), (Decision 10); an enemy
  ship sunk by it credits the player (existing `tagCredits` path).

### Task 9. Rendering and the instant replay

- Keep `loadParachutistView`. Add a test that reads the shipped GLB and asserts the three node names the view
  requires (`CanopyOpen`, `CanopyRibs`, `CanopyClosed`) exist (a rig rename must fail here, not at runtime).
- **Canopy sway (Decision 12):** view-only, in `parachutist.ts`: a swing and canopy wobble from a pure function of `(tick, wind speed, relative sink)`, never read by the sim. Tests: the function is deterministic and bounded; amplitude grows with wind; a sim-state checksum is identical with the sway on or off (it cannot affect a replay). Skipped in the closed-canopy phase.
- Verify, by a diagnostics-driven E2E assertion (not a picture), that the post-bailout instant replay shows the
  parachutist: the replay stores whole `World`s (`src/replay/recorder.ts`), so the entity should be present, but
  nothing in the branch exercises it. If the view is not synced from the replay world, fix it here.
- Canopy sway: see the first bullet (Decision 12).

### Task 10. E2E and capture

- Keep `tests/e2e/bailout.spec.ts` (friendly Tacloban rescue, enemy Dulag capture, real `J`) and update its debrief
  assertions to F5B's debrief (no Continue). Add: a water case and the too-low case as **state** assertions through
  `__ww2.bailout()` (the old plan only captured them).
- `tests/e2e/bailoutCapture.spec.ts` stays enrolled in `captureTools.ts` (a capture tool, not a test).
- Run on ryzen (`docs/testing.md`, reference GPU). The nexus 680M is acceptable for correctness only.

### Task 11. Docs (one home each; point, do not copy)

- `GAMEPLAY.md`: replace the branch's paragraph. Say: single press of **J**; a jump below about 49 ft is refused with a message (inverted, stalled and fast exits are allowed and the physics decides); about
  246 ft needed for a safe descent; about 18 ft/s descent; **all four are estimates**; rescued and captured keep
  earned points and never count as mission success (no badge, no progress); captured is a POW. Remove the two rows
  added to the old multiplier table. The "Campaign scoring and conduct" section already says bailout and rescue keep
  destruction points; do not restate it.
- `docs/campaign-data.md`: fix the F7A paragraph (what is true: `bankSortie` handles closure and refill; F7B scope as under "F7B's remaining scope").
- `docs/flight-recorder.md`: the action carries the seed and the environment.
- `MASTER_PLAN.md`: replace the F7A status block; apply the proposed F7B wording above.

### Task 12. Closeout

- Focused tests first, then `REMOTE_RUN_OVERFLOW=0 remote-run bash -c 'npm run verify'` gated on its exit status (not
  a grep'd pipeline). Re-diff `origin/main..HEAD` immediately before the push.
- Handoff `docs/handoff/<date>-f7a-bailout-rescue.md` with **Tests updated / Tests still valid / Known gaps**
  (AGENTS.md "Worktree closeout") and the reference captures for Mark's final attended review (the rescue over
  Tacloban, the capture over Dulag, a water case, a too-low case, and the open canopy from the chase view, each
  1920x1080 with the debrief visible). Send the handoff to `marktuttle1@gmail.com` per AGENTS.md. Do not deploy.

## Stop conditions

- No rescue or capture result depends on frame rate, wall time, renderer state or an unrecorded random call. (Enforced:
  the lint rule, Task 6(d), the recorded seed.)
- Do not remove the source aircraft or stop the rest of the world when the pilot leaves.
- Do not infer friendly or enemy control from paint, model identity or scenario ids.
- Do not add campaign status fields, a roster path, or replacement logic.
- Do not edit `src/campaign/` at all (S1 declined; S2 would need a schema bump Mark has not asked for).
- Do not ship a primitive substitute if the rig cannot load: a load failure is a visible diagnostic.

## Frozen-contract items (resolved)

**S1 (DECLINED by Mark, 2026-10-15). `bankSortie` accepts `rescued` with `success: true`.** `bank.ts:77` refuses success only
for `killed`, `captured` and `abandoned`. Mark declined tightening it: do not touch `bank.ts` or any frozen F5A reducer.
The sim's `missionOutcome` (Task 3) is the only lock; its agreement test and the Task 4 mutation are the guards.

**S2. The campaign log cannot hold bailout evidence.** The contract's "`SortieFacts` for the bailout seed" row cannot
carry a seed known only at the press (facts are written at launch; `SortieReport` and `LogEntry` have no evidence
field). F7A does not need it: the seed and evidence live in the debrief and in the Dev recorder. If Mark wants "rescued
at sea" or the seed persisted in the campaign dossier, that is a `schemaVersion` bump with a migration. Not planned.

**F6A contract:** no change needed. The `lights` control and the `bailout` action are separate additive members of the
same union and auto-merge; F6A's light contract (`src/sim/lights/`) is not read by F7A. If F6B changes what AI sees by
night, the resolver's `enemyPresence` stays a position test and does not call it.

## Ambiguities for Mark: all resolved 2026-10-15

| # | Question (first draft) | Ruling |
| --- | --- | --- |
| 1 | Where the rescue die roll's seed comes from, and how a replay verifies | **C**: computed at the key press, written into the recorded action (Decision 8) |
| 2 | What counts as an "impossible" bailout | **Changed**: only too-low is refused, with an on-screen message; everything else allowed, no speed kill (Decision 9) |
| 3 | Abandoned airplane's friendly fire and credit | **A**: still the player's (Decision 10) |
| 4 | Who builds raft, rescue boat, buoy | **A**: nothing in F7A; F7B generic, F10 for A4 (Decision 11) |
| 5 | Canopy sway | **A**: small view-only sway now (Decision 12) |
| 6 | When the sortie ends | At touchdown (Decision 13) |
| 7 | Reducer tightening (S1) | **Declined** (Decision 14) |
| 8 | Mis-press of `J` | Single press stays; no hold (Decision 15) |

## Risks (honest)

- **R1. Rebase is the cost.** `main.ts` is about 3,500 lines and F5B rewrites its middle. The branch's `main.ts` edits
  split cleanly into (a) the **edge** (key latch, `requestBailout`, HUD, view creation and sync, `__ww2.bailout`),
  which should rebase, and (b) the **bank/debrief site**, which must be rewritten by hand against F5B. Budget the time
  for (b); do not try to textually merge it.
- **R2. F5B's shape is unseen.** The plan names F5B's pieces from its announced scope (single bank entry, no Continue,
  `startGame` rewrite) but not their names. Task 4 begins by reading F5B's handoff; if its report-builder or debrief
  shape differs, the mapping table stays and the wiring adapts.
- **R3. F6B parallel.** F6B (night perception, sights) touches AI and HUD rows. The HUD row C10 change reduces the
  chance of a positional-parameter clash in `autopilotBadge`; both branches may still touch `main.ts` HUD code.
- **R4. The physics is thin, and now it alone decides fast, inverted and stalled exits.** No opening shock, no
  wind-blast, no oscillation, no horizontal impact speed in the survival test, canopy descent is a first-order settle,
  so a 390 kt inverted jump survives. That is Mark's "arcade" ruling (Decision 9), recorded rather than hidden; the
  246 ft rule hides it only for level low exits, and the cross-check test is what keeps it honest.
- **R8. With S1 declined, one sim function is the only success lock.** `missionOutcome` plus `recoveryOf`; a later
  change that reads the abandoned airframe's `impact` first would silently re-open it. Task 3's agreement test and
  the Task 4 mutation are the defense.
- **R9. A mis-press of `J` is irreversible** (single press ruled), and a capture permanently loses that pilot.
- **R5. Repo weight.** The old handoff's five PNGs (about 5.7 MB) are in `ac6600bd`, so they ride along in history
  whatever happens. Plan: do not keep them in the rebased tree; add fresh ones at the final capture.
- **R6. A contested roll is only as good as the world's side data.** `recoveryFactsAt` decides control from the nearest
  airfield and ship distances only (15, 25 and 10 km constants). F8 will own real territory; the resolver contract was
  built to survive that swap, but until then rescue odds over the Leyte beachhead are a distance heuristic.
- **R7. Heavy runs.** The full `verify` was 7 minutes on ryzen; the two capture runs need the reference GPU through the
  RDP route. The measurement above ran in one ryzen slot and left nothing running.

## Collision notes (the exact seams)

| Seam | Who else changes it | F7A footprint | Handling |
| --- | --- | --- | --- |
| `src/render/main.ts` | F5B (rewrites `startGame`, title wiring, debrief, the three bank sites and the roster import); F6A already merged (auto-merges in a dry run) | the key latch and per-frame bailout call near the input frame; HUD notice; `parachutistView` create/sync; `__ww2.bailout`; the bank site | Rebase the edge; rewrite the bank site by hand (Task 4). |
| `src/render/debrief.ts`, `tests/render/debrief.test.ts` | F5B (drops `RANK_LADDER`, roster tests) | `bailoutModel`, `RecoveryOutcome`, stamp map | Redo against F5B's file (Task 5). |
| `src/render/roster.ts`, `dossier.ts`, `tests/render/{roster,dossier}...` | F5B deletes | the branch's `LogOutcome`/`OUTCOME_LABEL`/`foldCareer` hunks | Dropped (Task 1). |
| `tests/render/flightRecord.test.ts` | F5B | regex counts 3 -> 4 and 5 -> 6 | Do not re-increment; test the function (Task 4). |
| `src/flightRecorder/schema.ts` | F6A added `'lights'` to the `control` enum | one `bailout` action member + `bailout` evidence kind | Auto-merges (dry run 2026-10-15). |
| `src/flightRecorder/recorder.ts`, `verify.ts` | none on `main` | `evidenceBetween` + the replay of the action | Clean. |
| `tests/flightRecorder/recorder.test.ts` | F6A added tests | the bailout test + terrain imports | **The one real conflict in the 2026-10-15 dry run**; keep both, merge the import lines. |
| `src/input/bindings.ts`, `src/render/legend.ts`, `src/render/diagnostics.ts` | F6A added `toggleNavLights` / a legend row / `lights` diagnostics | one binding, one legend row, one diagnostic | Auto-merge (dry run). |
| `src/sim/loop.ts`, `src/sim/mission/outcome.ts` | none on `main` today | the parachutist step, recovery block, `Recovery` kinds | Clean; F6B may touch the AI half of `loop.ts`. |
| `src/campaign/*` | frozen | none (S1 declined; S2 not requested) | Read-only. |
| `GAMEPLAY.md`, `MASTER_PLAN.md`, `docs/campaign-data.md` | F5B updates its own status blocks | paragraphs listed in Task 11 | Re-read before editing; auto-merged in the dry run. |

## Size estimate

About **1 to 1.5 working days of agent time after F5B lands** (revised 2026-10-15 after the rulings: no speed rule and no reducer change, which remove about 40 lines and one conflict; the canopy sway adds about 45 lines and 3 tests, so the total is unchanged to within noise), in rough lines (the branch is 1,249 added lines today, of
which about 70% stays):

| Part | Lines changed (approx.) |
| --- | --- |
| Rebase conflict resolution and dropped roster hunks | -60 net |
| `bailoutTuning.ts` and replacing the inline literals | +90 |
| `Recovery` kinds, `recoveryOf`, `missionOutcome` | +40 |
| Shell bank site and `bailoutReport` | +80 (replaces about 70) |
| Recorder seed (schema, edge, verify) | +25 |
| HUD cue, environment function, badge notice object | +70 |
| Debrief and docs | +60 |
| Canopy sway (view-only) | +45 |
| Tests (new and rewritten: tuning cross-check and no-speed-refusal, outcome, bank table, recorder seed, cue, sway, node names, E2E states) | +420 |

Gates: one full `verify` (about 7 min) per merge point, plus two reference-GPU capture runs (a few minutes each). 12
tasks, all small except 1 and 4.

## What this plan did not verify

- F5B's real shape (not on `main` yet).
- The branch's own full suite: only a probe of the sim ran (2026-10-15, ryzen slot 1, 1.2 s); every statement about
  existing tests passing is the old handoff's claim except where this plan names a file it read.
- That the post-bailout instant replay shows the parachutist (Task 9 checks it).
- Any descent rate, deployment time or exit-height number against a primary source: none is cited in the repo.
