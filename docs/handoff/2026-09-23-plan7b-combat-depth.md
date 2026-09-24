# Plan 7b handoff — energy-aware AI maneuvering

2026-09-23, executed overnight via superpowers:subagent-driven-development
with no human input, per Mark's explicit authorization ("Proceed! ... Try to
complete without my input overnight. Make rulings on my behalf where
possible."). Plan 7's second bounded slice is complete on `main`. An AI
pilot now chooses between three maneuvers — Pursue, Extend, Break — rescored
on a per-skill cadence, instead of flying one hardcoded script forever as it
did after Plan 7a. Plan 7a's controller/pursuit seam is unchanged; this
slice is entirely the decision layer built on top of it.

## What landed

- `src/sim/ai/pilot.ts` — `PilotSkill` (reaction delay, gunnery accuracy,
  energy discipline, disengagement threshold — the last currently unused,
  reserved for a later slice), `VETERAN_SKILL`/`GREEN_SKILL` presets,
  `PilotManeuver`/`PilotDecisionState`, and `extendDesiredVelocity`/
  `breakDesiredVelocity` — two new desired-velocity producers feeding the
  same `controlsForDesiredVelocity` seam Plan 7a built, no controller
  changes. `extendDesiredVelocity` dives away below `SAFE_SEPARATION_M`
  (1,100 m) and rejoins on a shallow climb above it — a terminal state added
  during execution (see "What the overnight run found," below).
- `src/sim/ai/decision.ts` — the utility scorer: `DecisionFacts`,
  `deriveFacts` (relative energy, angle-off both ways, range, closing rate,
  threat-astern, damage taken, fuel fraction), `scoreManeuvers`,
  `decideManeuver` (Pursue wins ties; `MIN_ENGAGEMENT_RANGE_M` = 120 m is a
  forced pre-scoring override when closing inside it, not a weighted term),
  and `maneuverControls` (the dispatcher, deliberately placed here rather
  than in `pilot.ts` to avoid a circular import with `pursuit.ts`).
- `src/sim/ai/pursuit.ts` — `hasGunSolution`'s cone now scales by the
  shooter's `gunneryAccuracy` (`AI_GUN_CONE_RAD * gunneryAccuracy`, falling
  back to `1.0` — today's exact behavior — for a pilot-less shooter).
  `AI_GUN_RANGE_M` is unchanged.
- `src/sim/loop.ts` — `advance()`'s pilot dispatch now rescores on the
  pilot's own `reactionS` cadence (`tick * DT >= decision.nextRescoreS`)
  instead of calling `pursuitControls` unconditionally, and writes the
  (possibly updated) decision back onto the entity each tick.
- `src/sim/scenario.ts` — scenario content's `pilot` object gained an
  optional `skill: 'veteran' | 'green'` (default `'green'`, so every
  already-shipped scenario is unaffected); `worldFromScenario`'s
  `pilotAssignmentFrom` is the one production site that maps it to a preset
  and seeds the initial decision.
- `content/scenarios/pursuit-range.json` — `pursuer-1` is now
  `"skill": "veteran"`.
- `tests/e2e/ai-maneuver.spec.ts` — the reference-GPU acceptance spec:
  proves `pursuer-1` breaks off before point-blank range (closes under
  `MIN_ENGAGEMENT_RANGE_M`, opens again afterward, and never comes closer
  than 50 m — a floor added during the final review, see below) rather than
  flying through the player as it did after 7a. Deliberately does NOT
  attempt to prove the "damaged pilot disengages" claim at Tier 2 — no debug
  hook exists to seed AI damage without the player actually landing shots,
  and that claim is already Tier-1-covered; scripting a reliable player
  gunnery pass was judged disproportionate for this slice.

## What the overnight run found (all fixed, all independently reviewed)

Three real bugs were found and fixed DURING execution — one before
implementation even started (a hand-verification catch), two only once the
decision layer was wired into the real production loop and run against the
actual `pursuit-range` scenario. Each is recorded as a dated "Ruling"
callout in the plan itself
(`docs/superpowers/plans/2026-09-23-plan7b-combat-depth.md`), which is the
fuller record; summarized here:

1. **The energy-discipline formula's sign was backwards, and no scaling of
   its one term could ever have worked.** The design's own pseudocode
   (`EXTEND_ENERGY_WEIGHT = -1.0 * energyDiscipline`) made a MORE
   disciplined pilot extend MORE readily at a fixed energy deficit — the
   opposite of "holds the attack longer." Worse, since Pursue's own score
   had zero skill dependence, no scaling of Extend's term alone could ever
   make two skill presets choose differently at a fixed deficit (the
   ordering's sign was invariant to skill). Caught by hand before Task 2 was
   dispatched (commit `71d0cec`). Fixed by flipping Extend's scale to
   `(1 - energyDiscipline)` and adding a new `PURSUE_ENERGY_DISCIPLINE_BONUS
   = 1000` term to Pursue — the minimum structural change that makes a
   skill-dependent crossover possible at all.
2. **The Break-angle score was inverted.** `angleBetween(target.velocity,
   toSelf)` is 0 when the target's nose IS on self (real danger) and π when
   pointed away (safe) — but `BREAK_ANGLE_WEIGHT * angleOffTargetRad` scored
   Break HIGHEST exactly when safest. This is why `pursuer-1`, trailing
   directly behind the player (whose nose is necessarily pointed away),
   chose Break on tick 0 in production instead of Pursue — found only once
   Task 5 ran the real scenario (commit `93b4667`). Fixed to
   `BREAK_ANGLE_WEIGHT * (Math.PI - angleOffTargetRad)`, with the test
   fixture's neutral baseline flipped from `0` (the dangerous end) to
   `Math.PI` (the safe end) to match.
3. **`extendDesiredVelocity` had no terminal state.** Once a dive started it
   never stopped — empirically measured diving to -2,647 m altitude and
   33,743 m range after 200 simulated seconds, never returning, permanently
   failing Plan 7a's own hit-rate acceptance test (commit `903df3b`, found
   by the same production run as #2). Fixed by adding `SAFE_SEPARATION_M`:
   beyond 1,100 m (2× `AI_GUN_RANGE_M`), Extend rejoins toward the threat on
   a shallow climb instead of continuing to dive.

Two pre-existing Plan 7a tests were also updated in Task 5, because they
encoded the old "AI always pursues, nothing else exists" assumption this
plan intentionally supersedes: `tests/sim/entities.test.ts`'s
`pursuitWorld()` fixture (removed an accidental energy deficit that made
the now-live scorer correctly pick Extend where the test's real intent was
determinism/stepping, not tactics) and its stale `structuredClone`
expectation; and `tests/sim/scenario.test.ts`'s "actually hits the target"
test, whose tick budget was empirically re-tuned from 2,000 → 12,000 after
fix #3 landed, based on an observed deterministic hit at tick 7,430 (~61%
headroom — re-verified independently at the final review, not a guess).

**The final whole-branch review** (opus, reviewing the entire range fresh)
found two further defects that no single task's scoped review could have
seen — both direct, unforeseen consequences of fix #2 above:

4. `breakDesiredVelocity` degenerated to the zero vector in head-on
   geometry (`cross(selfFwd, towardThreat) → 0` when nearly antiparallel —
   exactly the geometry fix #2 now correctly routes to Break), causing
   bang-bang instability at 1 mm perturbations. Fixed with a stable
   world-up fallback axis when the cross product is near-zero.
5. `angleBetween`'s degenerate-input fallback (`0`) had become the
   MAXIMUM-threat value for `angleOffTargetRad` under fix #2's new
   convention, so a coincident-position or zero-velocity target read as
   maximal danger. Fixed by giving the function a per-call-site degenerate
   default: `0` (neutral) for `angleOffSelfRad`, `Math.PI` (safe) for
   `angleOffTargetRad`.

The same final review also found three tests that could not fail for the
behavior they were named after (a rescore-cadence test that only proved
half its claim; a `MIN_ENGAGEMENT_RANGE_M` test whose only assertions lived
inside a conditional that could silently become a no-op; a Tier 2 spec that
couldn't distinguish "broke off" from "flew straight through," since both
satisfy "range opens afterward") plus six Minor documentation/naming
issues. All 11 findings were fixed in one batched commit (`1593490`) and
independently re-reviewed clean — findings 4 and 5 above were specifically
hand-verified for geometric correctness, not just "a test was added and
passed."

**Every ruling above was made by the controller, unattended, per Mark's
explicit authorization to decide on his behalf and log the decisions.** The
full reasoning and cost-if-wrong for each lives in the plan document's own
"Ruling" callouts and in this plan's SDD ledger
(`.superpowers/sdd/2026-09-23-plan7b-combat-depth/progress.md`, gitignored
— not in this clone, but present in the checkout that ran tonight).

## Design boundary (deliberate, from the design doc, unchanged from 7a)

Lag pursuit, barrel-roll defence, split-S, scissors, attack run, bomber
formation station-keeping, formation keeping, landing AI and multi-pilot
teams remain explicitly out of scope — Plan 7c's territory, unchanged from
7a's own boundary. `disengageThreshold` exists on `PilotSkill` but is not
yet read by the scorer (reserved for a future slice; this slice's forced
override is range-based only). The "AI pilot damaged mid-fight visibly
disengages" claim is Tier-1-only (see Task 6's scope ruling in the plan).

## Tier 1 evidence

Final command:

```
npm run verify; rc=$?; echo rc=$rc
```

Result: `rc=0`; typecheck, ESLint (zero warnings) and dependency-cruiser
clean; 133+ test files, 1,388 tests passed, 1 pre-existing skip (unrelated
terrain-data skip, not this plan's).

## Reference-GPU evidence

Command, against the served nexus checkout through the Windows Playwright
server:

```
PW_REMOTE=ws://localhost:39001/ \
PW_BASE_URL=https://ww2airsim.windomlane.org \
npx playwright test tests/e2e/ai-maneuver.spec.ts
```

Result (final run, after the review fix wave): 1 passed, gpu p95 0.861 ms
over 3,576 samples (well under the 6.0 ms ceiling), zero WebGPU validation
errors, on the AMD RDNA 2 reference adapter at 2560×1440. `pursuer-1` closes
under `MIN_ENGAGEMENT_RANGE_M` (120 m), never comes closer than 50 m (the
floor added at final review — a genuine break-off, not merely "range opened
again," which a pass-through would also satisfy), and opens range afterward.
Screenshot: `test-results/ai-maneuver.png` in the served checkout's ignored
test output — read directly by both the implementing and reviewing agents
before the pass was trusted, per this repo's own rule.

## Commits

`0feca03..1593490` on `main`, 13 commits (12 plan-authored, one of them the
plan documents themselves): 4 task implementation commits interleaved with
2 pre-dispatch plan-doc rulings and 2 post-discovery plan-doc rulings with
their own fix commits, plus Task 5's and Task 6's own commits, plus the
final review's one fix-wave commit. Full list in
`docs/superpowers/plans/2026-09-23-plan7b-combat-depth.md`'s own execution
or via `git log --oneline 0feca03..1593490`.

## Remaining work

- Plan 7c: pilot skill selection tied to something beyond two hardcoded
  scenario presets, formation/team coordination, the rest of the maneuver
  library (lag pursuit, barrel-roll defence, split-S, scissors, attack run,
  bomber formation station-keeping), landing AI. Unchanged from 7a's own
  deferred list.
- `disengageThreshold` remains unread by the scorer — a future slice's
  hook, not a defect.
- The "damaged pilot disengages" claim stays Tier-1-only until a debug hook
  exists to seed AI damage without live player gunfire (noted as a
  deliberate scope decision in the plan's Task 6, not an oversight).
- Not pushed, not deployed — both are Mark's call, separately, per this
  repo's own convention.
