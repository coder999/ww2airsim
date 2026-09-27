# M2: the mission UI, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Viewing checkpoints: final product only** (Mark, 2026-09-26)

**Attended: no, run unattended** (default applied 2026-09-26; Mark accepted the plan with "looks good" and gave no separate answer, so this matches the 7e run)

Collect the Task 8 captures in the handoff for Mark's final look (repo `CLAUDE.md`, "How Mark works").

**Goal:** Make M1's headless mission engine visible and playable. The work covers:
- a briefing on the title screen's orders memo, with the picker split into Missions and Ranges;
- an objective line and a radio line in flight;
- intermediate landings that continue the flight instead of opening the debrief;
- objectives on the navigation chart;
- an objectives block and badge verdict in the debrief;
- the badge written to the pilot's roster record;
- meshes for held groups, so a mid-flight spawn draws.

**Architecture:** Most of the work is new pure modules under `src/render/mission/`, each with a thin DOM half where it needs one (the `paddlesBadge.ts` pattern), and all tested in Node. `main.ts` gets only wiring: one HUD handle, one landing branch, one helper call at each of the three debrief sites, one entity-view lookup, and one diagnostics entry. The sim gains only two optional, display-only scenario keys (`briefing`, `history`, ruling R15 of M1). Nothing in `World` changes.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Zod 3.25, vitest (node environment), Playwright against the reference GPU (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-25-missions-design.md`. Mark approved it on 2026-09-25. This plan is its §9 item 2, "M2 — UI: briefing, objective line, radio line, chart integration, debrief block, roster badge". Read §2.4, §3 and §5 before starting. M1's plan (`docs/superpowers/plans/2026-09-25-m1-mission-engine.md`) holds rulings R1-R16, and its handoff (`docs/handoff/2026-09-25-m1-mission-engine.md`) holds the "Forward notes for M2". This plan answers each of those notes (see "Self-review").

**Where:** the worktree `/home/mark/projects/ww2airsim/.claude/worktrees/missions-track`, branch `worktree-missions-track`. Do not switch branches. The branch may be pushed; `main` may not, and merging into `main` is Mark's call.

---

## Preconditions (execution does not start until these hold)

**M2 is executed only after E1 (effects engine, `docs/superpowers/plans/2026-09-26-e1-effects-engine.md`) has merged into `main`.** E1 rewrites the same stretch of `src/render/main.ts` and removes `smokes` from `src/render/scenarioEntities.ts`, and M2 edits both. O1 (`docs/superpowers/plans/2026-09-26-o1-ordnance-models.md`) and Lane A's 7e may also have merged by then. Take whatever `main` holds.

- [ ] **P1. Confirm E1 is on main.** Run `git -C /home/mark/projects/ww2airsim log --oneline main | grep -m1 -i "E1"` and `git -C /home/mark/projects/ww2airsim show main:src/render/scenarioEntities.ts | grep -c smokes`. Expected: an E1 handoff or merge commit, and `0`. If `smokes` is still present, E1 has not merged. Stop and tell the caller.
- [ ] **P2. Merge main into this branch.** Run `git merge main` from the worktree. The expected conflicts are only in docs (the §15 table, README), because this branch holds only this plan past `242c35e`. Resolve them by taking `main`'s text and re-adding this plan's file.
- [ ] **P3. Re-read the intersections below** in the merged tree, by function and by the quoted search string, never by line number. For each one, record in the ledger (`.superpowers/sdd/m2-mission-ui/progress.md`) what E1 left there, and whether the M2 step that edits it still applies as written.
- [ ] **P4. Re-measure the baselines** that this plan's gates compare against. E1's Task 1 added `combat.impacts`, so M1's digests no longer match. Run the digest probe (Task 1, Step 1) and record the six hashes in the ledger. Then run `remote-run npm run verify; rc=$?; echo "rc=$rc"` and record the pass count. Both are the "before" for this plan.

### Where E1 (and O1, 7e) intersect M2

| # | File | Function or search string | What E1/O1 does there | What M2 does there (task) |
| --- | --- | --- | --- | --- |
| 1 | `src/render/scenarioEntities.ts` | `buildScenarioEntities`, `ScenarioEntities` | E1 Task 10 removes `smokes` from the type, the per-airframe smoke loop and `disposeMeshTree(previous.smokes[i]!.object)`. O1 changes `LoadAirframe` to `(modelId, stores)` and calls `loadAirframe(a.spec.view.model, a.spec.stores)` | adds held-group meshes built hidden, keyed by entity id, disposed with the rest (Task 2) |
| 2 | `src/render/main.ts` | `const { airframes, shipHandles, smokes, player: playerAirframe } = scenarioEntities!` | E1 drops `smokes` from the destructure | replaces the destructure's source with `entityViews(scenarioEntities!, current.world)` (Task 2) |
| 3 | `src/render/main.ts` | E1's fx block, `const shipSmokeOrigins = new Map(current.world.ships.map((s, i) => [s.id, smokeOriginWorld(shipHandles[i]!, worldOffset)]` | E1 Task 9 inserts it after `for (const h of airfieldHandles) h.update(frameMs / 1000)`. E1 Task 10 then deletes that `h.update` line, so the anchor moves | nothing, **but** it indexes `shipHandles[i]` by world order. After Task 2 it must read the id-aligned `shipHandles`. Confirm it does: it reads the destructured local, so the fix is automatic if the destructure is the only source. Also confirm in `src/render/fx/events.ts` that an aircraft appearing mid-flight is not mistaken for E1's restart rule, which keys on the tick going backwards |
| 4 | `src/render/main.ts` | `const resetFlightUi = (): void => {` | E1 removes `impactEffect.hide()` and `hitFlashes.hide()`, and adds `fxSystem?.clear()`, `fxMemory = NO_FX_MEMORY` and `fxStress = null` | adds `missionHud.reset()` and `handledLandingTick = -1` (Tasks 3, 4) |
| 5 | `src/render/main.ts` | the impact block, `const hit = player.impact` through its `showDebrief(model, banked, undefined)` | E1 removes `impactEffect.object.position.set(...)`, `impactEffect.fire(...)` and the comment above them, and keeps the debrief logic | wraps the model with `withMissionDebrief` and passes `badgeId` to `bankMissionResult` (Task 5) |
| 6 | `src/render/main.ts` | the destruction block `shownDestructionTick !== playerDamage.destroyedAt` and the landing block `if (current.landing.report !== null && !landingShown)` | E1 does not edit them, but its insertions above shift them | the intermediate-landing branch (Task 4); `withMissionDebrief` at both sites (Task 5) |
| 7 | `src/render/main.ts` | `paddlesBadge.setCue(paddlesFor(current))` and the comment after it, `// Plan 6: every combat visual reads` | E1 Task 10 replaces that comment with one line, and removes the flash block and the smoke loop just below it | inserts `missionHud.update(...)` directly after `paddlesBadge.setCue(...)` (Task 3) |
| 8 | `src/render/main.ts` + `src/render/diagnostics.ts` | the `__ww2` object (after `terrainSurface:`) and `export type Ww2Diagnostics` | E1 adds `fx` and `fxStress`; O1 adds one entry | adds `mission` (Task 8) |
| 9 | `src/render/scene/ship.ts` | `ShipView`, `finishView` | E1 adds a `smoke origin` marker and removes the engine-smoke child | none. M2 only sets `root.visible` on held ship views. Confirm E1's `probeShipSurface` filter does not depend on visibility |
| 10 | `tests/render/scenarioEntities.test.ts` | the smoke expectations and the `(modelId) => …` stand-in loaders | E1 drops the smoke assertions; O1 changes the loader signature | adds held-mesh cases (Task 2) |
| 11 | `tests/e2e/harness.ts` | `hopAndLand` | E1 Task 11 imports `debriefDialog` from it, and O1 does not touch it | splits `hopAndLand` into `hopClear` + `landAndStop`, same behavior for the existing callers (Task 8) |
| 12 | `src/sim/scenario.ts` | `ScenarioShape`, `checkMission` | 7e adds `side` and changes `pilotAssignmentFrom`, textually nearby | adds `briefing` and `history` (Task 1) |

If an M2 step's search string no longer matches after the merge, find the equivalent code by reading the function, and record the change in the ledger. Do not re-create code that E1 deleted.

---

## Open questions for Mark: ANSWERED 2026-09-26, all five defaults accepted ("looks good")

1. **Test fixtures: dev-only, or a playable mission?** M3 ships the first real missions, so M2 needs fixture scenarios to prove the UI on the GPU. **Default:** two fixture scenarios, `dev-mission-ui` and `dev-mission-circuit`. They are listed in the picker only in a DEV build, and a production build's `isKnownScenarioId` rejects them. The JSON is still copied into `dist/`, harmless and unreachable. The alternative is to ship `dev-mission-circuit` as a real "Field Carrier Landing Practice" training mission.
2. **Objective line placement.** Spec §3 says "beside the top-center combat readout". That readout's width changes with its contents (one to nine fields; `combatReadoutLabel`), so a line beside it would move or collide as ammunition and stores change. **Default:** centered, under the autopilot badge, at `top: 72px`. Task 8 asserts it overlaps no other HUD element at 1440p and 1080p.
3. **In-flight visual style.** Spec §3 says all of the mission UI "reuses the Naval Communications visual language". The in-flight elements that already exist (Paddles, the combat readout, the autopilot badge) are dark monospace HUD badges, not paper. **Default:** the objective line and radio line match the in-flight badges. The briefing, the debrief block and the chart list use Naval Communications, as the screens they live on already do.
4. **Radio message duration.** **Default:** each message shows for 5 s of unpaused wall time, oldest first. Messages that arrive while one is showing queue behind it. A pause, the chart or a debrief freezes the countdown.
5. **Picker layout.** **Default:** one `Scenario` radiogroup, with a "Missions" subheading above the mission rows and a "Ranges" subheading above the range rows. The Tier 2 specs select `radiogroup 'Scenario'` today, so their selectors keep working. With no production mission (until M3), the "Missions" subheading is omitted in production, and the title looks exactly as it does today.

---

## Global Constraints

- **Verify:** `npm run verify` ends every task with `rc=0`, and runs on ryzen: `remote-run npm run verify; rc=$?; echo "rc=$rc"`. Never gate on a grepped pipeline.
- **On nexus, targeted runs only:**
  - one test file at a time, with `npx vitest run <file> --maxWorkers=2`;
  - `npx tsc --noEmit; echo "rc=$?"`;
  - `npx eslint <files> --max-warnings 0; echo "rc=$?"`.

  Parallel full suites have OOM-killed nexus. Never copy the repo, and never run a full suite here.
- **`src/sim/` changes are limited to Task 1:** two optional, display-only keys in the scenario schema and their `checkMission` rule. `World` gains nothing. The six digests of P4 must reproduce exactly after Task 1.
- `src/sim/` never imports `render/`. `src/render/mission/*` may import `src/sim/**` freely.
- **Pure first:** every module in `src/render/mission/` has a pure half that a Node test pins (vitest runs in the `node` environment, so no DOM). DOM halves stay thin and are covered by Tier 2.
- **`main.ts` footprint:** no logic beyond calls into `src/render/mission/*` and `roster.ts`. Task 9 reports `git diff <P2 merge commit> -- src/render/main.ts | grep -c '^[+-][^+-]'`, and the target is under 60 changed lines.
- **Ownership (spec §8):**
  - M2 creates no shipped mission (M3's) and no Dulag AAA.
  - It touches nothing under `src/sim/ai/**` and no render pipeline, cloud, sky, ocean or terrain code.
  - Fixture scenarios are `dev-`prefixed and DEV-only (open question 1).
- **Tier 2:**
  - Run it on a spare dev-server slot, `ww2airsim-2` (port 5175), from this worktree. The vite edit that points at that slot is local scratch and is never committed (repo `CLAUDE.md`).
  - Before naming the host, assert it is up: `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/` must print `200`.
  - If `ww2airsim-2` is in use, use `ww2airsim-3` (port 5174).
- Scratch probes go under `.superpowers/m2/`, which is gitignored (`git check-ignore -v .superpowers/x` prints `.gitignore:33:.superpowers/`). Never commit a probe.
- US spelling. Escape `|` as `\|` inside markdown table cells.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Put no model names in commit bodies or docs.
- Never run `git clean -fdx`.

## Shared files, overlap and merge order

| File | M2's change | Who else | Overlap |
| --- | --- | --- | --- |
| `src/render/main.ts` | thin wiring (Tasks 2-6, 8) | E1 (merged first, precondition), O1, 7e unknown | textual; see the intersection table |
| `src/render/scenarioEntities.ts` | held meshes, `entityViews` | E1 (smokes removed), O1 (loader signature) | textual, same function |
| `src/render/diagnostics.ts` | `mission` entry | E1, O1 | textual, append-only |
| `src/sim/scenario.ts` | `briefing`, `history`, `checkMission` lines | 7e (`side`) | textual; whichever lands second rebases (spec §8) |
| `src/sim/mission/schema.ts` | `BriefingObject`, `HistoryObject` | M3 (content consumer), 7e unknown | none known |
| `src/render/titleScreen.ts`, `debrief.ts`, `roster.ts`, `dossier.ts`, `missionMap.ts` | Tasks 5-7 | none known on 2026-09-26 | re-diff against HEAD before each commit |
| `tests/e2e/harness.ts` | `hopAndLand` split | E1 Task 11 imports only | none |
| master spec §15, `README.md` | one row, one paragraph | every plan | textual |

## Rulings this plan makes

Each ruling is an engineering choice inside the approved spec. Each records what it costs if it is wrong.

- **R1. Held-group meshes are keyed by entity id, not index.** `spawnInto` appends a group's entities in the order the TRIGGERS fire, not the order `heldGroups` lists them. So `world.aircraft[n]` for n past the start entities cannot be mapped to a mesh by position. Start entities keep their parallel arrays. Held entities get `ReadonlyMap<EntityId, Airframe | ShipView>`, and `entityViews` rebuilds world-ordered arrays whenever the world's entity counts change. A held mesh is hidden until its entity is in the world, and hidden again on Restart. Cost if wrong: none found. A per-frame allocation would be the cost, and it is avoided by caching on the counts.
- **R2. The intermediate-landing decision reads the mission log, never the frame.** `landingDisposition` says "intermediate" only when `lastLanding(mission)` is newer than the last landing handled AND has `intermediate: true`. Otherwise it is today's debrief. The probe under "Measured" shows the mission logs the landing on or before the frame that raises `landing.report`, at one and at three ticks per frame. If the two ever disagree, the fallback is today's behavior: a debrief.
- **R3. An intermediate landing banks nothing.** Points, kills and the flight segment keep accumulating until the next debrief. Spec §2.4 says the flight "continues without a pause", and a bank is what a debrief does. Cost if wrong: none, because the final debrief banks the whole segment (`killsSince` is already built for this).
- **R4. The roster stores badge IDS.** A badge's display name comes from the scenario option list, which Task 6 pins against content. The Dossier shows the name, falling back to the raw id for a badge whose mission this build no longer ships. `awardBadge` is idempotent. Cost if wrong: a renamed badge keeps its record, which is the point of storing ids.
- **R5. The scenario option list carries `kind` and, for missions, `badge`.** The picker needs both before any scenario file is fetched: the Missions/Ranges split and the AWARDED stamp. So the option list restates two facts from content. A Tier 1 test in Task 6 asserts they agree with the content files, and that every file in `content/scenarios/` is listed. Prefer the assertion to the fetch: the title stays synchronous.
- **R6. `briefing` and `history` are optional in the schema.** M1's inline test missions (`tests/sim/mission/fixture.ts`, `recoveryAgreement.test.ts`) declare objectives and no briefing, and must keep parsing. The Task 6 content test requires `briefing` for every mission option, and `history` for every production (non-`dev-`) mission option. The latter holds vacuously until M3.
- **R7. The objective line shows up to two active primary objectives, in file order, excluding `protect` and `deny`.** Those two are standing orders, not steps, and they appear on the chart. A failed primary prefixes the line with `NO BADGE · `. When every primary is complete, the line reads `OBJECTIVES COMPLETE`. See Task 3 for the exact strings.
- **R8. The radio line shows the engine's log messages verbatim,** with no speaker prefix: content writes its own ("Tower: …"). The engine's own messages are `<label>: failed` and `<label> <n> of <count>` (M1 R7).
- **R9. The debrief's verdict line.** On success it is `BADGE AWARDED: <name>`, or `MISSION COMPLETE` for a mission without a badge. Otherwise it is `<first reason> — no badge`, followed by the remaining reasons, one per line. `reasons` come from `missionOutcome`, in M1's R16 order.
- **R10. The recommended loadout is applied when the briefing arrives,** provided the same mission is still selected and the pilot has not picked a loadout since selecting it.

## Review Focus

These are the inputs most likely to break the UI that no spec-listed test exercises. Each has a test in the task that owns the code.

1. **A held group that spawns before an earlier-listed group.** The meshes must follow the ids, not the list order. *Task 2, "spawn order differs from heldGroups order".*
2. **Restart after a spawn.** The held meshes hide again, and the objective line, radio line and handled-landing tick all reset. *Task 2 ("restart hides spawned meshes"), Task 3 ("a shorter log resets the radio"), Task 4 ("handled tick resets").*
3. **Three ticks per frame across an intermediate landing.** The first landing of `count: 2` shows no debrief, and the second does. *Task 4, through production `nextFrameState` at `3 / 60`.*
4. **A killed or ditched pilot in a mission.** The debrief shows the objectives block with the right reason, and no badge. *Task 5.*
5. **A stale briefing fetch.** The pilot selects mission A, then B before A's fetch resolves. B's briefing shows, and A's recommended loadout is not applied. *Task 6, `briefingRequest` race test.*

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/sim/mission/schema.ts` | modify | `BriefingObject`, `HistoryObject`, `LoadoutObject` |
| `src/sim/scenario.ts` | modify | `briefing`/`history` keys; `checkMission` requires objectives for them |
| `src/render/scenarioLoad.ts` | modify | `loadScenarioFile(id, fetchImpl)` for the title's briefing |
| `content/scenarios/dev-mission-ui.json`, `dev-mission-circuit.json` | create | DEV-only fixtures (open question 1) |
| `src/render/scenarioEntities.ts` | modify | held meshes built hidden; `held` maps; disposal |
| `src/render/mission/entityViews.ts` | create | `entityViews(entities, world)`: world-ordered arrays plus held visibility |
| `src/render/mission/hud.ts` | create | `objectiveLineLabel`, `nextRadioLine`, `createMissionHud` |
| `src/render/mission/landingFlow.ts` | create | `landingDisposition` |
| `src/render/mission/debriefMission.ts` | create | `missionDebrief`, `withMissionDebrief` |
| `src/render/debrief.ts` | modify | `DebriefModel.mission`; the objectives block in `show()` |
| `src/render/roster.ts` | modify | `awardBadge`, `awardBadgeInRoster` |
| `src/render/mission/briefing.ts` | create | `briefingModel`, `conditionsFor`, `renderBriefing`, `briefingRequest` |
| `src/render/titleScreen.ts` | modify | option `kind`/`badge`, `scenarioOptions(dev)`, Missions/Ranges, briefing panel, AWARDED chip, `badgeName` |
| `src/render/dossier.ts` | modify | badge names through a `badgeName` function |
| `src/render/mission/chart.ts` | create | `objectiveMarks`, `objectiveRows` |
| `src/render/missionMap.ts` | modify | objective and station points; the OBJECTIVES list |
| `src/render/main.ts` | modify | wiring only |
| `src/render/diagnostics.ts` | modify | `mission()` |
| `tests/render/mission/*.test.ts` | create | one per module, as named in each task |
| `tests/render/{scenarioEntities,roster,debrief,dossier,titleScreen,missionMap,scenarioLoad}.test.ts`, `tests/sim/mission/schema.test.ts` | modify | as named in each task |
| `tests/e2e/harness.ts` | modify | `hopClear`, `landAndStop`; `hopAndLand` composes them |
| `tests/e2e/mission-ui.spec.ts` | create | Tier 2 |

---

## Measured before writing this plan (2026-09-26, node v22.22.1, this worktree at `242c35e`)

These are claims to re-check, not premises.

- **The mission logs a landing no later than the frame reports it.** Probe `.superpowers/m2-plan/landing-order.ts` uses the setup of `tests/sim/mission/recoveryAgreement.test.ts`: a `land` objective with `count: 3`, a settle from 0.4 m, then rest, driven by production `nextFrameState`:

  | Case | Frame length | Frames after rest to `report` | `world.tick` at report | Mission landing entry | Radio |
  | --- | --- | --- | --- | --- | --- |
  | airfield | 1 tick | 1 | 9 | tick 9, `intermediate: true`, `at.id` `tacloban` | `Trap 1 of 3` @ 9 |
  | carrier | 1 tick | 1 | 9 | tick 9, `intermediate: true`, `at.id` `cv-1` | `Trap 1 of 3` @ 9 |
  | airfield | 3 ticks | 1 | 15 | tick 13, `intermediate: true` | `Trap 1 of 3` @ 13 |
  | carrier | 3 ticks | 1 | 15 | tick 13, `intermediate: true` | `Trap 1 of 3` @ 13 |

  So at the frame the report appears, `lastLanding(world.mission)` already holds it (R2). The probe's `put` helper injects the player's state exactly as `recoveryAgreement.test.ts` does. Task 4 turns this into a test.
- **Spawn order is trigger order.** `spawnInto` (`src/sim/mission/spawn.ts`) appends `[...parts.aircraft, ...aircraft]` per call, so R1 holds.
- **`buildScenarioEntities` builds only `world.aircraft` and `world.ships`.** `src/render/scenarioEntities.ts` at `242c35e`: `world.aircraft.map((a) => loadAirframe(a.spec.view.model))`. A held group's entities live in `world.mission.held[*].aircraft/ships` (`HeldGroup<M>`, `src/sim/mission/state.ts`), fully built at world creation, specs included. So Task 2 can build their meshes at load.
- **Render loops index by world order** in the `main.ts` frame loop:
  - `current.poses.forEach((pose, i) => { const a = airframes[i]!.root`
  - `current.world.aircraft.forEach((a, i) => … airframes[i]!.setStores`
  - `airframes[i]!.update(`
  - `current.shipPoses.forEach((pose, i) => { const m = shipHandles[i]!.root`
  - `shipHandles[i]!.setDamage`

  After E1, the smoke loop is gone and E1's fx block adds another `shipHandles[i]` read. `frame.ts`'s `posesFor` maps `world.aircraft` per entity, `previous` → `state`, and `spawnInto` sets `previous = state`, so a spawned entity poses correctly from its first frame.
- **The title's picker is a static list.** `SCENARIO_OPTIONS` in `src/render/titleScreen.ts` holds six rows, and `tests/render/titleScreen.test.ts` pins them. The scenario radiogroup is `radioGroup('Scenario')`. The e2e specs select `getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'Gunnery Range' })`, and Playwright's `name` matches a substring by default, so a chip appended inside a row keeps these selectors working.
- **Roster badges** are `readonly string[]`: `createPilot` writes `badges: []`, `validatePilot` requires the field, and nothing appends to it. `dossier.ts` renders each string as a `.stamp-chip`. Its empty text is `No badges yet — awarded for completing mission objectives.`
- **HUD positions** (`style.cssText`, 2026-09-26):
  - combat readout: `top:8px`, centered, 13 px/1.3, `padding:6px 12px`, a 1 px border, so about 8-39 px;
  - time badge: `top:8px`, centered;
  - autopilot badge: `top:36px`, centered, 12 px/1.3, `padding:4px 10px`, so about 36-60 px;
  - pause badge: `top:40%`, centered on its middle;
  - Paddles: `top:68%`, centered on its middle;
  - legend: top-right, `right:8px;top:8px`;
  - overlay: top-left.

  By this arithmetic the combat readout and the autopilot badge already overlap by about 3 px when both show, and the time badge shares the readout's slot. Neither is M2's to fix. Task 8's non-overlap check tests only M2's two new elements against the others. The proposed objective line (`top:72px`, 13 px/1.3, `padding:4px 12px`, border) spans about 72-99 px. The proposed radio line (`top:24%`) sits at 259 px at 1080p and 346 px at 1440p. The pause badge's top is about 40% minus 22 px (410 px at 1080p), so the two do not meet.
- **Formatting arithmetic** (node):
  - Wind uses `formatKnots` from `src/render/dossier.ts` (`Math.round(mps * KT_PER_MPS)`): 6 m/s gives 12 kt, 12 m/s 23 kt, 5 m/s 10 kt.
  - Cloud bases round to the nearest 100 ft: 600 m gives 1968.5 ft, printed as 2,000 ft; 450 m gives 1,500 ft; 1200 m gives 3,900 ft.
  - Coverage in oktas is `max(1, round(c × 8))` for `c > 0`: 0.05 → 1, 0.3 → 2, 0.35 → 3, 0.5 → 4, 0.6 → 5, 0.9 → 7, 1 → 8. Words: 1-2 Few, 3-4 Scattered, 5-7 Broken, 8 Overcast.
  - Time of day is `round(h × 60)` minutes, printed as `HHMM`: 14 → `1400`, 6.75 → `0645`, 17.5 → `1730`, 23.99 → `2359`. Absent means 12, the renderer's default (`scenario.ts`'s `timeOfDay` doc).
  - `hold` seconds use `Math.floor(heldTicks * DT + 1e-9)`: 2700 ticks → 45, 2699 → 44, 10800 → 180.
- **The two fixtures parse, build and step** (probe `.superpowers/m2-plan/fixture-probe.ts`: Task 1's JSON without `briefing`, which the schema does not accept yet, built with terrain `null` and advanced 120 ticks). `dev-mission-ui` resolves the `targets` tag and holds `drone:drone-1`. After 120 ticks its statuses are `active,inactive,active` and its log is the `hello` trigger with the message `Tower: cleared for takeoff.` at tick 60, which is `ticksFor(1)`. `dev-mission-circuit` is `active` with an empty log.
- **Tacloban hop lands on-field.** `dossier.spec.ts` asserts the first log row reads `Field landing` after `hopAndLand` from `gunnery-range`'s spot `{ x: 0, z: 300 }`. The fixtures use that same spot, so the fixture's `land at tacloban` counts.
- **E1's state when this plan was written:** `worktree-e1-effects` holds E1 Tasks 1-3 (`38ccef9`, `430c003`, `d35ee79`), none of which touches `main.ts`. O1 holds three commits, none touching `main.ts` yet.

---

### Task 1: `briefing` and `history` in the scenario schema; the fixtures; a one-file loader

**Files:**
- Modify: `src/sim/mission/schema.ts`, `src/sim/scenario.ts` (`ScenarioShape`, `checkMission`)
- Modify: `src/render/scenarioLoad.ts` (add `loadScenarioFile`)
- Create: `content/scenarios/dev-mission-ui.json`, `content/scenarios/dev-mission-circuit.json`
- Modify: `tests/sim/mission/schema.test.ts`, `tests/render/scenarioLoad.test.ts`

**Interfaces:**
- Produces:
  - `export const LoadoutObject = z.enum(['clean', 'bombs', 'rockets', 'both'])`
  - `export const BriefingObject = z.object({ situation: z.string().min(1), loadout: LoadoutObject }).strict()`, with `export type Briefing`
  - `export const HistoryObject = z.object({ text: z.string().min(1), sources: z.array(z.string().min(1)).min(1) }).strict()`, with `export type History`
  - `Scenario.briefing?: Briefing`, `Scenario.history?: History`
  - `export async function loadScenarioFile(id: string, fetchImpl?: typeof fetch): Promise<Scenario>`

- [ ] **Step 1: Baseline digest.** Copy M1's probe from M1's plan ("Measured") into `.superpowers/m2/digest.ts`. Run `npx tsx .superpowers/m2/digest.ts 1800`. Its output must equal the hashes recorded in P4. The directory now holds eight scenario files, so it prints eight lines: the six from P4 plus the two fixtures once they exist. Compare only the six.

- [ ] **Step 2: Write the failing schema tests.** Append to `tests/sim/mission/schema.test.ts`, reusing its existing imports of `parseScenario` and the fixture's `scenario(...)`:

  ```ts
  describe('briefing and history (M2, ruling R6)', () => {
    const objectives = [{ id: 'up', label: 'Take off', priority: 'primary', kind: 'takeoff', from: 'tacloban' }]
    const briefing = { situation: 'Fly the pattern.', loadout: 'clean' }
    const history = { text: 'Inspired by …', sources: ['Cannon, Leyte: The Return to the Philippines (1954), ch. 5'] }

    it('parses a mission with a briefing and a history', () => {
      const s = parseScenario(scenario({ objectives, briefing, history }))
      expect(s.briefing).toEqual(briefing)
      expect(s.history).toEqual(history)
    })
    it('keeps both optional: M1 missions without them still parse', () => {
      expect(parseScenario(scenario({ objectives })).briefing).toBeUndefined()
    })
    it('rejects a briefing or history without objectives', () => {
      expect(() => parseScenario(scenario({ briefing }))).toThrow(/briefing needs objectives/)
      expect(() => parseScenario(scenario({ history }))).toThrow(/history needs objectives/)
    })
    it('rejects an unknown loadout, an empty source list, and extra keys', () => {
      expect(() => parseScenario(scenario({ objectives, briefing: { ...briefing, loadout: 'torpedo' } }))).toThrow()
      expect(() => parseScenario(scenario({ objectives, history: { ...history, sources: [] } }))).toThrow()
      expect(() => parseScenario(scenario({ objectives, briefing: { ...briefing, weather: 'fair' } }))).toThrow()
    })
  })
  ```

  Run: `npx vitest run tests/sim/mission/schema.test.ts --maxWorkers=2`. Expected: FAIL (`Unrecognized key(s) in object: 'briefing'`).

- [ ] **Step 3: Implement the schema.** In `src/sim/mission/schema.ts`, after `BadgeObject`:

  ```ts
  /** The four loadouts the title offers (src/sim/weapons/stores.ts `Loadout`);
   *  `scenario.ts` asserts the two agree at the type level. */
  export const LoadoutObject = z.enum(['clean', 'bombs', 'rockets', 'both'])

  /** Display only (M2): what the title's orders memo shows for a mission.
   *  `loadout` is the recommended one, preselected but changeable (spec §3). */
  export const BriefingObject = z.object({ situation: z.string().min(1), loadout: LoadoutObject }).strict()
  export type Briefing = z.infer<typeof BriefingObject>

  /** Display only (M2): a short historical-context paragraph written for the
   *  game, and its public-domain sources as citation strings (spec §6.3:
   *  "every historical note carries at least one citation"). */
  export const HistoryObject = z.object({ text: z.string().min(1), sources: z.array(z.string().min(1)).min(1) }).strict()
  export type History = z.infer<typeof HistoryObject>
  ```

  In `src/sim/scenario.ts`:
  - Import `BriefingObject`, `HistoryObject` and `LoadoutObject` beside `BadgeObject`.
  - Add `briefing: BriefingObject.optional(),` and `history: HistoryObject.optional(),` after `badge` in `ScenarioShape`, and extend its "Missions" doc comment by one sentence: "`briefing` and `history` are display-only (M2); `World` never sees them."
  - Add a type-level agreement check below the imports: ``const _loadouts: z.infer<typeof LoadoutObject> extends Loadout ? (Loadout extends z.infer<typeof LoadoutObject> ? true : never) : never = true``. `Loadout` is already imported. If lint rejects the unused name, use `void _loadouts`.
  - In `checkMission`'s `if (s.objectives === undefined)` block, add these two lines:

  ```ts
      if (s.briefing !== undefined) issue('briefing needs objectives: a scenario without objectives is not a mission', ['briefing'])
      if (s.history !== undefined) issue('history needs objectives: a scenario without objectives is not a mission', ['history'])
  ```

  Run Step 2's command. Expected: PASS.

- [ ] **Step 4: The fixtures.** Create `content/scenarios/dev-mission-ui.json`. The player sits at `gunnery-range`'s spot, so `hopAndLand` lands on-field ("Measured"):

  ```json
  {
    "id": "dev-mission-ui",
    "player": "f6f-1",
    "airfields": ["tacloban"],
    "aircraft": [
      { "id": "f6f-1", "spec": "f6f-hellcat", "parkedAt": { "airfield": "tacloban", "spot": { "x": 0, "z": 300 } }, "chocked": false },
      { "id": "target-1", "spec": "f6f-hellcat", "tags": ["targets"], "parkedAt": { "airfield": "tacloban", "spot": { "x": -35, "z": -200 } }, "chocked": true }
    ],
    "ships": [],
    "weather": { "windFromDeg": 90, "windMps": 6, "timeOfDay": 14 },
    "objectives": [
      { "id": "up", "label": "Take off", "priority": "primary", "kind": "takeoff", "from": "tacloban" },
      { "id": "home", "label": "Recover", "priority": "primary", "kind": "land", "at": "tacloban", "after": "up" },
      { "id": "range", "label": "Target", "priority": "secondary", "kind": "destroy", "targets": ["targets"] }
    ],
    "triggers": [
      { "id": "hello", "when": { "at": 1 }, "then": [{ "message": "Tower: cleared for takeoff." }] },
      { "id": "company", "when": { "completed": "up" }, "then": [{ "spawn": "drone" }, { "message": "Tower: a friendly is passing overhead." }] }
    ],
    "heldGroups": [
      { "id": "drone", "aircraft": [{ "id": "drone-1", "spec": "f6f-hellcat", "airborneAt": { "position": [-29666, 600, -46605], "headingDeg": 0, "speedMps": 80 } }] }
    ],
    "badge": { "id": "dev-ui-wings", "name": "UI Fixture Wings (dev)" },
    "briefing": { "situation": "DEV FIXTURE. Take off from Tacloban, fly a circuit, and land. A friendly passes overhead once you are airborne.", "loadout": "clean" }
  }
  ```

  Create `content/scenarios/dev-mission-circuit.json`. It is the same file with these changes:
  - `"id": "dev-mission-circuit"`;
  - only the player aircraft, no `target-1`;
  - `"objectives": [{ "id": "circuit", "label": "Circuit", "priority": "primary", "kind": "land", "at": "tacloban", "count": 2 }]`;
  - no `triggers`, no `heldGroups`;
  - `"badge": { "id": "dev-circuit-wings", "name": "Circuit Fixture Wings (dev)" }`;
  - `"briefing": { "situation": "DEV FIXTURE. Land at Tacloban twice.", "loadout": "clean" }`.

  Neither file has `history`; a fixture carries no history (R6).

  Then run:

  ```bash
  npx vitest run tests/sim/mission/content.test.ts --maxWorkers=2
  ```

  Expected: PASS, with 8 scenarios built and both fixtures reporting a mission. If `drone-1`'s position makes the build throw, read the message: R3 requires airborne, and the altitude must be above 0.

- [ ] **Step 5: `loadScenarioFile`.** In `src/render/scenarioLoad.ts`, extract the first fetch-and-parse of `loadScenarioBundle` into:

  ```ts
  /** The scenario file alone, parsed: what the title's briefing needs (M2)
   *  without fetching the specs and bases a flight needs. Same error text as
   *  the bundle loader for a failed fetch. */
  export async function loadScenarioFile(id: string, fetchImpl: typeof fetch = fetch): Promise<Scenario> {
    const res = await fetchImpl(scenarioUrl(id))
    if (!res.ok) throw new Error(`Failed to fetch content ${scenarioUrl(id)}: ${res.status} ${res.statusText}`)
    return parseScenario(await res.json())
  }
  ```

  `loadScenarioBundle` then starts with `const scenario = await loadScenarioFile(id, fetchImpl)`. In `tests/render/scenarioLoad.test.ts`, add a case using the file's existing disk-backed fetch, `diskFetch`: `expect((await loadScenarioFile('dev-mission-ui', diskFetch)).briefing?.loadout).toBe('clean')`.

  Run: `npx vitest run tests/render/scenarioLoad.test.ts --maxWorkers=2`. Expected: PASS.

- [ ] **Step 6: Digest gate.** Run `npx tsx .superpowers/m2/digest.ts 1800`. Expected: the six P4 hashes, character for character, plus two new lines for the fixtures.

- [ ] **Step 7: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/sim/mission/schema.ts src/sim/scenario.ts src/render/scenarioLoad.ts content/scenarios/dev-mission-ui.json content/scenarios/dev-mission-circuit.json tests/sim/mission/schema.test.ts tests/render/scenarioLoad.test.ts
  git commit -m "M2 Task 1: briefing and history scenario keys, two DEV fixture missions, loadScenarioFile"
  ```

---

### Task 2: Held-group meshes, and world-ordered entity views

**Files:**
- Modify: `src/render/scenarioEntities.ts`
- Create: `src/render/mission/entityViews.ts`
- Modify: `src/render/main.ts` (the frame loop's `scenarioEntities!` destructure; the `loadScenario` call's world argument if its type needs `mission`)
- Modify: `tests/render/scenarioEntities.test.ts`; create `tests/render/mission/entityViews.test.ts`

**Interfaces:**
- Consumes: `World.mission.held: readonly HeldGroup<M>[]` (M1).
- Produces:
  - `ScenarioEntities.held: { readonly airframes: ReadonlyMap<string, Airframe>; readonly ships: ReadonlyMap<string, ShipView> }`
  - `buildScenarioEntities(scene, world: Pick<World<undefined>, 'aircraft' | 'ships' | 'player' | 'mission'>, …)`
  - `export function entityViews(e: ScenarioEntities, world: Pick<World<unknown>, 'aircraft' | 'ships'>): { readonly airframes: readonly Airframe[]; readonly shipHandles: readonly ShipView[]; readonly player: Airframe }`

- [ ] **Step 1: Write the failing tests.** In `tests/render/scenarioEntities.test.ts`, reuse that file's existing stand-in loaders (synchronous `createHellcat`-style airframes and box ship views), whatever they are named after E1 and O1. Build a world from `dev-mission-ui` (`loadScenarioBundle` from `tools/content/load.ts`):

  ```ts
  it('builds held-group meshes at load, hidden, keyed by id (M2 R1)', async () => {
    const world = worldFromScenario(loadScenarioBundle('dev-mission-ui'), null)
    const e = await buildScenarioEntities(new Scene(), world, null, standInAirframe, standInShip)
    expect(e.airframes).toHaveLength(2)                       // f6f-1, target-1
    expect([...e.held.airframes.keys()]).toEqual(['drone-1'])
    expect(e.held.airframes.get('drone-1')!.root.visible).toBe(false)
  })
  it('disposes held meshes with the rest on a switch', async () => { /* spy on the held airframe's dispose, as the existing switch test does for start airframes */ })
  ```

  In `tests/render/mission/entityViews.test.ts`, use plain objects shaped like `Airframe` and `ShipView` (`{ root: { visible: true } }`, cast):

  ```ts
  describe('entityViews (M2 R1)', () => {
    it('is the start arrays, unchanged, when nothing has spawned', …)
    it('appends a spawned held mesh at the spawned entity index and shows it', …)
    it('spawn order differs from heldGroups order: meshes follow ids', () => {
      // held 'a-1' (group A, listed first) and 'b-1' (group B); world.aircraft = [...start, b-1, a-1]
      // expect airframes[start.length] === heldB, airframes[start.length + 1] === heldA
    })
    it('restart hides spawned meshes again', () => { /* a world with b-1, then the start-only world */ })
    it('returns the same arrays for the same entity counts (cache)', …)
    it('throws naming the id when an entity has no mesh', …)
  })
  ```

  Run: `npx vitest run tests/render/mission/entityViews.test.ts tests/render/scenarioEntities.test.ts --maxWorkers=2`. Expected: FAIL.

- [ ] **Step 2: `buildScenarioEntities`.** In `src/render/scenarioEntities.ts`, after E1's and O1's changes:
  - Add `'mission'` to the `world` parameter's `Pick`.
  - Collect `const heldAircraft = (world.mission?.held ?? []).flatMap((g) => g.aircraft)` and `heldShips` likewise.
  - Load them in the same `Promise.all` as the start entities, with the same all-or-nothing failure handling: every fulfilled view is disposed if any load rejects. For airframes, call the loader with the same arguments O1's version uses for start airframes.
  - Add each held root to the scene with `root.visible = false`.
  - Return `held: { airframes: new Map(heldAircraft.map((a, i) => [a.id, heldAirframes[i]!])), ships: … }`.
  - In the `previous !== null` teardown, remove and dispose `previous.held` views exactly as the start views are.
  - Extend the doc comment by two sentences: held meshes are built at load and hidden until spawned (M2 R1), because `spawnInto` appends in trigger order.

- [ ] **Step 3: `entityViews`.** Create `src/render/mission/entityViews.ts`:

  ```ts
  import type { Airframe } from '../scene/airframe.js'
  import type { ShipView } from '../scene/ship.js'
  import type { ScenarioEntities } from '../scenarioEntities.js'
  import type { World } from '../../sim/loop.js'

  type Views = { readonly airframes: readonly Airframe[]; readonly shipHandles: readonly ShipView[]; readonly player: Airframe }
  const cache = new WeakMap<ScenarioEntities, { readonly key: string; readonly views: Views }>()

  /**
   * World-ordered mesh arrays for the frame loop (M2 R1). Start entities keep
   * `buildScenarioEntities`' parallel arrays; an entity past them is a spawned
   * held entity, looked up by id, because `spawnInto` appends in TRIGGER order.
   * Recomputed only when the world's entity counts change (a spawn, a Restart,
   * a scenario switch); each recompute sets every held mesh's visibility to
   * "is it in the world", so a Restart hides spawned meshes again.
   */
  export function entityViews(e: ScenarioEntities, world: Pick<World<unknown>, 'aircraft' | 'ships'>): Views {
    const key = `${world.aircraft.length}:${world.ships.length}:${world.aircraft.slice(e.airframes.length).map((a) => a.id).join(',')}`
    const hit = cache.get(e)
    if (hit !== undefined && hit.key === key) return hit.views
    const pick = <V>(start: readonly V[], held: ReadonlyMap<string, V>, ids: readonly string[]): V[] =>
      ids.map((id, i) => {
        if (i < start.length) return start[i]!
        const v = held.get(id)
        if (v === undefined) throw new Error(`entityViews: no mesh for spawned entity "${id}"`)
        return v
      })
    const airframes = pick(e.airframes, e.held.airframes, world.aircraft.map((a) => a.id))
    const shipHandles = pick(e.shipHandles, e.held.ships, world.ships.map((s) => s.id))
    const present = new Set([...world.aircraft.map((a) => a.id), ...world.ships.map((s) => s.id)])
    for (const [id, v] of e.held.airframes) v.root.visible = present.has(id)
    for (const [id, v] of e.held.ships) v.root.visible = present.has(id)
    const views = { airframes, shipHandles, player: e.player }
    cache.set(e, { key, views })
    return views
  }
  ```

  Run Step 1's command. Expected: PASS.

- [ ] **Step 4: Wire `main.ts`.** Replace the frame loop's destructure source. After E1 it reads `const { airframes, shipHandles, player: playerAirframe } = scenarioEntities!`, and it becomes:

  ```ts
      // M2 R1: world-ordered, including spawned held entities (entityViews.ts).
      const { airframes, shipHandles, player: playerAirframe } = entityViews(scenarioEntities!, current.world)
  ```

  Add the import. `loadScenario` already passes a full `World` to `buildScenarioEntities`; `tsc` confirms it satisfies the widened `Pick`. Then confirm intersection row 3: `grep -n "shipHandles\[" src/render/main.ts`. Every hit must be inside the frame loop, after this destructure, and none may read `scenarioEntities!.shipHandles` directly. Diagnostics that read `scenarioEntities?.shipHandles` (the `shipModels` entry) report start ships only. Leave them as they are, and say so in the ledger.

- [ ] **Step 5: Typecheck, lint, tests.**

  ```bash
  npx tsc --noEmit; echo "rc=$?"                                   # rc=0
  npx eslint src/render/scenarioEntities.ts src/render/mission/entityViews.ts src/render/main.ts tests/render/scenarioEntities.test.ts tests/render/mission/entityViews.test.ts --max-warnings 0; echo "rc=$?"
  npx vitest run tests/render/mission/entityViews.test.ts tests/render/scenarioEntities.test.ts --maxWorkers=2
  ```

- [ ] **Step 6: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/render/scenarioEntities.ts src/render/mission/entityViews.ts src/render/main.ts tests/render/scenarioEntities.test.ts tests/render/mission/entityViews.test.ts
  git commit -m "M2 Task 2: held-group meshes built hidden at load; world-ordered entity views by id"
  ```

---

### Task 3: The objective line and the radio line

**Files:**
- Create: `src/render/mission/hud.ts`, `tests/render/mission/hud.test.ts`
- Modify: `src/render/main.ts` (create the handle beside `createPaddlesBadge(root)`; one `update` after `paddlesBadge.setCue(paddlesFor(current))`; `reset()` in `resetFlightUi`)

**Interfaces:**
- Consumes: `MissionState`, `radioMessages`, `ticksFor` (M1); `DT`.
- Produces:
  - `export function objectiveLineLabel<M>(m: MissionState<M> | null): string | null`
  - `export const RADIO_SHOW_MS = 5000`
  - `export type RadioLine = { readonly seen: number; readonly text: string | null; readonly remainingMs: number }`
  - `export const NO_RADIO: RadioLine = { seen: 0, text: null, remainingMs: 0 }`
  - `export function nextRadioLine(r: RadioLine, messages: readonly { readonly text: string }[], dtMs: number): RadioLine`
  - `export type MissionHudHandle = { update<M>(m: MissionState<M> | null, frameMs: number, paused: boolean): void; reset(): void; text(): { objective: string | null; radio: string | null } }`
  - `export function createMissionHud(root: HTMLElement): MissionHudHandle`

- [ ] **Step 1: Write the failing tests.** In `tests/render/mission/hud.test.ts`, build missions from M1's inline fixture (`tests/sim/mission/fixture.ts`: `missionWorld`, `steps`, `progressOf`, and the other helpers it exports). Where a state is easier to write by hand, spread a real `MissionState` and replace `progress`.

  ```ts
  describe('objectiveLineLabel (M2 R7)', () => {
    it('is null without a mission', () => expect(objectiveLineLabel(null)).toBeNull())
    it('shows the active primary, uppercased', () => /* takeoff active */ expect(label).toBe('TAKE OFF'))
    it('shows destroy progress as count/needed, needed = count ?? targets', () => expect(label).toBe('CONVOY 1/2'))
    it('shows land progress only for count > 1', () => expect(label).toBe('CIRCUIT 1/2'))
    it('shows hold seconds from ticks', () => /* heldTicks 2700, seconds 180 */ expect(label).toBe('CAP STATION 45/180 S'))
    it('shows at most two, in file order, joined by " · "', () => expect(label).toBe('CONVOY 0/2 · CAP STATION 0/180 S'))
    it('skips protect and deny', () => /* protect active + land active */ expect(label).toBe('RECOVER'))
    it('prefixes NO BADGE once a primary has failed', () => expect(label).toBe('NO BADGE · RECOVER'))
    it('reads OBJECTIVES COMPLETE when every primary is complete', …)
    it('reads NO BADGE · RETURN TO BASE when a primary failed and none is active', …)
    it('ignores secondaries', …)
  })

  describe('nextRadioLine (M2 R8, open question 4)', () => {
    const msgs = [{ text: 'Tower: cleared.' }, { text: 'Trap 1 of 3' }]
    it('shows the oldest unseen message for RADIO_SHOW_MS', () => {
      const r = nextRadioLine(NO_RADIO, msgs, 16)
      expect(r).toEqual({ seen: 1, text: 'Tower: cleared.', remainingMs: RADIO_SHOW_MS })
    })
    it('queues: the next shows only after the first has run out', () => {
      let r = nextRadioLine(NO_RADIO, msgs, 16)
      r = nextRadioLine(r, msgs, RADIO_SHOW_MS - 1)
      expect(r.text).toBe('Tower: cleared.')
      r = nextRadioLine(r, msgs, 1)
      expect(r.text).toBe('Trap 1 of 3')
    })
    it('clears when everything has been shown and run out', …)
    it('does not count down at dtMs 0 (paused)', …)
    it('a shorter log resets (Restart): the new first message shows', () => {
      const r = nextRadioLine({ seen: 2, text: 'Trap 1 of 3', remainingMs: 100 }, [{ text: 'fresh' }], 16)
      expect(r).toEqual({ seen: 1, text: 'fresh', remainingMs: RADIO_SHOW_MS })
    })
  })
  ```

  Run: `npx vitest run tests/render/mission/hud.test.ts --maxWorkers=2`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement the pure half.**

  ```ts
  import { DT } from '../../sim/flight/model.js'
  import { radioMessages, type MissionState } from '../../sim/mission/state.js'

  const MAX_SHOWN = 2

  /** The current primary objective(s), compact (spec §3; ruling R7). */
  export function objectiveLineLabel<M>(m: MissionState<M> | null): string | null {
    if (m === null) return null
    const primaries = m.objectives.map((o, i) => ({ o, p: m.progress[i]! })).filter(({ o }) => o.priority === 'primary')
    const failed = primaries.some(({ p }) => p.status === 'failed')
    const parts = primaries
      .filter(({ o, p }) => p.status === 'active' && o.kind !== 'protect' && o.kind !== 'deny')
      .slice(0, MAX_SHOWN)
      .map(({ o, p }) => {
        const name = o.label.toUpperCase()
        if (o.kind === 'destroy') return `${name} ${p.count}/${o.count ?? o.resolved.length}`
        if (o.kind === 'land' && (o.count ?? 1) > 1) return `${name} ${p.count}/${o.count}`
        if (o.kind === 'hold') return `${name} ${Math.floor(p.heldTicks * DT + 1e-9)}/${o.seconds} S`
        return name
      })
    if (parts.length > 0) return `${failed ? 'NO BADGE · ' : ''}${parts.join(' · ')}`
    if (failed) return 'NO BADGE · RETURN TO BASE'
    return primaries.every(({ p }) => p.status === 'complete') ? 'OBJECTIVES COMPLETE' : null
  }

  export const RADIO_SHOW_MS = 5000
  export type RadioLine = { readonly seen: number; readonly text: string | null; readonly remainingMs: number }
  export const NO_RADIO: RadioLine = { seen: 0, text: null, remainingMs: 0 }

  /** One radio-line step (ruling R8). `dtMs` is 0 while paused (open question 4). */
  export function nextRadioLine(r: RadioLine, messages: readonly { readonly text: string }[], dtMs: number): RadioLine {
    const base = messages.length < r.seen ? NO_RADIO : r
    const left = base.text === null ? 0 : base.remainingMs - dtMs
    if (left > 0) return { ...base, remainingMs: left }
    const next = messages[base.seen]
    return next === undefined ? { seen: base.seen, text: null, remainingMs: 0 } : { seen: base.seen + 1, text: next.text, remainingMs: RADIO_SHOW_MS }
  }
  ```

  The "reads OBJECTIVES COMPLETE" case is sound because a primary still waiting on `after` is `inactive`, so it is not `complete`, and the line reads `null` in that state. Add a test for that `null`.

  Run Step 1's command. Expected: PASS.

- [ ] **Step 3: The DOM half.** In the same file, `createMissionHud(root)` makes two elements. Their styles follow `paddlesBadge.ts` (open question 3), and each keeps a `shown` guard so a DOM write happens only on change:
  - objective line: `aria-label="Objective"`, `position:fixed;left:50%;top:72px;transform:translateX(-50%);padding:4px 12px;border:1px solid #2b3440;border-radius:4px;background:rgba(12,14,18,.72);color:#e8d9a8;font:13px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.08em;white-space:nowrap;pointer-events:none;display:none;z-index:9`
  - radio line: `role="status"`, `aria-label="Radio"`, `aria-live="polite"`, `position:fixed;left:50%;top:24%;transform:translateX(-50%);padding:6px 14px;border:1px solid #2b3440;border-radius:6px;background:rgba(12,14,18,.78);color:#bfe8c8;font:15px/1.35 ui-monospace,Menlo,monospace;letter-spacing:.04em;max-width:min(720px,80vw);pointer-events:none;display:none;z-index:9`

  The handle keeps a `RadioLine` in a closure:
  - `update(m, frameMs, paused)` runs `nextRadioLine(r, m === null ? [] : radioMessages(m), paused ? 0 : frameMs)` and writes both labels.
  - `reset()` sets `r = NO_RADIO` and hides both elements.
  - `text()` returns what is shown, for diagnostics.

- [ ] **Step 4: Wire `main.ts`.**
  - Beside `const paddlesBadge = createPaddlesBadge(root)`, add `const missionHud = createMissionHud(root)`.
  - After `paddlesBadge.setCue(paddlesFor(current))`, add `missionHud.update(current.world.mission, frameMs, current.paused)`. Read the loop to confirm `frameMs` is the per-frame wall delta there; E1's own block uses `frameMs / 1000` as seconds.
  - In `resetFlightUi`, add `missionHud.reset()`.

  A scenario without objectives has `mission === null`, so both lines stay hidden, exactly as today.

- [ ] **Step 5: Typecheck, lint, tests** (the Task 2 Step 5 pattern, for `src/render/mission/hud.ts`, `src/render/main.ts` and `tests/render/mission/hud.test.ts`).

- [ ] **Step 6: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/render/mission/hud.ts src/render/main.ts tests/render/mission/hud.test.ts
  git commit -m "M2 Task 3: objective line and radio line, pure labels with thin DOM"
  ```

---

### Task 4: Intermediate landings continue the flight

**Files:**
- Create: `src/render/mission/landingFlow.ts`, `tests/render/mission/landingFlow.test.ts`
- Modify: `src/render/main.ts` (the landing block; `let handledLandingTick` beside `let landingShown`; `resetFlightUi`)

**Interfaces:**
- Produces: `export function landingDisposition<M>(m: MissionState<M> | null, handledTick: number): { readonly kind: 'debrief' | 'intermediate'; readonly tick: number }`. `tick` is the mission landing's tick, or `handledTick` when there is none.

- [ ] **Step 1: Write the failing tests.**

  ```ts
  describe('landingDisposition (M2 R2)', () => {
    it('debrief without a mission', () => expect(landingDisposition(null, -1).kind).toBe('debrief'))
    it('intermediate for a new landing with intermediate: true', …)
    it('debrief for a new landing that completes the objective', …)
    it('debrief when the newest landing was already handled (tick <= handledTick)', …)
  })

  describe('through production nextFrameState (Review Focus 3)', () => {
    it.each([1, 3])('%i tick(s) per frame: landing 1 of 2 is intermediate, landing 2 is the debrief', (ticks) => {
      // setup from .superpowers/m2-plan/landing-order.ts ("Measured"), with count: 2:
      // land once, frame dt = ticks / 60; expect landingDisposition(...).kind === 'intermediate'
      // and radioMessages(mission).at(-1)!.text === 'Circuit 1 of 2'.
      // acknowledgeLanding(frame); re-latch airborne (put at +50 m, one frame); land again;
      // expect 'debrief' and missionOutcome(mission, recoveryOf(world)!).result === 'success'
    })
    it('handled tick resets: a Restart world with tick 0 and an intermediate landing is intermediate again', …)
  })
  ```

  Copy `put`, `frameFor` and the landing sequence from the probe (Measured). Change the objective to `{ id: 'circuit', label: 'Circuit', priority: 'primary', kind: 'land', at: 'tacloban', count: 2 }`.

  Run: `npx vitest run tests/render/mission/landingFlow.test.ts --maxWorkers=2`. Expected: FAIL.

- [ ] **Step 2: Implement.**

  ```ts
  import { lastLanding, type MissionState } from '../../sim/mission/state.js'

  /**
   * Whether the landing the frame just latched is an intermediate one (spec
   * §2.4: a radio line, no debrief, no pause) or gets today's debrief. Reads
   * the MISSION's log, never the frame (ruling R2): the mission records the
   * landing on or before the frame that raises `landing.report` (measured
   * 2026-09-26 at 1 and 3 ticks per frame). Anything else is a debrief.
   */
  export function landingDisposition<M>(m: MissionState<M> | null, handledTick: number): { readonly kind: 'debrief' | 'intermediate'; readonly tick: number } {
    const l = m === null ? undefined : lastLanding(m)
    if (l === undefined || l.tick <= handledTick) return { kind: 'debrief', tick: handledTick }
    return { kind: l.intermediate ? 'intermediate' : 'debrief', tick: l.tick }
  }
  ```

  Run Step 1's command. Expected: PASS.

- [ ] **Step 3: Wire `main.ts`.**
  - Beside `let landingShown = false`, add `let handledLandingTick = -1`, with a one-line doc: "The mission landing tick already handled (M2 R2); -1 before any".
  - In `resetFlightUi`, add `handledLandingTick = -1`.
  - The landing block becomes:

  ```ts
      if (current.landing.report !== null && !landingShown) {
        const landing = landingDisposition(current.world.mission, handledLandingTick)
        handledLandingTick = landing.tick
        if (landing.kind === 'intermediate') {
          // Spec §2.4: the engine logged "<label> n of count" for the radio line;
          // the flight goes on, unpaused and unbanked (M2 R3).
          frame = acknowledgeLanding(current)
        } else {
          landingShown = true
          // …the existing body, unchanged (Task 5 adds withMissionDebrief)…
        }
      }
  ```

  Where Task 5 later adds a mission debrief, read the model through it. This task leaves the debrief body as it is.

- [ ] **Step 4: Typecheck, lint, tests** (the Task 2 Step 5 pattern).

- [ ] **Step 5: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/render/mission/landingFlow.ts src/render/main.ts tests/render/mission/landingFlow.test.ts
  git commit -m "M2 Task 4: intermediate landings show on the radio line and continue the flight"
  ```

---

### Task 5: The debrief's objectives block, and the badge in the roster

**Files:**
- Create: `src/render/mission/debriefMission.ts`, `tests/render/mission/debriefMission.test.ts`
- Modify: `src/render/debrief.ts` (`DebriefModel.mission`; render it in `show()`), `src/render/roster.ts` (`awardBadge`, `awardBadgeInRoster`)
- Modify: `src/render/main.ts` (the three debrief sites; `bankMissionResult` gains `badgeId`)
- Modify: `tests/render/debrief.test.ts`, `tests/render/roster.test.ts`

**Interfaces:**
- Consumes: `recoveryOf`, `missionOutcome`, `MissionOutcome` (M1).
- Produces:
  - `export type DebriefMission = { readonly objectives: readonly { readonly label: string; readonly priority: 'primary' | 'secondary'; readonly final: 'complete' | 'incomplete' | 'failed' }[]; readonly verdict: string; readonly more: readonly string[]; readonly badge: Badge | null }`
  - `export function missionDebrief<M>(world: World<M>): DebriefMission | null`
  - `export function withMissionDebrief<M>(model: DebriefModel, world: World<M>): { readonly model: DebriefModel; readonly badgeId: string | null }`
  - `DebriefModel.mission?: DebriefMission`
  - `export function awardBadge(p: PilotRecord, id: string): PilotRecord`
  - `export function awardBadgeInRoster(r: readonly PilotRecord[], pilotId: string, id: string): readonly PilotRecord[]`

- [ ] **Step 1: Write the failing tests.** `tests/render/mission/debriefMission.test.ts` builds worlds with M1's fixture helpers (`landOnce`, `destroyShip` and the rest, as exported):

  ```ts
  describe('missionDebrief (M2 R9)', () => {
    it('is null for a world without a mission', …)
    it('success: every row stamped, BADGE AWARDED with the name, badge set', () => {
      expect(d.verdict).toBe('BADGE AWARDED: Carrier Qualified')
      expect(d.more).toEqual([])
      expect(d.badge).toEqual({ id: 'cq', name: 'Carrier Qualified' })
    })
    it('success without a badge reads MISSION COMPLETE', …)
    it('ditched: "Ditched — no badge", then the incomplete primaries', () => {
      expect(d.verdict).toBe('Ditched — no badge')
      expect(d.more).toEqual(['Recover: incomplete'])
      expect(d.badge).toBeNull()
    })
    it('killed in the air', () => expect(d.verdict).toBe('Killed — no badge'))
    it('a failed protect: "<label>: failed — no badge"', …)
    it('secondaries are listed and never gate the badge', …)
  })
  ```

  `tests/render/roster.test.ts`:

  ```ts
  it('awardBadge appends once and is idempotent (M2 R4)', …)
  it('awardBadgeInRoster touches only that pilot', …)
  it('a roster with badges round-trips through save/export and load/import (spec §5)', () => {
    // exportRoster → importRoster keeps badges: ['cq']; and loadRoster after saveRoster, with the
    // file's existing localStorage stand-in
  })
  ```

  `tests/render/debrief.test.ts`: `withMissionDebrief(landingModel(...), world)` returns the model with `mission` set and `badgeId` set on success. With a mission-less world it returns the model unchanged (`toBe` the same object) and `badgeId: null`.

  Run: `npx vitest run tests/render/mission/debriefMission.test.ts tests/render/roster.test.ts tests/render/debrief.test.ts --maxWorkers=2`. Expected: FAIL.

- [ ] **Step 2: Implement.** `src/render/mission/debriefMission.ts`:

  ```ts
  export function missionDebrief<M>(world: World<M>): DebriefMission | null {
    if (world.mission === null) return null
    const recovery = recoveryOf(world)
    // Every debrief is raised by a landing, an impact or a destruction, so
    // recoveryOf is non-null here; a null means the two signals disagree (M1's
    // recoveryAgreement.test.ts pins that they do not). Fail loudly.
    if (recovery === null) throw new Error('missionDebrief: a debrief with no recovery the mission can see')
    const o = missionOutcome(world.mission, recovery)
    const objectives = o.objectives.map(({ label, priority, final }) => ({ label, priority, final }))
    if (o.result === 'success') {
      return { objectives, verdict: o.badge === null ? 'MISSION COMPLETE' : `BADGE AWARDED: ${o.badge.name}`, more: [], badge: o.badge }
    }
    const [first, ...rest] = o.reasons
    return { objectives, verdict: `${first!} — no badge`, more: rest, badge: null }
  }

  export function withMissionDebrief<M>(model: DebriefModel, world: World<M>): { readonly model: DebriefModel; readonly badgeId: string | null } {
    const mission = missionDebrief(world)
    return mission === null ? { model, badgeId: null } : { model: { ...model, mission }, badgeId: mission.badge?.id ?? null }
  }
  ```

  `o.reasons` is non-empty exactly when `result` is `no-badge` (M1 `missionOutcome`), so `first!` is sound. `recoveryAgreement.test.ts` covers the reasoning; add one assertion to this file that pins it.

  `roster.ts`:

  ```ts
  /** Records a mission badge by id (M2 R4). Idempotent: a second success
   *  on the same mission adds nothing. */
  export function awardBadge(p: PilotRecord, id: string): PilotRecord {
    return p.badges.includes(id) ? p : { ...p, badges: [...p.badges, id] }
  }
  export function awardBadgeInRoster(r: readonly PilotRecord[], pilotId: string, id: string): readonly PilotRecord[] {
    return r.map((p) => (p.id === pilotId ? awardBadge(p, id) : p))
  }
  ```

  `debrief.ts`: add `readonly mission?: DebriefMission` to `DebriefModel`, with a doc line "M2: present only for a mission world (`withMissionDebrief`)". Import the type from `./mission/debriefMission.js`. That module imports `DebriefModel` as a TYPE only, so depcruise's `no-circular`, which sees runtime imports only, is satisfied. Confirm with `npm run depcruise`. In `show()`, after the figures and before the buttons, when `model.mission` is present:
  - a `sectionTitle('Objectives')`;
  - one `figureRow(label + (priority === 'secondary' ? ' (secondary)' : ''), final.toUpperCase())` per objective;
  - then the verdict. On success it is a `.stamp stamp--md stamp--blue stamp--rotate-1` element with the verdict text (`ensureStampFilter()` is already called by this module). Otherwise it is a `figureRow('Badge', verdict)`, followed by one row per `more` entry.

- [ ] **Step 3: Wire `main.ts`.**
  - `bankMissionResult` gains a last parameter, `badgeId: string | null`. After `roster = applyMissionResultToRoster(...)`, add `if (badgeId !== null) roster = awardBadgeInRoster(roster, currentPilotId, badgeId)`, before `saveRoster`.
  - At each of the three sites (impact, destruction, landing), wrap the built model:

  ```ts
      const { model, badgeId } = withMissionDebrief(debriefModel(hit, player.state, killsSinceLastBank), current.world)
  ```

    Pass `badgeId` as `bankMissionResult`'s new last argument. The landing site is inside Task 4's `else` branch. `showDebrief` needs no change, because `mission` rides on the model.

- [ ] **Step 4: Typecheck, lint, tests, depcruise.**

  ```bash
  npx tsc --noEmit; echo "rc=$?"
  npm run depcruise; echo "rc=$?"
  npx eslint src/render/mission/debriefMission.ts src/render/debrief.ts src/render/roster.ts src/render/main.ts tests/render/mission/debriefMission.test.ts tests/render/roster.test.ts tests/render/debrief.test.ts --max-warnings 0; echo "rc=$?"
  npx vitest run tests/render/mission/debriefMission.test.ts tests/render/roster.test.ts tests/render/debrief.test.ts tests/sim/mission/recoveryAgreement.test.ts --maxWorkers=2
  ```

- [ ] **Step 5: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/render/mission/debriefMission.ts src/render/debrief.ts src/render/roster.ts src/render/main.ts tests/render/mission/debriefMission.test.ts tests/render/roster.test.ts tests/render/debrief.test.ts
  git commit -m "M2 Task 5: debrief objectives block and verdict; a landing success writes the badge to the roster"
  ```

---

### Task 6: The orders memo: Missions and Ranges, the briefing, the AWARDED chip, badge names

**Files:**
- Create: `src/render/mission/briefing.ts`, `tests/render/mission/briefing.test.ts`, `tests/render/mission/options.test.ts`
- Modify: `src/render/titleScreen.ts`, `src/render/dossier.ts`, `src/render/main.ts` (`createTitleScreen`'s new argument; `isKnownScenarioId(…, import.meta.env.DEV)`)
- Modify: `tests/render/titleScreen.test.ts`, `tests/render/dossier.test.ts`

**Interfaces:**
- Produces, in `titleScreen.ts`:
  - `export type ScenarioOption = { readonly value: string; readonly label: string; readonly kind: 'mission' | 'range'; readonly badge?: Badge }`
  - `SCENARIO_OPTIONS: readonly ScenarioOption[]` (the six, all `kind: 'range'`, same order and labels)
  - `DEV_SCENARIO_OPTIONS` (the two fixtures, `kind: 'mission'`, with their badges)
  - `export function scenarioOptions(dev: boolean): readonly ScenarioOption[]`
  - `export function isKnownScenarioId(id: string, dev = false): boolean`
  - `export function badgeName(id: string): string`
  - `createTitleScreen(…, boot, missions: TitleMissions = PRODUCTION_MISSIONS)`, where `export type TitleMissions = { readonly options: readonly ScenarioOption[]; readonly loadScenario: ((id: string) => Promise<Scenario>) | null }`
- Produces, in `briefing.ts`:
  - `export type BriefingModel = { readonly situation: string | null; readonly history: { readonly text: string; readonly sources: readonly string[] } | null; readonly objectives: readonly { readonly label: string; readonly priority: 'PRIMARY' | 'SECONDARY' }[]; readonly conditions: readonly { readonly label: string; readonly value: string }[]; readonly loadout: Loadout | null; readonly badge: { readonly name: string; readonly held: boolean } | null }`
  - `export function briefingModel(s: Scenario, heldBadges: readonly string[]): BriefingModel`
  - `export function conditionsFor(weather: Scenario['weather']): BriefingModel['conditions']`
  - `export function renderBriefing(el: HTMLElement, m: BriefingModel | 'loading' | 'unavailable'): void`
  - `export function briefingRequest(load: (id: string) => Promise<Scenario>): (id: string, apply: (s: Scenario) => void, fail: () => void) => void`. It is latest-wins: only the most recent id's result is applied.
- Produces, in `dossier.ts`: `dossierModel(pilot, scenarioLabel, badgeName = (id) => id)` maps `badges` through `badgeName`. `openDossier` gains the same optional parameter.

- [ ] **Step 1: Write the failing tests.**

  `tests/render/mission/options.test.ts` covers R5 and R6, reading content from disk:

  ```ts
  import { readdirSync } from 'node:fs'
  import { loadScenarioBundle } from '../../../tools/content/load.js'
  import { DEV_SCENARIO_OPTIONS, SCENARIO_OPTIONS, scenarioOptions, isKnownScenarioId } from '../../../src/render/titleScreen.js'

  const FILES = readdirSync(new URL('../../../content/scenarios/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

  describe('scenario options agree with content (M2 R5, R6)', () => {
    it('every content/scenarios file is an option, in production or DEV', () =>
      expect(scenarioOptions(true).map((o) => o.value).sort()).toEqual(FILES))
    it('DEV fixtures are dev-prefixed and absent from production', () => {
      expect(DEV_SCENARIO_OPTIONS.every((o) => o.value.startsWith('dev-'))).toBe(true)
      expect(SCENARIO_OPTIONS.some((o) => o.value.startsWith('dev-'))).toBe(false)
      expect(isKnownScenarioId('dev-mission-ui')).toBe(false)
      expect(isKnownScenarioId('dev-mission-ui', true)).toBe(true)
    })
    it.each(scenarioOptions(true).map((o) => [o.value, o] as const))('%s: kind, badge, briefing and history match the file', (_id, o) => {
      const s = loadScenarioBundle(o.value).scenario
      expect(o.kind).toBe(s.objectives === undefined ? 'range' : 'mission')
      expect(o.badge).toEqual(s.badge)
      if (o.kind === 'mission') expect(s.briefing, 'a mission needs a briefing').toBeDefined()
      if (o.kind === 'mission' && !o.value.startsWith('dev-')) expect(s.history, 'a shipped mission needs a history').toBeDefined()
    })
  })
  ```

  `tests/render/mission/briefing.test.ts` expects these values from "Measured":

  ```ts
  describe('conditionsFor', () => {
    it('time, wind and cloud as a pilot reads them', () => {
      expect(conditionsFor({ windFromDeg: 90, windMps: 6, timeOfDay: 14 })).toEqual([
        { label: 'Time', value: '1400 local' }, { label: 'Wind', value: 'From 090° at 12 kt' }, { label: 'Cloud', value: 'Clear' },
      ])
    })
    it('calm, the default noon, and 0645', …)            // windMps 0 → 'Calm'; timeOfDay absent → '1200 local'; 6.75 → '0645 local'
    it('layers in oktas, base to the nearest 100 ft', () => {
      // cumulus 600 m 0.35 → 'Scattered cumulus, base 2,000 ft'; cirrus 1200 m 1 → 'Overcast cirrus, base 3,900 ft'
      // 0.05 → 'Few', 0.3 → 'Few', 0.6 → 'Broken', 0.9 → 'Broken'; layers joined with '; ' in base order
    })
  })
  describe('briefingModel', () => {
    it('reads a fixture mission', () => {
      const m = briefingModel(loadScenarioBundle('dev-mission-ui').scenario, [])
      expect(m.objectives).toEqual([
        { label: 'Take off', priority: 'PRIMARY' }, { label: 'Recover', priority: 'PRIMARY' }, { label: 'Target', priority: 'SECONDARY' },
      ])
      expect(m.loadout).toBe('clean')
      expect(m.badge).toEqual({ name: 'UI Fixture Wings (dev)', held: false })
    })
    it('marks a held badge', …)
    it('situation and loadout are null without a briefing', …)
  })
  describe('briefingRequest (Review Focus 5)', () => {
    it('applies only the latest id', async () => {
      // two deferred promises; request A then B; resolve B then A; apply called once, with B
    })
  })
  ```

  In `tests/render/titleScreen.test.ts`, extend the existing option tests: every `SCENARIO_OPTIONS` row has `kind: 'range'`, and the list and labels are unchanged. In `tests/render/dossier.test.ts`: `dossierModel(pilotWith(['dev-ui-wings']), label, badgeName).badges` equals `['UI Fixture Wings (dev)']`, and an unknown id is shown raw.

  Run: `npx vitest run tests/render/mission/options.test.ts tests/render/mission/briefing.test.ts tests/render/titleScreen.test.ts tests/render/dossier.test.ts --maxWorkers=2`. Expected: FAIL.

- [ ] **Step 2: Implement the options and `badgeName`.** In `titleScreen.ts`:
  - Add `kind: 'range'` to each of the six rows, and `DEV_SCENARIO_OPTIONS` with the two fixtures: labels `UI Fixture (dev)` and `Circuit Fixture (dev)`, their `kind` and `badge`.
  - `scenarioOptions(dev)` returns `dev ? [...SCENARIO_OPTIONS, ...DEV_SCENARIO_OPTIONS] : SCENARIO_OPTIONS`.
  - `isKnownScenarioId(id, dev = false)` searches `scenarioOptions(dev)`.
  - `badgeName(id)` searches `scenarioOptions(true)`'s badges, falling back to `id`.
  - `scenarioLabel` also searches `scenarioOptions(true)`, so a fixture's log row reads its label.
  - Update the `SCENARIO_OPTIONS` doc comment: rows now carry `kind`, and missions carry `badge`, both pinned against content by `tests/render/mission/options.test.ts`. Remove "these six" wording that a seventh row would falsify.

  In `main.ts`, the `isKnownScenarioId(requestedScenarioId)` call becomes `isKnownScenarioId(requestedScenarioId, import.meta.env.DEV)`.

- [ ] **Step 3: Implement `briefing.ts`.** This covers the pure `briefingModel`, `conditionsFor` and `briefingRequest`, and `renderBriefing` as thin DOM. `renderBriefing` builds these parts, using `navalComms.ts`'s shared classes (`form-section-title`) and `figureRow`-style key/value rows:
  - a `section` with `aria-label="Briefing"`;
  - a `sectionTitle('Briefing')`;
  - the situation paragraph;
  - `sectionTitle('Background')`, the history text and a `Sources:` line in the faint ink (`var(--ink-faint)`), only when `history` is present;
  - `sectionTitle('Objectives')`, with one row per objective, `PRIMARY` or `SECONDARY` on the right;
  - `sectionTitle('Conditions')` and its three rows;
  - a `Recommended loadout` row;
  - the badge row, with a `.stamp-chip` `AWARDED` when held.

  For `'loading'` it shows `Retrieving orders…`, and for `'unavailable'` it shows `Orders unavailable.` Implement `conditionsFor` exactly as "Measured" states. Use `formatKnots` from `../dossier.js`. The wind bearing is zero-padded to three digits (`090°`).

- [ ] **Step 4: Wire the title's orders memo.** In `createTitleScreen`:
  - Take the new last parameter, `missions: TitleMissions = { options: SCENARIO_OPTIONS, loadScenario: null }`.
  - Build the scenario radiogroup from `missions.options`. Inside the same `radioGroup('Scenario')`, when any option has `kind: 'mission'`, append a `sectionTitle('Missions')` before the mission rows and a `sectionTitle('Ranges')` before the range rows. With no mission, append no subheading, which is today's DOM (open question 5).
  - For each mission row whose `badge.id` is in the selected pilot's `badges`, append `<span class="stamp-chip">AWARDED</span>` to the row. The pilot is known when Form 2 is shown, so build or refresh the rows there. Re-read the roster the way the Dossier button does (`loadRoster()`), so a badge banked this session shows.
  - Under the two columns, add a briefing host `div`, hidden for ranges. On selecting a mission, when `missions.loadScenario` is non-null:
    - render `'loading'`;
    - call `request(id, apply, fail)` from `briefingRequest(missions.loadScenario)`;
    - `apply` renders `briefingModel(s, pilot.badges)`, and applies R10: if `loadout !== null` and the pilot has not picked a loadout since selecting this mission (a `loadoutTouched` flag, reset on each mission selection), set `selectedLoadout` and re-mark the loadout group;
    - `fail` renders `'unavailable'`.
  - When Form 2 opens, run the same path for the preselected scenario if it is a mission.
  - In the Dossier button's `openDossier(overlay, fresh, scenarioLabel, …)` call, pass `badgeName`.

  In `main.ts`, pass `{ options: scenarioOptions(import.meta.env.DEV), loadScenario: (id) => loadScenarioFile(id) }` as `createTitleScreen`'s new last argument.

- [ ] **Step 5: `dossier.ts`.** Add a `badgeName` parameter, defaulting to identity, to `dossierModel` and `openDossier`. Map `pilot.badges` through it.

- [ ] **Step 6: Typecheck, lint, tests** (the Task 2 Step 5 pattern, for every file above). Also run `npx vitest run tests/render/bootQuality.test.ts --maxWorkers=2`, because it pins that `createTitleScreen` receives `settings`. Its argument positions must still hold.

- [ ] **Step 7: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/render/mission/briefing.ts src/render/titleScreen.ts src/render/dossier.ts src/render/main.ts tests/render/mission/briefing.test.ts tests/render/mission/options.test.ts tests/render/titleScreen.test.ts tests/render/dossier.test.ts
  git commit -m "M2 Task 6: orders memo splits Missions and Ranges, shows the briefing, stamps awarded missions; Dossier names badges"
  ```

---

### Task 7: Objectives on the navigation chart

**Files:**
- Create: `src/render/mission/chart.ts`, `tests/render/mission/chart.test.ts`
- Modify: `src/render/missionMap.ts` (`MapPoint`, `mapPoints`, `createMissionMap`'s marker and list rendering), `tests/render/missionMap.test.ts`

**Interfaces:**
- Produces:
  - `MapPointKind` gains `'structure' | 'station'`
  - `MapPoint` gains `readonly objective?: 'destroy' | 'protect' | 'station'` and `readonly radiusM?: number`
  - `export function objectiveMarks<M>(world: World<M>): { readonly targets: ReadonlyMap<string, 'destroy' | 'protect'>; readonly stations: readonly MapPoint[]; readonly structures: readonly MapPoint[] }`
  - `export function objectiveRows<M>(m: MissionState<M> | null): readonly { readonly label: string; readonly priority: 'primary' | 'secondary'; readonly status: 'ACTIVE' | 'COMPLETE' | 'FAILED' | 'PENDING' }[]`

- [ ] **Step 1: Write the failing tests.**
  - `objectiveRows`:
    - `null` gives `[]`;
    - the statuses `inactive` / `active` / `complete` / `failed` map to `PENDING` / `ACTIVE` / `COMPLETE` / `FAILED`.
  - `objectiveMarks`:
    - an active `destroy` marks its present, undestroyed resolved ids `'destroy'`;
    - an active `deny` marks its hostiles `'destroy'`;
    - an active `protect` marks its targets `'protect'`;
    - an active `reach` or `hold` gives a `station` point: `id` `station:<objective id>`, label the objective label, `radiusM` the objective's, `targetable: true`;
    - a `deny` with a point `around` gives a station ring, not targetable;
    - a structure target gives a `structure` point at the structure's `position`, targetable;
    - complete, failed and inactive objectives mark nothing;
    - an unspawned held target marks nothing, because it is not in the world.
  - In `tests/render/missionMap.test.ts`:
    - `mapPoints` on `dev-mission-ui`'s world marks `aircraft:target-1` with `objective: 'destroy'` and `targetable: true`;
    - a mission-less world's points are exactly today's, so the existing expectations still pass untouched.

  Run: `npx vitest run tests/render/mission/chart.test.ts tests/render/missionMap.test.ts --maxWorkers=2`. Expected: FAIL.

- [ ] **Step 2: Implement `chart.ts`** from the rules in Step 1. For presence and destruction, M1's `isDestroyed` (`src/sim/mission/step.ts`) takes the step's `MissionTick<M>`, not a `World`. So reproduce M1 ruling R13 in a small local function instead, with a comment pointing at R13: an aircraft is gone if its combat `damage.destroyedAt` is set or it has an `impact`, and a ship or structure is gone if its `destroyedTick` is set. Add a test that runs both functions on the same destroyed entities and gets the same answer, so the copy cannot drift.

- [ ] **Step 3: `missionMap.ts`.**
  - In `mapPoints`, compute `objectiveMarks(world)` once. Spread `objective` and `targetable: true` onto the aircraft and ship points whose ids are in `targets`. Append `structures` and `stations`. With `world.mission === null`, `objectiveMarks` returns empty collections, so the output is unchanged.
  - In the marker renderer:
    - color `objective === 'destroy'` `#ff8a6a` and `'protect'` `#ffd27a`;
    - draw a `station` as a dashed circle whose radius in pixels is `projectPoint({x: x + radiusM, z}, …).x - projectPoint({x, z}, …).x`, plus the usual caption.
  - In `show()`, under the chart, add an `OBJECTIVES` list (`aria-label="Objectives"`) from `objectiveRows(world.mission)`: `label (secondary)` … `STATUS`. Render it only when the list is non-empty.

- [ ] **Step 4: Typecheck, lint, tests** (the Task 2 Step 5 pattern).

- [ ] **Step 5: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/render/mission/chart.ts src/render/missionMap.ts tests/render/mission/chart.test.ts tests/render/missionMap.test.ts
  git commit -m "M2 Task 7: navigation chart marks objective targets and stations and lists objectives"
  ```

---

### Task 8: Tier 2 on the reference GPU

> **Amended during execution (2026-09-26, measured on the reference GPU).** The Task 1 fixture JSON and the spec below changed in three ways:
> - **Calm weather.** Both `dev-mission-*` fixtures are now calm (`windFromDeg 0, windMps 0`). The 12 kt crosswind from 090 weathervaned the takeoff roll into the sea. The same wind as a pure headwind kept the hop airborne past the harness's landing window. The spec reads the briefing's wind text from the fixture through `conditionsFor`, so it holds no literal.
> - **Parking spot.** The player now parks at spot `z: 700`, not `z: 300`. From 300 the hop touches down about 40 m past the strip's north end, which is off-field and completes no `land` objective.
> - **Loadout.** Each test first asserts that the recommended Clean loadout was preselected, then switches to Both. The hop is measured at Both; a clean airplane balloons and does not come back down.
>
> `strike.spec.ts` is out of the regression set because it fails at collection on `main` too. Rulings T8-R1 to R4 are in the handoff.

**Files:**
- Modify: `src/render/diagnostics.ts` (`Ww2Diagnostics.mission`), `src/render/main.ts` (the `__ww2` entry)
- Modify: `tests/e2e/harness.ts` (`hopClear`, `landAndStop`)
- Create: `tests/e2e/mission-ui.spec.ts`

**Interfaces:**
- Produces:
  - `readonly mission: () => { readonly objective: string | null; readonly radio: string | null; readonly log: readonly MissionLogEntry[]; readonly spawned: readonly string[]; readonly meshes: readonly { readonly id: string; readonly visible: boolean }[] } | null`
  - `export async function hopClear(page: Page): Promise<void>`
  - `export async function landAndStop(page: Page, until: 'debrief' | 'stopped'): Promise<void>`
  - `hopAndLand(page)` is `hopClear` followed by `landAndStop(page, 'debrief')`, with the existing callers' behavior unchanged.

- [ ] **Step 1: The diagnostics entry.** In the `__ww2` object, after the entries E1 and O1 added:

  ```ts
      // M2: the mission UI, for tests/e2e/mission-ui.spec.ts.
      mission: () => {
        const m = frame?.world.mission ?? null
        if (m === null || scenarioEntities === null) return null
        const shown = missionHud.text()
        return {
          objective: shown.objective, radio: shown.radio, log: m.log, spawned: m.spawned,
          meshes: [...scenarioEntities.held.airframes].map(([id, a]) => ({ id, visible: a.root.visible })),
        }
      },
  ```

  Add the type to `Ww2Diagnostics`, with a doc comment. `missionHud` is declared later in `boot()` than the diagnostics object; the closure runs only after boot, the way `clouds()` closes over `cloudPass`. State that in a comment.

- [ ] **Step 2: Split `hopAndLand`.** Move the body up to and including `console.log(\`hopAndLand: cleared the latch…\`)` into `hopClear`. Move the rest into `landAndStop(page, until)`. Its last three statements become:

  ```ts
    await page.keyboard.press('KeyM')
    await page.keyboard.down('KeyB')
    if (until === 'debrief') await debriefDialog(page).waitFor({ timeout: 30_000 })
    else await page.waitForFunction(() => ((window as DiagWindow).__ww2!.mission()?.log ?? []).some((e) => e.kind === 'landing'), undefined, { timeout: 30_000 })
    await page.keyboard.up('KeyB')
  ```

  The 'stopped' wait works because the mission logs its landing when the aircraft comes to rest below `LANDED_SPEED_MPS`, exactly when the frame's debrief would otherwise open (Measured). `hopAndLand` becomes `await hopClear(page); await landAndStop(page, 'debrief')`.

- [ ] **Step 3: Write `tests/e2e/mission-ui.spec.ts`.**

  ```ts
  import { test, expect, type Page } from '@playwright/test'
  import { debriefDialog, hopClear, landAndStop, waitForScenario, type DiagWindow } from './harness.js'

  /**
   * Tier 2, M2: the mission UI end to end on the reference GPU, against the
   * DEV fixtures (content/scenarios/dev-mission-*.json; M2 open question 1).
   * Real physics throughout: the takeoff and landings are hopClear/landAndStop's
   * measured hop from the gunnery spot, which lands on-field (dossier.spec.ts).
   */
  test.setTimeout(300_000)
  const mission = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.mission())

  async function orders(page: Page, pilot: string) {
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto('/')
    const title = page.getByRole('dialog', { name: 'Title' })
    await title.getByRole('button', { name: 'New pilot' }).click()
    await title.getByPlaceholder('Pilot name').fill(pilot)
    await title.getByRole('button', { name: 'Add' }).click()
    await title.getByRole('button', { name: 'New game' }).click()
    return title
  }

  async function onStrip(page: Page, id: string) {
    await waitForScenario(page, id)
    await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
    await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  }

  /** Neither M2 element overlaps any other visible HUD element (open question 2). */
  async function expectNoHudOverlap(page: Page) {
    const boxes = await page.evaluate(() => {
      const els = [...document.querySelectorAll<HTMLElement>('body > div, body > pre, body > aside')]
        .filter((e) => getComputedStyle(e).position === 'fixed' && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width < innerWidth)
      return els.map((e) => ({ name: e.getAttribute('aria-label') ?? e.textContent?.slice(0, 20) ?? '', r: e.getBoundingClientRect().toJSON() as DOMRect }))
    })
    const mine = boxes.filter((b) => b.name === 'Objective' || b.name === 'Radio')
    for (const a of mine) for (const b of boxes) {
      if (a === b) continue
      const hit = a.r.left < b.r.right && b.r.left < a.r.right && a.r.top < b.r.bottom && b.r.top < a.r.bottom
      expect(hit, `${a.name} overlaps ${b.name}`).toBe(false)
    }
  }

  test('briefing, objective line, radio line, held-group spawn, chart, debrief, badge, stamp and dossier', async ({ page }) => {
    const title = await orders(page, 'Mission UI Pilot')
    const scenario = title.getByRole('radiogroup', { name: 'Scenario' })
    await expect(scenario).toContainText('Missions')
    await expect(scenario).toContainText('Ranges')
    await scenario.getByRole('radio', { name: 'UI Fixture (dev)' }).check()
    const briefing = title.getByRole('region', { name: 'Briefing' })
    await expect(briefing).toContainText('DEV FIXTURE. Take off from Tacloban')
    for (const text of ['PRIMARY', 'Take off', 'Recover', 'SECONDARY', 'Target', '1400 local', 'From 090° at 12 kt', 'Clear', 'UI Fixture Wings (dev)']) {
      await expect(briefing).toContainText(text)
    }
    await expect(title.getByRole('radiogroup', { name: 'Loadout' }).getByRole('radio', { name: 'Clean' })).toHaveAttribute('aria-checked', 'true')
    await page.screenshot({ path: 'test-results/m2-briefing.png' })
    await title.getByRole('button', { name: 'Launch' }).click()
    await onStrip(page, 'dev-mission-ui')

    await expect(page.getByLabel('Objective')).toHaveText('TAKE OFF')
    await expect(page.getByRole('status', { name: 'Radio' })).toHaveText('Tower: cleared for takeoff.', { timeout: 10_000 })
    expect((await mission(page))!.meshes).toEqual([{ id: 'drone-1', visible: false }])
    await expectNoHudOverlap(page)

    // Chart: objectives listed; the objective target is clickable for a course.
    await page.keyboard.press('KeyP')
    const chart = page.getByRole('dialog', { name: 'Navigation chart' })
    await expect(chart.getByLabel('Objectives')).toContainText('Take off')
    await expect(chart.getByLabel('Objectives')).toContainText('ACTIVE')
    await expect(chart.getByLabel('Objectives')).toContainText('PENDING')
    await chart.getByRole('button', { name: 'Set target-1 as navigation destination' }).click()
    await expect(chart).toContainText('Course')
    await page.screenshot({ path: 'test-results/m2-chart.png' })
    await page.keyboard.press('KeyP')
    await expect(chart).toBeHidden()

    await hopClear(page)
    await expect.poll(async () => (await mission(page))!.spawned, { timeout: 10_000 }).toEqual(['drone'])
    expect((await mission(page))!.meshes).toEqual([{ id: 'drone-1', visible: true }])
    await expect(page.getByLabel('Objective')).toHaveText('RECOVER')
    await expect(page.getByRole('status', { name: 'Radio' })).toHaveText('Tower: a friendly is passing overhead.', { timeout: 15_000 })
    await page.screenshot({ path: 'test-results/m2-airborne.png' })

    await landAndStop(page, 'debrief')
    const debrief = debriefDialog(page)
    for (const text of ['Objectives', 'Take off', 'COMPLETE', 'Target (secondary)', 'INCOMPLETE', 'BADGE AWARDED: UI Fixture Wings (dev)']) {
      await expect(debrief).toContainText(text)
    }
    await page.screenshot({ path: 'test-results/m2-debrief.png' })

    await debrief.getByRole('button', { name: 'Return to title' }).click()
    await title.locator('button[aria-pressed]').first().click()
    await title.getByRole('button', { name: 'New game' }).click()
    await expect(title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'UI Fixture (dev)' })).toContainText('AWARDED')
    await title.getByRole('button', { name: 'Back' }).click()
    await title.getByRole('button', { name: 'Dossier: Mission UI Pilot' }).click()
    await expect(page.getByRole('dialog', { name: 'Dossier: Mission UI Pilot' })).toContainText('UI Fixture Wings (dev)')
  })

  test('an intermediate landing shows on the radio line and the flight continues (spec §2.4)', async ({ page }) => {
    const title = await orders(page, 'Circuit Pilot')
    await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'Circuit Fixture (dev)' }).check()
    await title.getByRole('button', { name: 'Launch' }).click()
    await onStrip(page, 'dev-mission-circuit')
    await expect(page.getByLabel('Objective')).toHaveText('CIRCUIT 0/2')

    await hopClear(page)
    await landAndStop(page, 'stopped')
    await expect(page.getByRole('status', { name: 'Radio' })).toHaveText('Circuit 1 of 2')
    await expect(page.getByLabel('Objective')).toHaveText('CIRCUIT 1/2')
    const t0 = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
    await page.waitForTimeout(3000)
    await expect(debriefDialog(page)).toBeHidden()
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick()), 'the flight paused').toBeGreaterThan(t0)
    await page.screenshot({ path: 'test-results/m2-intermediate.png' })
  })
  ```

  Before running, confirm each name against the code as built in Tasks 3-7:
  - the Back button's accessible name (`titleModel().back`);
  - the Dossier button's `aria-label`: `Dossier: ${pilot.name}`;
  - the `Set … as navigation destination` label.

  If the harness's `startGame` pattern (reuse the first roster row) makes the second test's pilot list differ, leave it: each test gets a fresh context.

- [ ] **Step 4: Run Tier 2 on a spare slot.**

  ```bash
  # local scratch, never committed: vite.config.ts TUNNEL_HOST -> 'ww2airsim-2.windomlane.org', server.port -> 5175
  WW2AIRSIM_TUNNEL=1 npx vite --port 5175 &          # from this worktree
  curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/   # 200
  ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
  PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org npx playwright test tests/e2e/mission-ui.spec.ts --retries=2; echo "rc=$?"
  ```

  Expected: 2 passed, `rc=0`. Read every `test-results/m2-*.png` before claiming a pass. A picture you have not looked at is not evidence. If page loads time out in `waitForScenario`, first read the S1 ledger note: page loads took 26-56 s on 2026-09-26, so the budget is 60 s. Then consider a flake before changing code.

- [ ] **Step 5: The regression set.** The same command, with the specs whose code M2 touched:

  ```bash
  PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org npx playwright test tests/e2e/adapter.spec.ts tests/e2e/meta-game.spec.ts tests/e2e/meta-game-relaunch.spec.ts tests/e2e/dossier.spec.ts tests/e2e/scenarioPicker.spec.ts tests/e2e/title.spec.ts tests/e2e/missionMap.spec.ts tests/e2e/entities.spec.ts tests/e2e/deckQuals.spec.ts --retries=2; echo "rc=$?"
  ```

  Expected: every one passes. `meta-game` and `dossier` go through the split `hopAndLand`. `entities` and `deckQuals` go through `entityViews`. `scenarioPicker` and `title` go through the orders memo. M2 draws no geometry, so no GPU budget spec is in the set. Record the pass counts in the ledger. Revert the `vite.config.ts` scratch edit, `git diff --stat vite.config.ts` must be empty, and stop the dev server.

- [ ] **Step 6: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add src/render/diagnostics.ts src/render/main.ts tests/e2e/harness.ts tests/e2e/mission-ui.spec.ts
  git commit -m "M2 Task 8: Tier 2 mission UI spec on the reference GPU; hopAndLand split for intermediate landings"
  ```

---

### Task 9: Handoff, §15 row, README

**Files:**
- Create: `docs/handoff/<YYYY-MM-DD>-m2-mission-ui.md`, named with the completion date
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (the Plan 9 row of §15), `README.md` (one paragraph in `## Status`)

- [ ] **Step 1: Measure the footprint.** Run `git diff <P2 merge commit> -- src/render/main.ts | grep -c '^[+-][^+-]'` and record the number. The target is under 60. If it is over, list what made it so. Re-run the digest probe and record the six hashes, which must equal P4's.
- [ ] **Step 2: Write the handoff,** in this order:
  1. what changed, one bullet per commit with its SHA;
  2. the rulings, R1-R10 by number and one line each, plus the executor's own from the ledger;
  3. the answers Mark gave to the five open questions, or "defaults applied";
  4. Tier 1 and Tier 2 results: pass counts, the regression set, and the `m2-*.png` captures listed. If the run was unattended, the captures are the viewing checkpoint;
  5. **forward notes for M3:**
     - add each mission to `SCENARIO_OPTIONS` with `kind: 'mission'` and its `badge`; `options.test.ts` fails until the option and the file agree;
     - every shipped mission needs `briefing` and `history`;
     - Deck Quals' radio "Trap n of 3" is the engine's own message, so the label must be `Trap`;
     - the Tier 2 per-mission specs can reuse `mission-ui.spec.ts`'s `orders` and `onStrip`;
     - `dev-` fixtures stay DEV-only (or not, per Mark's answer to question 1).
- [ ] **Step 3: Update the §15 Plan 9 row.** Re-diff the row against `HEAD` first. In its Status cell, replace "M2 (UI), M3 (…) and M4 (…) not started, so no shipped scenario declares an objective yet" with: `M2, the mission UI (briefing, objective and radio lines, intermediate landings, chart objectives, debrief block, roster badge, held-group meshes), complete YYYY-MM-DD with Tier 1 and reference-GPU Tier 2 against DEV fixtures ([plan](../plans/2026-09-26-m2-mission-ui.md), [handoff](../../handoff/YYYY-MM-DD-m2-mission-ui.md)); M3 (Deck Quals, Airfield Strike, Convoy Strike) and M4 (Combat Air Patrol, after 7e) not started, so no shipped scenario declares an objective yet`. Also replace "the Dossier's badge section stays empty until M2 writes `badges[]`" with "M2 writes `badges[]` on a mission success".
- [ ] **Step 4: README paragraph** in `## Status`: `**Missions have a UI (M2, YYYY-MM-DD):** mission scenarios get a briefing on the orders memo, an objective line and a radio line in flight, objectives on the navigation chart, and an objectives block with a badge verdict in the debrief; a successful landing records the badge on the pilot. No shipped scenario is a mission until M3. See the [handoff](docs/handoff/YYYY-MM-DD-m2-mission-ui.md); master spec §15 holds the status.`
- [ ] **Step 5: Verify, commit, push the branch, email.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add docs/handoff/*-m2-mission-ui.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
  git commit -m "M2 handoff: the mission UI"
  git push -u origin worktree-missions-track
  python3 tools/mail-doc.py docs/handoff/<file>.md "ww2airsim handoff: M2 mission UI"
  ```

  Exit 0 means it was sent. Never re-run it with `--debug`. Do not merge into `main`; that is Mark's call.

---

## Self-review

**Spec coverage** (spec §9 item 2, and the §3/§5 bullets M2 owns):

| Spec item | Where |
| --- | --- |
| §3 picker split into Missions and Ranges | Task 6 |
| §3 AWARDED `.stamp` on a held mission | Task 6 (a `.stamp-chip`: `.stamp` needs the SVG filter and reads as a rubber stamp, too heavy inline; chip is the Dossier's own badge style) |
| §3 briefing: situation, historical context, objectives primary/secondary, time and weather, recommended loadout preselected and changeable | Tasks 1 (keys), 6 (model, DOM, R10) |
| §3 objective line, pure label + thin DOM | Task 3 |
| §3 radio line, queued, clear of Paddles and pause | Task 3; placement asserted in Task 8 |
| §3 chart: objectives with status, targets and stations marked, targets clickable | Task 7; Tier 2 in Task 8 |
| §3 debrief objectives block, BADGE AWARDED or the reason | Task 5 |
| §2.4 intermediate landings: radio line, no debrief, no pause | Task 4; Tier 2 in Task 8 |
| §5 roster round-trip with badges | Task 5 |
| §5 Tier 2: loads, briefing renders, objective line updates, a trigger's message appears, debrief stamps | Task 8, against DEV fixtures; M3 adds one spec per real mission |
| M1 forward note: held groups have no mesh | Task 2 (R1) |
| M1 forward note: `lastLanding(...).intermediate` → radio, acknowledge | Task 4 (R2) |
| M1 forward note: `recoveryOf` then `missionOutcome` at the debrief | Task 5 |
| M1 forward note: radio reads `radioMessages`, by tick | Task 3 (by count, R8: the log is append-only, so the count is the key) |
| M1 R15: `briefing`/`history` added with their first reader | Task 1 schema, Task 6 reader. The two land in separate commits, and Task 1's schema test is the reader in between. This is deliberate, so the fixtures exist before the UI tasks need them |
| Headless mission runs, content ASSETS checks | **Not M2**: M3 (spec §9) |

**Placeholder scan.** The fill-ins are the handoff's completion date, the SHAs it lists, P2's merge commit, and names confirmed against built code in Task 8 Step 3. Test bodies written as `…` name the exact assertion in their title and the helper to build them from. The executor writes them against M1's fixture exports, which exist.

**Type consistency.** These names are used identically across tasks:
- `entityViews`, `ScenarioEntities.held`;
- `objectiveLineLabel`, `nextRadioLine`, `RadioLine`, `NO_RADIO`, `RADIO_SHOW_MS`, `createMissionHud`, `MissionHudHandle.text`;
- `landingDisposition`, `handledLandingTick`;
- `missionDebrief`, `withMissionDebrief`, `DebriefMission`, `DebriefModel.mission`;
- `awardBadge`, `awardBadgeInRoster`;
- `ScenarioOption`, `SCENARIO_OPTIONS`, `DEV_SCENARIO_OPTIONS`, `scenarioOptions`, `isKnownScenarioId(id, dev)`, `badgeName`, `TitleMissions`;
- `briefingModel`, `conditionsFor`, `renderBriefing`, `briefingRequest`;
- `objectiveMarks`, `objectiveRows`;
- `loadScenarioFile`, `BriefingObject`, `HistoryObject`, `LoadoutObject`;
- `hopClear`, `landAndStop`.

**Review Focus coverage:**

| Item | Test |
| --- | --- |
| 1 | Task 2, "spawn order differs from heldGroups order" |
| 2 | Task 2, "restart hides spawned meshes again"; Task 3, "a shorter log resets"; Task 4, "handled tick resets" |
| 3 | Task 4, `it.each([1, 3])` through `nextFrameState` |
| 4 | Task 5, "ditched" and "killed in the air" |
| 5 | Task 6, `briefingRequest` "applies only the latest id" |
