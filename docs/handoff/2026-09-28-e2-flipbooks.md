# E2 baked flipbooks handoff — 2026-09-28

**Look first:** <https://ww2airsim-2.windomlane.org>. It is the dev server off
this worktree, on slot 2, and it returned `200` when this was written.
Then open these three captures, in
[`2026-09-28-e2-flipbooks-shots/`](2026-09-28-e2-flipbooks-shots/):

1. [`bomb-water.png`](2026-09-28-e2-flipbooks-shots/bomb-water.png): the liquid-whitewater column, 1.5 s after a bomb hits the sea.
2. [`air-kill.png`](2026-09-28-e2-flipbooks-shots/air-kill.png): the baked fireball at 400 m, 0.5 s after a kill.
3. [`rocket-motor.png`](2026-09-28-e2-flipbooks-shots/rocket-motor.png): an HVAR pair's motor flame, drawn from the fx system (Ruling R8).

E2 replaces E1's code-generated placeholder sheets with six Mantaflow
simulations rendered in Cycles on the blender.org 5.0.1 build and packed into
the same KTX2 layout. It also gives the rocket motor a real `flame`-sheet
plume. The work is complete on `worktree-e2-flipbooks` and is **not merged**;
merging is Mark's call. How to rebake: [`docs/fx-bake.md`](../fx-bake.md). Plan:
[`2026-09-27-e2-baked-flipbooks.md`](../superpowers/plans/2026-09-27-e2-baked-flipbooks.md).

## What shipped

| Commit | Result |
| --- | --- |
| `e77498c` | Task 1: bake transport to ryzen's blender.org build, the grid-render probe, and the lighting rig (R1, R10). |
| `fe16b46` | Task 2: the pure pack: channels, per-sheet normalization, optical-flow motion, loop crossfade, acceptance (R3, R5–R7). |
| `b63e129` | Task 3: `fx:pack` with the size ladder, manifest provenance and bake report; the placeholder generator is deleted (R2, R5). |
| `a52b1a6`, `2a4519d` | Task 4 rulings: the six-way check scores each sun by its local brightening. |
| `f78bf95` | Task 4: `smoke` and `dust` scripts. |
| `899a577` | Task 5: `fireball` and `flame` scripts. |
| `60ab00f` | Task 5b: exposure lowered so lit and emission passes do not clip. |
| `8bde0ab`, `f81367a` | Task 5c: emission encoded with a soft knee at the sheet's p75; fireball fuel 2.704 → 3.5. |
| `df806e3` | Task 8: the rocket motor is a `flame` stream at the HVAR nozzle; the flame box is deleted (R8). |
| `3cb4593`, `db195c9` | Task 6: `water-column` and `spray` as Mantaflow **liquid** whitewater, with gas kept as `*-gas.py`; soft radial fade. |
| `6f5b26f` | Task 7 step 0: fireball fuel 4.5; `FX_BAKE_HOST=local`, so nexus can bake beside ryzen. |
| `0130169` | Task 7 fix: local bakes resolve `~` properly, and the bake script refuses to run outside its own directory. |
| `59fdb7b` | Task 7: all six sheets baked from the final scripts and packed; provenance tests unconditional. |
| `d5130a2` | Task 9: catalog sizes carried through the baked sheets' fill (R9). |
| `f1b122b` | Task 10: reference-GPU Tier 2 green, plus the Mark-ruled fire, water and test-setup fixes; captures. |
| this commit | Task 11: this handoff, the runbook, §15 row and doc pointers. |

## The bake

All six from the committed scripts (scene hash `a7906b794b24…`), Blender
`5.0.1 a3db93c5b259`, 256 px, 128 samples, 64 frames (flame 64 + 8 loop).
Five sheets baked on ryzen. `flame` baked on nexus through `FX_BAKE_HOST=local`,
concurrently with the ryzen batch.

| Sheet | Host | Bake s | Render s | fill | edge α | peak cov. | height/width | emit frames | six-way min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `smoke` | ryzen | 298.8 | 277.0 | 0.621 | 0.000 | 0.121 | 1.85 | 0 | 0.0171 |
| `dust` | ryzen | 80.7 | 254.9 | 0.465 | 0.000 | 0.089 | 1.38 | 0 | 0.0458 |
| `fireball` | ryzen | 146.5 | 302.7 | 0.461 | 0.000 | 0.108 | 1.19 | 19 | 0.0256 |
| `flame` | nexus | 73.4 | 507.3 | 0.594 | 0.000 | 0.088 | 2.16 | 64 | 0.0196 |
| `water-column` | ryzen | 71.9 | 367.1 | 0.691 | 0.000 | 0.121 | 1.72 | 0 | 0.0204 |
| `spray` | ryzen | 116.9 | 485.2 | 0.641 | 0.000 | 0.156 | 0.70 | 0 | 0.0232 |

Every sheet passes `acceptance` (`tools/fx/pack.ts`). The full numbers are in
`tools/fx/bake-report.json`. The gas variants were baked only for comparison,
and fail the six-way check (≤ 0.009); they were never tuned (ledger ruling I3).

**Clipping**, measured on the raw 16-bit renders (luminance ≥ 0.999 on
texels with alpha > 0.01): every lit pass 0.00%, except the back pass on
`water-column` (0.08%) and `spray` (0.17%); worst emission frame 0.46%
(`flame`). The 15–22% figures from Tasks 5/5b, still quoted in `rig.py`'s
`SUN_STRENGTH` comment, did not reproduce and are stale (Open for Mark, 4).

## What ships

The top rung of the ladder: **256 px × 64 frames, 2,834,867 bytes** (the gate is
10,000,000).

| File | Bytes |
| --- | --- |
| `fx-light-a.ktx2` | 1,338,369 |
| `fx-light-b.ktx2` | 813,071 |
| `fx-motion.ktx2` | 682,672 |
| `sheets.json` | 755 |

## Tier 1

`remote-run npm run verify`: rc 0, 288 files, 3,279 passed, 2 skipped (the
Task 0 baseline's 2), after Task 7. The final run, after Task 11: 3,295 passed,
2 skipped, and 1 failed. The failure was `tests/render/gunzip.test.ts` timing out at 120 s
loading sky noise under shared ryzen load. Re-run alone, it passed 2/2 (a known
load timeout, not an open item).

## Tier 2 (reference GPU, RX 6700 XT, 1440p)

| Measure | E1 | E2 |
| --- | --- | --- |
| fx 1440p High, gpu p95 over `?fx=off` | +0.360 ms | **+0.445 ms** (limit 1.0) |
| 4K High photo, gpu p95 | 16.062 ms | 15.785 ms (+0.174 over `?fx=off`) |
| eye inside a smoke plume, over `?fx=off` | +0.862 ms | **+2.393 ms**, accepted; limit now 3.0 |
| budget4k High low-land-600 | 12.465 ms | 12.227 ms on re-run (first run 21.4 ms, n = 71: stutter) |
| `fx.spec.ts` | 8/8 | 8/8 |
| `ordnance.spec.ts` | — (O1's) | 2/2, incl. the new rocket-motor test |

The appearance counts from the final `fx.spec.ts` run (before → after):
bomb-land warm px 311 → 3,269; bomb-water white px 5,496 → 11,232; air-kill
warm px 56 → 2,483; soft-edge row step soft 9.4 vs hard 24.7; cloud ordering
287 of 685 clear-sky warm px (0.42, floor 0.4).

## What Tier 2 found, and how it was fixed

The first reference-GPU run failed 5 of 8 `fx.spec.ts` tests and 2 gates.
Mark chose each fix from a pick list (2026-09-28):

- **Fire was gone before the capture.** The baked fireball burns in its first
  19 of 64 frames. E1's 1.2–1.8 s particle life therefore left only 0.4–0.5 s
  of fire, and the 500–600 ms captures saw none. Fireball life is doubled at
  the four burst call sites in `catalog.ts`. The `round.aircraft` hit flash is
  unchanged.
- **The water drew grey.** R6 normalizes each sheet so its brightest lit
  texels reach 1, and on the liquid sheets the back-lit pass sets that scale.
  That left the sunlit passes at a median of ~0.23, against dust's ~0.45.
  `WATER_GAIN = 2.5` on the water tint draws the column white again. It is a
  catalog change, with no rebake.
- **The soft-edge test was measuring grass.** After 2 s, `structure.collapse`
  had no smoke left at the anchor: the dust ring flies outward, and the
  stream rises. The before and after luma on the anchor column differed by
  at most 3. The `smoke-base` stress scene now uses `engine.smoke`, which
  sits on the ground. The soft < 0.6 × hard rule is unchanged.
- **Cloud ordering** measured 0.44 and then 0.43 of clear sky, so its floor
  moved from 0.5 to 0.4. The control (0 px without the limit) still proves
  the limit matters.
- **Eye inside smoke** at +2.4 ms was accepted; that one gate is now 3.0 ms.

## Captures

All in [`2026-09-28-e2-flipbooks-shots/`](2026-09-28-e2-flipbooks-shots/), 2560×1440, from the final run:

| Capture | What it shows |
| --- | --- |
| `bomb-land.png` | a bomb on the runway at 600 ms: fireball glows and the dust ring |
| `bomb-water.png` | the white liquid-whitewater column and base puffs at 1.5 s |
| `air-kill.png` | the baked fireball in the air, 400 m out, at 0.5 s |
| `rocket-motor.png` | an HVAR pair just after firing, with the motor flame drawn by the fx system |
| `smoke-base-soft.png` / `-hard.png` | engine smoke meeting the ground 40 m out, with and without soft particles |
| `cloud-fireball.png` / `-nolimit.png` / `-clearsky.png` | a fireball in front of a cloud: with the march limit, without it, and in a clear sky |
| `crash-water.png` | `crash.water` just before Restart clears it |
| `fallback-bomb-land.png` | the sheets failing to load: effects fall back to blobs |
| `*-before.png` | each scene before its effect fires |

The liquid-vs-gas contact sheets for the water sheets are in the gitignored
ledger (`.superpowers/sdd/2026-09-27-e2-baked-flipbooks/captures/t7-*`):
liquid reads as a rising, collapsing column and burst, and gas reads as smoke
mushrooms.

## Rulings added during execution

In order. The full text, with cost-if-wrong, is in the gitignored ledger
`.superpowers/sdd/2026-09-27-e2-baked-flipbooks/progress.md`.

- **R4 replaced (Mark):** the water sheets are Mantaflow liquid whitewater,
  after a spike showed it renders on ryzen. Gas is kept as `*-gas.py` for
  comparison only. Spec §6.1 is amended to match.
- `rocket.motor` is sized on the baked sheet and is not rescaled by Task 9.
- **Six-way check:** after two superseded versions, each sun is scored by its
  local brightening, so plume shape cannot mask a correct sun and one
  mis-rotated sun is refused.
- **Flame tuning:** density and fill were chosen by full-physics cheap trials;
  `--check` is judged only at full settings.
- **Bakes run under `hwlock -s ryzen`,** so a bake never overlaps an exclusive
  budget measurement.
- **Task 5b:** `SUN_STRENGTH` 3.0 → 2.75, flame emission 10 → 0.034 and
  fireball emission 8 → 0.17, so passes stop clipping.
- **Task 5c:** emission is encoded with a soft knee at the sheet's p75 instead
  of R6's linear p99.9. Fireball fuel 2.704 → 3.5, and then 4.5 in Task 7 for
  margin (19 emit frames against the 16 required).
- **Task 7 was restructured** into one unattended batch of all sheets plus the
  gas variants, split across ryzen and nexus (Mark's suggestion).
  `FX_BAKE_HOST=local` was added for nexus.
- **Water-column's aspect of 1.72** depends partly on the soft radial fade
  (≈ 1.36 without it). Accepted as an art choice.
- **`rig.py`'s comment fix is deferred to the next rebake,** because the scene
  hash covers raw script bytes.
- **The `fireball()` spawn-radius factor went 0.3 → 0.19,** so the radius keeps
  its E1 value along with the visible size.
- **Mark's Task 10 pick-list rulings:** fireball life ×2, `WATER_GAIN` 2.5,
  the `smoke-base` scene uses `engine.smoke`, cloud-ordering floor 0.4, and
  the eye-smoke gate 3.0 ms.

## Open for Mark

1. **The water sheets (R4).** They shipped as liquid whitewater, not the plan's
   gas. Look at `bomb-water.png` and at a bomb on water in the live build.
   `WATER_GAIN` 2.5 is a single catalog number to tune if it reads too bright
   or too flat.
2. **The look.** For comparison, these were found by web search on 2026-09-28
   and **not opened** (NHHC returns 404 to non-browser fetches), so none of
   them has been checked for a suitable image. Links only, per R11:
   - WWII near-miss photographs: the
     [NHHC Battle of Midway collection](https://www.history.navy.mil/content/history/nhhc/our-collections/photography/wars-and-events/world-war-ii/midway.html),
     e.g. [80-G-17054](https://www.history.navy.mil/content/history/nhhc/our-collections/photography/wars-and-events/world-war-ii/midway/80-G-17054.html).
   - IL-2 Great Battles bomb effects: the
     [Mudspike 2024 screenshot thread](https://forums.mudspike.com/t/il-2-great-battles-screenshots-2024/16042).
   - A DCS smoke column: the
     [Better Smoke for DCS World 2.8](https://www.digitalcombatsimulator.com/en/files/3316164/) user-file page.
3. **The fire now lasts about 0.7–1.2 s,** because particle life was doubled
   rather than the fireball rebaked. A longer-burning rebake (more fuel) is the
   alternative if the fire still reads too short.
4. **`rig.py`'s `SUN_STRENGTH` comment** still quotes Task 5b's clip figures.
   Fix it together with the next script change, since any edit forces a full
   rebake.
5. **Cloud ordering has a thin margin:** 0.42 against a floor of 0.4.
6. **Nothing is blocked.**

## Status

The branch is pushed. `main` is untouched, and merging is Mark's call. The
worktree's `vite.config.ts` points at slot 2 (`ww2airsim-2`, port 5175) as a
local, uncommitted edit, and `content/terrain/tiles` is symlinked to main's.
