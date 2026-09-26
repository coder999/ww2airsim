# AI 7c: veteran retune, safety envelope, re-engagement and the maneuver library, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry out Mark's veteran ruling, and give every AI pilot a hard safety envelope (G limit, a symmetric negative-G floor that becomes zero for a float-carburetted engine, a ground floor and an overspeed guard). Make the pursuer re-engage after a missed head-on pass, then add the spec's named maneuvers on top of 7b's unchanged Pursue/Extend/Break scorer: lag pursuit, both yo-yos, attack run, scissors, split-S and Immelmann.

**Architecture:**
- The per-pilot block moves out of `advance()` into one pure function, `pilotTick` (`src/sim/ai/pilotTick.ts`). After that, `loop.ts` is not touched again.
- Each tick runs in a fixed order:
  1. rescore on the pilot's own cadence (7b's intent, then 7c's named-maneuver selector, then a phase latch);
  2. check the safety overrides, every tick;
  3. fly the maneuver through one of two controllers: the unchanged velocity controller, or a new lift-vector controller once the desired direction is more than 60° off the nose;
  4. apply the load-factor limiter, then the overspeed throttle cut, then 7d's control noise.
- Everything is derived from `AircraftSpec` fields, so the A6M Zero needs no special case.

**Tech Stack:** TypeScript (strict), vitest, `tsx` for scratch probes. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-ai-7c-design.md` (approved by Mark 2026-09-25, with his decisions recorded at its end). This plan implements §3 only: 7c. It does not implement 7e, 7f or 7g. Read §1, §3, §7 and §8 before starting. Read the three handoffs this plan answers:
- `docs/handoff/2026-09-25-gunnery-fix.md`, open item 1: after a head-on merge the AI never re-engages.
- `docs/handoff/2026-09-25-z2-zero-flight-model.md`, "For 7c" and open items: the AI Zero's negative-g cutout and control fade.
- `docs/handoff/2026-09-25-m1-mission-engine.md`, "For Lane A": `spawnHeldGroup` is 7e's, not 7c's. See "Out of scope".

**Where:** the worktree `/home/mark/projects/ww2airsim/.claude/worktrees/combat-track`, branch `worktree-combat-track`. This is the combat track. Mark set its order: gunnery fix, then Z2, then 7c, 7e, 7f, 7g. Do not switch branches, and do not push.

## Global Constraints

- **Resource rules (nexus was OOM-killed on 2026-09-25 by parallel test suites).**
  - Never copy the repo into `/tmp`.
  - During a task, run tests by named file only: `npx vitest run <files> --maxWorkers=2`.
  - Every task ends with verification, run exactly as: `npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"`. This is `npm run verify` under the suite lock the Z2 run used, with fewer workers. Capture `rc` directly and never gate on a grepped pipeline.
  - No `npm install`. No `git clean -fdx`.
  - Tier 2 runs only in Task 13, on the Windows desktop, from a free dev-server slot.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node core or a rendering library (`.dependency-cruiser.cjs`).
  - Within `src/sim/ai/`, value imports must stay acyclic. `pilot.ts` holds the types and the skill data. `maneuverFlight.ts` never imports `decision.ts`, `maneuvers.ts` or `pilotTick.ts`. `decision.ts` never imports `maneuvers.ts` or `pilotTick.ts`.
  - Type-only imports create no edge; see the `no-circular` rule's comment.
- **No AI code names an airframe** (spec §7). G comes from `limits.gLimit`, the negative-G floor from `engine.negativeGCutout`, corner speed from `reference.stallSpeedMps`, and ballistics from `spec.combat`. Task 3 adds a test that fails if a content id appears in `src/sim/ai/`.
- **Determinism.** The only randomness is the existing per-pilot `noiseCursor`. New choices break ties by id, never by array position. Every new `PilotDecisionState` field is plain data that survives `structuredClone`.
- **Bit-identity.** The four scenarios without a pilot (`deck-quals`, `free-flight`, `gunnery-range`, `strike-range`) keep their digests through every task, using the probe in Task 1 Step 1. The golden trajectory (`tests/sim/golden/trajectory.test.ts`) and the landing snapshots (`tests/sim/landing.test.ts`, `tests/sim/carrierLanding.test.ts`) stay bit-identical, because none of them has a pilot.
- **Tuning values are measured, not guessed.** Every constant this plan introduces has the probe measurement it came from in its comment, dated 2026-09-25, with the method. If a measurement you take disagrees with this plan's number, record yours. If a gate fails, stop and report it to the controller rather than loosening the gate.
- **Tier 1 measures through the production frame path.** `tools/ai/replica.ts` drives `initialFrameStateFor` and then `nextFrameState(f, 1/60, keys)`, which is the path `main.ts` runs. A test that measures what the browser shows goes through it.
- Scratch probes live under `.superpowers/7c/` (gitignored; confirm with `git check-ignore -v .superpowers/7c/x.ts`). Never commit a probe. Never edit `src/` to probe: copy the logic into the probe instead. (This plan's own prototypes were written that way, in `aitick.ts`.)
- US spelling in new prose and identifiers. Escape `|` as `\|` inside markdown table cells.
- End each commit message with the Co-Authored-By trailer your session's instructions specify. Put no AI model names in commit bodies or docs.

## Shared files, overlap and merge order

7c is the only plan running in `src/sim/ai/` (spec §2: 7e, 7f and 7g follow it and never run in parallel with it). What 7c touches that someone else might:

| File | 7c's change | Who else | Overlap |
| --- | --- | --- | --- |
| `src/sim/loop.ts` | Task 2 only: the per-pilot block becomes a `pilotTick` call | M1 (mission hook, already merged), photoreal (none), 7e (sides into `stepCombat`) | textual, a different block from M1's hook |
| `src/sim/scenario.ts` | Task 5: `pilotAssignmentFrom` seeds `initialDecision()` | M1 (merged), 7e (schema) | textual |
| `tests/sim/scenario.test.ts`, `tests/sim/entities.test.ts` | decision literals, the green hits test | everyone | textual |
| `tests/sim/zeroMerge.test.ts` | Task 5: kill floor and comment (ruling R9) | Z3 | textual |
| `tests/e2e/ai-*.spec.ts` | Task 13: headers and poll windows | none | none |
| `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` | §9 `aiHint` note, §15 Plan 7 row | every plan edits §15 | textual |
| `README.md` | one status paragraph | every plan | textual |

**Not touched:** anything under `src/render/` (the photoreal session owns it), `tools/models/**`, `content/**`, `src/sim/mission/**` and `src/sim/weapons/**`. 7c needs no content change. `pursuit-range` and `pursuit-range-veteran` fly the new AI as they are.

**Merge order.** Run `git merge main` before Task 1 and again before Task 13. Resolve by keeping both sides, and re-diff `loop.ts` and `scenario.ts` against `HEAD` before each commit.

## Review Focus

These are the five inputs the spec implies but no signature test exercises. Each has a test in the task that owns the code.

1. **An AI Zero never cuts its own engine.** A float-carburetted engine starves under negative lift (Z2's `engine.negativeGCutout`). The limiter's negative floor is 0 g for that airframe, so no AI command pushes it negative. Measured: 176 ticks of negative lift in the first 12 s at `HEAD`, against 0 in 120 s with the prototype envelope. Task 5.
2. **An AI over high ground measures height above that ground, not above sea level.** Over a 1,000 m plateau at 1,300 m, the floor fires. Over the sea at 1,300 m, it does not. With `terrain` null, sea level is the ground. Task 5.
3. **A diving Zero neither breaks up nor hits the sea.** Its controls fade to 0.2 above 350 mph EAS, so its pull-out is weak. The overspeed guard cuts the throttle at 0.9 × `diveSpeedMps` and pulls up at 0.95 ×. Measured: structure 1.000 and a minimum height of 542 m, from a 60° dive at 150 m/s from 2,500 m. Task 5.
4. **The player's head-on shot survives.** 7c keeps 7b's Break flight at the merge and adds no collision avoidance (ruling R4). The gunnery bot's first-merge kills stay 7/8 (green) and 8/8 (veteran). Task 5 (the `pursuitMerge.test.ts` regression) and Task 12.
5. **A world saved mid-maneuver resumes identically.** A `structuredClone` taken mid split-S flies on bit-identically, and reversing the aircraft array changes nothing. Task 12.

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/sim/ai/pilotTick.ts` | create (Task 2), grows in Tasks 5 and 7 | the whole per-pilot tick: rescore, selection and latch, safety, flight, finish |
| `src/sim/ai/envelope.ts` | create (Task 3) | `airframeEnvelope`, `relativeEnvelope`, `Pairing` |
| `src/sim/ai/liftVector.ts` | create (Task 4) | `controlsForLiftVector`, `pitchCommandForLoadFactor`, `steerToward` |
| `src/sim/ai/safety.ts` | create (Task 5) | limiter, floors, overspeed, `safetyOverride`, `finishControls` |
| `src/sim/ai/maneuverFlight.ts` | create (Task 5), grows in Tasks 7-11 | what each named maneuver flies, including its phase transitions and end condition |
| `src/sim/ai/maneuvers.ts` | create (Task 7), grows in Tasks 8-11 | `maneuverFacts`, `selectManeuver`, latch open, expire and interrupt |
| `src/sim/ai/pilot.ts` | modify | veteran retune (Task 1); `SafetyMode` and `initialDecision` (5); rejoin speed (6); `ManeuverName`, `ManeuverLatch`, repertoire and intent tables (7-11) |
| `src/sim/ai/decision.ts` | modify | `maneuverControls` flies through `maneuverFlight` and `finishControls` (Tasks 5 and 7) |
| `src/sim/loop.ts` | modify (Task 2 only) | calls `pilotTick` |
| `src/sim/scenario.ts` | modify (Task 5) | `pilotAssignmentFrom` seeds `initialDecision()` |
| `tools/ai/replica.ts` | create (Task 1) | frame-path replica harness |
| `tools/ai/lethality.ts` | create (Task 1) | 128-run re-measurement script, too slow for the suite |
| `tests/render/aiLethality.test.ts` | create (Task 1) | spec §3.1's three lethality tests |
| `tests/render/aiSafety.test.ts` | create (Task 5) | safety soak, Zero lift, Zero dive |
| `tests/render/aiReengage.test.ts` | create (Task 6), extended in Task 11 | the re-engage acceptance test |
| `tests/sim/ai/pilotTick.test.ts`, `envelope.test.ts`, `liftVector.test.ts`, `safety.test.ts`, `maneuvers.test.ts` | create | unit tests per file |
| `tests/sim/ai/maneuverWorlds.ts` | create (Task 8) | canned-geometry helpers (not a test file) |
| `tests/sim/ai/pursueManeuvers.test.ts`, `attackRun.test.ts`, `breakManeuvers.test.ts`, `immelmann.test.ts`, `determinism.test.ts` | create | signature and determinism tests |
| `tests/e2e/ai-maneuver.spec.ts`, `ai-pursuit.spec.ts`, `ai-pursuit-difficulty.spec.ts` | modify (Task 13) | headers and poll windows |

## Measured before writing this plan (2026-09-25, node v22.22.1, this worktree at `ac7f4f8`)

Every number below came from a headless probe through the production frame path (`initialFrameStateFor` → `nextFrameState(f, 1/60, keys)`, default assists, no terrain), unless it says otherwise.

The prototypes lived in `.superpowers/7c-probe/aitick.ts`. That file is a copy of `loop.ts`'s pilot block, with each 7c mechanism behind a switch, and it injects the pursuer's controls with its `pilot` set to null. With every switch off it reproduced `HEAD` exactly: the same range at 120 s (4,548 m), and the same pursuer structure. These numbers are claims to re-check, not premises. The tasks re-measure each one through committed tests.

**The re-engage defect (gunnery handoff open item 1) reproduces, and its cause is four things, not one.** With a passive player on `pursuit-range`, both skills break through the head-on pass and do not fire. The pursuer then pulls round the reversal with the velocity controller, which pushes negative g (§1.4 of the spec); it loses about 1,200 m and 8 G of structure margin. Once it has an energy deficit, 7b's scorer picks Extend. Extend's rejoin flies toward the threat on a climb at `throttle = 0.65 + (desired − current) × 0.012`, with `desired = current`, so it decays to 84 m/s. At `HEAD`, over 16 runs (2 skills × `clean`/`both` × 4 noise cursors), the pursuer fired 0 rounds after the merge, and at 120 s the range was 3.5-4.6 km (4.4 km in the `clean` runs, as the handoff says). Ablations, each over the same 16 runs:

| Change (cumulative where marked +) | Post-merge shots within 120 s | Why |
| --- | --- | --- |
| G limiter alone (0.9 × gLimit, −1 g floor) | 0 of 16; 12 of 16 dove into the sea at dive speed | the velocity controller cannot recover from a near-vertical dive |
| + lift-vector steering beyond 60° off the nose | 1 of 16 | turns round without the dive, but rejoins and pursues too slowly |
| + full-power rejoin (target speed + 30 m/s) | 5 of 16 | still closes at 25 m/s: pursuit's throttle law holds about 140 m/s |
| + full power in pursuit beyond gun range (550 m) | **16 of 16**, first post-merge shot at 77-120 s | |

**The configuration this plan builds (config "E") measures:**
- G limit at 0.9 × `gLimit`.
- A negative-g floor at −0.9 × `gLimit`, or 0 g when `engine.negativeGCutout` is set.
- Lift-vector steering for Pursue and Extend beyond 60° off the nose. Break stays 7b's velocity-controller flight.
- A ground floor at 300 m: it acts below 400 m, or when the aircraft would reach 400 m within 4 s.
- Overspeed: the throttle is cut at 0.9 × `diveSpeedMps`, and the pilot pulls up at 0.95 × when descending.
- Full-power rejoin and full-power pursuit beyond gun range.
- No collision avoidance.

| Check | `HEAD` | Config E |
| --- | --- | --- |
| Re-engage, `pursuit-range` (green): first post-merge shot, s (clean / both, 4 cursors each) | never | 88.9-110.0 / 68.8-83.9 |
| Re-engage, `pursuit-range-veteran` | never | 108.0-117.0 / 70.8-75.9 |
| Re-engage, `zero-merge` fixture (AI Zero) | never | 104.9-118.9 / 75.8-90.9 |
| The passive player after re-engagement | alive | killed in all 24 runs (12 hits, 8-30 for the Zero's mixed battery) |
| Gunnery bot's first-merge kills (`pursuitMerge.test.ts` method), green / veteran / AI Zero | 7/8, 8/8, 8/8 | **7/8, 8/8, 2/8** |
| AI Zero ticks with negative lift (engine cut), passive player | 176 in the first 12 s | 0 in 120 s (green and veteran) |
| Lethality, tail-chase fixture, 16 runs at the retuned 0.01 | 0 killed, mean 0.06 hits | 0 killed, mean 0.13 hits |
| Point-blank crossing ticks, fixture, per loadout | 1153 / 1202 / 1147 / 1193-1194 | unchanged |
| 7d bar (fixture, scripted evasion), time behind, green / veteran | 18-19 s / 19-20 s | 18-19 s / 19-20 s |
| Safety soak (fixture, 120 s, evasion, 2 skills × 4 loadouts): pursuer structure | destroyed by its own overload at ticks 2135-2695 | 1.000 in all 8 |
| Safety soak: peak `loadFactorG` | 9.93-10.79 | 7.29-7.32 green, 6.84-6.85 veteran (limit 7.5) |
| Safety soak: lowest pursuer altitude | −2,842 m (followed the player through the sea) | 353 m |
| Merge distance, passive player | 11-22 m | 11-26 m (ruling R4: unchanged by design) |

**Why the head-on pass keeps 7b's flight (ruling R4).** Three prototype variants each cost the player the first-merge kill that Mark flew and liked on 2026-09-25 (gunnery handoff item 3):

| Variant | Green / veteran / Zero first-merge kills | Merge distance |
| --- | --- | --- |
| Break flown by the lift-vector controller | 0/8, 0/8, 1/8 | 44-69 m |
| Collision avoidance, closest approach within 2 s and 100 m | 0/8, 0/8, 0/8 | 97-114 m |
| Collision avoidance, within 1 s and 60 m | 5/8, 6/8, 1/8 | 15-42 m |
| −1 g negative floor on the F6F (instead of symmetric) | 3/8, 5/8, 2/8 | 15-22 m |

`ai-maneuver.spec.ts` gates the closest range at above 50 m. That gate can only go green at the price of the merge kill, so it is Open for Mark, item 1.

**Maneuver prototypes (`controlsForLiftVector` with a latched loop center, R = V² / (g(n − 1)), n = 0.9 × gLimit):**

| Maneuver | Airframe, entry | Heading change | Altitude change | Exit / minimum speed | Peak G |
| --- | --- | --- | --- | --- | --- |
| Immelmann | F6F, 140 m/s | 174° | +552 m | 76 m/s (1.1 × stall = 48.2) | 6.39 |
| Immelmann | F6F, 125 m/s | 165° | +470 m | 62 m/s | 6.20 |
| Immelmann | Zero, 110 m/s | 152° | +429 m | 62 m/s (1.1 × stall = 38.4) | 6.01 |
| split-S | F6F, 110 m/s | 165° | −483 m | 111 m/s | 6.39 |
| split-S | Zero, 100 m/s | 175° | −474 m | 117 m/s | 6.31 |

**Envelope figures (Task 3's expected values), at the scenario fuel of 400 kg:**

| | F6F | A6M2 |
| --- | --- | --- |
| mass (`massKg`) | 4,590 kg | 2,080 kg |
| wing loading | 1,450.6131 N/m² (1,780.4 at `testMassKg`, as spec §3.3 quotes) | 908.9943 N/m² |
| power loading | 24.8431 W/N | 23.3692 W/N |
| corner speed | 119.9786 m/s | 92.2573 m/s |
| `turnAdvantage` against the other | 0.6266, `boom-and-zoom` | 1.5958, `turnfight` |

**Other facts the tasks rely on:**
- At `HEAD`, the tail-chase fixture's first pursuer hit comes at tick 370 for green and tick 9912 for veteran at 0.01. The shipped 0.02 hits at tick 525. With config E, veteran at 0.01 does not hit within 15,000 ticks. This is why Task 1 moves the "actually hits" test to green.
- The frame path reproduces spec §1.1 exactly: with the `both` loadout and cursor 0, the shipped veteran destroys the player at tick 517.
- `ai-pursuit-difficulty.spec.ts` on the head-on start: the Tier 1 replica runs the same keys from t = 0 and freezes the world at the player's sea impact, 25.7-26.5 s, as `frame.ts`'s hold does. It is never behind, at `HEAD` and with config E. The reference GPU recorded it green on 2026-09-25. The two tiers cannot agree, because the browser runs the airborne world during the terrain load before any key is pressed. See Open for Mark, item 3.
- Baseline digests at `ac7f4f8` (probe in Task 1 Step 1; 1,800 ticks, no terrain):

| Scenario | sha256 |
| --- | --- |
| deck-quals | `ee4e6dafd11528da2c6e6b2e63f7abe5140b61c56d2093b10e566d3e9fef28a2` |
| free-flight | `ba1247dd2873a3a139437754cc533fc12ead5ee1d14e0fd4979f8f402e3be3bd` |
| gunnery-range | `c2eea988aad67e7674b3ce7dba6b3e4b7906fc56c91a079bc53110f36bd26da9` |
| strike-range | `ff32289f8fba3af6ebd6bfb8a26d5e56247c259f34be9410b1471b1972602304` |
| pursuit-range | `a8fac9b23f9d98dca90541513e143e3536194a4333eb9d090811f4854e23f3e0` |
| pursuit-range-veteran | `8558ac0831805d3036ef3f718e00fdda732fa3016c1307f6f1a09f9e81505f3b` |
| fixture pursuit-tail-chase | `6d1c7ef8d2cdf7d45825a7b78df4ce10edbd8eb4031222c3e391e25193e8b7c1` |
| fixture zero-merge | `c478f2903da7c855d9e2e8cfa4fcc77ccbed1504020f0b7526595c874b4ba912` |

## Rulings this plan makes

Each ruling is a deviation from the spec or an addition to it, with the evidence. Record each in the SDD ledger (`.superpowers/sdd/2026-09-25-ai-7c/progress.md`), and copy them into the handoff.

- **R1. The §3.1 instruments read `tests/fixtures/scenarios/pursuit-tail-chase.json`.** This is Mark's execution note in the spec's Decisions section. The shipped `pursuit-range` is now a green head-on merge.
- **R2. The "actually hits" test (`scenario.test.ts`) moves to green by an in-test skill override, not by editing the fixture.** The fixture is frozen, and its other 7a/7b tests read `VETERAN_SKILL.reactionS`.
- **R3. Pursue and Extend steer through `steerToward`, which hands over to `controlsForLiftVector` beyond 60° off the nose.** With the G limiter and no lift-vector steering, 12 of 16 runs dove into the sea (table above). The spec says the velocity controller "stays as it is and keeps its tests". It does: `steerToward` returns it unchanged within 60°.
- **R4. Break keeps 7b's velocity-controller flight, and there is no collision avoidance.** Both variants cost the player's first-merge kill (table above). `ai-maneuver.spec.ts` stays RED on the head-on start. Its point-blank claim is proven on the fixture at Tier 1 (Task 1, item 2). This is Open for Mark, item 1.
- **R5. The negative-g floor is symmetric, at −0.9 × `gLimit`, because the sim's overload model is symmetric** (`damageFromStructuralOverload` uses the magnitude of the load). It is 0 g for an airframe with `engine.negativeGCutout`. A −1 g floor cost the merge kill (table above).
- **R6. The ground floor acts at `FLOOR_M + FLOOR_BUFFER_M` (400 m), or when the aircraft would reach 400 m within `FLOOR_TIME_S` = 4 s.** It asserts that the aircraft never goes below `FLOOR_M` = 300 m. The spec's 8 s is a tuning value. Measured on the green 7d bar: at 8 s, 0 of 4 loadouts got behind; at 6 s, 1 of 2; at 5 s, 3 of 4; at 4 s, 4 of 4. Without the buffer, the pursuer dipped to 256-281 m.
- **R7. The spec adds an overspeed guard to its §3.2 list.** Every probe dive at full throttle lost structure to overspeed: the F6F kept 0.834, and the Zero 0.000 at 150-160 m/s entries. With the guard, all kept 1.000.
- **R8. The rejoin and the pursuit fly at full power.** Extend's rejoin keeps its direction and asks for `max(own speed, target speed + 30 m/s)`. Lead pursuit asks for throttle 1 beyond `AI_GUN_RANGE_M`. Both are needed (ablation table). Neither changes `leadPursuitVelocity`'s intercept math, 7b's weights or the gun gate, all of which the spec §9 forbids changing.
- **R9. `zeroMerge.test.ts`'s kill floor drops from ≥ 4 to ≥ 1.** Its 8/8 was measured against an AI Zero that cut its own engine for 2.9 s of the approach (176 ticks). With the engine kept running, the bot kills it at the merge in 2 of 8 runs. The test is a fixture, and nothing ships it. Open for Mark, item 2.
- **R10. The envelope-gating test uses the real A6M2** (Z2 landed it), not the spec's synthetic 1.6×-wing-area Hellcat. The measured wing-loading ratio is 1.5958.
- **R11. Safety overrides never change `decision.maneuver` (the intent).** They record `decision.safety` (`'none' | 'recover' | 'overspeed'`) and clear any latch. The existing "MIN_ENGAGEMENT_RANGE_M forces Extend" test keeps its meaning.
- **R12. Lag pursuit latches.** Its end condition in the spec, closure below 15 m/s, is narrower than its entry (closure above 40 m/s), which needs a latch. The split-S and the scissors also require the threat to be behind the 3/9 line. The spec says "astern", and without that condition the head-on merge, where the player's nose is on the pursuer, would trigger a split-S.
- **R13. The re-engage test allows 150 s** (`REENGAGE_BUDGET_S`) for the two shipped scenarios, and 150 s for the AI Zero fixture. The slowest measured runs are 117.0 s (shipped) and 118.9 s (Zero). Task 11 re-measures after the Immelmann.

## Open for Mark (the plan's default is in bold)

**Answered 2026-09-25: Mark accepted all four defaults.** The AI does not dodge the head-on pass: the merge stays, and `ai-maneuver.spec.ts` stays red by design with its header rewritten. The harder-to-kill AI Zero at the merge is accepted, and `zeroMerge.test.ts`'s kill floor drops from 4 to 1. `ai-pursuit-difficulty` is run and its result recorded; if it is red, its header names the Tier 1 fixture replica as the record for the 7d bar, and the spec is not loosened. Air Combat's second pass ships as measured. The questions are kept below as the record of what was decided and why.

1. **Should the AI dodge the head-on pass?** Choosing avoidance turns `ai-maneuver.spec.ts` green, with a closest range of 97-114 m, but the player's first-merge kills fall from 7/8 to 0/8. **Default: no. Keep the merge Mark flew. `ai-maneuver` stays RED, with its header rewritten to say why.**
2. **The AI Zero stops cutting its own engine, so it is harder to kill at the merge (2/8 against 8/8).** **Default: accept it, and lower `zeroMerge.test.ts`'s floor to ≥ 1 (R9).**
3. **`ai-pursuit-difficulty.spec.ts` on the head-on start.** Tier 1 cannot reproduce its recorded green result, and its claim (a scripted break gets behind a tail-chasing green pursuer) belongs to the old tail chase. **Default: run it in Task 13 and record the result. If it is red, rewrite its header to name the Tier 1 fixture replica (`aiLethality.test.ts`, item 3) as the 7d bar of record. Do not loosen it.**
4. **Air Combat's second pass.** A passive player is now shot down about 70-118 s in, in every measured run. That is the "second fight" the gunnery handoff asked for. Say so if it is too soon or too sure. **Default: ship as measured.**

## Out of scope (spec §2, §4-§6, §9)

- Sides, target selection, friendly-fire hold and side-aware credit (7e).
- Id-seeded noise cursors (7e).
- `spawnHeldGroup(world, groupId)` from M1 is the insertion path for 7e's spawn-at-tick-3000 test. 7c's pilot state needs nothing from it, because every 7c field is set at a rescore or at latch entry, never from the world clock at creation.
- Formation (7f) and landing (7g).
- AI gunnery honesty: drop-compensated and relative-velocity lead. The spec's Decisions put it in a separate slice after the Zero lands.
- Barrel-roll defense, and clouds hiding the AI's view (spec §9).

---

### Task 1: The veteran retune and the lethality instrument

**Files:**
- Create: `tools/ai/replica.ts`, `tools/ai/lethality.ts`, `tests/render/aiLethality.test.ts`
- Modify: `src/sim/ai/pilot.ts` (`VETERAN_SKILL.controlNoise` and its comment)
- Modify: `tests/sim/scenario.test.ts` ("the pursuit pilot actually hits the target it is gated on")

**Interfaces:**
- Produces, from `tools/ai/replica.ts`:
  - `LOADOUTS: readonly Loadout[]` and `CURSORS_4: readonly number[]`.
  - `KeyScript = (tS: number) => ReadonlySet<string>`, `passive: KeyScript` and `EVASION: KeyScript`.
  - `diagOf(a): AircraftDiag`, the `__ww2.aircraft()` shape.
  - `replicaWorld(bundle, loadout, cursor, skill?): World<undefined>`.
  - `flyFrames(world, keys, maxS, onFrame: (f: FrameState, frame: number) => boolean): FrameState`.
  - `aircraftOf(f, id)`, `rangeBetween(f, a, b)`, `playerDestroyed(f)`.
  - `passiveClose(world, pursuerId, maxS?): PassiveCloseRun`, where `PassiveCloseRun = { outcome: 'killed' | 'point-blank' | 'timeout'; tick: number; pursuerHits: number }`.

- [x] **Step 1: Merge `main` and record the baseline digests.** Run `git merge main`. If it conflicts, stop and report. Then write `.superpowers/7c/hash.ts`:

```ts
import { createHash } from 'node:crypto'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { advance } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { loadFixtureScenarioBundle } from '../../tests/fixtures/scenarios.js'

/** Full digest: M1's method ({tick, aircraft, ships, combat, accumulatorSeconds} after
 *  1,800 ticks, no terrain). Motion digest: states and combat only, so a new
 *  plain-data pilot field does not move it. */
const ids = ['deck-quals', 'free-flight', 'gunnery-range', 'strike-range', 'pursuit-range', 'pursuit-range-veteran', 'fx:pursuit-tail-chase', 'fx:zero-merge']
for (const id of ids) {
  let w = worldFromScenario(id.startsWith('fx:') ? loadFixtureScenarioBundle(id.slice(3)) : loadScenarioBundle(id), null)
  for (let i = 0; i < 1800; i++) w = advance(w, DT).world
  const full = createHash('sha256').update(JSON.stringify({ tick: w.tick, aircraft: w.aircraft, ships: w.ships, combat: w.combat, accumulatorSeconds: w.accumulatorSeconds })).digest('hex')
  const motion = createHash('sha256').update(JSON.stringify({ tick: w.tick, states: w.aircraft.map((a) => [a.id, a.state, a.controls]), combat: w.combat })).digest('hex')
  console.log(id.padEnd(24), full, motion)
}
```

Run `npx tsx .superpowers/7c/hash.ts | tee .superpowers/7c/hash-baseline.txt`. The full digests must match the table under "Measured". If they differ because `main` moved, the new values are the baseline. Record them in the ledger.

- [x] **Step 2: Write the harness.** Create `tools/ai/replica.ts`:

```ts
import { initialFrameStateFor, nextFrameState, type FrameState } from '../../src/render/frame.js'
import { worldFromScenario, type ScenarioBundle } from '../../src/sim/scenario.js'
import type { AircraftEntity, World } from '../../src/sim/loop.js'
import type { Loadout } from '../../src/sim/weapons/stores.js'
import type { PilotSkill } from '../../src/sim/ai/pilot.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../src/sim/ai/decision.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { length, sub, v3 } from '../../src/sim/math/vec3.js'
// Type-only: tools/ never imports a test module at runtime.
import type { AircraftDiag } from '../../tests/e2e/pursuitGeometry.js'

/**
 * Tier 1 replicas of the Plan 7 Tier 2 specs (7c spec §1.1, §3.1). They drive
 * the production frame path -- `initialFrameStateFor`, then `nextFrameState(f,
 * 1/60, keys)` with default assists -- the path `main.ts` runs, headless.
 * Measured 2026-09-25: this reproduces the reference GPU's red
 * `ai-maneuver.spec.ts` run to the tick (the `both` loadout, player destroyed
 * at tick 517, 386 m). Every Tier 1 world is otherwise built `clean`; the
 * browser flies the title screen's DEFAULT_LOADOUT, `both`.
 */
export const LOADOUTS: readonly Loadout[] = ['clean', 'bombs', 'rockets', 'both']
/** Four noise cursors, the spec §3.1 set. */
export const CURSORS_4: readonly number[] = [0, 7919, 15838, 23757]
export const FRAME_S = 1 / 60

export type KeyScript = (tS: number) => ReadonlySet<string>
const NO_KEYS: ReadonlySet<string> = new Set()
export const passive: KeyScript = () => NO_KEYS

/** `bundle`'s world with the player's `loadout`, every pilot's noise cursor
 *  set to `cursor`, and every pilot's skill optionally replaced. */
export function replicaWorld(bundle: ScenarioBundle, loadout: Loadout, cursor: number, skill?: PilotSkill): World<undefined> {
  const w = worldFromScenario(bundle, null, loadout)
  return {
    ...w,
    aircraft: w.aircraft.map((a) => a.pilot == null ? a : {
      ...a,
      pilot: { ...a.pilot, skill: skill ?? a.pilot.skill, decision: { ...a.pilot.decision, noiseCursor: cursor } },
    }),
  }
}

export const aircraftOf = (f: FrameState, id: string): AircraftEntity<undefined> =>
  f.world.aircraft.find((a) => a.id === id)!
export const rangeBetween = (f: FrameState, a: string, b: string): number =>
  length(sub(aircraftOf(f, a).state.position, aircraftOf(f, b).state.position))
export const playerDestroyed = (f: FrameState): boolean =>
  f.world.combat.aircraft[f.world.player]!.damage.destroyedAt !== null

/** Frames of 1/60 s. `keys` is sampled at the END of each frame's time
 *  (frame i covers t = i/60), matching the probes this plan was measured
 *  with. `onFrame` returns true to stop. */
export function flyFrames(
  world: World<undefined>, keys: KeyScript, maxS: number,
  onFrame: (f: FrameState, frame: number) => boolean,
): FrameState {
  let f = initialFrameStateFor(world)
  const frames = Math.round(maxS / FRAME_S)
  for (let i = 1; i <= frames; i++) {
    f = nextFrameState(f, FRAME_S, keys(i * FRAME_S))
    if (onFrame(f, i)) break
  }
  return f
}

export type PassiveCloseRun = {
  readonly outcome: 'killed' | 'point-blank' | 'timeout'
  readonly tick: number
  readonly pursuerHits: number
}

/** The scripted evasion `ai-pursuit-difficulty.spec.ts` flies: roll left and
 *  pull for 4 s, reverse for 3 s, then hands off. */
export const EVASION: KeyScript = (t) =>
  t <= 4 ? new Set(['ArrowLeft', 'ArrowDown']) : t <= 7 ? new Set(['ArrowRight', 'ArrowDown']) : NO_KEYS

/** `window.__ww2.aircraft()`'s shape, with `headingRad` built the way
 *  `main.ts` builds it: `atan2(forward.x, -forward.z)`. */
export function diagOf(a: AircraftEntity<undefined>): AircraftDiag {
  const f = qRotate(a.state.attitude, v3(1, 0, 0))
  return { id: a.id, x: a.state.position.x, y: a.state.position.y, z: a.state.position.z, headingRad: Math.atan2(f.x, -f.z) }
}

/** Spec §1.2's instrument: a passive player, flown until the pursuer is inside
 *  MIN_ENGAGEMENT_RANGE_M, the player dies, or `maxS` runs out. */
export function passiveClose(world: World<undefined>, pursuerId: string, maxS = 60): PassiveCloseRun {
  const m: { outcome: PassiveCloseRun['outcome'] } = { outcome: 'timeout' }
  const f = flyFrames(world, passive, maxS, (fr) => {
    if (playerDestroyed(fr)) { m.outcome = 'killed'; return true }
    if (rangeBetween(fr, fr.world.player, pursuerId) < MIN_ENGAGEMENT_RANGE_M) { m.outcome = 'point-blank'; return true }
    return false
  })
  return { outcome: m.outcome, tick: f.world.tick, pursuerHits: f.world.combat.aircraft[pursuerId]!.hits }
}
```

- [x] **Step 3: Write the failing lethality tests.** Create `tests/render/aiLethality.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import {
  CURSORS_4, EVASION, LOADOUTS, aircraftOf, diagOf, flyFrames, passive, passiveClose, playerDestroyed, rangeBetween, replicaWorld,
} from '../../tools/ai/replica.js'
import { GREEN_SKILL } from '../../src/sim/ai/pilot.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../src/sim/ai/decision.js'
import { isBehind } from '../e2e/pursuitGeometry.js'

/**
 * 7c spec §3.1: the lethality instrument, and the regression gate for every
 * later maneuver change. Reads the frozen tail-chase fixture (ruling R1): the
 * shipped `pursuit-range` became a green head-on merge on 2026-09-25.
 */
const tailChase = loadFixtureScenarioBundle('pursuit-tail-chase')
const PURSUER = 'pursuer-1'

describe('a passive player survives to point-blank range (7c spec §3.1, item 1)', () => {
  // Measured 2026-09-25, VETERAN_SKILL.controlNoise 0.01: 16 of 16 reach
  // point-blank, at ticks 1153 (clean), 1202 (bombs), 1147 (rockets) and
  // 1193-1194 (both). 1 hit in all 16 runs (mean 0.06). At the shipped 0.02,
  // `both` with cursor 0 is destroyed at tick 517.
  it.each(LOADOUTS)('%s: alive at the first tick inside MIN_ENGAGEMENT_RANGE_M, for four noise cursors', (loadout) => {
    for (const cursor of CURSORS_4) {
      const run = passiveClose(replicaWorld(tailChase, loadout, cursor), PURSUER)
      expect(run.outcome, `${loadout}, cursor ${cursor}: tick ${run.tick}, ${run.pursuerHits} hits`).toBe('point-blank')
    }
  })
})

describe('the point-blank break-off, replicating ai-maneuver.spec.ts on the fixture (item 2)', () => {
  // Spec §3.1, measured with the retune: crossings at ticks 1147-1202,
  // closest 78.0-84.3 m, range reopening 2.6-2.8 s after the crossing.
  it.each(LOADOUTS)('%s: closes under 120 m within 30 s alive, stays above 50 m, and opens within 6 s', (loadout) => {
    const m = { crossing: null as number | null, crossingRange: 0, closest: Infinity, reopened: null as number | null }
    flyFrames(replicaWorld(tailChase, loadout, 0), passive, 36, (f, i) => {
      if (playerDestroyed(f)) throw new Error(`${loadout}: player destroyed at tick ${f.world.tick}`)
      const r = rangeBetween(f, f.world.player, PURSUER)
      if (m.crossing === null) {
        if (r < MIN_ENGAGEMENT_RANGE_M) { m.crossing = i; m.crossingRange = r; m.closest = r }
        return false
      }
      m.closest = Math.min(m.closest, r)
      if (m.reopened === null && r > m.crossingRange) m.reopened = i
      return i - m.crossing >= 6 * 60
    })
    expect(m.crossing, `${loadout} never closed`).not.toBeNull()
    expect(m.crossing!).toBeLessThanOrEqual(30 * 60)
    expect(m.closest).toBeGreaterThan(50)
    expect(m.reopened, `${loadout} never reopened`).not.toBeNull()
    expect(m.reopened! - m.crossing!).toBeLessThanOrEqual(6 * 60)
  })
})

describe('the 7d bar: a scripted evasion gets behind a green pursuer (item 3)', () => {
  // Measured 2026-09-25 at HEAD and with the prototype envelope: behind at
  // 18-19 s in all four loadouts, pursuer structure 1.000 at that moment.
  // Stronger than the Tier 2 original, which cannot tell a live pursuer
  // from a wreck frozen in the air.
  it.each(LOADOUTS)('%s: behind within 40 s, the player alive and the pursuer alive', (loadout) => {
    const m = { behindS: null as number | null, structure: 0, destroyed: true }
    flyFrames(replicaWorld(tailChase, loadout, 0, GREEN_SKILL), EVASION, 40, (f, i) => {
      if (playerDestroyed(f)) throw new Error(`${loadout}: player destroyed at tick ${f.world.tick}`)
      if (i < 7 * 60 || i % 60 !== 0) return false
      if (!isBehind(diagOf(aircraftOf(f, f.world.player)), diagOf(aircraftOf(f, PURSUER)), 400, 45)) return false
      const rec = f.world.combat.aircraft[PURSUER]!
      m.behindS = i / 60
      m.structure = rec.damage.structure
      m.destroyed = rec.damage.destroyedAt !== null
      return true
    })
    expect(m.behindS, `${loadout}: never behind`).not.toBeNull()
    expect(m.destroyed).toBe(false)
    expect(m.structure).toBeGreaterThan(0)
  })
})
```

- [x] **Step 4: Run the tests and check that only item 1 fails, and only for `both` at cursor 0.**

Run: `npx vitest run tests/render/aiLethality.test.ts --maxWorkers=2`
Expected: FAIL. Item 1 `both` reports `cursor 0: tick 517`. `clean`, `bombs` and `rockets` pass item 1, and items 2 and 3 pass for every loadout.

If item 2 or item 3 fails at `HEAD`, stop and report it: the spec measured them green.

- [x] **Step 5: Retune.** In `src/sim/ai/pilot.ts`, replace `VETERAN_SKILL`'s `controlNoise` line and its comment block with:

```ts
  // 7c (Mark's ruling 2026-09-25, "tone the veteran down"): 0.02 -> 0.01.
  // Measured 2026-09-25 through the production frame path against a passive
  // player on the tail-chase fixture (tests/render/aiLethality.test.ts, and
  // tools/ai/lethality.ts for the 128-run version). At 0.02 the veteran
  // killed the passive player before point-blank range in 4 of 128 runs,
  // including the reference GPU's red ai-maneuver run (`both` loadout, tick
  // 517). At 0.01 it killed none, with a mean of 0.04 hits. The lever is
  // this one because the AI's aim ignores gravity drop: a perfect aim streams
  // 2.2 m under the target, so a SHAKIER hand is deadlier (0.04 -> 11/32
  // kills, 0.08 -> 22/32). Green (0.15) is therefore the deadlier pilot
  // against a straight-flying target. That inversion is the gunnery-honesty
  // slice's to fix (spec Decisions, item 2). Still less than half of green's
  // noise, as noise.test.ts and pilot.test.ts require.
  controlNoise: 0.01,
```

- [x] **Step 6: Move the hits test to green (R2).** In `tests/sim/scenario.test.ts`, "the pursuit pilot actually hits the target it is gated on, not just fires blind", replace `let world = worldFromScenario(pursuit, null)` with:

```ts
    // 7c (2026-09-25): flown by a GREEN pursuer, by override, because the
    // veteran retune (controlNoise 0.01) puts the veteran's first hit at tick
    // 9912 against this 12,000 budget: the rounds pass low, so a steadier
    // hand hits less (7c spec §1.2). The claim here, that the gate and the
    // steering agree so rounds connect, does not depend on skill. Measured
    // 2026-09-25: green's first shot is at tick 181 and its first hit at 370.
    // The fixture stays frozen (it pins veteran for the other 7a/7b tests).
    const start = worldFromScenario(pursuit, null)
    let world = { ...start, aircraft: start.aircraft.map((a) => a.pilot == null ? a : { ...a, pilot: { ...a.pilot, skill: GREEN_SKILL } }) }
```

Leave the rest of the comment and the 12,000 budget as they are. Before the edit, the comment's opening already says why the budget stays loose.

- [x] **Step 7: Write the 128-run script.** Create `tools/ai/lethality.ts`:

```ts
import { readFileSync } from 'node:fs'
import { parseScenario } from '../../src/sim/scenario.js'
import { VETERAN_SKILL } from '../../src/sim/ai/pilot.js'
import { bundleForScenario } from '../content/load.js'
import { LOADOUTS, passiveClose, replicaWorld } from './replica.js'

/**
 * The 128-run version of tests/render/aiLethality.test.ts item 1 (7c spec
 * §3.1): 4 loadouts x 32 noise cursors (k * 7919, k = 0..31), a passive
 * player on the frozen tail-chase fixture, each run ending at point-blank
 * range or the player's death. About 36 s, too slow for the suite.
 *
 *   npx tsx tools/ai/lethality.ts            # VETERAN_SKILL as shipped
 *   npx tsx tools/ai/lethality.ts 0.02       # override controlNoise
 */
const path = new URL('../../tests/fixtures/scenarios/pursuit-tail-chase.json', import.meta.url)
const bundle = bundleForScenario(parseScenario(JSON.parse(readFileSync(path, 'utf8')) as unknown))
const noise = process.argv[2] === undefined ? VETERAN_SKILL.controlNoise : Number(process.argv[2])
const skill = { ...VETERAN_SKILL, controlNoise: noise }
let killed = 0, runs = 0, hits = 0, maxHits = 0
for (const loadout of LOADOUTS) {
  for (let k = 0; k < 32; k++) {
    const r = passiveClose(replicaWorld(bundle, loadout, k * 7919, skill), 'pursuer-1')
    runs++; hits += r.pursuerHits; maxHits = Math.max(maxHits, r.pursuerHits)
    if (r.outcome === 'killed') killed++
  }
}
console.log(`controlNoise ${noise}: killed ${killed}/${runs}, mean hits ${(hits / runs).toFixed(2)}, max ${maxHits}`)
```

Run it twice and record both lines in the ledger and in the constant's comment if they differ from the spec: `npx tsx tools/ai/lethality.ts` (the spec measured 0/128, mean 0.04, max 1) and `npx tsx tools/ai/lethality.ts 0.02` (the spec measured 4/128). The spec's cursor set is not recorded, so small differences are expected. A retune figure above 0 kills is not, so stop and report it.

- [x] **Step 8: Run the tests and check that they pass.**

Run: `npx vitest run tests/render/aiLethality.test.ts tests/sim/scenario.test.ts tests/sim/ai tests/sim/entities.test.ts tests/sim/pursuitMerge.test.ts tests/render/pursuitGeometry.test.ts --maxWorkers=2`
Expected: PASS. `pursuitMerge.test.ts` still asserts at least 6 veteran kills out of 8, and the veteran now flies at 0.01. Record the count it logs.

- [x] **Step 9: Digests.** Run `npx tsx .superpowers/7c/hash.ts`. The four no-pilot scenarios and the green `pursuit-range` must match the baseline. `pursuit-range-veteran` and the tail-chase fixture must differ (their veteran changed). `zero-merge` (green) must match. Save the output as `.superpowers/7c/hash-task1.txt`.

- [x] **Step 10: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add tools/ai/replica.ts tools/ai/lethality.ts tests/render/aiLethality.test.ts src/sim/ai/pilot.ts tests/sim/scenario.test.ts
git commit -m "7c: veteran controlNoise 0.02 -> 0.01, and the frame-path lethality instrument (7c Task 1)"
```

---

### Task 2: `pilotTick`, the per-pilot block as one pure function

**Files:**
- Create: `src/sim/ai/pilotTick.ts`, `tests/sim/ai/pilotTick.test.ts`
- Modify: `src/sim/loop.ts` (imports at lines 18-19; the "Every AI reads this SAME start-of-tick array" block, about lines 834-869)

**Interfaces:**
- Produces: `type PilotTickContext = { readonly nowS: number; readonly terrain: TerrainField | null; readonly decks: readonly Deck[]; readonly wind: Vec3 | null; readonly combat: CombatState }`
- Produces: `pilotTick<M>(a: AircraftEntity<M>, snapshot: readonly AircraftEntity<M>[], ctx: PilotTickContext): AircraftEntity<M>`. It returns `a` itself, the same object, when there is nothing to fly.

- [x] **Step 1: Write the failing tests.** Create `tests/sim/ai/pilotTick.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pilotTick, type PilotTickContext } from '../../../src/sim/ai/pilotTick.js'
import { deriveFacts, decideManeuver, maneuverControls } from '../../../src/sim/ai/decision.js'
import { GREEN_SKILL } from '../../../src/sim/ai/pilot.js'
import { createWorldOf, type AircraftEntity } from '../../../src/sim/loop.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3, ZERO } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const entity = (id: string, x: number, pilot?: AircraftEntity<undefined>['pilot']): AircraftEntity<undefined> => {
  const state = createState({ position: v3(x, 2000, 0), velocity: v3(120, 0, 0) })
  return { id, spec: f6f, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false, pilot }
}
const decision = { maneuver: 'pursue' as const, nextRescoreS: 0, observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0 }
const pilotEntity = entity('p', 0, { target: 't', skill: GREEN_SKILL, decision })
const target = entity('t', 400)
const world = createWorldOf({ aircraft: [pilotEntity, target], player: 't' })
const ctx = (nowS: number): PilotTickContext => ({ nowS, terrain: null, decks: [], wind: null, combat: world.combat })

describe('pilotTick', () => {
  it('returns the same object for an aircraft with no pilot', () => {
    expect(pilotTick(target, world.aircraft, ctx(1 / 60))).toBe(target)
  })

  it('returns the same object when the target is missing from the snapshot', () => {
    expect(pilotTick(pilotEntity, [pilotEntity], ctx(1 / 60))).toBe(pilotEntity)
  })

  it('returns the same object for a destroyed or impacted pilot', () => {
    const dead = { ...world.combat, aircraft: { ...world.combat.aircraft, p: { ...world.combat.aircraft['p']!, damage: { ...world.combat.aircraft['p']!.damage, destroyedAt: 3 } } } }
    expect(pilotTick(pilotEntity, world.aircraft, { ...ctx(1 / 60), combat: dead })).toBe(pilotEntity)
    const impacted = { ...pilotEntity, impact: { tick: 1, position: ZERO, velocity: ZERO } as unknown as AircraftEntity<undefined>['impact'] }
    expect(pilotTick(impacted, world.aircraft, ctx(1 / 60))).toBe(impacted)
  })

  it('on a rescore tick, decides from live facts, snapshots the target, and flies maneuverControls', () => {
    const nowS = 1 / 60
    const facts = deriveFacts(pilotEntity, target, 0, pilotEntity.state.fuelKg / f6f.mass.fuelCapacityKg)
    const rescored = {
      ...decision, maneuver: decideManeuver(facts, GREEN_SKILL), nextRescoreS: nowS + GREEN_SKILL.reactionS,
      observedTargetPosition: target.state.position, observedTargetVelocity: target.state.velocity,
    }
    const expected = maneuverControls(pilotEntity, target, rescored, GREEN_SKILL)
    const out = pilotTick(pilotEntity, world.aircraft, ctx(nowS))
    expect(out.controls).toEqual(expected.controls)
    expect(out.pilot!.decision).toEqual(expected.decision)
  })
})
```

Before running, check the `impact` shape: `grep -n "export type Impact" -A6 src/sim/contact.ts src/sim/loop.ts`. If it differs, build a valid `Impact` literal instead of the cast.

- [x] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/pilotTick.test.ts --maxWorkers=2`
Expected: FAIL, because `pilotTick.js` cannot be resolved.

- [x] **Step 3: Implement.** Create `src/sim/ai/pilotTick.ts`:

```ts
import type { AircraftEntity } from '../loop.js'
import type { CombatState } from '../weapons/combat.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import type { Vec3 } from '../math/vec3.js'
import { deriveFacts, decideManeuver, maneuverControls } from './decision.js'

/** What a pilot may read besides the start-of-tick aircraft snapshot. All of
 *  it is the start of the tick too: `combat` is the record `advance` has just
 *  aged, before this tick's `stepCombat`. */
export type PilotTickContext = {
  readonly nowS: number
  readonly terrain: TerrainField | null
  readonly decks: readonly Deck[]
  readonly wind: Vec3 | null
  readonly combat: CombatState
}

/**
 * One AI pilot's whole tick (7c spec §2): moved verbatim out of `advance()`
 * so the later AI plans (7e, 7f, 7g) grow this file instead of `loop.ts`.
 * Pure. Every pilot reads the same `snapshot`, the start-of-tick array, so
 * reversing the entity array cannot let one pilot see another a tick ahead
 * (entities design §3). Returns `a` itself when there is nothing to fly: no
 * pilot, an impacted or destroyed self, or a target missing from the
 * snapshot (`createWorldOf` rejects the last; the guard keeps a hand-edited
 * world finite instead of fabricating a target).
 */
export function pilotTick<M>(
  a: AircraftEntity<M>,
  snapshot: readonly AircraftEntity<M>[],
  ctx: PilotTickContext,
): AircraftEntity<M> {
  const pilot = a.pilot
  if (pilot == null || a.impact !== null) return a
  const record = ctx.combat.aircraft[a.id]!
  if (record.damage.destroyedAt !== null) return a
  const target = snapshot.find((candidate) => candidate.id === pilot.target)
  if (target === undefined) return a
  let decision = pilot.decision
  if (ctx.nowS >= decision.nextRescoreS) {
    const facts = deriveFacts(a, target, 1 - record.damage.structure, a.state.fuelKg / a.spec.mass.fuelCapacityKg)
    decision = {
      ...decision,
      maneuver: decideManeuver(facts, pilot.skill),
      nextRescoreS: ctx.nowS + pilot.skill.reactionS,
      observedTargetPosition: target.state.position,
      observedTargetVelocity: target.state.velocity,
    }
  }
  const { controls, decision: steered } = maneuverControls(a, target, decision, pilot.skill)
  return { ...a, pilot: { ...pilot, decision: steered }, controls }
}
```

In `src/sim/loop.ts`, replace `import { deriveFacts, decideManeuver, maneuverControls } from './ai/decision.js'` with `import { pilotTick, type PilotTickContext } from './ai/pilotTick.js'`. Then replace the block from `const aircraftAtStart = aircraft` through the closing `})` of the `aircraft = aircraftAtStart.map(...)` call with:

```ts
    const aircraftAtStart = aircraft
    const pilotContext: PilotTickContext = { nowS: tick * DT, terrain: world.terrain, decks, wind: world.wind, combat }
    aircraft = aircraftAtStart.map((a) => {
      const record = combat.aircraft[a.id]!
      return stepAircraftEntity(
        pilotTick(a, aircraftAtStart, pilotContext), tick, world.terrain, world.wind, decks, stepper, assist,
        record.damage, record.stores,
      )
    })
```

Keep the three-line comment above it ("Every AI reads this SAME start-of-tick array...") and add one line: `// The per-pilot block is src/sim/ai/pilotTick.ts (7c).`

- [x] **Step 4: Run the tests.**

Run: `npx vitest run tests/sim/ai tests/sim/entities.test.ts tests/sim/scenario.test.ts tests/render/aiLethality.test.ts --maxWorkers=2`
Expected: PASS.

- [x] **Step 5: Bit-identity.** Run `npx tsx .superpowers/7c/hash.ts`. All eight lines, full and motion digests, must equal `.superpowers/7c/hash-task1.txt`. This is a pure move. Any difference is a bug in it: fix the move, never the baseline.

- [x] **Step 6: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai/pilotTick.ts tests/sim/ai/pilotTick.test.ts src/sim/loop.ts
git commit -m "7c: the per-pilot block becomes pilotTick, bit-identical (7c Task 2)"
```

---

### Task 3: The airframe envelope

**Files:**
- Create: `src/sim/ai/envelope.ts`, `tests/sim/ai/envelope.test.ts`

**Interfaces:**
- Produces: `type Pairing = 'turnfight' | 'boom-and-zoom' | 'neutral'`
- Produces: `type AirframeEnvelope = { wingLoadingNPerM2, powerLoadingWPerN, cornerSpeedMps, diveSpeedMps, gLimit, maxRollRateRadPerS, maxPitchRateRadPerS }`. Every field is a readonly number.
- Produces: `airframeEnvelope(spec: AircraftSpec, state: AircraftState): AirframeEnvelope`
- Produces: `type RelativeEnvelope = { turnAdvantage, climbAdvantage, diveAdvantage: number; pairing: Pairing }`
- Produces: `relativeEnvelope(self: AirframeEnvelope, target: AirframeEnvelope): RelativeEnvelope`
- Produces: `TURNFIGHT_THRESHOLD = 1.1`, `BOOM_AND_ZOOM_THRESHOLD = 0.9`

- [x] **Step 1: Write the failing tests.** Create `tests/sim/ai/envelope.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { airframeEnvelope, relativeEnvelope } from '../../../src/sim/ai/envelope.js'
import { createState } from '../../../src/sim/flight/state.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const at = (fuelKg: number) => createState({ fuelKg })

describe('airframeEnvelope (7c spec §3.3), derived from fields every spec carries', () => {
  it('F6F at the scenario fuel of 400 kg', () => {
    const e = airframeEnvelope(f6f, at(400))
    expect(e.wingLoadingNPerM2).toBeCloseTo(1450.6131, 3)
    expect(e.powerLoadingWPerN).toBeCloseTo(24.8431, 3)
    expect(e.cornerSpeedMps).toBeCloseTo(119.9786, 3) // 43.81 * sqrt(7.5)
    expect(e.diveSpeedMps).toBe(216)
    expect(e.gLimit).toBe(7.5)
  })

  it('F6F at testMassKg reproduces the spec table\'s 1,780 N/m^2', () => {
    const e = airframeEnvelope(f6f, at(f6f.reference.testMassKg - f6f.mass.emptyKg))
    expect(e.wingLoadingNPerM2).toBeCloseTo(1780.4, 0)
  })

  it('A6M2 at 400 kg', () => {
    const e = airframeEnvelope(zero, at(400))
    expect(e.wingLoadingNPerM2).toBeCloseTo(908.9943, 3)
    expect(e.powerLoadingWPerN).toBeCloseTo(23.3692, 3)
    expect(e.cornerSpeedMps).toBeCloseTo(92.2573, 3) // 34.87 * sqrt(7.0)
  })

  it('burning fuel lowers the wing loading', () => {
    expect(airframeEnvelope(f6f, at(100)).wingLoadingNPerM2).toBeLessThan(airframeEnvelope(f6f, at(600)).wingLoadingNPerM2)
  })
})

describe('relativeEnvelope', () => {
  const hellcat = airframeEnvelope(f6f, at(400))
  const a6m = airframeEnvelope(zero, at(400))

  it('a Hellcat against a Hellcat is neutral', () => {
    const r = relativeEnvelope(hellcat, hellcat)
    expect(r.turnAdvantage).toBe(1)
    expect(r.pairing).toBe('neutral')
  })

  it('a Hellcat against the Zero reads boom-and-zoom, the Zero against a Hellcat turnfight', () => {
    const h = relativeEnvelope(hellcat, a6m)
    expect(h.turnAdvantage).toBeCloseTo(0.6266, 4)
    expect(h.pairing).toBe('boom-and-zoom')
    expect(h.climbAdvantage).toBeCloseTo(24.8431 / 23.3692, 3)
    expect(h.diveAdvantage).toBeCloseTo(216 / 166.67, 3)
    const z = relativeEnvelope(a6m, hellcat)
    expect(z.turnAdvantage).toBeCloseTo(1.5958, 4)
    expect(z.pairing).toBe('turnfight')
  })
})

describe('no AI code names an airframe (7c spec §7)', () => {
  it('no file under src/sim/ai contains a content aircraft id', () => {
    const dir = new URL('../../../src/sim/ai/', import.meta.url)
    const ids = readdirSync(new URL('../../../content/aircraft/', import.meta.url))
      .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    expect(ids.length).toBeGreaterThanOrEqual(3)
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const text = readFileSync(new URL(file, dir), 'utf8')
      for (const id of ids) expect(text.includes(id), `${file} names ${id}`).toBe(false)
    }
  })
})
```

- [x] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/envelope.test.ts --maxWorkers=2`
Expected: FAIL: `envelope.js` cannot be resolved. The airframe-id test passes already.

- [x] **Step 3: Implement.** Create `src/sim/ai/envelope.ts`:

```ts
import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState } from '../flight/state.js'
import { massKg } from '../flight/model.js'

const G_MPS2 = 9.80665
const DEG = Math.PI / 180

/** Tuning values from 7c spec §3.3: above 1.1 we out-turn the target enough
 *  to fight flat; below 0.9 we should not. */
export const TURNFIGHT_THRESHOLD = 1.1
export const BOOM_AND_ZOOM_THRESHOLD = 0.9

export type Pairing = 'turnfight' | 'boom-and-zoom' | 'neutral'

export type AirframeEnvelope = {
  readonly wingLoadingNPerM2: number
  readonly powerLoadingWPerN: number
  readonly cornerSpeedMps: number
  readonly diveSpeedMps: number
  readonly gLimit: number
  readonly maxRollRateRadPerS: number
  readonly maxPitchRateRadPerS: number
}

/**
 * What an AI knows about an airframe, derived from fields every AircraftSpec
 * already carries (7c spec §3.3). This replaces master spec §9's
 * hand-authored `aiHint`, so a new airframe needs no AI content. Wing and
 * power loading use the model's own mass (`massKg`: empty weight plus
 * remaining fuel), so they move as fuel burns. Corner speed is the speed at
 * which the stall and the G limit meet: stall speed x sqrt(gLimit).
 */
export function airframeEnvelope(spec: AircraftSpec, state: AircraftState): AirframeEnvelope {
  const weightN = massKg(spec, state) * G_MPS2
  return {
    wingLoadingNPerM2: weightN / spec.geometry.wingAreaM2,
    powerLoadingWPerN: (spec.engine.maxPowerW * spec.engine.propEfficiency) / weightN,
    cornerSpeedMps: spec.reference.stallSpeedMps * Math.sqrt(spec.limits.gLimit),
    diveSpeedMps: spec.limits.diveSpeedMps,
    gLimit: spec.limits.gLimit,
    maxRollRateRadPerS: spec.rates.maxRollRateDegPerSec * DEG,
    maxPitchRateRadPerS: spec.rates.maxPitchRateDegPerSec * DEG,
  }
}

export type RelativeEnvelope = {
  /** Target's wing loading over ours: above 1 means we out-turn it. */
  readonly turnAdvantage: number
  /** Our power loading over the target's: above 1 means we out-climb it. */
  readonly climbAdvantage: number
  /** Our dive limit over the target's. */
  readonly diveAdvantage: number
  readonly pairing: Pairing
}

export function relativeEnvelope(self: AirframeEnvelope, target: AirframeEnvelope): RelativeEnvelope {
  const turnAdvantage = target.wingLoadingNPerM2 / self.wingLoadingNPerM2
  return {
    turnAdvantage,
    climbAdvantage: self.powerLoadingWPerN / target.powerLoadingWPerN,
    diveAdvantage: self.diveSpeedMps / target.diveSpeedMps,
    pairing: turnAdvantage >= TURNFIGHT_THRESHOLD ? 'turnfight'
      : turnAdvantage <= BOOM_AND_ZOOM_THRESHOLD ? 'boom-and-zoom'
        : 'neutral',
  }
}
```

Check the field names first: `grep -n "wingAreaM2\|maxPowerW\|propEfficiency" src/sim/flight/schema.ts`.

- [x] **Step 4: Run the tests to verify they pass.** Run the command from Step 2. Expected: PASS.

- [x] **Step 5: Verify and commit.** Nothing flies differently. Run the hash probe and confirm that it equals `hash-task1.txt`.

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai/envelope.ts tests/sim/ai/envelope.test.ts
git commit -m "7c: the airframe envelope, derived from spec fields; the Zero reads turnfight against a Hellcat (7c Task 3)"
```

---

### Task 4: The lift-vector controller and `steerToward`

**Files:**
- Create: `src/sim/ai/liftVector.ts`, `tests/sim/ai/liftVector.test.ts`

**Interfaces:**
- Consumes: `commandedBodyRates(spec, state, controls)` (`src/sim/flight/model.ts`) and `controlsForDesiredVelocity` (`controller.ts`)
- Produces: `pitchPerUnitCommand(state, spec): number` (rad/s of pitch rate at pitch = 1, including rate authority and Z2's control fade)
- Produces: `pitchCommandForLoadFactor(state, spec, loadFactorG): number | null` (null when the airplane is too slow to have pitch authority)
- Produces: `controlsForLiftVector(state, spec, liftDirection: Vec3, loadFactorG: number, throttle: number): Controls`
- Produces: `steerToward(state, spec, desiredVelocity: Vec3, loadFactorG: number): Controls`, and `LIFT_VECTOR_HANDOFF_RAD = 60°`

- [x] **Step 1: Write the failing tests.** Create `tests/sim/ai/liftVector.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  LIFT_VECTOR_HANDOFF_RAD, controlsForLiftVector, pitchCommandForLoadFactor, pitchPerUnitCommand, steerToward,
} from '../../../src/sim/ai/liftVector.js'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { createState } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const level = createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) })
const inverted = createState({ ...level, attitude: qFromAxisAngle(v3(1, 0, 0), Math.PI) })
const G = 9.80665

describe('controlsForLiftVector (7c spec §3.4)', () => {
  it('lift straight up, wings level: no roll, and a pull', () => {
    const c = controlsForLiftVector(level, f6f, v3(0, 1, 0), 3, 1)
    expect(c.roll).toBeCloseTo(0, 9)
    expect(c.pitch).toBeGreaterThan(0)
  })

  it('lift to the right rolls right, to the left rolls left', () => {
    expect(controlsForLiftVector(level, f6f, v3(0, 0.2, 1), 3, 1).roll).toBeGreaterThan(0)
    expect(controlsForLiftVector(level, f6f, v3(0, 0.2, -1), 3, 1).roll).toBeLessThan(0)
  })

  it('lift straight down from wings level commands a full roll, not zero (7a\'s atan2 lesson), and never pushes', () => {
    const c = controlsForLiftVector(level, f6f, v3(0, -1, 0), 3, 1)
    expect(Math.abs(c.roll)).toBe(1)
    expect(c.pitch).toBeGreaterThanOrEqual(0)
  })

  it('already inverted with lift down: no roll, and a pull toward the ground', () => {
    const c = controlsForLiftVector(inverted, f6f, v3(0, -1, 0), 3, 1)
    expect(Math.abs(c.roll)).toBeLessThan(0.05)
    expect(c.pitch).toBeGreaterThan(0)
  })

  it('damping opposes body rates', () => {
    const rolling = createState({ ...level, bodyRates: v3(0.5, 0, 0) })
    const yawing = createState({ ...level, bodyRates: v3(0, -0.5, 0) })
    expect(controlsForLiftVector(rolling, f6f, v3(0, 1, 0), 1, 1).roll).toBeLessThan(0)
    expect(controlsForLiftVector(yawing, f6f, v3(0, 1, 0), 1, 1).yaw).toBeLessThan(0)
  })

  it('stays finite and clamped for a stopped airplane, a zero lift vector and absurd inputs', () => {
    const stopped = createState({ position: v3(0, 3000, 0), velocity: v3(0, 0, 0) })
    for (const c of [
      controlsForLiftVector(stopped, f6f, v3(0, 1, 0), 5, 1),
      controlsForLiftVector(level, f6f, v3(0, 0, 0), 5, 1),
      controlsForLiftVector(level, f6f, v3(-1, 0, 0), 99, 7),
      controlsForLiftVector(level, f6f, v3(Number.NaN, 1, 0), 5, 1),
    ]) {
      for (const k of ['roll', 'pitch', 'yaw', 'throttle'] as const) {
        expect(Number.isFinite(c[k])).toBe(true)
        expect(Math.abs(c[k])).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('pitchCommandForLoadFactor', () => {
  it('1 g wings level asks for no pitch rate', () => {
    expect(pitchCommandForLoadFactor(level, f6f, 1)).toBeCloseTo(0, 12)
  })

  it('commands the pitch rate whose V x omega / g + 1 equals the asked load', () => {
    const p = pitchCommandForLoadFactor(level, f6f, 4)!
    expect(120 * p * pitchPerUnitCommand(level, f6f) / G + 1).toBeCloseTo(4, 9)
  })

  it('sees the Zero\'s control fade: above 250 mph EAS a unit command buys less pitch rate', () => {
    const slow = createState({ position: v3(0, 0, 0), velocity: v3(100, 0, 0) })
    const fast = createState({ position: v3(0, 0, 0), velocity: v3(150, 0, 0) })
    expect(pitchPerUnitCommand(fast, zero)).toBeLessThan(pitchPerUnitCommand(slow, zero))
  })

  it('is null below any pitch authority', () => {
    expect(pitchCommandForLoadFactor(createState({ velocity: v3(0, 0, 0) }), f6f, 3)).toBeNull()
  })
})

describe('steerToward', () => {
  it('within the handoff angle it IS the velocity controller, bit for bit', () => {
    const desired = v3(120, 0, 120 * Math.tan(LIFT_VECTOR_HANDOFF_RAD * 0.5))
    expect(steerToward(level, f6f, desired, 6.75)).toEqual(controlsForDesiredVelocity(level, f6f, desired))
  })

  it('beyond it, a target behind is a pull round, never a push', () => {
    const c = steerToward(level, f6f, v3(-120, -30, 5), 6.75)
    expect(c).not.toEqual(controlsForDesiredVelocity(level, f6f, v3(-120, -30, 5)))
    expect(c.pitch).toBeGreaterThanOrEqual(0)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/liftVector.test.ts --maxWorkers=2`
Expected: FAIL, because `liftVector.js` cannot be resolved.

- [x] **Step 3: Implement.** Create `src/sim/ai/liftVector.ts`:

```ts
import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import { commandedBodyRates } from '../flight/model.js'
import { qRotate } from '../math/quat.js'
import { dot, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import { controlsForDesiredVelocity } from './controller.js'

const G_MPS2 = 9.80665
const clamp = (n: number, lo: number, hi: number): number => Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0

/** Beyond this angle between the nose and the desired velocity,
 *  `steerToward` flies the lift vector instead of the velocity controller.
 *  Measured 2026-09-25 (plan "Measured", ablation table): without it, the G
 *  limiter left the velocity controller pushing into a near-vertical dive it
 *  could not recover from in 12 of 16 head-on runs. */
export const LIFT_VECTOR_HANDOFF_RAD = 60 * Math.PI / 180
const ROLL_P = 1.8
const ROLL_D = 0.35
const YAW_D = 0.25
/** Pull only once the lift line is within this of the wanted one; until
 *  then, a light positive pull. A roll-then-pull, never a push. */
const PULL_WINDOW_RAD = Math.PI / 4
const ROLLING_PULL_FRACTION = 0.3

/** Pitch rate, rad/s, that pitch = 1 commands right now: the model's rate
 *  authority times Z2's control fade (`commandedBodyRates`). */
export function pitchPerUnitCommand(state: AircraftState, spec: AircraftSpec): number {
  return commandedBodyRates(spec, state, { roll: 0, pitch: 1, yaw: 0, throttle: 0 }).z
}

/**
 * The pitch command whose steady pitch rate gives `loadFactorG`, from
 * n = V x omega / g + (body-up . world-up): the gravity term is what makes 1 g
 * wings level a zero-rate command. Unclamped, so the limiter can compare
 * against it. Null below 1 m/s or with no pitch authority.
 */
export function pitchCommandForLoadFactor(state: AircraftState, spec: AircraftSpec, loadFactorG: number): number | null {
  const speed = length(state.velocity)
  const perUnit = pitchPerUnitCommand(state, spec)
  if (speed < 1 || perUnit < 1e-6) return null
  const upY = qRotate(state.attitude, v3(0, 1, 0)).y
  return ((loadFactorG - upY) * G_MPS2 / speed) / perUnit
}

/**
 * Fly a lift vector (7c spec §3.4): roll, at any bank including inverted,
 * until body-up lies along the part of `liftDirection` perpendicular to the
 * velocity, then pull `loadFactorG`. This is how a pilot flies vertical
 * maneuvers, and the only way to fly them here: the velocity controller
 * pushes negative g for anything below the nose (spec §1.4).
 *
 * A lift direction along the velocity has no perpendicular part; the current
 * lift line is held. Roll error comes from `atan2` with the cosine term free
 * to go negative, so a lift demand straight below commands a full roll
 * rather than none (the 7a controller lesson).
 */
export function controlsForLiftVector(
  state: AircraftState, spec: AircraftSpec, liftDirection: Vec3, loadFactorG: number, throttle: number,
): Controls {
  const speed = length(state.velocity)
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const right = qRotate(state.attitude, v3(0, 0, 1))
  const along = speed > 1e-6 ? scale(state.velocity, 1 / speed) : qRotate(state.attitude, v3(1, 0, 0))
  const lift = [liftDirection.x, liftDirection.y, liftDirection.z].every(Number.isFinite) ? liftDirection : up
  const perp = sub(lift, scale(along, dot(lift, along)))
  const wanted = length(perp) > 1e-9 ? normalize(perp) : up
  const rollError = Math.atan2(dot(wanted, right), dot(wanted, up))
  const pull = pitchCommandForLoadFactor(state, spec, loadFactorG) ?? 0
  const pitch = Math.abs(rollError) < PULL_WINDOW_RAD
    ? clamp(pull, -1, 1)
    : clamp(pull * ROLLING_PULL_FRACTION, 0, 1)
  return {
    roll: clamp(rollError * ROLL_P - state.bodyRates.x * ROLL_D, -1, 1),
    pitch,
    // Body y is negative while yawing right and Controls.yaw is positive for
    // a right command, so adding the rate opposes it (controller.ts).
    yaw: clamp(state.bodyRates.y * YAW_D, -1, 1),
    throttle: clamp(throttle, 0, 1),
    gearDown: false,
    flapDown: false,
    brake: 0,
  }
}

/**
 * Steer toward a desired velocity (7c ruling R3). Within
 * LIFT_VECTOR_HANDOFF_RAD of the nose this returns
 * `controlsForDesiredVelocity`'s result unchanged, so 7a/7b behavior and
 * tests stand. Beyond it, it rolls the lift vector toward the desired
 * direction and pulls `loadFactorG`, with the velocity controller's
 * throttle.
 */
export function steerToward(state: AircraftState, spec: AircraftSpec, desiredVelocity: Vec3, loadFactorG: number): Controls {
  const velocityControls = controlsForDesiredVelocity(state, spec, desiredVelocity)
  const speed = length(desiredVelocity)
  if (speed < 1e-6) return velocityControls
  const forward = qRotate(state.attitude, v3(1, 0, 0))
  const offNose = Math.acos(clamp(dot(scale(desiredVelocity, 1 / speed), forward), -1, 1))
  if (offNose < LIFT_VECTOR_HANDOFF_RAD) return velocityControls
  return controlsForLiftVector(state, spec, desiredVelocity, loadFactorG, velocityControls.throttle)
}
```

- [x] **Step 4: Run the tests to verify they pass.** Run the command from Step 2. Expected: PASS. If the Zero fade test fails, check that 150 m/s at sea level is above the fade's 250 mph EAS knee: 111.76 m/s, per `a6m2-zero.json`'s `controlFadeByEasMps`.

- [x] **Step 5: Verify and commit.** The hash must still equal `hash-task1.txt`, because nothing calls this file yet.

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai/liftVector.ts tests/sim/ai/liftVector.test.ts
git commit -m "7c: the lift-vector controller and steerToward (7c Task 4)"
```

---
### Task 5: The safety envelope, and flying Pursue and Extend through `steerToward`

**Files:**
- Create: `src/sim/ai/safety.ts`, `src/sim/ai/maneuverFlight.ts`, `tests/sim/ai/safety.test.ts`, `tests/render/aiSafety.test.ts`
- Modify: `src/sim/ai/pilot.ts` (`SafetyMode`, the `safety` field, `initialDecision()`)
- Modify: `src/sim/ai/decision.ts` (`maneuverControls`)
- Modify: `src/sim/ai/pilotTick.ts` (the safety override)
- Modify: `src/sim/scenario.ts` (`pilotAssignmentFrom`)
- Modify: the decision literals in `tests/sim/entities.test.ts:16-40`, `tests/sim/scenario.test.ts:141,154,162`, `tests/sim/ai/decision.test.ts:168-192` and `tests/sim/ai/pursuit.test.ts:111-114`
- Modify: `tests/sim/zeroMerge.test.ts` (ruling R9)
- Modify: `tests/render/aiLethality.test.ts` (item 1's comment only)

**Interfaces:**
- Consumes: `controlsForLiftVector`, `pitchCommandForLoadFactor` and `steerToward` (Task 4); `pilotTick` and `PilotTickContext` (Task 2)
- Produces, from `pilot.ts`:
  - `type SafetyMode = 'none' | 'recover' | 'overspeed'`
  - `PilotDecisionState.safety: SafetyMode`
  - `initialDecision(): PilotDecisionState`
- Produces, from `safety.ts`:
  - the constants `G_BUDGET = 0.9`, `FLOOR_M = 300`, `FLOOR_BUFFER_M = 100`, `FLOOR_TIME_S = 4`, `OVERSPEED_THROTTLE_CUT = 0.9` and `OVERSPEED_RECOVER = 0.95`
  - `loadFactorBudget(spec)` and `negativeLoadFloor(spec)`
  - `limitLoadFactor(state, spec, controls): Controls`
  - `heightAboveGround(state, terrain, decks): number` and `needsFloorRecovery(state, terrain, decks): boolean`
  - `type SafetyOverride = { mode: 'recover' | 'overspeed'; controls: Controls }`, and `safetyOverride(self, terrain, decks, wind): SafetyOverride | null`
  - `finishControls(self, base, noiseStdDev, cursor, wind): { controls: Controls; cursor: number }`
- Produces, from `maneuverFlight.ts`: `leadPursuitControls(self, perceived)`, `extendControls(self, perceived)`, `defensiveBreakControls(self, perceived)` and `intentControls(self, perceived, maneuver)`
- Produces, from `decision.ts`: `maneuverControls(self, target, decision, skill, wind = null)`, which gains a trailing optional argument.

- [x] **Step 1: Write the failing unit tests.** Create `tests/sim/ai/safety.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  FLOOR_M, G_BUDGET, OVERSPEED_THROTTLE_CUT, finishControls, heightAboveGround, limitLoadFactor, needsFloorRecovery, safetyOverride,
} from '../../../src/sim/ai/safety.js'
import { pitchPerUnitCommand } from '../../../src/sim/ai/liftVector.js'
import { createState } from '../../../src/sim/flight/state.js'
import { createTerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { qRotate } from '../../../src/sim/math/quat.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../../src/sim/loop.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const G = 9.80665
const loadOf = (s: ReturnType<typeof createState>, spec: typeof f6f, pitch: number) =>
  length(s.velocity) * pitch * pitchPerUnitCommand(s, spec) / G + qRotate(s.attitude, v3(0, 1, 0)).y
const plateau = createTerrainField(parseTerrainHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
  finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
}), 12, new Int16Array(9).fill(10000)) // 1,000 m everywhere
const entity = (spec: typeof f6f, state: ReturnType<typeof createState>): AircraftEntity<undefined> =>
  ({ id: 'a', spec, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false })

describe('limitLoadFactor (7c spec §3.2)', () => {
  const fast = createState({ position: v3(0, 3000, 0), velocity: v3(150, 0, 0) })

  it('cuts a full pull to G_BUDGET x gLimit', () => {
    const c = limitLoadFactor(fast, f6f, { roll: 0, pitch: 1, yaw: 0, throttle: 1 })
    expect(c.pitch).toBeLessThan(1)
    expect(loadOf(fast, f6f, c.pitch)).toBeCloseTo(G_BUDGET * f6f.limits.gLimit, 9)
  })

  it('floors a full push at -G_BUDGET x gLimit for an engine that runs under negative g (ruling R5)', () => {
    const c = limitLoadFactor(fast, f6f, { roll: 0, pitch: -1, yaw: 0, throttle: 1 })
    expect(loadOf(fast, f6f, c.pitch)).toBeCloseTo(-G_BUDGET * f6f.limits.gLimit, 9)
  })

  it('floors it at 0 g for an engine with negativeGCutout, so an AI Zero never starves its own engine', () => {
    const c = limitLoadFactor(fast, zero, { roll: 0, pitch: -1, yaw: 0, throttle: 1 })
    expect(loadOf(fast, zero, c.pitch)).toBeCloseTo(0, 9)
  })

  it('leaves a gentle command exactly alone', () => {
    const gentle = { roll: 0.3, pitch: 0.1, yaw: 0, throttle: 0.7 }
    expect(limitLoadFactor(fast, f6f, gentle)).toEqual(gentle)
  })
})

describe('the ground floor', () => {
  it('uses sea level when there is no terrain', () => {
    expect(heightAboveGround(createState({ position: v3(0, 1300, 0) }), null, [])).toBe(1300)
  })

  it('an AI over high ground measures height above that ground (Review Focus 2)', () => {
    const s = createState({ position: v3(0, 1300, 0), velocity: v3(120, 0, 0) })
    expect(heightAboveGround(s, plateau, [])).toBeCloseTo(300, 6)
    expect(needsFloorRecovery(s, plateau, [])).toBe(true)
    expect(needsFloorRecovery(s, null, [])).toBe(false)
  })

  it('acts below FLOOR_M + FLOOR_BUFFER_M, or within FLOOR_TIME_S of reaching it', () => {
    expect(needsFloorRecovery(createState({ position: v3(0, 390, 0), velocity: v3(120, 0, 0) }), null, [])).toBe(true)
    expect(needsFloorRecovery(createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) }), null, [])).toBe(false)
    // (1000 - 400) / 160 = 3.75 s < 4 s; (1000 - 400) / 100 = 6 s.
    expect(needsFloorRecovery(createState({ position: v3(0, 1000, 0), velocity: v3(100, -160, 0) }), null, [])).toBe(true)
    expect(needsFloorRecovery(createState({ position: v3(0, 1000, 0), velocity: v3(100, -100, 0) }), null, [])).toBe(false)
    expect(FLOOR_M).toBe(300)
  })
})

describe('safetyOverride and finishControls', () => {
  it('recovers wings-level and pulls, at full throttle, when the floor is close', () => {
    const o = safetyOverride(entity(f6f, createState({ position: v3(0, 350, 0), velocity: v3(120, -20, 0) })), null, [], null)
    expect(o?.mode).toBe('recover')
    expect(o!.controls.pitch).toBeGreaterThan(0)
    expect(o!.controls.throttle).toBe(1)
    expect(o!.controls.fire).toBeUndefined()
  })

  it('pulls out, throttle closed, at 0.95 x the dive limit and descending (ruling R7)', () => {
    const o = safetyOverride(entity(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(200, -80, 0) })), null, [], null)
    expect(o?.mode).toBe('overspeed')
    expect(o!.controls.throttle).toBe(0)
  })

  it('does nothing in ordinary flight', () => {
    expect(safetyOverride(entity(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(150, 0, 0) })), null, [], null)).toBeNull()
  })

  it('closes the throttle from 0.9 x the dive limit, whatever the maneuver asked', () => {
    const v = OVERSPEED_THROTTLE_CUT * f6f.limits.diveSpeedMps + 1
    const a = entity(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(v, 0, 0) }))
    expect(finishControls(a, { roll: 0, pitch: 0, yaw: 0, throttle: 1 }, 0, 0, null).controls.throttle).toBe(0)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/safety.test.ts --maxWorkers=2`
Expected: FAIL, because `safety.js` cannot be resolved.

- [x] **Step 3: Add `SafetyMode` and `initialDecision` to `pilot.ts`.** In `src/sim/ai/pilot.ts`, change the vec3 import to `import { cross, length, normalize, scale, sub, v3, ZERO, type Vec3 } from '../math/vec3.js'`. Then add, directly after `PilotManeuver`:

```ts
/** Which safety override flew this tick (7c spec §3.2; ruling R11). It never
 *  changes `maneuver`, the 7b intent; it only says the envelope took the
 *  stick. Plain data, for tests and diagnostics. */
export type SafetyMode = 'none' | 'recover' | 'overspeed'
```

Add `readonly safety: SafetyMode` as the last field of `PilotDecisionState`, with the doc comment `/** This tick's safety override, or 'none'. Written every tick by pilotTick. */`. Then add after the type:

```ts
/** A fresh pilot's decision state: rescore on the first tick
 *  (`nextRescoreS: 0` is always <= the first tick's time), so the placeholder
 *  observations are never flown against. The one source for scenario.ts and
 *  the tests. */
export function initialDecision(): PilotDecisionState {
  return {
    maneuver: 'pursue', nextRescoreS: 0,
    observedTargetPosition: ZERO, observedTargetVelocity: ZERO,
    noiseCursor: 0, safety: 'none',
  }
}
```

In `src/sim/scenario.ts`, `pilotAssignmentFrom`: import `initialDecision` next to `VETERAN_SKILL` and `GREEN_SKILL`, and replace the `decision: { ... }` literal with `decision: initialDecision(),`. Keep its comment: it moves above the call.

- [x] **Step 4: Implement `safety.ts`.** Create `src/sim/ai/safety.ts`:

```ts
import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import type { AircraftEntity } from '../loop.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import { airVelocity } from '../flight/model.js'
import { groundUnder } from '../world/ground.js'
import { SEA_LEVEL_M } from '../world/terrain.js'
import { length, v3, type Vec3 } from '../math/vec3.js'
import { controlsForLiftVector, pitchCommandForLoadFactor } from './liftVector.js'
import { applyControlNoise } from './noise.js'

/**
 * 7c spec §3.2: the AI safety envelope. These are hard overrides, not score
 * terms, following 7b's MIN_ENGAGEMENT_RANGE_M precedent: no weight change
 * can outscore flying into the sea. Every value was measured 2026-09-25
 * through the frame path (plan "Measured", config E). At HEAD, the pursuer
 * overloaded itself to destruction at ticks 2135-2695 of the scripted-evasion
 * soak and followed the player through the sea to -2,842 m. With this
 * envelope: structure 1.000 in all 8 soak runs, peak 7.32 g against a 7.5
 * limit, lowest point 353 m.
 */
export const G_BUDGET = 0.9
export const FLOOR_M = 300
/** Recovery starts this far above FLOOR_M, so the pull-out's own sink stays
 *  above it. Without it the soak dipped to 256-281 m (ruling R6). */
export const FLOOR_BUFFER_M = 100
/** The spec's 8 s was a tuning value. Measured on the green 7d bar: 8 s ->
 *  0 of 4 loadouts behind, 6 s -> 1 of 2, 5 s -> 3 of 4, 4 s -> 4 of 4
 *  (ruling R6). */
export const FLOOR_TIME_S = 4
/** Fractions of `limits.diveSpeedMps` (ruling R7). Measured: a Zero entering
 *  a 60° dive at 150 m/s from 2,500 m kept structure 1.000 and bottomed at
 *  542 m. Without the guard: structure 0. */
export const OVERSPEED_THROTTLE_CUT = 0.9
export const OVERSPEED_RECOVER = 0.95

const UP = v3(0, 1, 0)

export const loadFactorBudget = (spec: AircraftSpec): number => G_BUDGET * spec.limits.gLimit

/** Symmetric because the overload model is symmetric
 *  (`damageFromStructuralOverload` reads the load's magnitude). Zero g for a
 *  float-carburetted engine that starves under negative lift (Z2's
 *  `engine.negativeGCutout`), so an AI never cuts its own engine: 176 ticks
 *  at HEAD in the first 12 s of zero-merge, 0 in 120 s with this floor
 *  (ruling R5). */
export const negativeLoadFloor = (spec: AircraftSpec): number =>
  spec.engine.negativeGCutout === true ? 0 : -loadFactorBudget(spec)

/**
 * Clamp the pitch command so its steady pitch rate stays between the floor
 * and the budget. It runs on every AI output, before control noise, so a
 * green pilot's jitter can still nick the limit, which is human (spec §3.2).
 * Measured: green's soak peak was 7.32 g, within 7.5.
 */
export function limitLoadFactor(state: AircraftState, spec: AircraftSpec, controls: Controls): Controls {
  const hi = pitchCommandForLoadFactor(state, spec, loadFactorBudget(spec))
  const lo = pitchCommandForLoadFactor(state, spec, negativeLoadFloor(spec))
  if (hi === null || lo === null) return controls
  return { ...controls, pitch: Math.min(Math.max(controls.pitch, lo), hi) }
}

/** Height above what is under the aircraft: a deck, the terrain, or sea
 *  level where terrain is null (spec §3.2). */
export function heightAboveGround(state: AircraftState, terrain: TerrainField | null, decks: readonly Deck[]): number {
  const under = groundUnder(terrain, decks, state.position.x, state.position.z)
  return state.position.y - (under?.heightM ?? SEA_LEVEL_M)
}

/** Below FLOOR_M + FLOOR_BUFFER_M, or within FLOOR_TIME_S of reaching it at
 *  the current sink rate. Stateless: it clears itself once the aircraft is
 *  above that height and no longer descending. */
export function needsFloorRecovery(state: AircraftState, terrain: TerrainField | null, decks: readonly Deck[]): boolean {
  const trigger = FLOOR_M + FLOOR_BUFFER_M
  const h = heightAboveGround(state, terrain, decks)
  if (h < trigger) return true
  const vy = state.velocity.y
  return vy < 0 && (h - trigger) / -vy < FLOOR_TIME_S
}

export type SafetyOverride = { readonly mode: 'recover' | 'overspeed'; readonly controls: Controls }

/** Checked every tick, not at rescore: reaction delay models perceiving the
 *  enemy, not a pilot flying into the sea. The floor outranks overspeed.
 *  Never fires. */
export function safetyOverride<M>(
  self: AircraftEntity<M>, terrain: TerrainField | null, decks: readonly Deck[], wind: Vec3 | null,
): SafetyOverride | null {
  const n = loadFactorBudget(self.spec)
  if (needsFloorRecovery(self.state, terrain, decks)) {
    return { mode: 'recover', controls: controlsForLiftVector(self.state, self.spec, UP, n, 1) }
  }
  const airspeed = length(airVelocity(self.state, wind))
  if (airspeed >= OVERSPEED_RECOVER * self.spec.limits.diveSpeedMps && self.state.velocity.y < 0) {
    return { mode: 'overspeed', controls: controlsForLiftVector(self.state, self.spec, UP, n, 0) }
  }
  return null
}

/** The last three stages of every AI command, in order: the load-factor
 *  limiter, the overspeed throttle cut, then 7d's control noise. */
export function finishControls<M>(
  self: AircraftEntity<M>, base: Controls, noiseStdDev: number, cursor: number, wind: Vec3 | null,
): { readonly controls: Controls; readonly cursor: number } {
  const limited = limitLoadFactor(self.state, self.spec, base)
  const fast = length(airVelocity(self.state, wind)) >= OVERSPEED_THROTTLE_CUT * self.spec.limits.diveSpeedMps
  return applyControlNoise(fast ? { ...limited, throttle: 0 } : limited, noiseStdDev, cursor)
}
```

- [x] **Step 5: Implement `maneuverFlight.ts`, and rewire `maneuverControls` and `pilotTick`.** Create `src/sim/ai/maneuverFlight.ts`:

```ts
import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { controlsForDesiredVelocity } from './controller.js'
import { steerToward } from './liftVector.js'
import { hasGunSolution, pursuitDesiredVelocity } from './pursuit.js'
import { breakDesiredVelocity, extendDesiredVelocity, type PilotManeuver } from './pilot.js'
import { loadFactorBudget } from './safety.js'

/**
 * What each maneuver flies (7c spec §3.4-3.5). `perceived` is the target as
 * of the last rescore (7d's staleness); only the fire gate and steering read
 * it. Never imports decision.ts, maneuvers.ts or pilotTick.ts.
 */

/** 7a's lead pursuit and gun gate, steered through `steerToward` (ruling R3):
 *  within 60° of the nose this is `pursuitControls` exactly. */
export function leadPursuitControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>): Controls {
  const steered = steerToward(self.state, self.spec, pursuitDesiredVelocity(self, perceived), loadFactorBudget(self.spec))
  return hasGunSolution(self, perceived) ? { ...steered, fire: true } : steered
}

/** 7b's Extend, steered through `steerToward`: the reversal back toward the
 *  threat is a roll-and-pull, not a push into the sea. */
export function extendControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>): Controls {
  return steerToward(self.state, self.spec, extendDesiredVelocity(self, perceived), loadFactorBudget(self.spec))
}

/** 7b's Break, flown exactly as 7b flies it (ruling R4): at a head-on merge
 *  Break is chosen from the first rescore, and the lift-vector version cost
 *  the player's first-merge kill (7/8 -> 0/8, measured 2026-09-25). */
export function defensiveBreakControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>): Controls {
  return controlsForDesiredVelocity(self.state, self.spec, breakDesiredVelocity(self, perceived))
}

export function intentControls<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, maneuver: PilotManeuver): Controls {
  switch (maneuver) {
    case 'pursue': return leadPursuitControls(self, perceived)
    case 'extend': return extendControls(self, perceived)
    case 'break': return defensiveBreakControls(self, perceived)
  }
}
```

In `src/sim/ai/decision.ts`:
1. Replace the imports of `controlsForDesiredVelocity`, `pursuitControls`, `breakDesiredVelocity`, `extendDesiredVelocity` and `applyControlNoise` with `import { intentControls } from './maneuverFlight.js'` and `import { finishControls } from './safety.js'`. Keep `AI_GUN_RANGE_M` and `hasGunSolution` from `pursuit.js`, and change the vec3 import to `import { dot, length, sub, type Vec3 } from '../math/vec3.js'`.
2. Replace the body of `maneuverControls`, and add the `wind` parameter:

```ts
export function maneuverControls<M>(
  self: AircraftEntity<M>,
  target: AircraftEntity<M>,
  decision: PilotDecisionState,
  skill: PilotSkill,
  wind: Vec3 | null = null,
): { readonly controls: Controls; readonly decision: PilotDecisionState } {
  const perceived: AircraftEntity<M> = {
    ...target,
    state: { ...target.state, position: decision.observedTargetPosition, velocity: decision.observedTargetVelocity },
  }
  const { controls, cursor } = finishControls(
    self, intentControls(self, perceived, decision.maneuver), skill.controlNoise, decision.noiseCursor, wind,
  )
  return { controls, decision: { ...decision, noiseCursor: cursor } }
}
```

3. Append to its doc comment: `7c: the clean steering comes from maneuverFlight.ts, then finishControls applies the load-factor limiter and the overspeed throttle cut before the noise (safety.ts).`

In `src/sim/ai/pilotTick.ts`, import `safetyOverride` and `finishControls` from `./safety.js`. Replace the last two lines of `pilotTick` with:

```ts
  // 7c spec §3.2: the envelope is checked every tick, after the rescore, and
  // outranks any maneuver. It never changes the 7b intent (ruling R11).
  const override = safetyOverride(a, ctx.terrain, ctx.decks, ctx.wind)
  if (override !== null) {
    const { controls, cursor } = finishControls(a, override.controls, pilot.skill.controlNoise, decision.noiseCursor, ctx.wind)
    return { ...a, pilot: { ...pilot, decision: { ...decision, safety: override.mode, noiseCursor: cursor } }, controls }
  }
  const { controls, decision: steered } = maneuverControls(a, target, { ...decision, safety: 'none' }, pilot.skill, ctx.wind)
  return { ...a, pilot: { ...pilot, decision: steered }, controls }
```

- [x] **Step 6: Update the decision literals.** They now need `safety`.
- `tests/sim/entities.test.ts`: import `initialDecision` from `pilot.js`. Set `const PURSUE_NOW = initialDecision()`. Make `RESCORED_PURSUE` `{ ...initialDecision(), nextRescoreS: DT + GREEN_SKILL.reactionS, observedTargetPosition: v3(900, 2100, 250), observedTargetVelocity: v3(80, 0, 10), noiseCursor: 3407366838 }`, and keep both comments.
- `tests/sim/scenario.test.ts` lines 141, 154 and 162: replace each `decision: { maneuver: 'pursue', ... noiseCursor: 0 }` with `decision: initialDecision()`, and import it.
- `tests/sim/ai/decision.test.ts`: in both `PilotDecisionState` literals, add `safety: 'none',` after `noiseCursor: 0,`. In "reproduces today's exact steering when the snapshot equals live state", change the expectation to `toEqual(limitLoadFactor(self.state, self.spec, pursuitControls(self, target)))`, and import `limitLoadFactor` from `safety.js`. Add a one-line comment: `// 7c: every AI command now passes the load-factor limiter; inside 60° of the nose steerToward IS the velocity controller.`
- `tests/sim/ai/pursuit.test.ts`: `const PURSUE_NOW = initialDecision()`, with the import.
- `tests/sim/ai/pilotTick.test.ts`: use `const decision = initialDecision()`. In the rescore test, pass `{ ...rescored, safety: 'none' as const }` to `maneuverControls`.

- [x] **Step 7: Run the unit tests.**

Run: `npx vitest run tests/sim/ai tests/sim/entities.test.ts tests/sim/scenario.test.ts --maxWorkers=2`
Expected: PASS. If entities' `noiseCursor: 3407366838` moves, a noise draw was added or dropped. That is a bug: `finishControls` must call `applyControlNoise` exactly once per tick.

- [x] **Step 8: Write the frame-path safety tests.** Create `tests/render/aiSafety.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import { EVASION, LOADOUTS, aircraftOf, flyFrames, passive, replicaWorld } from '../../tools/ai/replica.js'
import { GREEN_SKILL, VETERAN_SKILL, initialDecision } from '../../src/sim/ai/pilot.js'
import { FLOOR_M } from '../../src/sim/ai/safety.js'
import { DT } from '../../src/sim/flight/model.js'
import { createState } from '../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity } from '../../src/sim/loop.js'
import { qFromAxisAngle, qRotate } from '../../src/sim/math/quat.js'
import { dot, scale, sub, v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const PURSUER = 'pursuer-1'
const G = 9.80665
/** Load along body-up from two consecutive tick states: negative means the
 *  wing is pushing, and a float-carburetted engine is starving. */
const bodyUpLoad = (a: AircraftEntity<undefined>): number => {
  const accel = scale(sub(a.state.velocity, a.previous.velocity), 1 / DT)
  return dot(sub(accel, v3(0, -G, 0)), qRotate(a.state.attitude, v3(0, 1, 0))) / G
}

describe('the safety soak: 120 s of the 7d evasion, both skills (7c spec §3.6)', () => {
  // Measured 2026-09-25 with the prototype envelope (config E): structure
  // 1.000 in all 8; peak 7.29-7.32 g (green) and 6.84-6.85 g (veteran)
  // against 7.5; lowest point 353-364 m. At HEAD the pursuer overloaded
  // itself to destruction (ticks 2135-2695) and followed the player to -2,842 m.
  for (const [name, skill] of [['green', GREEN_SKILL], ['veteran', VETERAN_SKILL]] as const) {
    it.each(LOADOUTS)(`${name}, %s: no overload damage, never below FLOOR_M, peak load within gLimit`, (loadout) => {
      const m = { peakG: 0, lowest: Infinity, recovered: 0 }
      const tailChase = loadFixtureScenarioBundle('pursuit-tail-chase')
      const f = flyFrames(replicaWorld(tailChase, loadout, 0, skill), EVASION, 120, (fr) => {
        const p = aircraftOf(fr, PURSUER)
        const rec = fr.world.combat.aircraft[PURSUER]!
        if (p.impact === null && rec.damage.destroyedAt === null) {
          m.peakG = Math.max(m.peakG, rec.stress.loadFactorG)
          m.lowest = Math.min(m.lowest, p.state.position.y)
          if (p.pilot!.decision.safety === 'recover') m.recovered++
        }
        return false
      })
      const rec = f.world.combat.aircraft[PURSUER]!
      expect(rec.damage.structure, `${name} ${loadout}`).toBe(1) // the player never fires, so any loss is self-inflicted
      expect(m.lowest).toBeGreaterThanOrEqual(FLOOR_M)
      expect(m.peakG).toBeLessThanOrEqual(aircraftOf(f, PURSUER).spec.limits.gLimit)
      expect(m.recovered, 'the floor never had to act, so this soak proved nothing about it').toBeGreaterThan(0)
    })
  }
})

describe('an AI Zero never cuts its own engine (Review Focus 1)', () => {
  // Measured 2026-09-25: 176 ticks of negative body-up load in the first 12 s
  // at HEAD (the velocity controller's push); 0 in 120 s with the 0 g floor.
  it.each([['green', GREEN_SKILL], ['veteran', VETERAN_SKILL]] as const)('%s: 120 s of zero-merge with no negative-lift tick', (_n, skill) => {
    const m = { negative: 0 }
    flyFrames(replicaWorld(loadFixtureScenarioBundle('zero-merge'), 'clean', 0, skill), passive, 120, (fr) => {
      const z = aircraftOf(fr, PURSUER)
      if (z.impact === null && fr.world.combat.aircraft[PURSUER]!.damage.destroyedAt === null && bodyUpLoad(z) < 0) m.negative++
      return false
    })
    expect(m.negative).toBe(0)
  })
})

describe('a diving AI Zero neither breaks up nor hits the sea (Review Focus 3)', () => {
  it('pursuing a target 2 km below from a 60° dive at 150 m/s', () => {
    const zero = loadAircraftSpec('a6m2-zero')
    const f6f = loadAircraftSpec('f6f-hellcat')
    const pitch = -60 * Math.PI / 180
    const zs = createState({ position: v3(0, 2500, 0), velocity: v3(150 * Math.cos(pitch), 150 * Math.sin(pitch), 0), attitude: qFromAxisAngle(v3(0, 0, 1), pitch) })
    const ts = createState({ position: v3(2500, 500, 0), velocity: v3(120, 0, 0) })
    const pilotZero: AircraftEntity<undefined> = {
      id: 'z', spec: zero, state: zs, previous: zs, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 1 },
      assistMemory: undefined, impact: null, parked: false,
      pilot: { target: 't', skill: VETERAN_SKILL, decision: initialDecision() },
    }
    const target: AircraftEntity<undefined> = {
      id: 't', spec: f6f, state: ts, previous: ts, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 },
      assistMemory: undefined, impact: null, parked: false,
    }
    let w = createWorldOf({ aircraft: [pilotZero, target], player: 't' })
    const m = { lowest: Infinity, peakG: 0, guarded: 0 }
    for (let i = 0; i < 30 * 60; i++) {
      w = advance(w, DT).world
      const z = w.aircraft.find((a) => a.id === 'z')!
      m.lowest = Math.min(m.lowest, z.state.position.y)
      m.peakG = Math.max(m.peakG, w.combat.aircraft['z']!.stress.loadFactorG)
      if (z.pilot!.decision.safety !== 'none') m.guarded++
    }
    expect(w.combat.aircraft['z']!.damage.structure).toBe(1)
    expect(m.lowest).toBeGreaterThanOrEqual(FLOOR_M)
    expect(m.peakG).toBeLessThanOrEqual(zero.limits.gLimit)
    expect(m.guarded).toBeGreaterThan(0)
  })
})
```

- [x] **Step 9: Run them, and measure.**

Run: `npx vitest run tests/render/aiSafety.test.ts --maxWorkers=2`
Expected: PASS. Add a temporary `console.log(name, loadout, m)` and record the peaks and lows in the ledger and in each `describe`'s comment. Then remove the log.

If the dive test fails on `lowest`, measure where it bottomed and why. A Zero at the 0.2 control-fade floor commands about 6°/s of pitch, which is 1.7 g at 156 m/s EAS (Z2 handoff), so an entry the guard cannot save is possible. Make the entry realistic (a steeper dive than an AI would choose is not a defect), and record what you changed and why. Do not change `FLOOR_*`.

- [x] **Step 10: Lower `zeroMerge.test.ts`'s floor (R9).** Change `toBeGreaterThanOrEqual(4)` to `toBeGreaterThanOrEqual(1)`. Append to the file's header comment:

```ts
 * 7c (2026-09-25): the AI Zero no longer cuts its own engine. At HEAD it
 * pushed negative g through 176 ticks (2.9 s) of the approach, and with the
 * engine starved the bot killed it 8/8. With 7c's 0 g floor its engine keeps
 * running, and the bot kills it at the merge in 2 of 8 runs (measured with
 * the prototype envelope). The floor is lowered to 1, which is ruling R9,
 * Open for Mark item 2.
```

Update item 1's comment in `tests/render/aiLethality.test.ts` with the numbers you measured: the prototype measured a mean of 0.13 hits with the envelope.

- [x] **Step 11: Run the regressions.**

Run: `npx vitest run tests/render/aiLethality.test.ts tests/render/aiSafety.test.ts tests/sim/pursuitMerge.test.ts tests/sim/zeroMerge.test.ts tests/sim/scenario.test.ts tests/sim/entities.test.ts tests/sim/ai --maxWorkers=2`
Expected: PASS. `pursuitMerge.test.ts` is Review Focus 4: the prototype measured 7/8 green and 8/8 veteran first-merge kills. A count below its floor of 6 means the merge changed. Stop and report that, with the count, and do not lower the floor.

- [x] **Step 12: Digests.** Run `npx tsx .superpowers/7c/hash.ts`. The four no-pilot scenarios must match `hash-task1.txt`. The four pilot worlds change. Save the output as `hash-task5.txt`.

- [x] **Step 13: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai/safety.ts src/sim/ai/maneuverFlight.ts src/sim/ai/pilot.ts src/sim/ai/decision.ts src/sim/ai/pilotTick.ts src/sim/scenario.ts \
  tests/sim/ai tests/render/aiSafety.test.ts tests/render/aiLethality.test.ts tests/sim/entities.test.ts tests/sim/scenario.test.ts tests/sim/zeroMerge.test.ts
git commit -m "7c: the AI safety envelope (G limit, symmetric negative-g floor, ground floor, overspeed) and lift-vector steering for Pursue and Extend (7c Task 5)"
```

---

### Task 6: Re-engagement after a missed head-on pass

**Files:**
- Modify: `src/sim/ai/pilot.ts` (`REJOIN_OVERTAKE_MPS`, and `extendDesiredVelocity`'s rejoin branch)
- Modify: `src/sim/ai/maneuverFlight.ts` (`leadPursuitControls`)
- Create: `tests/render/aiReengage.test.ts`
- Test: `tests/sim/ai/pilot.test.ts` (append)

**Interfaces:**
- Produces: `REJOIN_OVERTAKE_MPS = 30` (`pilot.ts`) and `PURSUIT_FULL_POWER_BEYOND_M` (`maneuverFlight.ts`, equal to `AI_GUN_RANGE_M`)

- [x] **Step 1: Write the failing acceptance test.** This is the test the track ledger requires. Create `tests/render/aiReengage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import { CURSORS_4, flyFrames, passive, rangeBetween, replicaWorld } from '../../tools/ai/replica.js'
import type { ScenarioBundle } from '../../src/sim/scenario.js'

/**
 * The gunnery handoff's open item 1, and the track ledger's required 7c
 * acceptance test: after the head-on merge, the pursuer must come back and
 * fight. At HEAD (2026-09-25), with a passive player, both skills sat in
 * `extend` for good: 4.4 km away at 120 s and 0 rounds fired (clean loadout;
 * 3.5-3.7 km with `both`). Mark, 2026-09-25: no stopgap, 7c fixes it.
 *
 * Measured 2026-09-25 with the prototype of this plan's envelope (config E),
 * first post-merge shot, seconds from spawn, clean / both, 4 cursors each:
 *   pursuit-range (green)      88.9-110.0 / 68.8-83.9
 *   pursuit-range-veteran     108.0-117.0 / 70.8-75.9
 *   zero-merge (AI Zero)      104.9-118.9 / 75.8-90.9
 * Every run went on to kill the passive player.
 */
const REENGAGE_BUDGET_S = 150
const PURSUER = 'pursuer-1'
const MERGE_WINDOW_S = 15

const CASES: readonly (readonly [string, ScenarioBundle])[] = [
  ['pursuit-range', loadScenarioBundle('pursuit-range')],
  ['pursuit-range-veteran', loadScenarioBundle('pursuit-range-veteran')],
  ['zero-merge', loadFixtureScenarioBundle('zero-merge')],
]

describe('after a missed head-on pass, the pursuer re-engages and fires again', () => {
  for (const [name, bundle] of CASES) {
    it.each(['clean', 'both'] as const)(`${name}, %s: fires after the merge and hits the player, inside ${REENGAGE_BUDGET_S} s`, (loadout) => {
      for (const cursor of CURSORS_4) {
        const m = { closest: Infinity, shotsAtMerge: 0, firstShotS: null as number | null, hitS: null as number | null, structureAtShot: 0 }
        flyFrames(replicaWorld(bundle, loadout, cursor), passive, REENGAGE_BUDGET_S, (f, i) => {
          const rec = f.world.combat.aircraft[PURSUER]!
          if (i <= MERGE_WINDOW_S * 60) {
            m.closest = Math.min(m.closest, rangeBetween(f, f.world.player, PURSUER))
            m.shotsAtMerge = rec.shots
            return false
          }
          if (m.firstShotS === null && rec.shots > m.shotsAtMerge) {
            m.firstShotS = f.world.tick / 60
            m.structureAtShot = rec.damage.structure
          }
          if (m.firstShotS !== null && f.world.combat.aircraft[f.world.player]!.damage.structure < 1) {
            m.hitS = f.world.tick / 60
            return true
          }
          return false
        })
        const label = `${name} ${loadout} cursor ${cursor} (merge ${m.closest.toFixed(0)} m)`
        expect(m.closest, `${label}: there was no merge to miss`).toBeLessThan(200)
        expect(m.firstShotS, `${label}: never fired again`).not.toBeNull()
        expect(m.structureAtShot, `${label}: came back damaged`).toBe(1)
        expect(m.hitS, `${label}: fired but never hit`).not.toBeNull()
      }
    })
  }
})
```

- [x] **Step 2: Run the test to verify it fails.**

Run: `npx vitest run tests/render/aiReengage.test.ts --maxWorkers=2`
Expected: FAIL with `never fired again` on most cases. The prototype measured 1 of 16 re-engaging with lift-vector steering alone.

- [x] **Step 3: Implement the full-power rejoin (R8).** In `src/sim/ai/pilot.ts`, add above `extendDesiredVelocity`:

```ts
/** Extend's rejoin asks for at least the threat's speed plus this, so the
 *  throttle law (`0.65 + (desired - current) x 0.012`) goes to full power
 *  instead of settling at 0.65 while climbing. At 0.65 the rejoin decayed to
 *  84 m/s and never closed (7c plan, "Measured", 2026-09-25). */
export const REJOIN_OVERTAKE_MPS = 30
```

In the rejoin branch, replace `return scale(normalize(climb), length(self.state.velocity))` with:

```ts
    return scale(normalize(climb), Math.max(length(self.state.velocity), length(threat.state.velocity) + REJOIN_OVERTAKE_MPS))
```

Leave the direction and its comment as they are. Append to `tests/sim/ai/pilot.test.ts`'s `extendDesiredVelocity` describe:

```ts
  it('rejoins at no less than the threat\'s speed plus REJOIN_OVERTAKE_MPS, so the throttle goes up (7c R8)', () => {
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(90, 0, 0) })
    const threat = entity({ position: v3(-1500, 3000, 0), velocity: v3(115, 0, 0) })
    expect(length(extendDesiredVelocity(self, threat))).toBeCloseTo(115 + REJOIN_OVERTAKE_MPS, 9)
  })
```

Add `length` and `REJOIN_OVERTAKE_MPS` to the file's imports.

- [x] **Step 4: Implement full-power pursuit beyond gun range (R8).** In `src/sim/ai/maneuverFlight.ts`, import `AI_GUN_RANGE_M` from `./pursuit.js`, and `length` and `sub` from `../math/vec3.js`. Add:

```ts
/** Beyond gun range the pursuer firewalls the throttle. Lead pursuit's
 *  requested speed (target + at most 35 m/s) and the controller's throttle
 *  law otherwise settle near 140 m/s against a 115 m/s target: 25 m/s of
 *  closure, and 16 of 16 runs could not get back into gun range within
 *  120 s (7c plan ablation, 2026-09-25). Not a change to leadPursuitVelocity's
 *  intercept math (spec §9). */
export const PURSUIT_FULL_POWER_BEYOND_M = AI_GUN_RANGE_M
```

In `leadPursuitControls`, between `steered` and the return, add `const rangeM = length(sub(perceived.state.position, self.state.position))` and `const powered = rangeM > PURSUIT_FULL_POWER_BEYOND_M ? { ...steered, throttle: 1 } : steered`. Then return `hasGunSolution(self, perceived) ? { ...powered, fire: true } : powered`.

- [x] **Step 5: Run the tests.**

Run: `npx vitest run tests/render/aiReengage.test.ts tests/sim/ai tests/render/aiLethality.test.ts tests/render/aiSafety.test.ts tests/sim/pursuitMerge.test.ts tests/sim/zeroMerge.test.ts tests/sim/scenario.test.ts --maxWorkers=2`
Expected: PASS. Log each case's `firstShotS` and record them in the header comment, replacing the prototype's numbers if yours differ. If any run exceeds 120 s, say so in the ledger. The budget of 150 s stays.

The decision test "reproduces today's exact steering" still compares at 500 m, inside gun range, so full power does not apply there.

- [x] **Step 6: Digests.** Run `npx tsx .superpowers/7c/hash.ts > .superpowers/7c/hash-task6.txt`. The four no-pilot scenarios must still match `hash-task1.txt`. Task 7 compares its motion digests against this file.

- [x] **Step 7: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai/pilot.ts src/sim/ai/maneuverFlight.ts tests/render/aiReengage.test.ts tests/sim/ai/pilot.test.ts
git commit -m "7c: the pursuer re-engages after a missed head-on pass: full-power rejoin and full-power pursuit beyond gun range (7c Task 6)"
```

---

### Task 7: Named maneuvers, repertoire and the phase latch

**Files:**
- Create: `src/sim/ai/maneuvers.ts`, `tests/sim/ai/maneuvers.test.ts`
- Modify: `src/sim/ai/pilot.ts` (`ManeuverName`, `DEFAULT_MANEUVER`, `INTENT_OF`, `ManeuverLatch`, `repertoire`, the `named` and `latch` decision fields, `initialDecision`)
- Modify: `src/sim/ai/maneuverFlight.ts` (`Flown`, `flyManeuver`)
- Modify: `src/sim/ai/decision.ts` (`maneuverControls` flies `decision.named`)
- Modify: `src/sim/ai/pilotTick.ts` (selection, latch hold, expiry and interrupt; the safety override clears the latch)
- Test: `tests/sim/ai/pilot.test.ts` (append)

**Interfaces:**
- Produces, from `pilot.ts`:
  - `type ManeuverName`. In this task it is only `'lead-pursuit' | 'defensive-break' | 'extend'`; Tasks 8-11 each add their names.
  - `DEFAULT_MANEUVER: Readonly<Record<PilotManeuver, ManeuverName>>` and `INTENT_OF: Readonly<Record<ManeuverName, PilotManeuver>>`
  - `type ManeuverLatch = { name, phase, enteredAtS, entryHeadingRad, entryAltitudeM, loopCenter: Vec3, reversals, lastSide, lowestAltitudeM }`
  - `PilotSkill.repertoire: readonly ManeuverName[]`, `PilotDecisionState.named: ManeuverName` and `PilotDecisionState.latch: ManeuverLatch | null`
- Produces, from `maneuvers.ts`:
  - `LATCH_CAP_S = 20`
  - `type ManeuverFacts` and `maneuverFacts(self, target, facts, intent, heightAboveGroundM)`
  - `selectManeuver(m: ManeuverFacts, repertoire): ManeuverName`
  - `isPhased(name)`, `openLatch(name, self, nowS)`, `latchExpired(latch, nowS)` and `interruptsLatch(latch, intent, facts)`
- Produces, from `maneuverFlight.ts`: `type Flown = { controls: Controls; latch: ManeuverLatch | null }` and `flyManeuver(self, perceived, decision, nowS): Flown`
- Produces, from `decision.ts`: `maneuverControls(self, target, decision, skill, wind = null, nowS = 0)`

- [x] **Step 1: Write the failing tests.** Create `tests/sim/ai/maneuvers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  LATCH_CAP_S, interruptsLatch, isPhased, latchExpired, maneuverFacts, openLatch, selectManeuver,
} from '../../../src/sim/ai/maneuvers.js'
import { deriveFacts } from '../../../src/sim/ai/decision.js'
import { DEFAULT_MANEUVER, GREEN_SKILL, VETERAN_SKILL, initialDecision, type ManeuverLatch } from '../../../src/sim/ai/pilot.js'
import { pilotTick } from '../../../src/sim/ai/pilotTick.js'
import { createState } from '../../../src/sim/flight/state.js'
import { createWorldOf, type AircraftEntity } from '../../../src/sim/loop.js'
import { v3, ZERO } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const at = (id: string, position = v3(0, 3000, 0), velocity = v3(120, 0, 0)): AircraftEntity<undefined> => {
  const state = createState({ position, velocity })
  return { id, spec: f6f, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false }
}
const self = at('s')
const neutralTarget = at('t', v3(400, 3000, 0), v3(120, 0, 0))
const factsFor = (intent: 'pursue' | 'extend' | 'break') =>
  maneuverFacts(self, neutralTarget, deriveFacts(self, neutralTarget, 0, 1), intent, 3000)
const latch = (name: ManeuverLatch['name'], enteredAtS = 0): ManeuverLatch =>
  ({ name, phase: 0, enteredAtS, entryHeadingRad: 0, entryAltitudeM: 3000, loopCenter: ZERO, reversals: 0, lastSide: 0, lowestAltitudeM: 3000 })

describe('selectManeuver: 7b\'s intent in, a named maneuver out (7c spec §3.5)', () => {
  it('a plain picture gives each intent its default, which is 7b\'s regression floor', () => {
    for (const intent of ['pursue', 'extend', 'break'] as const) {
      expect(selectManeuver(factsFor(intent), VETERAN_SKILL.repertoire)).toBe(DEFAULT_MANEUVER[intent])
    }
  })

  it('an empty repertoire still flies the defaults', () => {
    expect(selectManeuver(factsFor('pursue'), [])).toBe('lead-pursuit')
  })
})

describe('the phase latch', () => {
  it('expires at LATCH_CAP_S', () => {
    expect(latchExpired(latch('extend', 5), 5 + LATCH_CAP_S - 1e-9)).toBe(false)
    expect(latchExpired(latch('extend', 5), 5 + LATCH_CAP_S)).toBe(true)
  })

  it('only a Break forced by a threat astern interrupts a non-Break latch', () => {
    const threat = { ...deriveFacts(self, neutralTarget, 0, 1), threatAstern: true }
    const calm = { ...threat, threatAstern: false }
    expect(interruptsLatch(latch('extend'), 'break', threat)).toBe(true)
    expect(interruptsLatch(latch('extend'), 'break', calm)).toBe(false)
    expect(interruptsLatch(latch('extend'), 'pursue', threat)).toBe(false)
    expect(interruptsLatch(latch('defensive-break'), 'break', threat)).toBe(false)
  })

  it('opens with the entry heading and altitude, phase 0, as plain data', () => {
    const l = openLatch('extend', at('s', v3(0, 2500, 0), v3(0, 0, 100)), 7)
    expect(l).toMatchObject({ name: 'extend', phase: 0, enteredAtS: 7, entryAltitudeM: 2500, reversals: 0, lastSide: 0 })
    expect(l.entryHeadingRad).toBeCloseTo(Math.PI / 2, 12)
    expect(structuredClone(l)).toEqual(l)
  })

  it('the three defaults are not phased', () => {
    for (const n of ['lead-pursuit', 'defensive-break', 'extend'] as const) expect(isPhased(n)).toBe(false)
  })

  it('a safety override clears any latch and names the intent\'s default (ruling R11)', () => {
    const low = { ...at('s', v3(0, 350, 0), v3(120, -10, 0)), pilot: { target: 't', skill: GREEN_SKILL, decision: { ...initialDecision(), nextRescoreS: 99, maneuver: 'extend' as const, named: 'extend' as const, latch: latch('extend') } } }
    const w = createWorldOf({ aircraft: [low, neutralTarget], player: 't' })
    const out = pilotTick(low, w.aircraft, { nowS: 1, terrain: null, decks: [], wind: null, combat: w.combat })
    expect(out.pilot!.decision.safety).toBe('recover')
    expect(out.pilot!.decision.latch).toBeNull()
    expect(out.pilot!.decision.named).toBe('extend')
    expect(out.pilot!.decision.maneuver).toBe('extend')
  })
})
```

Append to `tests/sim/ai/pilot.test.ts`:

```ts
describe('repertoire is skill data (7c spec §3.5; Mark 2026-09-25: green gets the basic set)', () => {
  it('both presets carry the three intent defaults', () => {
    for (const skill of [GREEN_SKILL, VETERAN_SKILL]) {
      for (const n of ['lead-pursuit', 'defensive-break', 'extend'] as const) expect(skill.repertoire).toContain(n)
    }
  })
})
```

- [x] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/maneuvers.test.ts tests/sim/ai/pilot.test.ts --maxWorkers=2`
Expected: FAIL, because `maneuvers.js` cannot be resolved.

- [x] **Step 3: The types and data in `pilot.ts`.** Add after `SafetyMode`:

```ts
/** A named maneuver (7c spec §3.5). Each belongs to one 7b intent
 *  (`INTENT_OF`). Tasks 8-11 of the 7c plan add the rest of the library. */
export type ManeuverName = 'lead-pursuit' | 'defensive-break' | 'extend'

export const DEFAULT_MANEUVER: Readonly<Record<PilotManeuver, ManeuverName>> = {
  pursue: 'lead-pursuit', break: 'defensive-break', extend: 'extend',
}
export const INTENT_OF: Readonly<Record<ManeuverName, PilotManeuver>> = {
  'lead-pursuit': 'pursue', 'defensive-break': 'break', extend: 'extend',
}

/**
 * A phased maneuver's memory (7c spec §3.5): once entered it holds until its
 * own end condition or LATCH_CAP_S, through rescores, so a split-S is not
 * re-decided halfway through every 0.3 s. Plain data. Nothing here refers to
 * the world clock at creation: `enteredAtS` is written only on entry.
 */
export type ManeuverLatch = {
  readonly name: ManeuverName
  readonly phase: number
  readonly enteredAtS: number
  /** atan2(v.z, v.x) of the velocity at entry. */
  readonly entryHeadingRad: number
  readonly entryAltitudeM: number
  /** Split-S and Immelmann: the loop's center, fixed at entry. ZERO otherwise. */
  readonly loopCenter: Vec3
  /** Scissors: roll-direction reversals so far, and the threat's last side (+1 right, -1 left, 0 unknown). */
  readonly reversals: number
  readonly lastSide: number
  /** Attack run: the lowest altitude reached, for the zoom's recovery. */
  readonly lowestAltitudeM: number
}
```

Add `readonly repertoire: readonly ManeuverName[]` to `PilotSkill`, with the doc comment `/** Which named maneuvers this pilot flies (master spec §7: "green versus veteran is data"). The intent defaults are always flown, listed or not. */`. Add `repertoire: ['lead-pursuit', 'defensive-break', 'extend'],` to both presets.

Add to `PilotDecisionState`: `readonly named: ManeuverName` (`/** The maneuver flown this tick, chosen at rescore within 'maneuver'. */`) and `readonly latch: ManeuverLatch | null`. Add `named: 'lead-pursuit', latch: null` to `initialDecision()`.

Update the two decision literals in `tests/sim/ai/decision.test.ts` to spread `initialDecision()`:

```ts
const decision: PilotDecisionState = {
  ...initialDecision(), maneuver: 'pursue', nextRescoreS: 999,
  observedTargetPosition: v3(500, 3000, 0), observedTargetVelocity: snapshotVelocity,
}
```

The second literal follows the same pattern. Remove the now-duplicated `noiseCursor` and `safety` keys.

- [x] **Step 4: `maneuvers.ts`.** Create `src/sim/ai/maneuvers.ts`:

```ts
import type { AircraftEntity } from '../loop.js'
import { length, sub, dot, v3, ZERO, type Vec3 } from '../math/vec3.js'
import type { DecisionFacts } from './decision.js'
import { airframeEnvelope, relativeEnvelope, type RelativeEnvelope } from './envelope.js'
import { DEFAULT_MANEUVER, INTENT_OF, type ManeuverLatch, type ManeuverName, type PilotManeuver } from './pilot.js'

/** Spec §3.5: a phased maneuver holds at most this long. */
export const LATCH_CAP_S = 20

/** Everything the selector reads, all live at the rescore instant, as 7b's
 *  intent facts are. */
export type ManeuverFacts = {
  readonly intent: PilotManeuver
  readonly facts: DecisionFacts
  readonly envelope: RelativeEnvelope
  readonly selfSpeedMps: number
  readonly targetSpeedMps: number
  readonly selfCornerSpeedMps: number
  readonly targetCornerSpeedMps: number
  readonly selfDiveSpeedMps: number
  readonly heightAboveGroundM: number
  readonly heightOverTargetM: number
  /** How fast the target's flight path is turning: |body pitch and yaw rates|. */
  readonly targetTurnRateRadPerS: number
  /** The target is behind our 3/9 line. */
  readonly threatBehind: boolean
  /** The angle between the two velocity vectors. */
  readonly velocityAngleRad: number
}

export function maneuverFacts<M>(
  self: AircraftEntity<M>, target: AircraftEntity<M>, facts: DecisionFacts, intent: PilotManeuver, heightAboveGroundM: number,
): ManeuverFacts {
  const mine = airframeEnvelope(self.spec, self.state)
  const theirs = airframeEnvelope(target.spec, target.state)
  const selfSpeedMps = length(self.state.velocity)
  const targetSpeedMps = length(target.state.velocity)
  const toTarget = sub(target.state.position, self.state.position)
  const denom = selfSpeedMps * targetSpeedMps
  return {
    intent, facts,
    envelope: relativeEnvelope(mine, theirs),
    selfSpeedMps, targetSpeedMps,
    selfCornerSpeedMps: mine.cornerSpeedMps,
    targetCornerSpeedMps: theirs.cornerSpeedMps,
    selfDiveSpeedMps: mine.diveSpeedMps,
    heightAboveGroundM,
    heightOverTargetM: self.state.position.y - target.state.position.y,
    targetTurnRateRadPerS: Math.hypot(target.state.bodyRates.y, target.state.bodyRates.z),
    threatBehind: dot(toTarget, self.state.velocity) < 0,
    velocityAngleRad: denom < 1e-9 ? 0 : Math.acos(Math.min(1, Math.max(-1, dot(self.state.velocity, target.state.velocity) / denom))),
  }
}

/** The named maneuver for this rescore. With nothing special in the picture
 *  it is the intent's default, which keeps 7b's regression floor. Tasks 8-11
 *  add one branch per maneuver. */
export function selectManeuver(m: ManeuverFacts, repertoire: readonly ManeuverName[]): ManeuverName {
  void repertoire
  return DEFAULT_MANEUVER[m.intent]
}

const PHASED: ReadonlySet<ManeuverName> = new Set<ManeuverName>([])
export const isPhased = (name: ManeuverName): boolean => PHASED.has(name)

export const latchExpired = (latch: ManeuverLatch, nowS: number): boolean => nowS - latch.enteredAtS >= LATCH_CAP_S

/** Spec §3.5: the only intent that interrupts a latch is a Break forced by a
 *  threat astern (safety overrides clear latches in pilotTick). */
export function interruptsLatch(latch: ManeuverLatch, intent: PilotManeuver, facts: DecisionFacts): boolean {
  return intent === 'break' && facts.threatAstern && INTENT_OF[latch.name] !== 'break'
}

/** Loop radius for a vertical maneuver at `speedMps` and `loadFactorG`:
 *  R = V^2 / (g (n - 1)). Used by the split-S and the Immelmann (Tasks 10, 11). */
export const loopRadiusM = (speedMps: number, loadFactorG: number): number =>
  (speedMps * speedMps) / (9.80665 * Math.max(0.5, loadFactorG - 1))

export function openLatch<M>(name: ManeuverName, self: AircraftEntity<M>, nowS: number): ManeuverLatch {
  const v = self.state.velocity
  const loopCenter: Vec3 = ZERO
  void v3
  return {
    name, phase: 0, enteredAtS: nowS,
    entryHeadingRad: Math.atan2(v.z, v.x),
    entryAltitudeM: self.state.position.y,
    loopCenter,
    reversals: 0, lastSide: 0,
    lowestAltitudeM: self.state.position.y,
  }
}
```

(The `void` lines keep lint quiet until Tasks 8 and 10 use `repertoire` and `v3`. Each of those tasks removes its `void`.)

- [x] **Step 5: `flyManeuver`.** In `src/sim/ai/maneuverFlight.ts`, import `type ManeuverLatch` and `type PilotDecisionState` from `./pilot.js`, and add:

```ts
/** A maneuver's controls this tick, and its latch afterwards: the same
 *  object while it continues, a new one on a phase change, null once it has
 *  ended. A non-phased maneuver returns null. */
export type Flown = { readonly controls: Controls; readonly latch: ManeuverLatch | null }

export function flyManeuver<M>(
  self: AircraftEntity<M>, perceived: AircraftEntity<M>, decision: PilotDecisionState, nowS: number,
): Flown {
  void nowS
  switch (decision.named) {
    case 'lead-pursuit': return { controls: leadPursuitControls(self, perceived), latch: null }
    case 'extend': return { controls: extendControls(self, perceived), latch: null }
    case 'defensive-break': return { controls: defensiveBreakControls(self, perceived), latch: null }
  }
}
```

Delete `intentControls`, since its only caller is `maneuverControls`. Remove the now-unused `type PilotManeuver` from the `pilot.js` import.

- [x] **Step 6: `maneuverControls` flies `named`.** In `decision.ts`, import `flyManeuver` (and no longer `intentControls`) and `DEFAULT_MANEUVER`. Replace the body after `perceived` with:

```ts
  const flown = flyManeuver(self, perceived, decision, nowS)
  const { controls, cursor } = finishControls(self, flown.controls, skill.controlNoise, decision.noiseCursor, wind)
  const ended = decision.latch !== null && flown.latch === null
  return {
    controls,
    decision: {
      ...decision, noiseCursor: cursor, latch: flown.latch,
      named: ended ? DEFAULT_MANEUVER[decision.maneuver] : decision.named,
    },
  }
```

Add the parameter `nowS = 0` after `wind`.

- [x] **Step 7: `pilotTick` selects, holds and interrupts.** In `pilotTick.ts`:
1. Import `maneuverFacts`, `selectManeuver`, `isPhased`, `openLatch`, `latchExpired` and `interruptsLatch` from `./maneuvers.js`.
2. Import `heightAboveGround` alongside the other `./safety.js` imports.
3. Import `DEFAULT_MANEUVER` from `./pilot.js`.
4. Replace the rescore block with:

```ts
  let decision = pilot.decision
  if (decision.latch !== null && latchExpired(decision.latch, ctx.nowS)) {
    decision = { ...decision, latch: null, named: DEFAULT_MANEUVER[decision.maneuver] }
  }
  if (ctx.nowS >= decision.nextRescoreS) {
    const facts = deriveFacts(a, target, 1 - record.damage.structure, a.state.fuelKg / a.spec.mass.fuelCapacityKg)
    const intent = decideManeuver(facts, pilot.skill)
    decision = {
      ...decision,
      nextRescoreS: ctx.nowS + pilot.skill.reactionS,
      observedTargetPosition: target.state.position,
      observedTargetVelocity: target.state.velocity,
    }
    // A latched maneuver holds through the rescore: perception still
    // refreshes (7d), the choice does not (spec §3.5).
    if (decision.latch === null || interruptsLatch(decision.latch, intent, facts)) {
      const named = selectManeuver(
        maneuverFacts(a, target, facts, intent, heightAboveGround(a.state, ctx.terrain, ctx.decks)), pilot.skill.repertoire,
      )
      decision = { ...decision, maneuver: intent, named, latch: isPhased(named) ? openLatch(named, a, ctx.nowS) : null }
    }
  }
```

5. In the override branch, add `latch: null, named: DEFAULT_MANEUVER[decision.maneuver],` to the returned decision.
6. Pass `ctx.nowS` as `maneuverControls`'s sixth argument.

- [x] **Step 8: Run the tests.**

Run: `npx vitest run tests/sim/ai tests/sim/entities.test.ts tests/sim/scenario.test.ts tests/render/aiLethality.test.ts tests/render/aiReengage.test.ts --maxWorkers=2`
Expected: PASS.

- [x] **Step 9: Behavior-neutral check.** Run `npx tsx .superpowers/7c/hash.ts`. Every **motion** digest (the second column) must equal `.superpowers/7c/hash-task6.txt`'s. The full digests of the pilot scenarios change, because the pilot now carries `named` and `latch` and the skill carries `repertoire`. The four no-pilot scenarios must keep both digests. A moved motion digest means this task changed flight: find why before committing.

- [x] **Step 10: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai tests/sim/ai
git commit -m "7c: named maneuvers, repertoire as skill data, and the phase latch; behavior-neutral (7c Task 7)"
```

---

### Task 8: Pursue family: lag pursuit, high yo-yo, low yo-yo

**Files:**
- Create: `tests/sim/ai/maneuverWorlds.ts`, `tests/sim/ai/pursueManeuvers.test.ts`
- Modify: `src/sim/ai/pilot.ts` (names, tables, repertoires), `src/sim/ai/maneuvers.ts` (the selector and `PHASED`) and `src/sim/ai/maneuverFlight.ts` (three flights)
- Test: `tests/sim/ai/maneuvers.test.ts` (append)

**Interfaces:**
- Produces: `ManeuverName` gains `'lag-pursuit' | 'high-yo-yo' | 'low-yo-yo'`. `GREEN_SKILL.repertoire` gains `'lag-pursuit'`, and `VETERAN_SKILL.repertoire` gains all three.
- Produces, from `maneuvers.ts`: `TARGET_TURNING_RAD_PER_S = 0.05`, `OVERSHOOT_RANGE_M = 600`, `OVERSHOOT_CLOSURE_MPS = 40`, `LOW_YOYO_RANGE_M = 400` and `LOW_YOYO_HEIGHT_MARGIN_M = 500`
- Produces, from `maneuverFlight.ts`: `LAG_DISTANCE_M = 150`, `LAG_END_CLOSURE_MPS = 15`, `HIGH_YOYO_CLIMB_M = 100`, `YOYO_TAIL_ANGLE_RAD = 30°` and `LOW_YOYO_DROP = 0.25`
- Produces, from `tests/sim/ai/maneuverWorlds.ts`:
  - `level(id, spec, position, velocity, pilot?)`
  - `pilotFor(target, skill, nextRescoreS?)` and `withRepertoire(skill, names)`
  - `ScriptedFlight`, with `straight`, `levelTurn(n, side)` and `chase(targetId)`
  - `runCanned(world, scripts, seconds, onTick): World`
  - `closureOf(self, other)` and `headingChangeRad(from, to)`

- [ ] **Step 1: The canned-world helpers.** Create `tests/sim/ai/maneuverWorlds.ts`:

```ts
import { advance, withControls, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { add, cross, dot, length, normalize, scale, sub, v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { controlsForLiftVector } from '../../../src/sim/ai/liftVector.js'
import { pursuitDesiredVelocity, type PilotAssignment } from '../../../src/sim/ai/pursuit.js'
import { initialDecision, type ManeuverName, type PilotSkill } from '../../../src/sim/ai/pilot.js'

/**
 * Canned geometries for the 7c maneuver signatures (spec §3.6): one AI pilot
 * in production `advance`, against a scripted aircraft. Each test asserts that
 * the maneuver was SELECTED and that its physical signature HAPPENED: two
 * different claims (7a's "fires" versus "hits" lesson).
 */
export function level(id: string, spec: AircraftSpec, position: Vec3, velocity: Vec3, pilot?: PilotAssignment): AircraftEntity<undefined> {
  const state = createState({ position, velocity, attitude: qFromAxisAngle(v3(0, 1, 0), Math.atan2(-velocity.z, velocity.x)) })
  return { id, spec, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false, pilot }
}

export const pilotFor = (target: string, skill: PilotSkill, nextRescoreS = 0): PilotAssignment =>
  ({ target, skill, decision: { ...initialDecision(), nextRescoreS } })

/** A skill whose repertoire is exactly `names`, so a test isolates one maneuver. */
export const withRepertoire = (skill: PilotSkill, names: readonly ManeuverName[]): PilotSkill => ({ ...skill, repertoire: names })

export type ScriptedFlight = (self: AircraftEntity<undefined>, world: World<undefined>) => Controls
export const straight: ScriptedFlight = () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0.7 })

/** A sustained level turn at `n` g, left (-1) or right (+1). */
export const levelTurn = (n: number, side: 1 | -1): ScriptedFlight => (a) => {
  const right = normalize(cross(a.state.velocity, v3(0, 1, 0)))
  const lift = add(v3(0, 1, 0), scale(right, side * Math.sqrt(Math.max(0, n * n - 1))))
  return controlsForLiftVector(a.state, a.spec, lift, n, 1)
}

/** Lead pursuit of `targetId`, never firing: a scripted attacker. */
export const chase = (targetId: string): ScriptedFlight => (a, w) =>
  controlsForDesiredVelocity(a.state, a.spec, pursuitDesiredVelocity(a, w.aircraft.find((x) => x.id === targetId)!))

/** Advance `seconds`, applying each scripted aircraft's controls before
 *  every tick. `onTick` sees the world after each tick. */
export function runCanned(
  world: World<undefined>, scripts: Readonly<Record<string, ScriptedFlight>>, seconds: number,
  onTick: (w: World<undefined>) => void,
): World<undefined> {
  let w = world
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    for (const [id, script] of Object.entries(scripts)) {
      w = withControls(w, id, script(w.aircraft.find((a) => a.id === id)!, w))
    }
    w = advance(w, DT).world
    onTick(w)
  }
  return w
}

/** 7b's closing rate: our velocity along the line to the other. */
export function closureOf(self: AircraftEntity<undefined>, other: AircraftEntity<undefined>): number {
  const to = sub(other.state.position, self.state.position)
  const r = length(to)
  return r < 1e-6 ? 0 : dot(to, self.state.velocity) / r
}

export const headingChangeRad = (from: number, to: number): number => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)))
```

- [ ] **Step 2: Write the failing selector unit tests.** Append to `tests/sim/ai/maneuvers.test.ts`:

```ts
describe('Pursue family selection (Task 8)', () => {
  const base = factsFor('pursue')
  const turning = { ...base, targetTurnRateRadPerS: 0.2 }
  const overshoot = { ...turning, facts: { ...base.facts, rangeM: 400, closingRate: 60 } }

  it('overshoot risk with an energy margin: high yo-yo if in the repertoire, else lag', () => {
    expect(selectManeuver({ ...overshoot, facts: { ...overshoot.facts, relativeEnergyJPerKg: 100 } }, VETERAN_SKILL.repertoire)).toBe('high-yo-yo')
    expect(selectManeuver({ ...overshoot, facts: { ...overshoot.facts, relativeEnergyJPerKg: 100 } }, GREEN_SKILL.repertoire)).toBe('lag-pursuit')
  })

  it('overshoot risk with no energy margin: lag', () => {
    expect(selectManeuver({ ...overshoot, facts: { ...overshoot.facts, relativeEnergyJPerKg: -100 } }, VETERAN_SKILL.repertoire)).toBe('lag-pursuit')
  })

  it('no overshoot unless the target is turning', () => {
    expect(selectManeuver({ ...overshoot, targetTurnRateRadPerS: 0 }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
  })

  it('falling behind a turning target, with height to spare: low yo-yo; without the height: lead', () => {
    const behind = { ...turning, facts: { ...base.facts, rangeM: 700, closingRate: -10 } }
    expect(selectManeuver({ ...behind, heightAboveGroundM: 3000 }, VETERAN_SKILL.repertoire)).toBe('low-yo-yo')
    expect(selectManeuver({ ...behind, heightAboveGroundM: 700 }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
    expect(selectManeuver({ ...behind, heightAboveGroundM: 3000 }, GREEN_SKILL.repertoire)).toBe('lead-pursuit')
  })

  it('all three are phased', () => {
    for (const n of ['lag-pursuit', 'high-yo-yo', 'low-yo-yo'] as const) expect(isPhased(n)).toBe(true)
  })
})
```

- [ ] **Step 3: Write the failing signature tests.** Create `tests/sim/ai/pursueManeuvers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GREEN_SKILL, VETERAN_SKILL, type ManeuverName } from '../../../src/sim/ai/pilot.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../../src/sim/ai/decision.js'
import { hasGunSolution } from '../../../src/sim/ai/pursuit.js'
import { createWorldOf, type World } from '../../../src/sim/loop.js'
import { length, sub, v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { closureOf, level, levelTurn, pilotFor, runCanned, withRepertoire } from './maneuverWorlds.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const P = 'p', T = 't'
const self = (w: World<undefined>) => w.aircraft.find((a) => a.id === P)!
const other = (w: World<undefined>) => w.aircraft.find((a) => a.id === T)!

/** The pilot starts fast behind a target in a 3 g left turn. Its first
 *  rescore is at 1 s, when the target is already turning. If the named
 *  maneuver is never selected, print the first rescore's facts and move the
 *  START (range, speeds), never the thresholds, and record the change in the
 *  ledger. */
function overshootWorld(skill: typeof GREEN_SKILL, pilotSpeed = 170) {
  return createWorldOf({
    aircraft: [
      level(P, f6f, v3(0, 3000, 0), v3(pilotSpeed, 0, 0), pilotFor(T, skill, 1.0)),
      level(T, f6f, v3(450, 3000, 0), v3(110, 0, 0)),
    ],
    player: T,
  })
}

describe('lag pursuit (7c spec §3.5)', () => {
  it('green, overshooting a turning target: selected, closure falls, range stays above MIN_ENGAGEMENT_RANGE_M', () => {
    const m = { selected: false, entryClosure: 0, lastClosure: 0, minRange: Infinity }
    runCanned(overshootWorld(GREEN_SKILL), { [T]: levelTurn(3, -1) }, 20, (w) => {
      const d = self(w).pilot!.decision
      if (d.named !== 'lag-pursuit') return
      const c = closureOf(self(w), other(w))
      if (!m.selected) { m.selected = true; m.entryClosure = c }
      m.lastClosure = c
      m.minRange = Math.min(m.minRange, length(sub(other(w).state.position, self(w).state.position)))
    })
    expect(m.selected).toBe(true)
    expect(m.lastClosure).toBeLessThan(m.entryClosure)
    expect(m.minRange).toBeGreaterThan(MIN_ENGAGEMENT_RANGE_M)
  })
})

describe('high yo-yo', () => {
  it('veteran with energy to spare: selected, climbs at least 100 m, closure falls, then the gun cone comes back', () => {
    const skill = withRepertoire(VETERAN_SKILL, ['lead-pursuit', 'high-yo-yo', 'defensive-break', 'extend'] as ManeuverName[])
    const m = { selected: false, entryY: 0, peakY: -Infinity, peakTick: 0, entryClosure: 0, minClosure: Infinity, coneAfterPeak: false }
    runCanned(overshootWorld(skill), { [T]: levelTurn(3, -1) }, 25, (w) => {
      const s = self(w)
      if (s.pilot!.decision.named === 'high-yo-yo') {
        if (!m.selected) { m.selected = true; m.entryY = s.state.position.y; m.entryClosure = closureOf(s, other(w)) }
        if (s.state.position.y > m.peakY) { m.peakY = s.state.position.y; m.peakTick = w.tick }
        m.minClosure = Math.min(m.minClosure, closureOf(s, other(w)))
      }
      if (m.selected && w.tick > m.peakTick && hasGunSolution(s, other(w))) m.coneAfterPeak = true
    })
    expect(m.selected).toBe(true)
    expect(m.peakY - m.entryY).toBeGreaterThanOrEqual(100)
    expect(m.minClosure).toBeLessThan(m.entryClosure)
    expect(m.coneAfterPeak).toBe(true)
  })
})

describe('low yo-yo', () => {
  it('veteran falling behind a faster turning target: selected, descends, closure turns positive', () => {
    const skill = withRepertoire(VETERAN_SKILL, ['lead-pursuit', 'low-yo-yo', 'defensive-break', 'extend'] as ManeuverName[])
    const world = createWorldOf({
      aircraft: [
        level(P, f6f, v3(0, 3150, 0), v3(115, 0, 0), pilotFor(T, skill, 1.0)),
        level(T, f6f, v3(700, 3000, 0), v3(125, 0, 0)),
      ],
      player: T,
    })
    const m = { selected: false, entryY: 0, minY: Infinity, positiveClosure: false }
    runCanned(world, { [T]: levelTurn(3, -1) }, 25, (w) => {
      const s = self(w)
      if (s.pilot!.decision.named !== 'low-yo-yo') return
      if (!m.selected) { m.selected = true; m.entryY = s.state.position.y }
      m.minY = Math.min(m.minY, s.state.position.y)
      if (closureOf(s, other(w)) > 0) m.positiveClosure = true
    })
    expect(m.selected).toBe(true)
    expect(m.minY).toBeLessThan(m.entryY)
    expect(m.positiveClosure).toBe(true)
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/maneuvers.test.ts tests/sim/ai/pursueManeuvers.test.ts --maxWorkers=2`
Expected: FAIL. TypeScript rejects `'high-yo-yo'` as a `ManeuverName`, and the selector returns only the defaults.

- [ ] **Step 5: Names and repertoire.** In `pilot.ts`, extend `ManeuverName` with `| 'lag-pursuit' | 'high-yo-yo' | 'low-yo-yo'`. Add `'lag-pursuit': 'pursue', 'high-yo-yo': 'pursue', 'low-yo-yo': 'pursue'` to `INTENT_OF`. Set `GREEN_SKILL.repertoire = ['lead-pursuit', 'lag-pursuit', 'defensive-break', 'extend']` (Mark, 2026-09-25: green never goes vertical). Add all three to `VETERAN_SKILL.repertoire`.

- [ ] **Step 6: Selection.** In `maneuvers.ts`, remove `void repertoire`, and add:

```ts
/** Tuning values from spec §3.5's table; measured in the Task 8 signature
 *  tests. A target is "turning" above about 3°/s. */
export const TARGET_TURNING_RAD_PER_S = 0.05
export const OVERSHOOT_RANGE_M = 600
export const OVERSHOOT_CLOSURE_MPS = 40
export const LOW_YOYO_RANGE_M = 400
export const LOW_YOYO_HEIGHT_MARGIN_M = 500
```

Import `FLOOR_M` from `./safety.js`. Replace `selectManeuver`'s body with:

```ts
  const has = (n: ManeuverName): boolean => repertoire.includes(n)
  const f = m.facts
  if (m.intent === 'pursue') {
    const turning = m.targetTurnRateRadPerS >= TARGET_TURNING_RAD_PER_S
    const overshoot = turning && f.rangeM < OVERSHOOT_RANGE_M && f.closingRate > OVERSHOOT_CLOSURE_MPS
    if (overshoot && has('high-yo-yo') && f.relativeEnergyJPerKg >= 0) return 'high-yo-yo'
    if (overshoot && has('lag-pursuit')) return 'lag-pursuit'
    if (turning && has('low-yo-yo') && f.rangeM > LOW_YOYO_RANGE_M && f.closingRate < 0 &&
        m.heightAboveGroundM >= FLOOR_M + LOW_YOYO_HEIGHT_MARGIN_M) return 'low-yo-yo'
  }
  return DEFAULT_MANEUVER[m.intent]
```

Set `PHASED` to `new Set<ManeuverName>(['lag-pursuit', 'high-yo-yo', 'low-yo-yo'])`. Lag pursuit is latched per ruling R12.

- [ ] **Step 7: The flights.** In `maneuverFlight.ts`, add the imports `add`, `dot`, `normalize`, `scale` and `v3` from `../math/vec3.js`, and `controlsForLiftVector` from `./liftVector.js`. Add:

```ts
const UP = v3(0, 1, 0)
/** Our closing rate on `other`, 7b's definition (`deriveFacts`). */
const closure = <M>(self: AircraftEntity<M>, other: AircraftEntity<M>): number => {
  const to = sub(other.state.position, self.state.position)
  const r = length(to)
  return r < 1e-6 ? 0 : dot(to, self.state.velocity) / r
}
const withGate = <M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, c: Controls): Controls =>
  hasGunSolution(self, perceived) ? { ...c, fire: true } : c

/** Lag pursuit (spec §3.5): aim at a point this far behind the target along
 *  its track, at the target's speed, to stop an overshoot; the gun gate stays
 *  live. Ends once closure is under LAG_END_CLOSURE_MPS. */
export const LAG_DISTANCE_M = 150
export const LAG_END_CLOSURE_MPS = 15
export function flyLagPursuit<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const tv = perceived.state.velocity
  const ts = length(tv)
  const behind = ts > 1e-6 ? sub(perceived.state.position, scale(tv, LAG_DISTANCE_M / ts)) : perceived.state.position
  const to = sub(behind, self.state.position)
  const desired = length(to) < 1e-6 ? tv : scale(normalize(to), Math.max(ts, 60))
  const controls = withGate(self, perceived, steerToward(self.state, self.spec, desired, loadFactorBudget(self.spec)))
  return { controls, latch: closure(self, perceived) < LAG_END_CLOSURE_MPS ? null : latch }
}

/** High yo-yo: phase 0 pulls the lift vector above the target's plane at the
 *  G budget and full power until HIGH_YOYO_CLIMB_M is gained; phase 1 rolls
 *  back down into lead pursuit. Ends within YOYO_TAIL_ANGLE_RAD of the
 *  target's tail. */
export const HIGH_YOYO_CLIMB_M = 100
export const YOYO_TAIL_ANGLE_RAD = 30 * Math.PI / 180
function nearTail<M>(self: AircraftEntity<M>, target: AircraftEntity<M>): boolean {
  const back = scale(target.state.velocity, -1)
  const toSelf = sub(self.state.position, target.state.position)
  const d = length(back) * length(toSelf)
  return d > 1e-9 && Math.acos(Math.min(1, Math.max(-1, dot(back, toSelf) / d))) < YOYO_TAIL_ANGLE_RAD
}
export function flyHighYoYo<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  if (latch.phase === 0) {
    const toTarget = normalize(sub(perceived.state.position, self.state.position))
    const lift = add(scale(UP, 1.5), toTarget)
    const controls = controlsForLiftVector(self.state, self.spec, lift, loadFactorBudget(self.spec), 1)
    const climbed = self.state.position.y - latch.entryAltitudeM >= HIGH_YOYO_CLIMB_M
    return { controls, latch: climbed ? { ...latch, phase: 1 } : latch }
  }
  return { controls: leadPursuitControls(self, perceived), latch: nearTail(self, perceived) ? null : latch }
}

/** Low yo-yo: the nose inside the target's turn and below its plane, the lead
 *  line tipped down by LOW_YOYO_DROP of its speed, full power, gun gate
 *  live. Ends once closure turns positive. */
export const LOW_YOYO_DROP = 0.25
export function flyLowYoYo<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const lead = pursuitDesiredVelocity(self, perceived)
  const speed = length(lead)
  const dipped = speed < 1e-6 ? lead : scale(normalize(sub(normalize(lead), scale(UP, LOW_YOYO_DROP))), speed)
  const controls = withGate(self, perceived, { ...steerToward(self.state, self.spec, dipped, loadFactorBudget(self.spec)), throttle: 1 })
  return { controls, latch: closure(self, perceived) > 0 ? null : latch }
}
```

In `flyManeuver`, add these cases. A latched maneuver always has its latch, and the `!` states that invariant:

```ts
    case 'lag-pursuit': return flyLagPursuit(self, perceived, decision.latch!)
    case 'high-yo-yo': return flyHighYoYo(self, perceived, decision.latch!)
    case 'low-yo-yo': return flyLowYoYo(self, perceived, decision.latch!)
```

`pilotTick` guarantees the invariant, because `openLatch` runs whenever `isPhased(named)`. If the repo's lint rules forbid the non-null assertion, guard instead with `if (decision.latch === null) return { controls: leadPursuitControls(self, perceived), latch: null }` above the switch, for the phased names only.

- [ ] **Step 8: Run the tests, and measure.**

Run: `npx vitest run tests/sim/ai/maneuvers.test.ts tests/sim/ai/pursueManeuvers.test.ts --maxWorkers=2`
Expected: PASS. Log each signature's numbers (entry and exit closure, climb, dip), then write them into each `it`'s comment with today's date, and remove the log.

If a test fails on selection, follow `overshootWorld`'s comment: move the start geometry and record the move in the ledger. If it fails on the signature, the flight is wrong. Fix the flight function, and only change its tuning constant with a measured reason in the constant's comment.

- [ ] **Step 9: The regression gate.**

Run: `npx vitest run tests/render/aiLethality.test.ts tests/render/aiSafety.test.ts tests/render/aiReengage.test.ts tests/sim/pursuitMerge.test.ts tests/sim/zeroMerge.test.ts tests/sim/scenario.test.ts tests/sim/entities.test.ts --maxWorkers=2`
Expected: PASS. Green now flies lag pursuit in the 7d evasion, which is a turning target. Item 3's time-behind and the soak's peaks may move. Record the new values, and stop and report if a gate goes red.

- [ ] **Step 10: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai tests/sim/ai
git commit -m "7c: lag pursuit, high yo-yo and low yo-yo, each selected and flown to its signature (7c Task 8)"
```

---
### Task 9: The attack run

**Files:**
- Create: `tests/sim/ai/attackRun.test.ts`
- Modify: `src/sim/ai/pilot.ts`, `src/sim/ai/maneuvers.ts` and `src/sim/ai/maneuverFlight.ts`
- Test: `tests/sim/ai/maneuvers.test.ts` (append)

**Interfaces:**
- Produces: `ManeuverName` gains `'attack-run'` (Pursue), and `VETERAN_SKILL.repertoire` gains it. Green's does not: an attack run is vertical.
- Produces, from `maneuverFlight.ts`: `ATTACK_RUN_HEIGHT_M = 300`, `PASS_RANGE_M = 150`, `ZOOM_CLIMB_RAD = 30°`, `ZOOM_START_VY_MPS = 20`, `ZOOM_END_VY_MPS = 5` and `flyAttackRun`

- [ ] **Step 1: Write the failing tests.** Append to `tests/sim/ai/maneuvers.test.ts`:

```ts
describe('attack run selection (Task 9)', () => {
  const base = factsFor('pursue')
  const high = { ...base, heightOverTargetM: 300 }

  it('boom-and-zoom or neutral, 300 m or more above the target: attack run', () => {
    expect(selectManeuver({ ...high, envelope: { ...base.envelope, pairing: 'boom-and-zoom' } }, VETERAN_SKILL.repertoire)).toBe('attack-run')
    expect(selectManeuver({ ...high, envelope: { ...base.envelope, pairing: 'neutral' } }, VETERAN_SKILL.repertoire)).toBe('attack-run')
  })

  it('never for a better turner, never below 300 m of height advantage, never for green', () => {
    expect(selectManeuver({ ...high, envelope: { ...base.envelope, pairing: 'turnfight' } }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
    expect(selectManeuver({ ...base, heightOverTargetM: 299 }, VETERAN_SKILL.repertoire)).toBe('lead-pursuit')
    expect(selectManeuver(high, GREEN_SKILL.repertoire)).toBe('lead-pursuit')
  })
})
```

Create `tests/sim/ai/attackRun.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { VETERAN_SKILL, type ManeuverName } from '../../../src/sim/ai/pilot.js'
import { createWorldOf, type World } from '../../../src/sim/loop.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { level, pilotFor, runCanned, straight, withRepertoire } from './maneuverWorlds.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const self = (w: World<undefined>) => w.aircraft.find((a) => a.id === 'p')!

describe('attack run (7c spec §3.5)', () => {
  it('a veteran Hellcat 1,000 m above a Zero (boom-and-zoom): selected, fires in the dive, zooms back at least 60% of the height lost', () => {
    const skill = withRepertoire(VETERAN_SKILL, ['lead-pursuit', 'attack-run', 'defensive-break', 'extend'] as ManeuverName[])
    const world = createWorldOf({
      aircraft: [
        level('p', f6f, v3(-1500, 4000, 0), v3(130, 0, 0), pilotFor('t', skill)),
        level('t', zero, v3(0, 3000, 0), v3(110, 0, 0)),
      ],
      player: 't',
    })
    const m = { selected: false, entryY: 0, lowest: Infinity, lowestTick: 0, highestAfter: -Infinity, firedInDescent: false, lastShots: 0 }
    runCanned(world, { t: straight }, 40, (w) => {
      const s = self(w)
      const d = s.pilot!.decision
      const shots = w.combat.aircraft['p']!.shots
      if (d.named === 'attack-run') {
        if (!m.selected) { m.selected = true; m.entryY = s.state.position.y }
        if (d.latch?.phase === 0 && s.state.velocity.y < 0 && shots > m.lastShots) m.firedInDescent = true
      }
      if (m.selected) {
        if (s.state.position.y < m.lowest) { m.lowest = s.state.position.y; m.lowestTick = w.tick; m.highestAfter = -Infinity }
        if (w.tick > m.lowestTick) m.highestAfter = Math.max(m.highestAfter, s.state.position.y)
      }
      m.lastShots = shots
    })
    expect(m.selected).toBe(true)
    expect(m.firedInDescent).toBe(true)
    const lost = m.entryY - m.lowest
    expect(lost).toBeGreaterThan(0)
    expect(m.highestAfter - m.lowest).toBeGreaterThanOrEqual(0.6 * lost)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/maneuvers.test.ts tests/sim/ai/attackRun.test.ts --maxWorkers=2`
Expected: FAIL: `'attack-run'` is not a `ManeuverName`.

- [ ] **Step 3: Implement.**
- In `pilot.ts`: add `| 'attack-run'` to `ManeuverName`, add `'attack-run': 'pursue'` to `INTENT_OF`, and add `'attack-run'` to `VETERAN_SKILL.repertoire`.
- In `maneuvers.ts`: import `ATTACK_RUN_HEIGHT_M` from `./maneuverFlight.js`, add `'attack-run'` to `PHASED`, and make this the FIRST line inside `if (m.intent === 'pursue') {`:

```ts
    if (has('attack-run') && m.envelope.pairing !== 'turnfight' && m.heightOverTargetM >= ATTACK_RUN_HEIGHT_M) return 'attack-run'
```

In `maneuverFlight.ts`, add:

```ts
/** Attack run (spec §3.5): for a boom-and-zoom or neutral pairing with a
 *  height advantage. Phase 0 dives onto the lead point at full power with
 *  the gun gate live, until level with the target, within PASS_RANGE_M, or
 *  past it. Phase 1 pulls up at the G budget until climbing at
 *  ZOOM_START_VY_MPS. Phase 2 zooms on a ZOOM_CLIMB_RAD line toward the
 *  target until the climb is spent (ZOOM_END_VY_MPS) or the height
 *  advantage is back. */
export const ATTACK_RUN_HEIGHT_M = 300
export const PASS_RANGE_M = 150
export const ZOOM_CLIMB_RAD = 30 * Math.PI / 180
export const ZOOM_START_VY_MPS = 20
export const ZOOM_END_VY_MPS = 5
export function flyAttackRun<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const y = self.state.position.y
  const lowestAltitudeM = Math.min(latch.lowestAltitudeM, y)
  const to = sub(perceived.state.position, self.state.position)
  if (latch.phase === 0) {
    const passed = y <= perceived.state.position.y || length(to) < PASS_RANGE_M || closure(self, perceived) < 0
    const controls = { ...leadPursuitControls(self, perceived), throttle: 1 }
    return { controls, latch: { ...latch, lowestAltitudeM, phase: passed ? 1 : 0 } }
  }
  const n = loadFactorBudget(self.spec)
  if (latch.phase === 1) {
    const controls = controlsForLiftVector(self.state, self.spec, UP, n, 1)
    return { controls, latch: { ...latch, lowestAltitudeM, phase: self.state.velocity.y >= ZOOM_START_VY_MPS ? 2 : 1 } }
  }
  const flat = length(v3(to.x, 0, to.z)) > 1e-6 ? normalize(v3(to.x, 0, to.z)) : normalize(v3(self.state.velocity.x, 0, self.state.velocity.z))
  const line = v3(flat.x * Math.cos(ZOOM_CLIMB_RAD), Math.sin(ZOOM_CLIMB_RAD), flat.z * Math.cos(ZOOM_CLIMB_RAD))
  const controls = { ...steerToward(self.state, self.spec, scale(line, Math.max(length(self.state.velocity), 60)), n), throttle: 1 }
  const done = self.state.velocity.y <= ZOOM_END_VY_MPS || y >= perceived.state.position.y + ATTACK_RUN_HEIGHT_M
  return { controls, latch: done ? null : { ...latch, lowestAltitudeM } }
}
```

Add `case 'attack-run': return flyAttackRun(self, perceived, decision.latch!)` to `flyManeuver`.

- [ ] **Step 4: Run the tests and measure.** Run the command from Step 2, and expect PASS. Record the entry height, the lowest point, the zoom's recovery fraction and the tick of the first shot in the test's comment, with today's date. Follow Task 8 Step 8's rule if selection or the signature fails.

- [ ] **Step 5: The regression gate.** Run Task 8 Step 9's command. Expected: PASS. `pursuit-range` starts level, so no shipped scenario should select an attack run. Confirm that by counting `named === 'attack-run'` ticks in a 120 s run of both shipped pursuit scenarios; expect 0, and record the count.

- [ ] **Step 6: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai tests/sim/ai
git commit -m "7c: the attack run, gated by the airframe envelope (7c Task 9)"
```

---

### Task 10: Break family: scissors and split-S, and the envelope gate

**Files:**
- Create: `tests/sim/ai/breakManeuvers.test.ts`
- Modify: `src/sim/ai/pilot.ts`, `src/sim/ai/maneuvers.ts` (selection, `PHASED`, `openLatch`'s loop center) and `src/sim/ai/maneuverFlight.ts`
- Test: `tests/sim/ai/maneuvers.test.ts` (append)

**Interfaces:**
- Produces: `ManeuverName` gains `'scissors' | 'split-s'` (Break), and `VETERAN_SKILL.repertoire` gains both.
- Produces, from `maneuvers.ts`: `SCISSORS_RANGE_M = 300`, `SCISSORS_ANGLE_RAD = 45°`, `SPLIT_S_MIN_HEIGHT_M = 1500` and `SPLIT_S_MAX_SPEED_FRACTION = 0.6`
- Produces, from `maneuverFlight.ts`: `SCISSORS_THROTTLE = 0.4`, `SPLIT_S_THROTTLE = 0.3`, `REVERSAL_DONE_RAD = 150°`, `LEVEL_EXIT_MIN_CLIMB = -0.2`, `flyScissors` and `flySplitS`

- [ ] **Step 1: Write the failing tests.** First append two shared fixtures to `tests/sim/ai/maneuverWorlds.ts`. Task 12 reuses them, and a test file must never import another test file, because its tests would register twice. Add `import { VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'` (merged into that file's existing `pilot.js` import), `import { createWorldOf } from '../../../src/sim/loop.js'` (merged likewise) and `import { loadAircraftSpec } from '../../../tools/content/load.js'`:

```ts
export const BREAK_SET: readonly ManeuverName[] = ['lead-pursuit', 'defensive-break', 'scissors', 'split-s', 'extend']

/** A veteran F6F at 110 m/s with a faster Hellcat 250 m dead astern, nose on:
 *  Break (the threat's nose is on us), threat astern, 3,000 m up, below
 *  0.6 x 216 m/s. No scissors: the threat is above its 120 m/s corner speed. */
export function splitSWorld(): World<undefined> {
  const f6f = loadAircraftSpec('f6f-hellcat')
  return createWorldOf({
    aircraft: [
      level('p', f6f, v3(0, 3000, 0), v3(110, 0, 0), pilotFor('t', withRepertoire(VETERAN_SKILL, BREAK_SET))),
      level('t', f6f, v3(-250, 3000, 0), v3(130, 0, 0)),
    ],
    player: 't',
  })
}
```

Then append to `tests/sim/ai/maneuvers.test.ts`:

```ts
describe('Break family selection (Task 10)', () => {
  const base = factsFor('break')
  const scissorsPicture = {
    ...base, threatBehind: true, velocityAngleRad: 0.1, selfSpeedMps: 88, targetSpeedMps: 100,
    selfCornerSpeedMps: 92.26, targetCornerSpeedMps: 119.98,
    facts: { ...base.facts, rangeM: 150 },
    envelope: { ...base.envelope, turnAdvantage: 1.6, pairing: 'turnfight' as const },
  }

  it('scissors: threat close behind, near-parallel, both below corner speed, and we out-turn it', () => {
    expect(selectManeuver(scissorsPicture, VETERAN_SKILL.repertoire)).toBe('scissors')
  })

  it('no scissors against a better turner (the envelope gate), nor above corner speed, nor for green', () => {
    expect(selectManeuver({ ...scissorsPicture, envelope: { ...scissorsPicture.envelope, turnAdvantage: 0.63, pairing: 'boom-and-zoom' } }, VETERAN_SKILL.repertoire)).not.toBe('scissors')
    expect(selectManeuver({ ...scissorsPicture, targetSpeedMps: 130 }, VETERAN_SKILL.repertoire)).not.toBe('scissors')
    expect(selectManeuver(scissorsPicture, GREEN_SKILL.repertoire)).toBe('defensive-break')
  })

  const splitPicture = {
    ...base, threatBehind: true, heightAboveGroundM: 3000, selfSpeedMps: 110, selfDiveSpeedMps: 216,
    facts: { ...base.facts, threatAstern: true, rangeM: 250 },
  }

  it('split-S: threat astern in gun range, height to spare, below 0.6 x the dive limit', () => {
    expect(selectManeuver(splitPicture, VETERAN_SKILL.repertoire)).toBe('split-s')
  })

  it('no split-S below 1,500 m, too fast, or with the threat AHEAD (a head-on pass, ruling R12)', () => {
    expect(selectManeuver({ ...splitPicture, heightAboveGroundM: 1499 }, VETERAN_SKILL.repertoire)).toBe('defensive-break')
    expect(selectManeuver({ ...splitPicture, selfSpeedMps: 130 }, VETERAN_SKILL.repertoire)).toBe('defensive-break')
    expect(selectManeuver({ ...splitPicture, threatBehind: false }, VETERAN_SKILL.repertoire)).toBe('defensive-break')
  })
})
```

Create `tests/sim/ai/breakManeuvers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'
import { FLOOR_M } from '../../../src/sim/ai/safety.js'
import { createWorldOf, type World } from '../../../src/sim/loop.js'
import { dot, sub, v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { BREAK_SET, chase, headingChangeRad, level, pilotFor, runCanned, splitSWorld, straight, withRepertoire } from './maneuverWorlds.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const self = (w: World<undefined>) => w.aircraft.find((a) => a.id === 'p')!
const other = (w: World<undefined>) => w.aircraft.find((a) => a.id === 't')!

/** A veteran `pilotSpec` pilot below its corner speed, with a `threatSpec`
 *  chaser 150 m behind and 30 m to the side, also below its corner speed. */
const scissorsWorld = (pilotSpec: typeof f6f, pilotSpeed: number, threatSpec: typeof f6f, threatSpeed: number) => createWorldOf({
  aircraft: [
    level('p', pilotSpec, v3(0, 3000, 0), v3(pilotSpeed, 0, 0), pilotFor('t', withRepertoire(VETERAN_SKILL, BREAK_SET))),
    level('t', threatSpec, v3(-150, 3000, 30), v3(threatSpeed, 0, 0)),
  ],
  player: 't',
})

describe('split-S (7c spec §3.5)', () => {
  it('selected, reverses heading by 150°+, loses 400-1,500 m, stays within gLimit and above the floor', () => {
    const m = { entry: null as null | { heading: number; y: number }, exitHeading: 0, exitY: 0, done: false, peakG: 0, lowest: Infinity }
    runCanned(splitSWorld(), { t: straight }, 20, (w) => {
      const s = self(w)
      const d = s.pilot!.decision
      m.lowest = Math.min(m.lowest, s.state.position.y)
      if (d.named === 'split-s' && d.latch !== null) {
        if (m.entry === null) m.entry = { heading: d.latch.entryHeadingRad, y: d.latch.entryAltitudeM }
        m.peakG = Math.max(m.peakG, w.combat.aircraft['p']!.stress.loadFactorG)
      } else if (m.entry !== null && !m.done) {
        m.done = true
        m.exitHeading = Math.atan2(s.state.velocity.z, s.state.velocity.x)
        m.exitY = s.state.position.y
      }
    })
    expect(m.entry, 'split-S never selected').not.toBeNull()
    expect(m.done, 'split-S never ended').toBe(true)
    expect(headingChangeRad(m.entry!.heading, m.exitHeading)).toBeGreaterThanOrEqual(150 * Math.PI / 180)
    const lost = m.entry!.y - m.exitY
    expect(lost).toBeGreaterThanOrEqual(400)
    expect(lost).toBeLessThanOrEqual(1500)
    expect(m.peakG).toBeLessThanOrEqual(f6f.limits.gLimit)
    expect(m.lowest).toBeGreaterThanOrEqual(FLOOR_M)
  })
})

describe('scissors, and the envelope gate (7c spec §3.6)', () => {
  it('a veteran Zero chased by a Hellcat: selected, at least 2 roll reversals in 12 s, and the Hellcat ends up ahead', () => {
    const m = { enteredTick: null as number | null, reversals: 0, lastSign: 0, threatAhead: false }
    runCanned(scissorsWorld(zero, 88, f6f, 100), { t: chase('p') }, 30, (w) => {
      const s = self(w)
      if (s.pilot!.decision.named === 'scissors' && m.enteredTick === null) m.enteredTick = w.tick
      if (m.enteredTick === null) return
      const r = s.controls.roll
      if (w.tick - m.enteredTick <= 12 * 60 && Math.abs(r) >= 0.5) {
        const sign = Math.sign(r)
        if (m.lastSign !== 0 && sign !== m.lastSign) m.reversals++
        m.lastSign = sign
      }
      if (dot(sub(other(w).state.position, s.state.position), s.state.velocity) > 0) m.threatAhead = true
    })
    expect(m.enteredTick, 'scissors never selected').not.toBeNull()
    expect(m.reversals).toBeGreaterThanOrEqual(2)
    expect(m.threatAhead).toBe(true)
  })

  it('a veteran Hellcat chased by a Zero never enters a scissors in 120 s: a boom-and-zoom airframe does not turn with a better turner', () => {
    let scissorsTicks = 0
    runCanned(scissorsWorld(f6f, 100, zero, 88), { t: chase('p') }, 120, (w) => {
      if (self(w).pilot!.decision.named === 'scissors') scissorsTicks++
    })
    expect(scissorsTicks).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/maneuvers.test.ts tests/sim/ai/breakManeuvers.test.ts --maxWorkers=2`
Expected: FAIL: the names are unknown.

- [ ] **Step 3: Implement.**
- In `pilot.ts`: add `| 'scissors' | 'split-s'` to `ManeuverName`, add `scissors: 'break', 'split-s': 'break'` to `INTENT_OF`, and add both to `VETERAN_SKILL.repertoire`.
- In `maneuvers.ts`: add both names to `PHASED`, and add the constants:

```ts
export const SCISSORS_RANGE_M = 300
export const SCISSORS_ANGLE_RAD = 45 * Math.PI / 180
export const SPLIT_S_MIN_HEIGHT_M = 1500
export const SPLIT_S_MAX_SPEED_FRACTION = 0.6
```

Add the break branch before the final `return` of `selectManeuver`:

```ts
  if (m.intent === 'break') {
    if (has('scissors') && m.threatBehind && f.rangeM < SCISSORS_RANGE_M && m.velocityAngleRad < SCISSORS_ANGLE_RAD &&
        m.selfSpeedMps < m.selfCornerSpeedMps && m.targetSpeedMps < m.targetCornerSpeedMps &&
        m.envelope.turnAdvantage >= 1) return 'scissors'
    if (has('split-s') && f.threatAstern && m.threatBehind && m.heightAboveGroundM >= SPLIT_S_MIN_HEIGHT_M &&
        m.selfSpeedMps < SPLIT_S_MAX_SPEED_FRACTION * m.selfDiveSpeedMps) return 'split-s'
  }
```

In `openLatch`, remove `void v3`. Import `add`, `scale` and `length` from vec3, and `loadFactorBudget` from `./safety.js`. Replace `const loopCenter: Vec3 = ZERO` with:

```ts
  const r = loopRadiusM(length(v), loadFactorBudget(self.spec))
  const loopCenter: Vec3 = name === 'split-s' ? add(self.state.position, v3(0, -r, 0)) : ZERO
```

- In `maneuverFlight.ts`: import `qRotate` from `../math/quat.js`, and add:

```ts
const headingOf = (v: { readonly x: number; readonly z: number }): number => Math.atan2(v.z, v.x)
const headingChange = (from: number, to: number): number => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)))
export const REVERSAL_DONE_RAD = 150 * Math.PI / 180
/** The nose's climb component (velocity.y / speed) above which a split-S counts as level again. */
export const LEVEL_EXIT_MIN_CLIMB = -0.2

/** Scissors (spec §3.5): lift toward the threat at the G budget and a low
 *  throttle, so each time it crosses our 3/9 line we reverse into it and it
 *  slides ahead. Ends once the threat is ahead of the 3/9 line. */
export const SCISSORS_THROTTLE = 0.4
export function flyScissors<M>(self: AircraftEntity<M>, perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  const to = sub(perceived.state.position, self.state.position)
  const s = dot(to, qRotate(self.state.attitude, v3(0, 0, 1)))
  const side = s > 0 ? 1 : s < 0 ? -1 : latch.lastSide
  const reversed = latch.lastSide !== 0 && side !== 0 && side !== latch.lastSide
  const controls = controlsForLiftVector(self.state, self.spec, to, loadFactorBudget(self.spec), SCISSORS_THROTTLE)
  const ahead = dot(to, self.state.velocity) > 0
  return { controls, latch: ahead ? null : { ...latch, lastSide: side, reversals: latch.reversals + (reversed ? 1 : 0) } }
}

/** Split-S: phase 0 rolls inverted (lift straight down at 1 g); phase 1
 *  pulls through around the loop center fixed at entry, at the G budget.
 *  Ends with the heading reversed by REVERSAL_DONE_RAD and the nose back
 *  near level. Prototype, 2026-09-25: F6F from 110 m/s, 165° / -483 m /
 *  6.39 g; Zero from 100 m/s, 175° / -474 m / 6.31 g. */
export const SPLIT_S_THROTTLE = 0.3
export function flySplitS<M>(self: AircraftEntity<M>, _perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  if (latch.phase === 0) {
    const controls = controlsForLiftVector(self.state, self.spec, v3(0, -1, 0), 1, SPLIT_S_THROTTLE)
    return { controls, latch: qRotate(self.state.attitude, UP).y < -0.9 ? { ...latch, phase: 1 } : latch }
  }
  const controls = controlsForLiftVector(self.state, self.spec, sub(latch.loopCenter, self.state.position), loadFactorBudget(self.spec), SPLIT_S_THROTTLE)
  const v = self.state.velocity
  const turned = headingChange(latch.entryHeadingRad, headingOf(v)) >= REVERSAL_DONE_RAD
  const level = v.y / Math.max(length(v), 1e-6) > LEVEL_EXIT_MIN_CLIMB
  return { controls, latch: turned && level ? null : latch }
}
```

Add `case 'scissors': return flyScissors(self, perceived, decision.latch!)` and `case 'split-s': return flySplitS(self, perceived, decision.latch!)` to `flyManeuver`.

- [ ] **Step 4: Run the tests, and measure.** Run the command from Step 2, and expect PASS. Record the split-S's heading change, height lost and peak G, and the scissors' reversals and exit time, in each test's comment. Apply Task 8 Step 8's rule.

In the scissors test, the Zero's pitch authority fades above 250 mph EAS, but both airplanes start below 100 m/s, so the fade is inactive. If the Zero's scissors fails to reverse, check whether the chaser ever crosses its 3/9 line at all (log `side`) before changing anything.

- [ ] **Step 5: The regression gate.** Run Task 8 Step 9's command. This matters most here: at the head-on merge the player's gun cone is on the pursuer, which is exactly `threatAstern`. The `threatBehind` condition (ruling R12) is what keeps the split-S out of the merge. `pursuitMerge.test.ts` must still show the green and veteran first-merge kills at 6 or more of 8. Count `named === 'split-s'` ticks in the first 15 s of both shipped scenarios; expect 0, and record the count.

- [ ] **Step 6: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai tests/sim/ai
git commit -m "7c: scissors and split-S, and the envelope gate that keeps a Hellcat out of a Zero's scissors (7c Task 10)"
```

---

### Task 11: The Immelmann replaces Extend's rejoin

**Files:**
- Create: `tests/sim/ai/immelmann.test.ts`
- Modify: `src/sim/ai/pilot.ts`, `src/sim/ai/maneuvers.ts` and `src/sim/ai/maneuverFlight.ts`
- Modify: `tests/render/aiReengage.test.ts` (the recorded numbers only)
- Test: `tests/sim/ai/maneuvers.test.ts` and `tests/sim/ai/pilot.test.ts` (append)

**Interfaces:**
- Produces: `ManeuverName` gains `'immelmann'` (Extend), and `VETERAN_SKILL.repertoire` gains it. This completes the library.
- Produces, from `maneuverFlight.ts`: `IMMELMANN_UPRIGHT_COS = cos 30°` and `flyImmelmann`

- [ ] **Step 1: Write the failing tests.** Append to `tests/sim/ai/maneuvers.test.ts`:

```ts
describe('Immelmann selection (Task 11)', () => {
  const base = factsFor('extend')
  const rejoin = { ...base, selfSpeedMps: 140, selfCornerSpeedMps: 119.98, facts: { ...base.facts, rangeM: 1300 } }

  it('replaces Extend\'s rejoin beyond SAFE_SEPARATION_M at or above corner speed', () => {
    expect(selectManeuver(rejoin, VETERAN_SKILL.repertoire)).toBe('immelmann')
  })

  it('not below corner speed, not inside SAFE_SEPARATION_M, not for green', () => {
    expect(selectManeuver({ ...rejoin, selfSpeedMps: 110 }, VETERAN_SKILL.repertoire)).toBe('extend')
    expect(selectManeuver({ ...rejoin, facts: { ...rejoin.facts, rangeM: 900 } }, VETERAN_SKILL.repertoire)).toBe('extend')
    expect(selectManeuver(rejoin, GREEN_SKILL.repertoire)).toBe('extend')
  })
})
```

Append to `tests/sim/ai/pilot.test.ts`:

```ts
describe('the finished repertoires (7c; Mark 2026-09-25: green gets the basic set)', () => {
  it('green flies exactly lead and lag pursuit, the defensive break and the extend: nothing vertical', () => {
    expect([...GREEN_SKILL.repertoire].sort()).toEqual(['defensive-break', 'extend', 'lag-pursuit', 'lead-pursuit'])
  })

  it('veteran flies the whole library', () => {
    expect([...VETERAN_SKILL.repertoire].sort()).toEqual([
      'attack-run', 'defensive-break', 'extend', 'high-yo-yo', 'immelmann', 'lag-pursuit', 'lead-pursuit', 'low-yo-yo', 'scissors', 'split-s',
    ])
  })
})
```

Create `tests/sim/ai/immelmann.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { VETERAN_SKILL, type ManeuverName } from '../../../src/sim/ai/pilot.js'
import { createWorldOf, type World } from '../../../src/sim/loop.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { headingChangeRad, level, pilotFor, runCanned, straight, withRepertoire } from './maneuverWorlds.js'

const self = (w: World<undefined>) => w.aircraft.find((a) => a.id === 'p')!
const SET = ['lead-pursuit', 'defensive-break', 'extend', 'immelmann'] as ManeuverName[]

/** The pilot is 600 m below and 1,300 m from a threat flying away: an energy
 *  deficit, so Extend (a veteran at +4,800 J/kg of speed and -5,884 of
 *  height), with the threat's nose away (no Break), and beyond
 *  SAFE_SEPARATION_M at or above corner speed, which is the rejoin the
 *  Immelmann replaces. */
function world(specId: string, speed: number) {
  const spec = loadAircraftSpec(specId)
  return createWorldOf({
    aircraft: [
      level('p', spec, v3(0, 2400, 0), v3(speed, 0, 0), pilotFor('t', withRepertoire(VETERAN_SKILL, SET))),
      level('t', loadAircraftSpec('f6f-hellcat'), v3(-1300, 3000, 0), v3(-100, 0, 0)),
    ],
    player: 't',
  })
}

describe('Immelmann (7c spec §3.5)', () => {
  // Prototype, 2026-09-25 (lift vector toward a loop center fixed at entry):
  // F6F from 140 m/s: 174°, +552 m, exit 76 m/s. Zero from 110 m/s: 152°,
  // +429 m, exit 62 m/s.
  it.each([['f6f-hellcat', 140], ['a6m2-zero', 110]] as const)('%s from %d m/s: selected, reverses 150°+, gains height, exits at 1.1 x stall or faster', (specId, speed) => {
    const spec = loadAircraftSpec(specId)
    const m = { entry: null as null | { heading: number; y: number }, exit: null as null | { heading: number; y: number; speed: number } }
    runCanned(world(specId, speed), { t: straight }, 25, (w) => {
      const s = self(w)
      const d = s.pilot!.decision
      if (d.named === 'immelmann' && d.latch !== null && m.entry === null) m.entry = { heading: d.latch.entryHeadingRad, y: d.latch.entryAltitudeM }
      if (m.entry !== null && m.exit === null && d.named !== 'immelmann') {
        m.exit = { heading: Math.atan2(s.state.velocity.z, s.state.velocity.x), y: s.state.position.y, speed: length(s.state.velocity) }
      }
    })
    expect(m.entry, 'Immelmann never selected').not.toBeNull()
    expect(m.exit, 'Immelmann never ended').not.toBeNull()
    expect(headingChangeRad(m.entry!.heading, m.exit!.heading)).toBeGreaterThanOrEqual(150 * Math.PI / 180)
    expect(m.exit!.y).toBeGreaterThan(m.entry!.y)
    expect(m.exit!.speed).toBeGreaterThanOrEqual(1.1 * spec.reference.stallSpeedMps)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tests/sim/ai/maneuvers.test.ts tests/sim/ai/immelmann.test.ts tests/sim/ai/pilot.test.ts --maxWorkers=2`
Expected: FAIL: `'immelmann'` is unknown.

- [ ] **Step 3: Implement.**
- In `pilot.ts`: add `| 'immelmann'` to `ManeuverName`, add `immelmann: 'extend'` to `INTENT_OF`, and add `'immelmann'` to `VETERAN_SKILL.repertoire`.
- In `maneuvers.ts`: import `SAFE_SEPARATION_M` from `./pilot.js`, add `'immelmann'` to `PHASED`, and add before the final `return`:

```ts
  if (m.intent === 'extend' && has('immelmann') && f.rangeM > SAFE_SEPARATION_M && m.selfSpeedMps >= m.selfCornerSpeedMps) return 'immelmann'
```

In `openLatch`, make the loop center `name === 'split-s' ? add(pos, v3(0, -r, 0)) : name === 'immelmann' ? add(pos, v3(0, r, 0)) : ZERO`.

- In `maneuverFlight.ts`, add:

```ts
/** Immelmann (spec §3.5): replaces Extend's shallow-climb rejoin at or above
 *  corner speed. Phase 0 is a half loop up around the center fixed at entry,
 *  at the G budget and full power, until the heading has reversed by
 *  REVERSAL_DONE_RAD. Phase 1 rolls upright at 1 g. It ends upright, pointing
 *  back at the threat. Never fires: Extend never does (7b). */
export const IMMELMANN_UPRIGHT_COS = Math.cos(30 * Math.PI / 180)
export function flyImmelmann<M>(self: AircraftEntity<M>, _perceived: AircraftEntity<M>, latch: ManeuverLatch): Flown {
  if (latch.phase === 0) {
    const controls = controlsForLiftVector(self.state, self.spec, sub(latch.loopCenter, self.state.position), loadFactorBudget(self.spec), 1)
    const turned = headingChange(latch.entryHeadingRad, headingOf(self.state.velocity)) >= REVERSAL_DONE_RAD
    return { controls, latch: turned ? { ...latch, phase: 1 } : latch }
  }
  const controls = controlsForLiftVector(self.state, self.spec, UP, 1, 1)
  return { controls, latch: qRotate(self.state.attitude, UP).y > IMMELMANN_UPRIGHT_COS ? null : latch }
}
```

Add `case 'immelmann': return flyImmelmann(self, perceived, decision.latch!)` to `flyManeuver`. The switch is now exhaustive over all ten names.

- [ ] **Step 4: Run the tests and measure.** Run the command from Step 2, and expect PASS. Record each airframe's heading change, height gain and exit speed in the test comment. The Zero measured 152° in the prototype, just over 150°. If it falls short, report the measured value with the phase-0 exit condition, and do not loosen the 150° bar: that is spec §3.5's signature.

- [ ] **Step 5: Re-measure the re-engagement.** The veteran may now Immelmann on its rejoin.

Run: `npx vitest run tests/render/aiReengage.test.ts --maxWorkers=2` with a temporary log of `firstShotS` per case.
Expected: PASS. Replace the veteran rows in the header comment with the new numbers, and count how many veteran runs flew an Immelmann (`named === 'immelmann'` at any tick). Remove the log.

- [ ] **Step 6: The regression gate.** Run Task 8 Step 9's command, plus `npx tsx tools/ai/lethality.ts`. Expected: PASS, and 0 kills out of 128. Record the line.

- [ ] **Step 7: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add src/sim/ai tests/sim/ai tests/render/aiReengage.test.ts
git commit -m "7c: the Immelmann replaces Extend's rejoin at corner speed; the library is complete (7c Task 11)"
```

---

### Task 12: Determinism, serialization and bit-identity

**Files:**
- Create: `tests/sim/ai/determinism.test.ts`

**Interfaces:**
- Consumes: `splitSWorld()`, `level`, `pilotFor` and `runCanned` from `tests/sim/ai/maneuverWorlds.ts` (Tasks 8 and 10)

- [ ] **Step 1: Write the tests.** Create `tests/sim/ai/determinism.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'
import { advance, createWorldOf, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { level, pilotFor, runCanned, splitSWorld, straight } from './maneuverWorlds.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')

describe('7c determinism (spec §3.6, §7)', () => {
  it('two runs of the same maneuvering world are bit-identical', () => {
    const run = () => runCanned(splitSWorld(), { t: straight }, 12, () => undefined)
    expect(run()).toEqual(run())
  })

  it('reversing the aircraft array changes nothing, with four aircraft and three pilots mid-fight', () => {
    const parts = () => [
      level('a', f6f, v3(0, 3000, 0), v3(120, 0, 0), pilotFor('b', VETERAN_SKILL)),
      level('b', zero, v3(1500, 3000, 200), v3(-110, 0, 0), pilotFor('a', GREEN_SKILL)),
      level('c', f6f, v3(0, 3500, 3000), v3(120, 0, 0)),
      level('d', f6f, v3(-600, 3600, 3000), v3(125, 0, 0), pilotFor('c', VETERAN_SKILL)),
    ]
    const run = (reversed: boolean) => {
      const list = parts()
      let w = createWorldOf({ aircraft: reversed ? list.reverse() : list, player: 'c' })
      for (let i = 0; i < 30 * 60; i++) w = advance(w, DT).world
      return w
    }
    const normal = run(false)
    const reversed = run(true)
    for (const id of ['a', 'b', 'c', 'd']) {
      const n = normal.aircraft.find((x) => x.id === id)!
      const r = reversed.aircraft.find((x) => x.id === id)!
      expect(r.state).toEqual(n.state)
      expect(r.controls).toEqual(n.controls)
      expect(r.pilot).toEqual(n.pilot)
    }
    expect(reversed.combat).toEqual(normal.combat)
  })

  it('a structuredClone taken mid split-S flies on bit-identically (Review Focus 5)', () => {
    let w: World<undefined> = splitSWorld()
    for (let i = 0; i < 20 * 60; i++) {
      w = runCanned(w, { t: straight }, 1 / 60, () => undefined)
      const d = w.aircraft.find((a) => a.id === 'p')!.pilot!.decision
      if (d.named === 'split-s' && d.latch?.phase === 1) break
    }
    const d = w.aircraft.find((a) => a.id === 'p')!.pilot!.decision
    expect(d.named).toBe('split-s')
    expect(d.latch?.phase).toBe(1)
    const cloned = structuredClone(w)
    expect(cloned).toEqual(w)
    const on = (x: World<undefined>) => runCanned(x, { t: straight }, 2, () => undefined)
    expect(on(cloned)).toEqual(on(w))
  })
})
```

- [ ] **Step 2: Run the tests.**

Run: `npx vitest run tests/sim/ai/determinism.test.ts tests/sim/ai/breakManeuvers.test.ts --maxWorkers=2`
Expected: PASS. If the reversal test fails, find which pilot reads anything other than the start-of-tick snapshot and `ctx`. That is a real defect: fix it, and never weaken the test.

- [ ] **Step 3: Bit-identity and the final sweep.**
1. `npx tsx .superpowers/7c/hash.ts > .superpowers/7c/hash-final.txt`. The four no-pilot scenarios' full digests must equal `hash-task1.txt` (the Task 1 baseline, `main` at the start). Put the before and after table in the handoff.
2. `npx vitest run tests/sim/golden/trajectory.test.ts tests/sim/landing.test.ts tests/sim/carrierLanding.test.ts --maxWorkers=2`. Expected: PASS with the inline snapshots unchanged (`git diff --stat tests/sim` shows no change to those files).
3. `npx tsx tools/ai/lethality.ts` and `npx tsx tools/ai/lethality.ts 0.02`. Record both lines.
4. `npx vitest run tests/render/aiLethality.test.ts tests/render/aiSafety.test.ts tests/render/aiReengage.test.ts tests/sim/pursuitMerge.test.ts tests/sim/zeroMerge.test.ts --maxWorkers=2`. Record every number the tests log or comment on, for the handoff's measured table.

- [ ] **Step 4: Verify and commit.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add tests/sim/ai
git commit -m "7c: determinism, array-order and mid-maneuver structuredClone tests (7c Task 12)"
```

---

### Task 13: Tier 2, the handoff, §15 and README

**Files:**
- Modify: `tests/e2e/ai-pursuit.spec.ts` (header, poll windows and test timeout), `tests/e2e/ai-maneuver.spec.ts` (header) and `tests/e2e/ai-pursuit-difficulty.spec.ts` (header)
- Create: `docs/handoff/<YYYY-MM-DD>-ai-7c.md`, dated the day the work completes
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§9 `aiHint`, and the §15 Plan 7 row) and `README.md` (one paragraph)

**What 7c expects of each Tier 2 spec.** Each is predicted from its Tier 1 replica on the browser's default `both` loadout. The browser runs an airborne world during the terrain load, so its clock is ahead of the keys and polls by the load time.

| Spec | Before 7c (2026-09-25) | 7c's prediction | Why |
| --- | --- | --- | --- |
| `ai-pursuit.spec.ts` | RED: pursuer-1 never fires | **GREEN once its windows are re-timed** | Green's first post-merge shot is at 68.8-83.9 s from spawn (Task 6), after the spec's 20 s tracer window; the hit follows within seconds. Its three claims (turns, fires through production controls, lands a hit) are unchanged. |
| `ai-maneuver.spec.ts` | RED: closest 44.8 m against a 50 m floor | **RED, by design (ruling R4, Open for Mark item 1)** | The merge still passes at 21-22 m headless (`both`). Its point-blank break-off claim is proven at Tier 1 on the fixture (`aiLethality.test.ts` item 2). |
| `ai-pursuit-difficulty.spec.ts` | GREEN | **Unknown; run it and record the result (Open for Mark item 3)** | The Tier 1 head-on replica is never behind, before or after 7c. The recorded green is not reproducible at Tier 1. |

- [ ] **Step 1: Merge `main`.** Run `git merge main`, resolve by keeping both sides, and re-diff `loop.ts` and `scenario.ts` against `HEAD`. Then run the verification command. Re-run the hash probe: the four no-pilot digests may change only if `main`'s own merge moved them. If so, compare this branch against `main`'s own probe output, and record both.

- [ ] **Step 2: Re-time `ai-pursuit.spec.ts`.**
1. Change `test.setTimeout(120_000)` to `test.setTimeout(300_000)`.
2. Change the tracer poll's `timeout: 20_000` to `timeout: 150_000`, and the structure poll's to `timeout: 60_000`. Leave the heading poll at 20 s.
3. Replace the paragraph that begins `**2026-09-25: the geometry this spec was written against moved.**` with:

```ts
 * **2026-09-25: the geometry moved; 7c made the second pass real.**
 * `pursuit-range` is now a head-on merge at 2.5 km with a GREEN pursuer (the
 * shootdown spike). At the merge, 7b's scorer picks Break (the player's nose
 * is on the pursuer), so there is no head-on shot. Before 7c the pursuer then
 * sat in Extend for good (0 rounds in 120 s); 7c's re-engagement
 * (`tests/render/aiReengage.test.ts`) brings it back. Measured headless with
 * the browser's `both` loadout: first post-merge shot at 68.8-83.9 s from
 * spawn, and the hit within seconds. Hence the 150 s tracer window and the
 * 60 s hit window. The claims are unchanged.
```

- [ ] **Step 3: Rewrite `ai-maneuver.spec.ts`'s header.** Replace the block from `**RED as of 2026-09-24, for a real reason, measured` through the end of the `**Reference GPU, 2026-09-25 (after merging to main): RED.**` paragraph with:

```ts
 * **History.** RED from 2026-09-24: the veteran shot the passive player down
 * at tick 517 (8.6 s, 386 m) before point-blank range. 7c's measurement (spec
 * §1.1, 2026-09-25) found the trigger: 7d's noise PLUS the title screen's
 * default `both` loadout, which every Tier 1 world lacked. The 7d handoff had
 * blamed 7d alone. The veteran retune (controlNoise 0.01, Mark's ruling)
 * resolved that: 0 of 128 passive-player runs killed.
 *
 * **7c, <DATE>: still RED, by design.** On the head-on `pursuit-range`, the
 * green pursuer passes the player at 21-22 m (headless, `both`), under this
 * spec's 50 m floor. Making the AI dodge the pass (collision avoidance, or
 * Break flown on the lift vector) clears the floor at 97-114 m, but the
 * player's first-merge kill falls from 7/8 to 0/8: the merge Mark flew and
 * liked on 2026-09-25. 7c kept the merge (ruling R4) and asked Mark (7c
 * handoff, Open for Mark item 1). This spec's claim, a break-off rather than
 * a pass-through at point-blank range, is proven at Tier 1 on the frozen
 * tail-chase fixture (`tests/render/aiLethality.test.ts`, item 2), which no
 * URL can load.
```

Replace `<DATE>` with the real date. No code in this spec changes.

- [ ] **Step 4: Add a 7c note to `ai-pursuit-difficulty.spec.ts`'s header,** after the 2026-09-25 paragraph:

```ts
 * **7c, <DATE>.** The Tier 1 replica of this spec on the head-on start (keys
 * from t = 0, the world frozen at the player's sea impact at 25.7-26.5 s) is
 * never behind, before or after 7c. The 7d bar of record is now the Tier 1
 * replica on the frozen tail chase (`tests/render/aiLethality.test.ts`, item
 * 3: behind at 18-19 s, pursuer alive). Result of this spec on the reference
 * GPU after 7c: <RESULT>.
```

Replace `<RESULT>` with what Step 5 measures.

- [ ] **Step 5: Run Tier 2 on the reference GPU.** Follow the repo `CLAUDE.md`'s "GPU work" section.
1. Pick a free dev-server slot (`ww2airsim-2`, port 5175, or `ww2airsim-3`, port 5174). Point this worktree's `vite.config.ts` at it (`TUNNEL_HOST` and `server.port`). That edit is local scratch: never commit it, and revert it after.
2. Start the dev server: `WW2AIRSIM_TUNNEL=1 npx vite --port 5175` (run in the background).
3. Confirm the slot is up: `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/` must print `200`.
4. Tunnel to the desktop's Playwright server: `ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &`.
5. Run: `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org npx playwright test tests/e2e/ai-pursuit.spec.ts tests/e2e/ai-maneuver.spec.ts tests/e2e/ai-pursuit-difficulty.spec.ts; rc=$?; echo "rc=$rc"`.

   Do not overlap a photoreal budget measurement (spec §8); check with the controller first.
6. Record, for each spec: pass or fail, its failure message, gpu p95 and validation errors. Read the three `test-results/*.png` screenshots yourself.
7. `ai-pursuit` must pass. `ai-maneuver` is expected to fail only on its closest-range assertion. If it fails on anything else (validation errors, p95 at or above 6.0 ms, or never closing below 120 m), that is a real finding: report it.
8. Stop the dev server and revert `vite.config.ts`.

- [ ] **Step 6: Write the handoff,** `docs/handoff/<YYYY-MM-DD>-ai-7c.md`, in this order:
1. What changed: one bullet per commit, with its SHA.
2. Every ruling R1-R13, one line each with its evidence.
3. The measured tables. Re-engagement per case and loadout; lethality (the 16-run and 128-run versions); the safety soak (peak G, lowest point, structure); the maneuver signatures; the gunnery bot's first-merge kills; and the AI Zero's negative-lift ticks, before and after.
4. Bit-identity: the four no-pilot digests before and after, the golden and landing results, and the node version.
5. Tier 2: the table above, filled in with results, p95 and validation errors.
6. The record correction: the 2026-09-24 red was 7d plus the `both` default loadout, not 7d alone (spec §3.1).
7. Open for Mark: items 1-4 from this plan, with its defaults as shipped.
8. For 7e: `pilotTick` is the file to grow. `spawnHeldGroup` (M1) is the insertion path for the spawn-at-tick-3000 test, and `pilotAssignmentFrom` still seeds `initialDecision()`, which rescores on the first tick. The id-seeded noise cursor will change `pursuer-1`'s trajectory, so re-run the three lethality tests and `aiReengage.test.ts`.
9. For the gunnery-honesty slice: the drop term and relative-velocity lead make the AI deadlier. Re-run `tools/ai/lethality.ts` and all of the above.

- [ ] **Step 7: Update the master spec.**
1. In §9, after the `aiHint: 'boom-and-zoom' | 'turnfight',` line's block, add: *Amended <DATE> (Plan 7c): `aiHint` is not authored. It is derived from `geometry`, `mass`, `engine`, `limits` and `reference` by `relativeEnvelope` (`src/sim/ai/envelope.ts`), so a new airframe needs no AI content.*
2. In §15, replace the Plan 7 row's final clause, `7c (the rest of the maneuver library, formation, landing AI, teams) not started`, with: `7c (veteran retune, AI safety envelope, re-engagement after a missed merge, lift-vector controller, named maneuver library) landed <DATE> with Tier 1 acceptance and reference-GPU Tier 2 ([design](2026-09-25-ai-7c-design.md), [plan](../plans/2026-09-25-ai-7c-safety-and-maneuvers.md), [handoff](../../handoff/<YYYY-MM-DD>-ai-7c.md)); ai-maneuver.spec.ts stays red by design pending Mark's ruling on dodging the head-on pass. 7e (sides), 7f (formation), 7g (landing AI) not started`. Also update the row's status cell from `14 — 7a/7b/7d complete` to `14 — 7a/7b/7c/7d complete`.

- [ ] **Step 8: Add a README paragraph** after the Plan 7d one:

`**Plan 7c AI safety envelope and maneuver library landed <DATE>.** AI pilots can no longer overload their own airframe, fly into the sea or over-speed, and an AI Zero no longer cuts its own engine under negative g. After a missed head-on pass the pursuer now turns back and fights again, where before it flew away for good. Veterans fly the named maneuvers (yo-yos, lag pursuit, attack run, scissors, split-S, Immelmann), and greens fly the basic set. The veteran was toned down per Mark's ruling. See the [handoff](docs/handoff/<YYYY-MM-DD>-ai-7c.md); master spec §15 holds the status.`

- [ ] **Step 9: Verify, commit and email.**

```bash
npm run typecheck && npm run lint && npm run depcruise && flock /tmp/ww2airsim-fullsuite.lock npx vitest run --maxWorkers=2; rc=$?; echo "rc=$rc"   # rc=0
git add tests/e2e/ai-pursuit.spec.ts tests/e2e/ai-maneuver.spec.ts tests/e2e/ai-pursuit-difficulty.spec.ts docs/handoff/*-ai-7c.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md
git commit -m "7c handoff: safety envelope, re-engagement and the maneuver library, measured; Tier 2 re-timed and recorded"
python3 tools/mail-doc.py docs/handoff/<YYYY-MM-DD>-ai-7c.md "ww2airsim handoff: 7c, AI safety envelope and maneuver library"
```

`mail-doc.py` exits 0 and prints a byte count. Run it once, and never re-run it with `--debug`.

---

## Self-review

**Spec coverage (spec §3):**

| Spec item | Where |
| --- | --- |
| §2: `pilotTick` extraction | Task 2 |
| §3.1: veteran 0.02 → 0.01 and its comment | Task 1 |
| §3.1: hits test to green | Task 1 (R2) |
| §3.1: the three lethality tests | Task 1 |
| §3.1: `tools/ai/lethality.ts` | Task 1 |
| §3.1: Tier 2 re-runs and the record correction | Task 13 |
| §3.2: load-factor limiter before noise | Task 5 |
| §3.2: ground floor, every tick | Task 5 (R6 retunes the time) |
| §3.2: overspeed | Task 5 (R7, an addition) |
| §3.3: `envelope.ts`, the relative envelope, classification | Task 3 (R10: real Zero) |
| §3.4: `controlsForLiftVector` and its unit tests | Task 4 |
| §3.5: selector with 7b's scorer unchanged | Task 7 |
| §3.5: lag pursuit, both yo-yos | Task 8 |
| §3.5: attack run | Task 9 |
| §3.5: scissors, split-S | Task 10 |
| §3.5: Immelmann replacing the rejoin | Task 11 |
| §3.5: latch, 20 s cap, interrupts | Task 7 |
| §3.5: repertoire as skill data (green restricted) | Tasks 7-11, pinned in Task 11 |
| §3.5: envelope gating of scissors and attack run | Tasks 9 and 10 |
| §3.6: canned worlds asserting selection and signature | Tasks 8-11 |
| §3.6: envelope gating over 120 s both ways | Task 10 |
| §3.6: safety soak | Task 5 |
| §3.6: determinism, array order, `structuredClone` mid-maneuver | Task 12 |
| §3.6: golden and landing snapshots bit-identical | Task 12, and the hash probe in every task |
| §3.6: Tier 2 | Task 13 (ai-maneuver red by design, R4) |
| Track ledger: the re-engage acceptance test | Task 6, re-measured in Task 11 |
| Z2 "For 7c": cutout and fade | Task 5 (0 g floor, dive test), Task 4 (fade in `pitchPerUnitCommand`) |
| M1 "For Lane A" | "Out of scope", and handoff item 8 |

**Placeholder scan.** The only fill-ins are:
- the completion date (`<DATE>`, `<YYYY-MM-DD>`) in Task 13;
- the Tier 2 result (`<RESULT>`), measured in Task 13 Step 5;
- the measured numbers each signature test's comment records, which its own step produces.

Every code step has its code.

**Type consistency.** These names are used identically everywhere:
- `pilotTick(a, snapshot, ctx)` and `PilotTickContext`
- `initialDecision()`, `SafetyMode`, `PilotDecisionState.{safety, named, latch}`
- `ManeuverName`, `ManeuverLatch`, `DEFAULT_MANEUVER`, `INTENT_OF`, `PilotSkill.repertoire`
- `airframeEnvelope` and `relativeEnvelope`
- `controlsForLiftVector`, `pitchCommandForLoadFactor`, `pitchPerUnitCommand`, `steerToward`
- `limitLoadFactor`, `loadFactorBudget`, `negativeLoadFloor`, `heightAboveGround`, `needsFloorRecovery`, `safetyOverride`, `finishControls`
- `leadPursuitControls`, `extendControls`, `defensiveBreakControls`, `flyManeuver`, `Flown`
- `maneuverFacts`, `selectManeuver`, `isPhased`, `openLatch`, `latchExpired`, `interruptsLatch`, `loopRadiusM`
- `maneuverControls(self, target, decision, skill, wind = null, nowS = 0)`

`intentControls` exists only between Tasks 5 and 7; Task 7 deletes it.

**Review Focus coverage:**

| Item | Test |
| --- | --- |
| 1 | Task 5, `aiSafety.test.ts` "an AI Zero never cuts its own engine", and `safety.test.ts` "floors it at 0 g" |
| 2 | Task 5, `safety.test.ts` "an AI over high ground measures height above that ground" |
| 3 | Task 5, `aiSafety.test.ts` "a diving AI Zero neither breaks up nor hits the sea" |
| 4 | Tasks 5, 8, 10 and 12: `pursuitMerge.test.ts` as a regression gate (floor 6 of 8) |
| 5 | Task 12, `determinism.test.ts` "a structuredClone taken mid split-S" |
