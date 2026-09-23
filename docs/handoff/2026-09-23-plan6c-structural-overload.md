# Plan 6c handoff — structural-overload damage

2026-09-23. Plan 6's final currently implementable slice is complete on
`main`. The F6F now takes deterministic structure damage beyond its existing G
and dive-speed limits. Torpedoes remain explicitly deferred until the project
has a second, historically appropriate airframe; Plan 7 AI is next.

## What landed

- `src/sim/damage/overload.ts` derives proper load from consecutive fixed-tick
  velocities and airspeed from velocity relative to wind. Steady level motion
  is about 1 g and ballistic motion about 0 g.
- Damage per second is the sum of the fractional G-limit and speed-limit
  excesses. Exactly at a limit is safe. There is no randomness or hidden
  fatigue record: normalized structure health is the accumulator.
- `AircraftCombat.stress` carries current load factor and airspeed, both live
  limit flags, and their peaks since creation or Restart.
- `stepCombat` resolves structural damage before releases and gunfire. A
  failure on that tick cannot emit a weapon. Crashed aircraft do not take
  overload damage from ground-contact correction.
- Structural failure records no attacker and awards no kill.
- The combat readout shows `OVER-G` and `OVERSPEED`; DEV combat diagnostics
  expose current and peak telemetry.
- Damage destruction now opens the shared debrief/Restart path. Reference-GPU
  acceptance found that the pre-existing frame hold worked but `main.ts` only
  raised the dialog for impacts, which left gunfire and overload deaths frozen
  at HP 0. The new destruction model closes that production gap for both.

The existing `limits.gLimit` and `limits.diveSpeedMps` values were not changed.
This slice adds gameplay consequences to those content values and makes no new
historical claim for them.

## Deterministic rule

For every live, uncrashed aircraft fixed tick:

```
acceleration = (current velocity - previous velocity) / dt
proper acceleration = acceleration - gravity
load factor = length(proper acceleration) / g
airspeed = length(current velocity - wind)

g excess = max(0, load factor / g limit - 1)
speed excess = max(0, airspeed / dive-speed limit - 1)
structure loss = (g excess + speed excess) * dt
```

The content model has one unsigned G limit, so vertical, negative and lateral
proper acceleration share that limit. That is the smallest model consistent
with the master design's “sufficient for drama; no per-component structural
modelling” boundary.

## Tier 1 evidence

Final command:

```
npm run verify; rc=$?; echo rc=$rc
```

Result: `rc=0`; typecheck, ESLint and dependency-cruiser clean; 127 test files
passed, 1,318 tests passed and 1 pre-existing test skipped. Focused coverage
includes 0/1 g measurement, wind-relative speed, exact limits, continuous and
additive damage, unattributed destruction, crash exclusion, same-tick weapon
refusal, clone determinism, readout/diagnostics, and destruction debrief copy.
No flight or landing golden changed.

## Reference-GPU evidence

Command, against the served Nexus checkout through the Windows Playwright
server:

```
PW_REMOTE=ws://localhost:39001/ \
PW_BASE_URL=https://ww2airsim.windomlane.org \
npx playwright test tests/e2e/structural-overload.spec.ts
```

Result: 1 passed in 34.9 s, exit 0, on the AMD RDNA 2 reference adapter at
2560×1440. The production keyboard and flight path observed:

- simultaneous live `OVER-G` and `OVERSPEED` warnings;
- peak 10.82 g and 220.19 m/s;
- structure at 0.8698 after the measured dive/pull-out, then zero after a
  sustained structural failure;
- exact tick and structure freeze while paused;
- destruction debrief and its real Restart button;
- fresh structure and reset stress peaks after Restart;
- zero WebGPU validation errors;
- render-pass p95 1.301 ms over 2,837 samples, below the 6.0 ms ceiling.

The acceptance screenshot is `test-results/structural-overload-dive.png` in the
served checkout's ignored test output.

## Commits

- `44288c0` — Plan 6c structural overload
- `769e0ee` — Add structural-overload damage
- `418d9bd` — Accept structural overload on reference GPU
- The roadmap/README/handoff closure commit follows this document.

## Remaining work

- Torpedoes wait for a second, appropriate airframe and are not a blocker.
- Plan 7 AI is the next implementable roadmap phase.
- The unrelated low-tier tree-hiding incident remains tracked in
  `docs/incidents/2026-09-20-low-tier-hides-trees.md`.

