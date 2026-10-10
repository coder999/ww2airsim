# B3: g-limit the player's pursuit autopilot

**Status (2026-10-10):** built on the branch, not merged; results in [`../../handoff/2026-10-10-b3-pursuit-g-limit.md`](../../handoff/2026-10-10-b3-pursuit-g-limit.md).
**Mark's decisions (2026-10-10):**
- The g-limit is **each airframe's own structural limit from its spec (`limits.gLimit`), minus a margin**, so the autopilot never overstresses the airplane under Realistic damage. The margin is chosen and justified by measurement (Task 3).
- Scope per MASTER_PLAN §4 Q5: pursuit only, g-limited lead pursuit onto a gun solution; the player still fires. No heading/altitude hold, no waypoint mode.
**Viewing checkpoint:** final product only.
**Run mode:** unattended, to completion.
**Location:** worktree `.claude/worktrees/agent-a9f86eab69be97b65`, branch `worktree-agent-a9f86eab69be97b65`, cut from `main` `91da48f0`. Not merged by this run.
**Heavy jobs:** `tsc`, eslint, vitest suites and `npm run verify` go to ryzen (`REMOTE_RUN_OVERFLOW=0 remote-run`). On nexus, single small test files and the headless probe only.
**Parallel work:** 1a (terrain gzip), M5 (difficulty: `settings.ts`, AI aim scaling, `aaFire`, player damage scaling), E3 (bomber AI, turrets, `combat.ts`) and k1 (clouds) run at the same time. This plan touches `src/sim/ai/autoPursuit.ts`, one optional parameter in `src/sim/ai/safety.ts`, their tests, a probe tool and docs.

## What is in the code (read 2026-10-10)

| Fact | Where | Consequence |
| --- | --- | --- |
| Shift calls `autoPursuit(prev.world)` once per render frame; its roll, pitch and yaw replace the keys'. Throttle and trigger stay the player's. | `src/render/frame.ts` (`autopilotCommand`) | The fix belongs in `autoPursuit`, the one function the frame calls. |
| `autoPursuit` flies `pursuitDesiredVelocity` (or a level/floor request) through `controlsForDesiredVelocity`, whose pitch is `pitchError * 2.4 - q * 0.30`, clamped to ±1. Nothing limits load. | `src/sim/ai/autoPursuit.ts`, `src/sim/ai/controller.ts` | At high speed full stick is far past the airframe's limit: n ≈ V·q/g. |
| The AI already has a g-limit: `limitLoadFactor` clamps pitch to the command whose steady pitch rate gives `G_BUDGET` (0.9) × `gLimit`, and a negative floor (0 g for a float carburetor). Applied on every AI output since 7c (2026-09-25; soak peak 7.32 g against 7.5). | `src/sim/ai/safety.ts`, `liftVector.ts` (`pitchCommandForLoadFactor`) | Reuse it for the player with its own margin; do not write a second limiter. The AI is already limited, so the AI is out of scope (Task 5 confirms). |
| Overload damage reads the MAGNITUDE of proper acceleration over `gLimit` each tick, under Realistic damage only. | `src/sim/damage/overload.ts` | The detector: `world.combat.aircraft[player].stress.loadFactorG` and `damage.structure`. |

## Baseline, measured before any change (2026-10-10, `tools/autopilot/pursuitProbe.ts` at `91da48f0`)

**The fault, confirmed.** Shift on a green AI Zero in the crossing geometry: peak **13.55 g**, 119-141 ticks over the F6F's 7.5 g, structure **0.000 in 4 of 4** cursors (the airframe breaks up). That is the M4 handoff's "about 13 g" (2026-09-27 §6). With an enemy 800 m behind at 0.95 of dive speed, the F6F, F4U, F4F and Ki-84 each break up (10.9-11.5 g); every gun-armed airframe except the P-38 goes over its limit at 0.8 of dive speed.

**Gun solution on the Damage Range** (Shift held, a 0.25 s tap once the solution has held 0.1 s, at most one a second): first solution at 0.00 s (the first Zero spawns 350 m ahead), first two taps 11 and 14 hits (the damage stages round 2 handoff's 11-18), taps to set the three Zeros alight 2, 12 and 12, mean nose error to the solution while in gun range 1.02°, peak 1.12 g.

## Tasks

1. **Probe** (`tools/autopilot/pursuitProbe.ts`, done): three tables through production `advance` with Realistic damage: overload per gun-armed airframe at 0.6/0.8/0.95 of dive speed, the evader duels, and the Damage Range gun solution.
2. **Failing test first:** `tests/sim/ai/autoPursuit.test.ts` gains an enrolled overload test: every gun-armed airframe (pinned list), at each speed fraction, 20 s of Shift, asserts peak load ≤ `gLimit` and structure 1. Plus the crossing-green evader case. See it go red at HEAD.
3. **Limit:** `limitLoadFactor` gains an optional budget fraction (default `G_BUDGET`, AI unchanged). `autoPursuit` applies it with `AUTO_PURSUIT_G_FRACTION`. Sweep the fraction (0.8, 0.85, 0.9, 0.95) on all three tables; pick the largest that keeps every peak under `gLimit` with measured headroom, without costing gun-solution quality.
4. **Wiring:** `autopilotFrame.test.ts` reads the limit back through `nextFrameState` (the Plan 3 defect class: a limit `frame.ts` never reached would be inert in the browser).
5. **AI check:** the AI already runs `limitLoadFactor`; record E1's duel table only if this run changes AI output (it should not: the default stays `G_BUDGET`).
6. **Verify** on ryzen; E2E autopilot specs if any exist; docs: handoff, MASTER_PLAN B3 status, email.

## Found while executing (2026-10-10)

Pitch alone was not enough: with it limited, the 13 g case still pulled 8.34 g (full rudder at 231 m/s) and lost structure to overspeed in the dive before the pull. Task 3 therefore also limits the rudder to the load the pull leaves, and stops the dive at `AUTO_PURSUIT_DIVE_FRACTION` of dive speed. Both are measured in the handoff and listed there as rulings for Mark.
