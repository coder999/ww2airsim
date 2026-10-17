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

## hangar.spec.ts on ryzen (whole file, 27 tests)

26 passed, 1 failed. Case 15 passed (all 27 ids, the four new at 1.000x), 15b passed, 10 (budgets as drawn) and 12, 14, 16 passed.
**Failed: case 1** ("mask covers 2% to 80% of the frame"): `jinamoc-seaplane-ramp` reads **1.65%** (floor 2%). A probe run of case 1 with soft
assertions over every entry shows it is the only entry under 2% (next lowest `hvar` 2.02%); quonset 8.96%, pontoon 6.50%, ormoc 8.95%.
This is a framing issue, not luminance: a 220 x 40 ft ramp 17.6 ft high is a thin low shape in the Hangar's three-quarter view. The gate is
unchanged. Options for Mark or the coordinator: reframe the Hangar camera for long low objects, or a per-entry exception with a reason; neither
was done here. The F8A handoff never ran this file on the reference GPU, so this is the first run to see it.

## Tests

**Tests updated:** `tests/e2e/fixtures/flat-luminance.json` (four rows and the note).
**Tests still valid:** every other test; no unit test reads the fixture (`rg flat-luminance tests` finds only `hangar.spec.ts`).
**Known gaps:** Hangar case 1 fails for the Jinamoc ramp (above). The four rows are guards, not flat comparisons.

## Verify

`REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on ryzen, 2026-10-17, exit 0 (read from the command, not a pipe): 499 test files passed, 1 skipped; 7,671 tests passed, 14 skipped.
