# B3 handoff: the pursuit autopilot is g-limited

**Date:** 2026-10-10. **Plan:** [`2026-10-10-b3-pursuit-g-limit.md`](../superpowers/plans/2026-10-10-b3-pursuit-g-limit.md).
**Branch:** `worktree-agent-a9f86eab69be97b65` (worktree `.claude/worktrees/agent-a9f86eab69be97b65`), cut from `main` `91da48f0`. **Merged to `main` 2026-10-10** (with M5; `npm run verify` on the merge: 399 files, 5,561 passed).
**Run:** unattended; viewing checkpoint is the final product only (fly it, below).

## What changed

Holding Shift still chases the nearest enemy with the same lead-pursuit law, and you still fire. Now it:

- **pulls at most 0.9 of the airframe's own load limit** (`limits.gLimit` in its content file: 7.5 g for the F6F, F4U, F4F and Ki-84, 7.0 for the Zero, Oscar and Val, 6.0 for the P-38, 5.0 for the TBM). It pushes no further than the AI's negative floor, which is 0 g for a float carburetor, so Shift never cuts a Zero's engine;
- **holds the rudder to whatever load the pull leaves** inside the same budget. At 230 m/s (515 mph) full rudder alone is about 5 g of sideslip, and the overload model reads the whole load, not just the pull;
- **stops diving at 0.9 of the dive speed.** It keeps turning toward the target but climbs at about 15° until it is slower. The throttle is yours, so it cannot cut power the way the AI does.

Code: `src/sim/ai/autoPursuit.ts` (`AUTO_PURSUIT_G_FRACTION`, `AUTO_PURSUIT_DIVE_FRACTION`, `limitPursuitLoad`) and one optional `fraction` parameter on `limitLoadFactor` and its helpers in `src/sim/ai/safety.ts`. The parameter defaults to the AI's `G_BUDGET`, so AI output is unchanged.

## The fault, confirmed before the fix

Instrument: `tools/autopilot/pursuitProbe.ts` (`npx tsx tools/autopilot/pursuitProbe.ts [overload|evader|gun]`). It flies Shift headless through production `advance` under Realistic damage, steering every 1/60 s tick as `frame.ts` does at 60 Hz. Load is `combat.aircraft[player].stress.loadFactorG`, the number the overload damage reads.

| Case (all measured 2026-10-10) | Before (`91da48f0`) | After |
| --- | --- | --- |
| F6F on Shift vs a green AI Zero, crossing start, 4 runs | peak **13.55 g**; 119-141 ticks over 7.5 g; structure **0.000 in 4 of 4** (broke up) | peak **6.78 g**; 0 ticks over; structure 1.000 in 4 of 4 |
| Same, head-on, tail and crossing vs veteran and green (24 runs) | the 4 above broke up; the other 20 peaked at 5.70-6.91 g | peak 6.78 g; every run 1.000 |
| Enemy 800 m behind, each gun-armed airframe at 0.6, 0.8 and 0.95 of its dive speed, 20 s (27 runs) | 16 of 27 lost structure; F6F, F4U, F4F and Ki-84 broke up at 0.95 (10.9-11.5 g); worst 1.53x the limit (F4F) | 0 of 27 lost structure; worst 0.903 of the limit (Val) |

That crossing case is the M4 handoff's "about 13 g" (2026-09-27 §6), which also dived to 226 m/s first. Both halves show in the trace: the F6F followed the Zero down past its 216 m/s dive speed at full throttle (structure already 0.86 from overspeed), then pulled. With the pitch limited and nothing else, the run still hit **8.34 g**. Full rudder (yaw 1.00) at 231 m/s added about 5 g of sideslip on top of the 6.75 g pull. That is why the rudder and the dive are limited too.

Each new test was seen red at HEAD before the fix (`tests/sim/ai/autoPursuit.test.ts`: 10 failures, e.g. `expected 13.549522205913757 to be less than or equal to 7.5`).

## Choosing the margins (measured, `pursuitProbe`, 2026-10-10)

The limiter clamps the *steady* pitch rate, and the airframe overshoots it while the rate builds. The sweep shows how far:

| `AUTO_PURSUIT_G_FRACTION` | Worst peak / limit (51 runs) | Runs that lost structure | Seconds in gun solution (24 duels, summed) |
| --- | --- | --- | --- |
| 0.85 | 0.857 | 0 | 13.1 |
| **0.9 (shipped)** | **0.904** | **0** | **12.8** |
| 0.95 | 0.957 | 0 | 12.4 |
| 1.0 | 1.007 | 4 (F6F on a green Zero, 7.55 g) | 12.1 |

- **Overshoot past the budget is 0.4-0.7% of the limit** at every fraction. So 1.0 fails and anything up to about 0.99 would hold in these cases.
- **More g bought no gun time.** Seconds in solution fell slightly as the fraction rose.
- **So 0.9:** a 10% margin, the AI's own `G_BUDGET`. It costs nothing measurable and leaves room for cases the probe does not fly: damage-reduced authority, wind, a target that reverses harder.

| `AUTO_PURSUIT_DIVE_FRACTION` (g at 0.9) | Crossing vs green Zero, 4 runs |
| --- | --- |
| 0.85 | structure 1.000 in 4 of 4 |
| **0.9 (shipped)** | **1.000 in 4 of 4** |
| 0.95 | 0.990-0.996 in 3 of 4: still overran the dive speed in the pull-out |

0.9 is also the AI's throttle-cut fraction (`OVERSPEED_THROTTLE_CUT`).

**A first version only stopped the dive while descending.** It froze the P-38: its content top speed is above its 161 m/s dive speed, so at 0.95 of dive speed it held level and never turned (peak 1.00 g in 20 s). The shipped version climbs on the chase heading instead, and the P-38 turns at 5.21 g.

## Gun solution, before and after

| Measure | Before | After |
| --- | --- | --- |
| Damage Range, Shift held, a 0.25 s tap once the solution has held 0.1 s (at most one a second): hits on the first two taps | 11, 14 | 11, 14 |
| Taps to set the three Zeros alight | 2, 12, 12 | 2, 12, 12 |
| Mean nose error to the muzzle-lead solution while in gun range | 1.02° | 1.02° |
| Time to first solution (first Zero spawns 1,150 ft ahead) | 0.00 s | 0.00 s |
| Head-on vs veteran / green Zero: first solution | 9.8 s | 9.8 s |
| Head-on vs veteran / green Zero: seconds in solution per run | 2.0/1.9/2.0/3.3 and 1.3/1.2/1.0/0.9 | 2.0/1.9/2.0/1.8 and 1.3/1.5/1.0/1.3 |
| Crossing vs green Zero: seconds in solution | 1.6-2.3 s per run, at 36-38 s, while pulling 13 g and breaking up | 0 in 90 s; the airplane survives |

The Damage Range is identical to the tick: the straight-flying Zeros never ask for more than 1.12 g, so the limit never binds there. The damage stages round 2 handoff's 11-18 hits per tap holds.

**What the limit costs:** the crossing fight against a green Zero. The old law reached a solution there only by pulling 13 g, and it broke the airplane doing it. Tail and crossing starts against a Zero that fights back reached no solution before or after. A Zero out-turns an F6F, and the autopilot does not fly energy tactics.

## AI pilots: not changed

The AI already runs `limitLoadFactor` at 0.9 × `gLimit` on every output (7c, 2026-09-25), and this change leaves its default alone.

**Measured in E1's duels** (F6F v F6F, 4 cursors per pairing, 90 s, scratch script over `tools/ai/duel.ts`'s worlds, 2026-10-10): the peak was 6.64-7.26 g in eight of nine pairings and 0 ticks over 7.5 g. Green v green crossing peaked at 7.60 g, 16 ticks over in 4 runs, with negligible structure loss. That is 7c's noted "green jitter can still nick the limit", not a 13 g overshoot.

So the AI keeps its own limiter, and E1's duel table was not re-measured: no AI code path changed. Its rudder is unlimited like the player's was. That is an open item (below), not a fix made here.

## Verification

- **New tests:** `tests/sim/ai/autoPursuit.test.ts`, "the pursuit autopilot stays inside the airframe limit (B3)":
  - an enrolled overload test over every airframe with fixed guns, with the list pinned;
  - the 13 g crossing case;
  - a gun-solution guard: the first tap lands at least 11 hits, every Damage Range Zero burns within 12 taps, and the head-on solution comes by 10 s.

  `tests/render/autopilotFrame.test.ts` reads the limited pull back through `nextFrameState`, the frame path the browser uses.
- **`npm run verify` on ryzen:**
  - **First run, rc 0:** 397 files and 5,543 tests passed, 12 skipped. This run was on the final code but before the E2E capture spec and the docs were added.
  - **Second run, on the final tree:** typecheck and lint were green. Three files timed out at 30 s under shared ryzen load: `aiLethality`, `soak` and `attack`, none of which this change touches. Re-run alone, all three passed (rc 0).
- **E2E** (nexus Radeon 680M, local Playwright on a private vite port, under `hwlock nexus-compute`): `tests/e2e/pursuitAutopilotCapture.spec.ts` passed. It is a capture tool, run with `E2E_CAPTURE=1`. In the real game the Damage Range on Shift showed the `AUTOPILOT · PURSUIT` badge. Twenty blind once-a-second 0.25 s taps landed 7, 22 and 5 hits (taps 3-5) and set `zero-1` alight. The player's peak load was 1.16 g, structure 1.0, with no console errors. These taps are not gated on the solution, unlike the headless probe's, so most miss.

## How to fly it

- **Damage Range:** on any dev host with this branch, `?scenario=damage-range&launch`. Hold Shift and tap Space. It should feel exactly as before.
- **To feel the limit:** fly a fighter mission against Zeros that fight back, for example Combat Air Patrol, under Realistic damage. Hold Shift through a hard turn: the HUD's `OVER-G` warning (combat readout) should never appear, and the airplane should come out whole.
- **Dives:** a diving chase now levels off near the dive speed instead of following the target down.

## Rulings for Mark

1. **The rudder is limited too** (conservative reading of "never overstresses"). Your ruling named the g-limit; the overload model reads the whole load, and pitch alone left 8.34 g.
2. **The dive is limited too.** Overspeed breaks the airframe in the same overload model, and the throttle is yours, so the autopilot climbs instead of diving at 0.9 of the dive speed. If you would rather it chase down and leave the speed to you, set `AUTO_PURSUIT_DIVE_FRACTION` past 1 and say so.
3. **Margin 0.9 (10%),** the AI's figure, chosen by the sweep above. 0.95 also held in every measured case, for no gain in gun time.

## Open items

- **The AI's rudder is not load-limited.** Its peak in the duels is 7.60 g against 7.5. If an AI ever breaks up at high speed, `limitPursuitLoad` is the fix to share: `finishControls` would call it instead of `limitLoadFactor`.
- **The P-38's content top speed is above its dive speed** (161 m/s, 360 mph). Either the dive limit or the speed is probably wrong in `content/aircraft/p-38-lightning.json`. Not touched here; it is a flight-model sourcing question.
- **The autopilot does not fly energy tactics.** Against a Zero that turns with it (tail and crossing starts), it reaches no gun solution in 90 s, before or after this change. That is the "pursuit only" scope (§4 Q5).
