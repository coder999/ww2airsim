# Hangar check 15 rows for the four F8A models

**Date:** 2026-10-17. **Branch:** `hangar-luminance` (from `main` 3a561771; not merged, nothing deployed). Closes the Known gap in
[the F8A Task 0 handoff](2026-10-16-f8a-new-models.md).

## How a row is measured

Hangar case 15 loads each id in `tests/e2e/fixtures/flat-luminance.json`, renders the three-quarter view, and takes the mean linear
luminance inside the model's mask (`masks()` in `tests/e2e/hangar.spec.ts`). It passes when that is 0.6x to 1.5x of the row. For the DP
models the row came from the flat glb the skinned build replaced.

**The four F8A models have no flat predecessor and cannot get one.** They were only ever built skinned (`"skin": true`; the Blender scripts write
a skin sidecar, and `build.ts` refuses a sidecar on an entry without `skin`), so there is no flat glb in any commit. This is the
`g4m-betty` precedent (2026-09-29): the row is the skinned build's own lit luminance, so case 15 is a regression guard for these four, not a
flat-versus-skinned comparison. Their ratio is 1.000x by construction; the gate still catches a later change that blacks out or blows out the model.

## Measurement

Reference GPU (RX 6700 XT), ryzen RDP route as `rdp` (nobody logged in; server on 3002, tunnel 39003 reused), this worktree's own vite on slot 5175
(`ww2airsim-2.windomlane.org`, local `vite.config.ts` edit reverted, never committed), default viewport, all under `hwlock -w 3600 ryzen-budget`.
Taken twice, bit-identical to nine digits.

| Model | Row (lit luminance) | Nearest similar existing row |
| --- | ---: | ---: |
| `quonset-hut-20x48` | 0.118730677 | barracks-and-huts 0.1099 |
| `pontoon-pier-segment` | 0.052930630 | pier-and-warehouses 0.1185 |
| `jinamoc-seaplane-ramp` | 0.136521824 | revetment 0.1677 |
| `ormoc-customs-building` | 0.136286873 | hangar 0.1154 |

The pontoon is the darkest (grey steel cells on a dark stage); it is inside the range of the other rows' ratios, but its absolute value is low,
so the guard band (0.032 to 0.079) is the narrowest in absolute terms.

## Hangar case 1 and the framing fix (Mark's ruling)

The first whole-file run on ryzen was 26 of 27: case 1 ("mask covers 2% to 80% of the frame") failed for `jinamoc-seaplane-ramp` at **1.65%**
(floor 2%, unchanged; next lowest `hvar` 2.02%). The cause is framing: the Hangar frames by bounding sphere, which for a long low strip is mostly air.
Fix: `framingRadius()` in `src/render/hangar/framing.ts`, used by `stage.ts`, frames an object whose length is at least 4x its width and 10x its height
20% closer. First try used 5x width and changed nothing (the ramp is 67.1 x 16.2 m, 4.1x); the unit test now pins the ramp's real size, a hut and a
pontoon pier stay unchanged. The model is untouched.

Result on ryzen, same route and slot: ramp mask share **2.45%** (was 1.65%); no other entry's share changed (`hvar` 2.02%, `b-29` 2.26%).
The ramp's row was re-measured because the view changed: **0.128746112** (was 0.136521824). Case 15 for the other 26 ids was
unchanged to the digit (ships jitter in the 6th digit as before), so the quonset, pontoon and ormoc rows stand.

## hangar.spec.ts on ryzen (whole file, 27 tests)

After the fix: **27 passed** (13.1 min), including case 1, case 15 (all 27 ids), 15b and 16; exit 0, under `hwlock -w 3600 ryzen-budget`.

## Tests

**Tests updated:** `tests/e2e/fixtures/flat-luminance.json` (four rows and the note).
**Tests still valid:** every other test; no unit test reads the fixture (`rg flat-luminance tests` finds only `hangar.spec.ts`).
**Tests updated:** also `tests/render/hangar/framing.test.ts` (`framingRadius`).
**Known gaps:** The four rows are guards, not flat comparisons.

## Verify

`REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on ryzen, 2026-10-17, exit 0 (read from the command, not a pipe): 499 test files passed, 1 skipped; 7,672 tests passed (after the framing fix), 14 skipped.
