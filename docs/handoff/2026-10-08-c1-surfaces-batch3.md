# Handoff: C1 batch 3, control surfaces on the A6M2 Zero and Ki-43 (2026-10-08)

**Plan:** [`docs/superpowers/plans/2026-10-08-c1-surfaces-batch3.md`](../superpowers/plans/2026-10-08-c1-surfaces-batch3.md).
**Run:** branch `c1-surfaces-batch3`, worktree `../ww2airsim-c1-batch3`, unattended. Not merged; Mark looks first.

## What works

The Zero and Ki-43 move their ailerons, elevators, rudder and flaps on the Hangar bench and in flight, by the same rules as batches 1-2. AI Zeros and Oscars move theirs from their own pilots' controls.

## Checkpoint (Mark)

- **Live:** `https://ww2airsim-2.windomlane.org/hangar.html?bench`, served from this worktree. Pick the Zero or the Ki-43, then use the "Control surfaces" sliders and the flaps.
- **Captures, before and after side by side,** in [`2026-10-08-c1-surfaces-batch3-shots/`](2026-10-08-c1-surfaces-batch3-shots/):
  - flaps down from the side;
  - flaps down from below;
  - full right roll from the front.
- **Where to look:**
  - the Zero's flaps, which sit partly behind its drop tank from the side;
  - the Ki-43's flaps and ailerons, now separate parts.

## How

- **The Zero, cut from its one skin.** Its download draws the body, wing and tail as one `Corps` mesh with no separate surfaces, so all seven are cut, as the F6F's were.
  - **Hinges:** from true sections in the pitched source frame, at 0.25 of the local chord from the trailing edge for the ailerons and flaps, 0.40 for the elevators and 0.35 for the rudder.
  - **Spans, ESTIMATE:**
    - ailerons from 55% to 88% of the semispan;
    - flaps from the fuselage side, at 16%, to 50%;
    - elevators across the whole tailplane;
    - rudder from y 80 to 152 in source units.

    No source with the A6M2's spans was found. [J-Aircraft's A6M1 drawing study](https://j-aircraft.com/research/jimlong/a6m1_part1.htm) gives only that the A6M2's flap ended at wing station 11.
- **The Ki-43, its own pieces.** Its download already models the ailerons (`eleron`, `eleron01`), elevators (`rul_vis`, `rul_vis01`) and rudder (`rul_napr`) as separate meshes, which the build used to join into the body. Now they are `keep` nodes, each pivoted on its leading edge:
  - each line runs through the edge at 10% and 90% of the piece's span, because the tips are rounded;
  - each line is then slid forward onto the foremost vertex, so nothing stands ahead of the hinge.
- **The Ki-43's flaps** are cut from the wing between the fuselage fillet and the aileron root, with the hinge at 0.25 chord, as an ESTIMATE. The download has no flap mesh: the second wing primitive (`krilo-FACES_0`) is the wheel-well covers, ahead of the main spar.

## Fixes to the cut stage (`tools/models/stages/split.ts`)

- **Stack overflow:** `Math.max(...out)` spread the Zero's ~250k indices onto the call stack. It's a `reduce` now.
- **One draw per surface:** a cut piece's primitives that share a material are joined into one (`mergeSameMaterial`). The Zero's `Corps` is two primitives of one material, so without this each surface cost two draws.
  - It applies only to cuts. The F6F, F4U and Wildcat rebuild byte-identically with it.
  - The two-material test now really uses two materials; it had none, so the halves would have merged.
  - A new test checks the one-material case, and failed with the merge disabled.

## Measured

| Model | Draws | Triangles | Bytes |
| --- | --- | --- | --- |
| A6M2 before | 7 | 91,902 | 5,442,852 |
| A6M2 after | 14 (budget raised from 12) | 96,634 / 100,000 | 5,599,068 / 5,600,000 |
| Ki-43 before | 34 | 17,240 | 937,396 |
| Ki-43 after | 41 / 47 | 18,518 / 60,000 | 992,576 / 3,000,000 |

- **The Zero's draw budget goes from 12 to 14.** Seven surfaces of one draw each on its 7-draw base make 14; no layout fits 12.
  - The 12 came from the Zero design's measured count plus headroom (`docs/superpowers/specs/2026-09-25-a6m-zero-design.md` §8), not from a GPU limit.
  - With eight Zeros on screen that's 16 more draws per frame.
  - **This is Mark's call to approve.**
- **The Zero's body simplify ratio drops from 0.45 to 0.40** (`perNode.Corps`). The cut planes slice the whole skin they cross, which added about 7,600 body triangles. At 0.40 the model fits the triangle and byte budgets, but only 932 bytes under the byte limit.

## Tests

- **`aircraftRigs.test.ts`:** the Zero and Ki-43 are in the pinned list. All 14 of their surfaces pass the direction, leading-edge, open-edge and budget checks.
  - **Pinned exception:** `a6m2-zero/Rudder` has 5.2 cm of open edge on its hinge face. That is two open edges at the fin tip, a missing sliver about 1 mm wide, not a visible hollow.
  - **Seen red:** the Ki-43's first hinge lines, taken from the rounded tips, failed the leading-edge check, ailerons by 3 mm and elevators by 4.9 cm. That's what led to the 10%/90% measurement.
- **`geometryStages.test.ts`:** the new same-material join test.
- **Full suite via remote-run:**
  - 4,732 passed and 1 failed. The failure was `tests/sim/soak.test.ts`, which timed out at 31.8 s against its 30 s limit, under load. It passes on nexus.
  - There were 17 skips, not 10: `shipEntries.test.ts` skipped 7 because the run had no model cache. With the cache it passes, 16/16 together with the soak test.
- **`hangar.spec.ts`:** 20/20 on nexus.
- **`sortie.spec.ts`:** 6/8. The 6 include every Zero case. The two AD-2 pilot-status tests fail on main too (batch 2 handoff).

## Not done, and found on the way

- **Main's B-17 doesn't rebuild.** On main, `npm run models:build -- b-17-flying-fortress` fails, 101,518 triangles against its 100,000 budget, with main's own `split.ts`. Its committed glb (99,085) was built by C2 with the early batch 2 cut stage; the final stage slices more. The coming `sketchfabEntries.test.ts` will flag it. This branch doesn't change it.
- **Raw downloads:** the worktree's `tools/models/cache` is a symlink to main's, the one home of the raws. The repo's ignore rule (`/tools/**/cache/`) matches directories only, so the symlink shows as untracked; it is never committed.
- **Batch 4:** the D3A, and the B-17's surfaces. The B-17 has no triangle budget left (see above).
