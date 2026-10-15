# F6A night renderer and light contract: handoff (2026-10-14)

Plan: `docs/superpowers/plans/2026-10-14-f6a-night-renderer-lights.md` (Mark's rulings D1-D9 and the CP1/CP2 amendments are in its section 7 and in `docs/night.md`). Merged to `main` 2026-10-15 (branch and worktree removed; full gate and CI green). Not deployed. Mark reviewed the look at CP1 and CP2 ("nighttime looks great", "this is amazing"); CP3 is the final scenes and the budget.

## What shipped

See `docs/night.md` (the standing reference: files, keys, `?night=` tunables, sources, deviations). In one paragraph: a fixed movie-night floor, a fixed waning-gibbous moon and procedural stars, one instanced glow batch, one shared 8-slot lighting node that lights terrain, ocean, beaches, fx and every lit model from flares, pots and beams (with a CPU twin the GPU is tested against), a searchlight beam with ground and cloud hit, flares that descend at OP 1664's M24 rate (700 ft/min), drift with the wind, go out in water and burn 25 s on land, aircraft position lights read off each rendered mesh, a fixed 35% night cockpit, the player's recorded lights switch (`N`), Dev-only Late dusk and Night takeoff times, quality tiers, and a pure contract (`src/sim/lights/`, `LIGHT_CONTRACT_VERSION = 1`) for F6B.

## Contract for F6B (frozen at this handoff)

`lightsAt(specs, world)`, `illuminanceAt(lights, point)` and `ambientNightLevel(sunElevationDeg, cloudCover)` in `src/sim/lights/lights.ts`: pure, no THREE, no render clock; lights are derived from content, tick, terrain, wind and aircraft/ship poses and are never stored (a test proves the world checksum is identical with lights evaluated every tick). The player's switch is the recorded action `{kind:'control', control:'lights', value}`; it has no sim effect until F6B. Changing the 8-slot shape (D1) or that action (D2) is a version bump.

## Tests

**Tests updated:** the three enrolled scenario lists (`titleScreen.test.ts`, `sortieFlow.test.ts`, `mission/options.test.ts`: Night Range, Night Field, Night Bay rows), `recorder.test.ts` (the lights action and old-record parse), `sun.test.ts` (Dev night takeoff hours).
**Tests still valid:** the day-render specs, the golden trajectory and soak (lights never enter the world), `ocean.spec.ts` (the ocean shader gained a guarded term; still matches its CPU reference), the legend and bindings tables (two keys became one).
**New:** `tests/sim/lights/*` (contract, flares, airframe lights against the meshes), `tests/render/{night,lights,lightSelect,lightTiers,beam,cockpitDim}.test.ts`, `tests/e2e/{night,nightLights,nightTakeoff,overlaySelect}.spec.ts`, `tests/e2e/nightBudget.spec.ts` (budget mode). Each new test was shown to fail against its fault; the mutations are listed in the CP reports.
**Known gaps:** the E2E thresholds were measured on the nexus 680M, not re-run on the reference GPU; the budget numbers below; the A4 anchorage scene is not built (base layouts are F8); cloud shadows at night and the beam against a real cloud deck were not exercised.

## Accessibility check (F6 gate)

Measured contrast (WCAG ratio on linear luminance of screenshots, nexus 680M): flare pot against its surroundings 15:1 (target 8), red harbor light 16:1 (3), parachute flare against sky outside its halo 14:1 (8), searchlight beam 9:1 (3), a nav light at 1.1 miles 16:1 (3), an unlit pot 1.2:1 (it draws nothing). Gauges at the fixed night level: needles and major marks at least 4.5:1, minor marks at least 3:1 for all four cockpit families (asserted).
**Failing, for your ruling:** the player's own airplane in the chase view at night is a near-black silhouette against the lit sea: about 1.16:1 against the sea and 1.24:1 against the sky (measured on `docs/handoff/2026-10-14-f6a-cp1-shots/range-air-over.png`'s state). It reads as a shape, not a contrast. The lever, if you want it fixed, is a small minimum ambient on aircraft materials (looks ruling); I did not change it.

## Budget (Task 11): honest status

Measured 2026-10-14 on the ryzen RX 6700 XT through Mark's console session, under `hwlock ryzen-budget`, 1440p High, via `tests/e2e/nightBudget.spec.ts`. **The machine was not quiet** (Mark was logged in; this is not the H0 overnight condition): the same unmodified view swung between about 5 and 15 ms between page loads, and main's own day views ran 7 to 15 ms. Absolute numbers below are therefore indicative only; the paired numbers are trustworthy.

| Gate | Result | Verdict |
| --- | --- | --- |
| (c) lights on minus lights off, alternating inside one page load, median of six | night-field **+0.98 ms**, night-bay **+0.13 ms** | pass (field is at the edge of 1.0) |
| (b) each night view at most 8.33 ms, median of three loads | night-floor-600 15.4, night-dusk-j5 13.6, night-field 7.3, night-bay 12.5 | **not demonstrable here**: three of four exceed 8.33 in this noisy session, but so do main's day views |
| (a) nine day views regress by less than 0.3 ms against main | paired A/B (three alternating rounds, main on its slot, this branch on its slot) is too noisy to read (per-view deltas from -5.5 to +7.0 ms; individual runs bimodal); a controlled in-session A/B of one view with clouds off and High, same server, main source against this branch, gave main 11.4 / 14.4 and this branch 11.05 / 13.4 (parity) after the fixes below | **inconclusive**; needs a quiet-machine run (the nightly) |

What the measurement found and fixed (each confirmed by an alternating A/B, not a single run):
1. The dev overlay's per-frame `getSelection()` / text-node rewrite added 2 to 5 ms in the DEV build (the CPU cost per frame changes how hard the GPU is driven). Now click-to-freeze with `textContent` as before: parity.
2. The dome's stars and moon and the shared lighting loop ran for every daytime pixel: now behind uniform branches.
3. With one flare lit over open sea, the shared node per fragment on the ocean cost 3 to 4 ms: the ocean now evaluates it per vertex (+0.05 to +0.13 ms). The same change on the terrain broke the reference GPU's pipeline limits ("infringes limits"), so the terrain stays per fragment.
4. Budget samples taken right after a page load, or after the player crashed, read 2 to 3 ms: the spec now waits for 4 s of sim and launches the bench with God mode.

**Update 2026-10-15:** a controlled A/B found ryzen's frame times are bimodal (fast about 5-9 ms, slow about 12-15 ms per page load) with no identified cause, so a single run cannot settle gates (a) and (b); judge them on the median of at least 5 fresh loads per view or on the nightly's trend. See `docs/testing.md` "Known gaps" and [the A/B](2026-10-15-ryzen-budget-noise-ab.md).

**Open for the first quiet run:** gates (a) and (b). If (a) fails the plan's fallback is sprites-only (D1); if only (b) fails on the night floor, the lever is the cloud tier, not the lights (the floor view has no lights).
