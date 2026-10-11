# Entity scaling: how many aircraft and ships fit in the budget

**Goal:** answer Mark's question (2026-10-10), "How many aircraft and ships could we have in the game
before going over GPU budget? 30?", with measured numbers. Nothing had measured how frame cost scales
with entity count. `MASTER_PLAN.md` Track H (rendering budget) carries the pointer.

**Run:** in a worktree (branch `worktree-agent-a4e28ab8cde4a6876`), unattended.
**Viewing checkpoints:** the final product only (the handoff and its screenshots). Nothing blocks on Mark.
**Result:** [`docs/handoff/2026-10-10-entity-scaling.md`](../../handoff/2026-10-10-entity-scaling.md). As run, the capture added a frozen (paused) GPU window: a CPU-bound frame's GPU timestamps read a down-clocked GPU.
**Scope:** measurement and DEV-only tooling. The shipping game is unchanged
(`tests/build/dist.test.ts` asserts the swarm parameters never reach a production bundle).
Fixes are recommended, ranked by measured payoff, and not implemented.

## Limits measured against

| Limit | Bar | Source |
| --- | --- | --- |
| GPU p95, 1440p, High | 8.33 ms (one 120 Hz frame) | H0 gate, `tests/e2e/budget.spec.ts` |
| CPU frame (main-thread work per frame) | 8.33 ms (120 Hz), 16.7 ms (60 Hz) | this plan |
| Sim at 3x time scale, per frame | 1.5 ticks per 120 Hz frame, 3 per 60 Hz frame, inside the CPU frame | `TRIPLE_TIME_SCALE`, `DT` = 1/60 s |

## Tasks

1. **Swarm generator** (`src/sim/swarm.ts`): `withSwarm(scenario, {aircraft, ships, layout}, anchor)`.
   Groups of four of one type and side (veteran leader, three green wingmen in formation); fighter
   leaders engage, bomber leaders fly ingress at the other side's first ship (gunners included); ships
   sail a loop at 15 kn, AA by side as always, main batteries only where the scenario frees them.
   Layouts: **tight** (a 5 x 3 grid of groups 1,150 to 6,700 ft ahead, all inside the chase camera's
   view; ships 1.5 to 4 mi ahead) and **mission** (one engagement half a mile ahead of the camera, the
   rest paired off 5 to 12 mi out; an allied task force 2.5 mi ahead, the axis force 15 mi away).
   Anchor `SWARM_PROBE_ANCHOR`: open water east of Leyte at 2,950 ft, below free-flight's cumulus base.
2. **DEV wiring** (`main.ts`): `?swarmAircraft=&swarmShips=&swarmLayout=` through a new
   `loadScenarioBundle` `extend` hook; `?invariants=off` (production `step`, not `stepChecked`);
   `?swarmHide=1` (swarm flies, nothing of it drawn: the meshes' share by difference);
   `__ww2.cpuFrameSamples()` (work ms, sim ms, ticks, draw calls, triangles per frame),
   `__ww2.setGpuSampling(on)` (timestamp sampling serializes frames, so the CPU window turns it off),
   `__ww2.entityCounts()`.
3. **Unit test** `tests/sim/swarm.test.ts`: counts, mix, rules, tight in view, mission spread, ships on
   water over the real terrain (seen to fail with the anchor moved ashore).
4. **Headless sweep** `tools/ai/swarmSweep.ts` (harness `tests/sim/swarmHarness.ts`): ms per tick vs
   N and M for both layouts, median of 3, on ryzen through `remote-run`; `--profile` gives self time by
   function at 60 + 20, the basis for ranking sim fixes; `--checked` prices the DEV stepper.
5. **Capture** `tests/e2e/entityScalingCapture.spec.ts` (E2E_CAPTURE=1, enrolled in `docs/testing.md`):
   N in 0, 5, 10, 20, 30, 45, 60; M in 0, 2, 5, 10, 15, 20; combined 30 + 10 and 60 + 20; both
   layouts; High and Medium at 1440p. Per point: GPU p50/p95, draw calls, triangles, rAF interval,
   main-thread work p50/p95, sim ms per tick at 1x and 3x, JS heap, entities in view. Median of 3
   interleaved repeats, under `hwlock ryzen-budget`, ryzen checked idle (CPU and other 3D clients)
   before each run; loaded runs are discarded and said so. Ablations at the large points:
   `swarmHide=1`.
6. **Reference-GPU run** on a free dev slot (5174 or 5175; both held by other sessions when this plan
   was written). Poll for about 3 hours after everything else is ready; if none frees, finish with the
   headless sweep plus nexus-GPU correctness runs and leave the reference sweep ready to run.
7. **Handoff** `docs/handoff/2026-10-10-entity-scaling.md`: the tables, where each limit is crossed,
   which binds first per layout, ranked fixes, the plain answer to "30?". Email plan and handoff;
   one line under Track H in `MASTER_PLAN.md`.
