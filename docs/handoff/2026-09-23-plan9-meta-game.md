# Plan 9 handoff — meta-game: roster, live scoring, dynamic scenario switching

2026-09-23/24, executed overnight via superpowers:subagent-driven-development
with no human input, per Mark's explicit authorization. Plan 9's remaining
scope (master spec §15: "roster, mission select and return-to-title remain")
is complete on `main`. `missionScore()` reads real combat state instead of a
hardcoded-zero stub, a persistent pilot roster lives behind the title
screen, and picking a scenario swaps entities in place with no page reload.

This was the most consequential plan of the night, not because any single
task was hard, but because its own core feature — dynamic scenario
switching — had never once run in a real browser before tonight, and its
first real run found a serious bug class no amount of Tier 1 testing could
have caught. See "What the overnight run found," below.

## What landed

- `src/sim/weapons/targetType.ts` — `TargetType`, an 8-value union matching
  master spec §8's point table exactly (including `'runway'`, which has no
  producer yet — a forward-compatible vocabulary, not dead code),
  `zeroKillsByType()`, `addKillsByType()` (additive accumulation, added
  during the final review's fix wave).
- `src/sim/flight/schema.ts` / `content/aircraft/f6f-hellcat.json` —
  aircraft gain a `role: 'fighter' | 'bomber'` field.
- `src/sim/world/ships.ts` / `src/sim/weapons/combat.ts` — ship `role`
  widens to add `'cruiser'`/`'battleship'` (no existing ship reclassified —
  none of the three shipped ships actually is one).
- `src/sim/world/airfields.ts` / `src/sim/weapons/structures.ts` /
  `src/render/scene/airfield.ts` — `Building`/`StructureEntity.kind` widens
  to add `'aaa'` only (deliberately NOT `'runway'` — see the plan's own
  Ruling for why a runway doesn't fit this model). One `'aaa'` building
  added to `content/bases/tacloban.json`.
- `src/sim/weapons/combat.ts` — `AircraftCombat.killsByType`, credited at
  all three existing kill/sink/destroy sites, additive to the pre-existing
  flat `kills`/`shipsSunk`/`structuresDestroyed` counters (unchanged).
  `'escort'`/`'merchant'` ship sinks deliberately do NOT feed `killsByType`
  (outside master spec §8's table; forcing them in would mislabel a sunk
  destroyer) — they still increment `shipsSunk`, still visible wherever
  that already renders.
- `src/render/debrief.ts` — real `missionScore()`, `killsSince()` (the
  per-type delta that prevents a landing-then-Continue-then-another-landing
  sequence from re-banking the whole flight's cumulative kills), 3-value
  `RecoveryOutcome` (`'landed' | 'ditched' | 'killed'` — master spec §8's
  4th tier, "bailed out over friendly water," has no code path since there
  is no bail-out/parachute mechanic, and is deliberately not modeled). The
  debrief now also shows the recovery multiplier applied, the banked
  cumulative total, and a promotion notice when one occurs (added during
  the final review's fix wave — the original design doc promise for these
  three fields had fallen between Task 3 and Task 6).
- `src/render/roster.ts` — `PilotRecord`, the 10-tier rank ladder (matches
  master spec §8 exactly, including the Commodore/Rear Admiral
  period-accuracy substitution), `loadRoster`/`saveRoster` (the only two
  functions touching `window.localStorage`, per design §2's decision —
  `localStorage`, not IndexedDB), `exportRoster`/`importRoster`,
  `createPilot`, `startSortie` (resurrection), `applyMissionResult`
  (scoring/promotion/death). `loadRoster` tolerates a corrupt blob (warns,
  returns an empty roster) rather than throwing — added during the final
  review; `importRoster` still throws on malformed input, a deliberately
  different contract for a user-initiated action.
- `src/render/titleScreen.ts` — a roster step above the scenario/loadout
  pickers (native `<button>`s, matching the file's existing keyboard-first
  convention), `show(currentScenarioId)` (invented for the first time —
  the file's old "there is no show()" comment is gone), `onNewGame` grows a
  third parameter (`pilotId`). `titleScreen.ts` itself calls
  `startSortie`/`saveRoster` before invoking `onNewGame` — a deliberate
  architectural call made necessary by `main.ts`'s scenario-switch path
  once doing a full page navigation (now fixed by Task 7, but the ownership
  split stuck: `titleScreen.ts` owns starting a sortie, `main.ts` owns
  banking its result).
- `src/render/main.ts` — roster/scoring state wired at all three debrief
  sites (impact, destruction, landing) via a shared `bankMissionResult`;
  a new "Return to title" path; `loadScenario(id, loadout)` extracted from
  boot's one-time sequence, disposing the previous scenario's meshes
  (`src/render/scenarioEntities.ts`, new) before building the new ones —
  terrain/ocean/sky/the panel are untouched, per design §5.

## What the overnight run found (all fixed, all independently reviewed)

**The scenario-switch feature's first-ever real browser run failed
completely**, and traced back to a temporal-dead-zone (TDZ) bug class that
static reading alone missed twice before an actual reproduction found it:
`main.ts`'s `onNewGame` closure is created synchronously, before `boot()`'s
first `await` — but several bindings it (or the `rebuildFrame`/`loadScenario`
closures it calls) reads or writes were declared much later, across real
`await` boundaries (renderer init, the initial scenario fetch, sky noise,
ocean cascades, depth field). A click landing in any of those windows threw
a silent, uncaught `ReferenceError`, aborting the whole handler with **no
visible symptom** — worse than a crash, because nothing looked broken.

Found and fixed across two rounds: `roster`/`currentPilotId`/
`scoredThroughKillsByType` first (the immediate cause of the switch not
working at all), then — after a review pass found the same class unfixed
elsewhere — `frame`/`audio`/`buildWorld`/`loadScenario`/`loop` (5 more
bindings), the last two found only by building a zero-latency in-page click
harness, since ordinary Playwright clicks were too slow over the network
tunnel to reliably reproduce the race. All six are now hoisted above the
title screen's creation. A separate, genuinely different bug in the same
area — the Tier 2 test's own wait condition checked a one-time terrain
signal that could never detect a second in-session scenario load — was
fixed alongside it.

**The same real-GPU run also found that this plan's own roster gate broke
shared test infrastructure repo-wide.** `tests/e2e/harness.ts`'s
`startGame()` helper — used by `waitForTerrain`, which ~20 e2e spec files
across the WHOLE repo call to get past the title screen — never selected a
pilot, and the "New game" button is now `disabled` until one is selected.
Every affected spec would fail via a 60-second Playwright timeout, not a
silent no-op. Fixed as its own commit, verified against `terrain.spec.ts`
(an unrelated spec) passing 4/4 on the real reference GPU.

**The final whole-branch review found one more real, deterministic
regression** in the plan's own headline flow, invisible to any single
task's review because it's a cross-task interaction: `rebuildFrame()`
(used by `onNewGame`'s New Game handler) reset only the scoring baseline,
not the seven other flight/debrief UI flags the pre-existing Restart
handler already reset (`landingShown`, `shownImpactTick`,
`shownDestructionTick`, `postImpactOceanSeconds`, and hiding the debrief/
impact-effect/hit-flash overlays). Land once, return to title, start a new
sortie, land again — and the second debrief silently never shows, banking
nothing, for the rest of the page's life. Fixed by extracting a shared
`resetFlightUi()` called from both paths; re-verified on the real reference
GPU (banked total 500 → 1000 across two landings in one session, screenshots
read directly).

The same final review found four more real gaps, all fixed in the same
pass: `loadRoster()` could brick boot on a corrupt save (now tolerant);
`PilotRecord.killsByType` was declared and persisted but never actually
written by any code path (now accumulates additively); the debrief never
showed the recovery multiplier, banked total, or a promotion notice despite
the design doc promising all three (now rendered); and Restart after a
death left a pilot permanently `'kia'` with no way back except a fresh New
Game, bypassing the whole resurrection model (now clears on any non-killed
outcome, with `resurrections` staying exclusively `startSortie`'s to
increment).

**Every ruling above was made by the controller, unattended, per Mark's
explicit authorization to decide on his behalf and log the decisions.** The
full reasoning and cost-if-wrong for each lives in the plan document's own
"Ruling" callouts and in this plan's SDD ledger
(`.superpowers/sdd/2026-09-23-plan9-meta-game/progress.md`, gitignored —
not in this clone, but present in the checkout that ran tonight).

## Deliberate boundaries (unchanged from planning, or newly recorded tonight)

- `'runway'` (master spec §8, 500 pts) is not a scorable target — a runway
  isn't a discrete `Building`-shaped entity, and forcing the fit was judged
  worse than an honest absence.
- `'escort'`/`'merchant'` ship kills don't feed `killsByType` — outside
  master spec §8's table entirely.
- "Bailed out over friendly water" (§8's 4th recovery tier, 0.25×) has no
  code path — no bail-out/parachute mechanic exists in this sim.
- `exportRoster`/`importRoster` have no production UI caller yet. This is
  **the one item the final review found and left genuinely open** rather
  than guessing: the design doc says only "explicit JSON export and
  import," with no UI placement and no replace-vs-merge semantics specified
  for what happens when an imported roster collides with an existing one.
  Needs a real design decision before it's wired up.
- The aircraft roster (master spec §9 — historical airframe types), badge
  *content* (the mechanism exists, no scenario declares an objective to
  award one from yet), and multiplayer/server-side sync all remain
  explicitly out of scope, per design §6's own deliberate boundary.

## Tier 1 evidence

Final command:

```
npm run verify; rc=$?; echo rc=$rc
```

Result: `rc=0`; typecheck, ESLint (zero warnings) and dependency-cruiser
clean; 136 test files, 1,436 tests passed, 1 pre-existing skip (unrelated
terrain-data skip).

## Reference-GPU evidence

Three separate real-GPU passes tonight, against the served nexus checkout
through the Windows Playwright server (`PW_REMOTE=ws://localhost:39001/
PW_BASE_URL=https://ww2airsim.windomlane.org`):

- `terrain.spec.ts` (verifying the harness fix broadly): 4/4 passed, gpu
  p95 3.287 ms.
- `tests/e2e/scenarioPicker.spec.ts` (Task 7's own regression suite, after
  both the harness fix and the TDZ fixes): 3/3 passed.
- `tests/e2e/meta-game.spec.ts` (Task 8's full acceptance flow — pick a
  pilot, fly, land, bank a real score, Return to title, switch scenario in
  place, fly the new one) and `tests/e2e/meta-game-relaunch.spec.ts` (the
  final review's own land-twice regression test): all passed, gpu p95
  3.116 ms / well under the 6.0 ms ceiling across both, zero WebGPU
  validation errors after at least two in-session scenario switches.
  Screenshots read directly by both implementing and reviewing agents
  before any pass was trusted, per this repo's own rule.

## Commits

`1852b08..9ed751d` on `main`, 16 commits: 8 task-implementation commits
interleaved with 3 controller-authored plan-doc ruling/fix commits made
before dispatch, one standalone shared-infrastructure fix (`d9c7203`, the
e2e harness), two mid-execution investigation/fix commits for the TDZ bug
class (`6634388`, `f1de58e`), and one final whole-branch-review fix-wave
commit (`9ed751d`). Full list via
`git log --oneline 1852b08..9ed751d`.

## Remaining work

- Wire `exportRoster`/`importRoster` into the title screen once the
  replace-vs-merge UI decision is made (the one deliberately-deferred item
  from tonight's final review).
- Badge *content*: no shipped scenario currently declares an objective, so
  the award mechanism has nothing to award yet.
- The aircraft roster (§9) and multiplayer/server sync remain out of scope,
  unchanged from the design doc's own boundary.
- Not pushed, not deployed — both are Mark's call, separately, per this
  repo's own convention.
