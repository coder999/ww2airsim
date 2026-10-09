# C1 batch 3: control surfaces on the A6M2 Zero and the Ki-43

**Goal:** ailerons, elevators, rudder and flaps move on the A6M2 and Ki-43 (`MASTER_PLAN.md` Track C1, batch 3).

**Run:** in the worktree `../ww2airsim-c1-batch3` (branch `c1-surfaces-batch3`), unattended (Mark, 2026-10-08).
**Viewing checkpoint:** the end of the plan only, on the Hangar bench at `ww2airsim-2.windomlane.org`. Captures go in the handoff.

**Note:** this plan was written after the work, which ran straight through. It records the route taken and the numbers measured.

## Rulings carried from batches 1-2 (Mark, 2026-10-08)

| # | Ruling |
| --- | --- |
| R1 | Visual only, cosmetic slew, full travel at any speed; flaps follow `flapFraction`. |
| R2 | Defaults: aileron ±20°, elevator ±25°, rudder ±25°, flap 0-45°. |
| R3 | Hinges oriented per `docs/models.md` §5; the batch 2 checks are the gate (direction, leading edge, open edge ≤ 2 cm, budget). |

## Measured starting point (rebuilt byte for byte from the raws, 2026-10-08)

| Model | Draws | Triangles | Bytes | Budget |
| --- | --- | --- | --- | --- |
| A6M2 | 7 | 91,902 | 5,442,852 | 12 / 100,000 / 5,600,000 |
| Ki-43 | 34 | 17,240 | 937,396 | 47 / 60,000 / 3,000,000 |

## Route

| Model | Surfaces | How |
| --- | --- | --- |
| A6M2 | AileronL/R, Flap1L/R, ElevatorL/R, Rudder | `split` + `cut` from the one `Corps` skin, as the F6F's |
| Ki-43 | AileronL/R, ElevatorL/R, Rudder | `keep` the download's own pieces (`eleron`, `eleron01`, `rul_vis`, `rul_vis01`, `rul_napr`), pivoted on their leading edges |
| Ki-43 | Flap1L/R | `split` + `cut` from the wing (`krilo`) inboard of the ailerons; the download has no flap mesh |

## Tasks

- [x] Verify both raws rebuild their committed glbs byte for byte.
- [x] Zero: hinges from true sections of the pitched source frame (0.25 chord for the ailerons and flaps, 0.40 for the elevators, 0.35 for the rudder, from the trailing edge). Spans are ESTIMATE.
- [x] Ki-43: leading-edge hinge lines taken at 10% and 90% of each piece's span, then slid forward onto its foremost vertex.
- [x] Fix the cut stage: `Math.max(...out)` overflowed the stack on the Zero's ~250k indices.
- [x] Cut stage: join a cut piece's same-material primitives, one draw per surface. Unit test, seen red.
- [x] Zero budget: the 12 draws can't hold seven surfaces (7 + 7 = 14), so it rises to 14. Its body simplify ratio drops from 0.45 to 0.40, which keeps triangles and bytes inside their budgets.
- [x] Enroll both in `aircraftRigs.test.ts`'s pinned list.
- [x] Full suite via remote-run, `hangar.spec.ts`, `sortie.spec.ts`; before/after captures; handoff; MASTER_PLAN.

## Done means

The suite passes, and so do `hangar.spec.ts` and the Zero's `sortie.spec.ts` cases. A handoff with captures goes in `docs/handoff/`. Mark looks before any merge.
