# Plan 7e handoff: sides, target selection, the ingress pilot and many-vs-many

Dated 2026-09-26. Branch `worktree-ai-7e` (worktree `.claude/worktrees/ai-7e`), cut from `main` at `242c35e`, pushed; **not merged** (Mark's call). Design: [2026-09-25-ai-7c-design.md](../superpowers/specs/2026-09-25-ai-7c-design.md) §4. Plan: [2026-09-26-ai-7e-sides-and-many-vs-many.md](../superpowers/plans/2026-09-26-ai-7e-sides-and-many-vs-many.md). Master spec §15 holds the status. Viewing checkpoint: final product only; run unattended.

Every number below was measured on 2026-09-26, headless through production `advance` on node v22.22.1 unless it says "reference GPU".

## 1. What changed

| Commit | What |
| --- | --- |
| `fc575e1` | The plan (emailed). |
| `44aa800` | Task 1: `src/sim/sides.ts` (`sideOf`, `sidesOf`, `sameSide`); `AircraftEntity.side?`; content `"side"`; `pilot.target` optional; a static target must be opposite-side (schema, held groups, `createWorldOf`). |
| `44c111c` | Task 2: `AircraftCombat.friendlyHits/friendlyKills`; same-side hits and kills never reach `hits`, `kills` or `killsByType` (ruling W1); one side table per tick into `stepCombat` and `creditDownedAircraft`. |
| `493e24e` | Task 3: `PilotDecisionState.mode/targetId/legIndex`; the noise cursor seeded by FNV-1a of the entity id. |
| `3ec9435` | Task 4: `src/sim/ai/targeting.ts`, the five-term scorer plus stickiness. |
| `9e65895` | Task 5: pilots choose, re-check every tick, retarget within one tick of a death, loiter without a target (`src/sim/ai/loiter.ts`). |
| `9baf708` | Task 6: hold fire (`src/sim/ai/holdFire.ts`). |
| `cb2a197` | Task 7: the ingress pilot (`src/sim/ai/ingress.ts`, `pilot.ingress` content). |
| `1f3cd89` | Task 8: the Shift pursuit autopilot chases only the other side. |
| `5c2894d` | Task 9: `content/scenarios/furball-range.json` ("Furball (dev)" in the picker) and the 120 s furball soak. |
| `573e0ff` | Task 10: radar friendly tint; `__ww2.aircraft()` gains `side`, `mode`, `maneuver`, `targetId`; `__ww2.combat()` rows gain `kills`, `friendlyKills`, `attacker`. |
| `a38bb7f` | Task 11: `tests/e2e/furball.spec.ts`; the tick-cost gate as `npm run perf:furball`. |
| `50dad6f` | Whole-branch review fixes (section 6). |
| (this commit) | Handoff, plan rulings, §15, README, the 7c spec's dated 7e notes. |

## 2. Acceptance (spec §4.7 and §4.5)

**Tier 1** (all in the suite; `remote-run npm run verify` rc=0, 227 files, 2,359 passed, 1 skipped, before the review fixes; see section 8 for the final run):

| Item | Test | Result |
| --- | --- | --- |
| Selector, one test per score term | `tests/sim/ai/targeting.test.ts` | nearer, threat, leader threat, tail, engaged-by-friendlies, stickiness; plus filters, ties by id, order |
| Order independence with N dynamic pilots | `sidesTick.test.ts` | 6 aircraft, 5 choosing pilots, 20 s, reversed array identical; every pilot held an opposite-side target |
| Static-target validation reject | `sides.test.ts`, `mission/schema.test.ts` | schema, held groups, `createWorldOf` |
| Retarget within one tick of a death | `sidesTick.test.ts` | the tick after `destroyedAt`, onto a fresh snapshot of the new target |
| Hold fire as a friendly crosses | `holdFire.test.ts` | 0 rounds while blocked; fires before and after; the crosser untouched. With the gate disabled: 30 rounds while blocked |
| 120 s furball soak | `furball.test.ts` | bit-identical twice, no NaN, safety invariants for every AI, 1 AI-on-AI kill by hits (tick 24), every kill across sides, `friendlyKills` 0, friendly hits 0 of 24 |
| p95 tick cost, 2 ms ceiling | `npm run perf:furball` | 0.774-0.784 ms best-of-3 on an idle nexus (ruling R-F2) |
| `missionScore` for shooting down an allied AI adds nothing | `friendlyCredit.test.ts` | total 0 |
| Ingress: three-leg route, each leg within 100 m / 10 m/s, orbit of a moving carrier | `ingress.test.ts` | legs end 3,734 m / 125.7 m/s (want 3,800/130), 2,991/136.3 (3,000/140), 3,490/119.2 (3,500/120); orbit 1,540 m, altitude within 30 m, 0 rounds at the ship |
| Engage within one `reactionS`; resume at the same `legIndex` | `ingress.test.ts` | both the "gone" (destroyed) and "leaves" (past 4.5 km) cases |
| A hostile 6 km off the route never pulls it off | `ingress.test.ts` | mode `ingress` throughout 100 s |
| Spawn at tick 3,000 | `ingress.test.ts` | first commanded tick flies the target's start-of-tick position, never `ZERO` |
| Two raiders spawned together jitter differently | `ingress.test.ts` | same state, different cursors, different roll/pitch/yaw |
| `structuredClone` round trip | `sidesTick.test.ts`, `ingress.test.ts` | mid-furball and mid-route, bit-identical |

**Tier 2 on the reference GPU** (Windows desktop RX 6700 XT, HUD "amd" / "rdna-2", dev slot `ww2airsim-2.windomlane.org`, 2560x1440):

| Spec | Result | gpu p95 | Samples | Validation errors |
| --- | --- | --- | --- | --- |
| `furball.spec.ts` (new) | **GREEN** twice: `bandit-2` shot down by `ally-1`; no pilot ever targeted its own side over 20 s; 0 friendly kills | 2.068 ms, then 2.046 ms | 1,725, then 427 | 0 |
| `ai-pursuit.spec.ts` | GREEN | 2.055 ms | 4,096 | 0 |
| `ai-maneuver.spec.ts` | GREEN (still reads the first sample under 120 m, 7c open item 1b) | 2.062 ms | 1,113 | 0 |
| `radar.spec.ts` | GREEN once after the friendly tint (2.064 ms, 514 samples); later runs red, see open item 4 | | | 0 |
| `ai-pursuit-difficulty.spec.ts` | 2 of 3 runs green, 1 red ("never got behind"), see open item 5 | | | |

Captures, read by the executor: `test-results/furball-kill.png` (tick 35, chase view behind the player, pair A and the wingman out of frame astern). They are gitignored; copies are in `.superpowers/7e/` on nexus.

## 3. Bit-identity

Digest probe `.superpowers/7e/hash.ts` (1,800 ticks; "stripped" drops only the keys 7e adds: `friendlyHits`, `friendlyKills`, `mode`, `targetId`, `legIndex`, `loiter`, `side`):

- `deck-quals`, `free-flight`, `gunnery-range`, `strike-range`: stripped and motion digests identical to `242c35e` after every task.
- The four piloted rows moved in Task 3 only, and only because of the cursor: with every cursor forced back to 0, all eight rows equal the baseline, stripped and motion.
- Golden trajectory and landing snapshots: unchanged (in the suite).

## 4. Rulings

The writer's W1-W10 and the executor's R-E1-R-E6, R-F1 and R-F2 are in the plan's rulings sections, each with its cost if wrong. The two that matter most:

- **R-F1, the furball's geometry.** With the spec's first layout (both axis pairs head-on from 6 km), no AI hit another AI in 300 s. In 1v1 duels no AI hit a maneuvering AI in 180 s: veteran and green head-on, veteran 1,500 m on a green's tail (174 rounds, 0 hits), green on green (204, 0), crossing (60, 0). The cause is the deferred gunnery-honesty slice (lead by target velocity, no drop), plus green's 1 s stale perception and a pursuit that closes at 1-5 m/s. To meet §4.7's "at least one AI-on-AI kill by hits" without changing the AI, `furball-range` starts pair A 850 m behind the player, with the veteran wingman 280 m behind pair A's green. The wingman's bounce kills it at tick 24 in all four loadouts. Gap sweep: 200 m, 350 m and 450 m do not kill.
- **R-F2, the 2 ms ceiling.** Inside ryzen's full parallel suite the furball's p95 read 5.84 ms single-pass and 2.56 ms best-of-3. That is the other workers' load. The gate is `npm run perf:furball`, run on an idle machine: 0.78 ms. The soak does not time ticks.

## 5. Open for Mark

1. **AI-on-AI fights do not resolve by kills** (R-F1). After the opening bounce, the furball's AI fight each other without hitting. The passive player is shot down at 58-70 s by a green. The fix is the gunnery-honesty slice: relative-velocity lead plus drop compensation, per-skill aim error, and a re-run of 7c §3.1. Cost if left: a many-vs-many among AI is mostly maneuvering. It is also the precondition for M4's interceptors to actually shoot raiders down.
2. **Ships have no side** (review, for M4). *Resolved 2026-09-26 by friendly fire, merged to `main`: ships and structures carry a side, and own-side damage scores nothing and discharges the pilot. See [the friendly-fire handoff](2026-09-26-friendly-fire.md). The original note follows.* Ship-sinking credit puts `killsByType.carrier` on whoever sank the hull, whatever the side, so in Combat Air Patrol the player could score by sinking his own `cv-1`. This predates 7e, and §4.3 covers aircraft only. Options: ship `side` content read through the same `sideOf`, or an `enemyShipIds` filter like `enemyStructureIds`.
3. **Teamkill penalty**: none, as recommended (spec Decisions item 4). Friendly kills simply do not score.
4. **`radar.spec.ts` is flaky on the reference GPU, and not because of 7e's shader.** It passed once after the tint. Later, both the 7e shader and the original `242c35e` shader failed the same way: the GPU sample count came in at 17-60 of the 120 required, and the contact-pixel check failed 2 of 5 times (the sweep-timing flake the spec's own header documents). The desktop showed 24 Chrome processes at the time, so another session was probably using the GPU. Re-run it on a quiet desktop before merging.
5. **`ai-pursuit-difficulty.spec.ts`** was red in 1 of 3 runs. The id-seeded cursor moved `pursuer-1` (7c handoff §8 predicted this). The spec is timing-dependent, because the browser flies the world during the terrain load. The bar of record, `aiLethality.test.ts` item 3, holds at the new cursor 1751318077: behind at 18/19/18/19 s in clean/bombs/rockets/both, pursuer structure 1.
6. **The ingress orbit banks about 63° on a 1,540 m circle** at 118 m/s. That is about 2 g. The radius and altitude are right. The bank is not explained: it is steeper than a level turn of that radius needs (about 42°), and this was not investigated. Cost if left: the raiders' orbit looks aggressive.
7. **The furball soak asserts the pursuit floor (15 m) for every AI**, not `FLOOR_M` for non-pursuing ones. The lowest measured point was not recorded. The 7c soak made the same choice.

## 6. The whole-branch review (fresh reviewer, 2026-09-26) and what was done

No critical findings.

- **Fixed:**
  - **A same-side graze no longer overwrites `lastHitBy`.** Before the fix, the player's crash credit could go to the victim's own wingman. The new test fails without the fix.
  - **A downed friendly no longer counts as "engaging".**
  - **The loiter latches its heading and altitude.**
  - **`ingressAccepts` has unit tests,** plus a production "leaves" case. The gun-cone clause, which is subsumed by the range rule today, is now commented.
  - **Stronger `sidesTick` assertions.**
  - **The soak runs in `beforeAll` and times nothing.**
  - **Stale docs:** `ai-maneuver.spec.ts`'s Finding 9 is marked resolved, and the shader comment is fixed.
  - **Diagnostic types** are now `PilotMode`/`ManeuverName`.
  - **US "around".**
- **Recorded, not fixed:** open items 2, 6 and 7.

## 7. E1 and O1 intersections (for the merge)

E1 (effects) and O1 (ordnance) ran in parallel from `242c35e`. The shared files 7e touched, and where:

| File | 7e | E1 (per its plan, and its branch at `d35ee79`) |
| --- | --- | --- |
| `src/sim/weapons/combat.ts` | `AircraftCombat` fields; the `createCombat` record literal (`friendlyHits: 0, friendlyKills: 0` on the `shots:` line); `stepCombat`'s new trailing `sides` parameter; `creditAircraftDamage`; the `lastHitBy` lines in `damageAircraftAt`; `creditDownedAircraft` | `CombatState.impacts`, the `impacts: []` line in `createCombat`, `Contact`/`nearestContact`, the shot loop, the return. Different lines; expect at most a small textual conflict in `createCombat`, keep both |
| `src/sim/loop.ts` | the `sides` import, `AircraftEntity.side?`, the `createWorldOf` pilot check, `sidesOf` in `advance`, `pilotContext`, and the `stepCombat`/`creditDownedAircraft` calls | none named |
| `src/render/main.ts` | the `sideOf` import and four fields in `__ww2.aircraft()` | fx wiring, quality binding, E1 Task 10 deletions |
| `src/render/diagnostics.ts` | the `aircraft()` row type and one import | new fx members on the same type |
| `src/render/combatReadout.ts` | `CombatDiagnostics.aircraft` rows | none named |
| `src/render/scene/radarScope.ts`, `src/render/radar.ts` | the friendly tint and flag | none |
| `src/render/titleScreen.ts` | the picker entry | none |
| `package.json` | `perf:furball` after `verify` | E1 adds an fx build script |
| §15, README | the Plan 7 row, one paragraph | E1's own row and paragraph |

O1 touches `tools/models`, stores and the Hangar, none of which 7e touches. M4 rebases onto 7e's `scenario.ts` schema (missions spec §8).

## 8. Final verification and viewing

- `remote-run npm run verify` after the review fixes and these docs (2026-09-26): rc=0, 227 files, 2,364 passed, 1 skipped. Digests (stripped and motion) unchanged from Task 3.
- **Viewing (final product):** `https://ww2airsim-2.windomlane.org/?scenario=furball-range`. It is served live from this worktree's dev server (`WW2AIRSIM_TUNNEL=1 npx vite --port 5175`, with a local-only `vite.config.ts` edit) and returned 200 at hand-off. The dev server is not a service: it stops when nexus reboots or the process is killed. Picking "Furball (dev)" on the title screen does the same.
