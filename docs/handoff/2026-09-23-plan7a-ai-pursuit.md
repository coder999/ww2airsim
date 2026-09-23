# Plan 7a handoff — AI flight controller and pursuit pilot

2026-09-23. Plan 7's first bounded slice is complete on `main`. An AI pilot
can now fly the shared flight model through ordinary `Controls`, pursue an
assigned aircraft with a bounded lead intercept, and fire only when it has a
short-range gun solution. It establishes the control and world-update seams
every later Plan 7 maneuver and decision rule will build on. Plan 6c
structural overload was the prior handoff; nothing about that slice changed
here.

## What landed

- `src/sim/ai/controller.ts` — a pure proportional-derivative flight
  controller. It takes an aircraft state and a desired world-space velocity
  and emits ordinary `Controls`: heading and pitch error against the body
  frame drive roll/pitch/yaw, body-rate terms damp the response, and desired
  speed drives throttle. Every output is finite and clamped to the same
  ranges a human pilot's controls are. It writes no aircraft state directly
  and retains no hidden state between calls.
- `src/sim/ai/pursuit.ts` — a bounded constant-velocity lead intercept
  (`leadPursuitVelocity`, capped at 3 s of lead) turned into a desired
  velocity for the controller outside gun range, plus a short-range (550 m)
  muzzle-velocity-lead gun gate (`hasGunSolution`, a 3-degree cone) that holds
  the trigger only when the nose is actually on the target. Once in range,
  `pursuitDesiredVelocity` steers at that same muzzle-lead point rather than
  the (much longer, up to 3 s) maneuver lead — see "Post-review correction"
  below for why that distinction is load-bearing.
- `src/sim/loop.ts` — a static pilot assignment (`{ target: <aircraft id> }`)
  on an entity. On every fixed tick, `advance` snapshots every aircraft
  first, derives every assigned pilot's `Controls` from that one snapshot,
  and only then steps any aircraft — so controller cadence is the fixed 60 Hz
  tick regardless of render rate, reversing the aircraft array cannot change
  a trajectory, and an assignment can fly the player seat in headless tests.
  Impacted and destroyed pilots receive no new commands.
- `src/sim/scenario.ts` / `src/render/scenarioLoad.ts` / `tools/content/load.ts`
  — a strict airborne aircraft-start alternative (compass heading + speed,
  gear retracted, not terrain-settled) alongside the existing parked form,
  and an optional validated `pilot.target` that must name another aircraft in
  the same scenario and cannot name itself. Both content loaders now collect
  airfields only for parked starts.
- `content/scenarios/pursuit-range.json` — two airborne F6Fs: the player
  heading east at 3,000 m/120 m/s, and `pursuer-1` 500 m astern and 50 m to
  one side at 125 m/s, assigned to pursue the player. The geometry was tuned
  so the real fixed-step pilot reaches a gun solution within 600 ticks
  (10 s) — proven in Tier 1 (`tests/sim/scenario.test.ts`, "turns the
  production pursuit pilot onto a gun solution") and observed at 12.5 s
  wall-clock on the reference GPU.
- `src/render/diagnostics.ts` / `src/render/main.ts` — `window.__ww2.aircraft()`
  gained `headingRad` per entity, derived as the inverse of the same compass
  construction `scenario.ts` uses for an airborne start. Added because
  Tier 2 had no way to distinguish an AI pilot actually turning the airframe
  from an unassigned entity drifting in a straight line under its spawn
  velocity — the exact ambiguity `aircraft().x/y/z` alone left open.
- `tests/e2e/ai-pursuit.spec.ts` — the reference-GPU acceptance spec (see
  below). Created at `tests/e2e/`, not the plan's stated `tests/tier2/`: this
  repo's actual Tier 2 convention (`playwright.config.ts`'s `testDir`) is
  `tests/e2e`, and there is no `tests/tier2/` directory.

## Design boundary (deliberate, from the design doc)

This slice does not add pilot skill, reaction delay, energy-state utility
scoring, disengagement, defensive maneuvers, formation keeping, landing AI or
teams. Those need persistent pilot decision state and are Plan 7b/7c, built on
this controller seam. The claim here is narrow and physical: an AI pilot can
fly and attack through the same fair path the player uses.

## Post-review correction

The whole-branch review this plan's execution process requires (one fresh
context over the whole diff, not a per-task review) found two Important
defects that both tiers of acceptance had passed without catching. Both are
fixed on `main`; this section is dated and kept rather than rewritten, per
this repo's own rule about not silently erasing a wrong claim.

**The gun gate and the steering disagreed on where the nose was aimed.**
`hasGunSolution` gated on the muzzle-velocity lead (well under 1 s of flight
time at 550 m), but `pursuitControls` flew the controller at the *maneuver*
lead (capped at 3 s) — a materially different point for a crossing target.
The trigger therefore opened only where the two unrelated leads happened to
cross paths, at the cone's ragged edge and biased toward over-lead. Measured
before the fix, over 90 s of the shipped `pursuit-range` scenario through
production `advance`: **1,002 rounds fired, 0 hits**, 42% of ammunition spent
in the first 20 s, with miss distances of 28.0 m, 11.3 m and 7.9 m against a
~10 m airframe at the three recorded firing moments. Both acceptance tests
only asserted `shots > 0`, which a coincidentally-timed blind burst satisfies
exactly as well as a real solution does — the earlier "holds the trigger only
when the nose is actually on the target" claim above was aspirational, not
measured. Fixed by adding `pursuitDesiredVelocity`, which steers at the same
muzzle-lead direction `hasGunSolution` gates on once in range (falling back to
the longer maneuver lead outside it, unchanged) — so the nose the gate checks
is the nose actually being commanded. New Tier 1 coverage: a unit test
proving the two leads coincide once in range and diverge outside it
(`pursuit.test.ts`), and a scenario-level test proving actual hits, not just
shots (`scenario.test.ts`, "the pursuit pilot actually hits the target it is
gated on"). Tier 2 now polls `combat().player.structure < 1` — a round
actually landing — rather than stopping at the first tracer.

**A target behind the nose could report zero heading/pitch error.**
`controlsForDesiredVelocity`'s `ahead = Math.max(1e-6, dot(desired, forward))`
forced `atan2`'s x-argument positive for every behind-nose case, discarding
the sign and collapsing both errors toward 0 whenever the lateral/vertical
offset was also near 0 — a real geometry right after a pursuit overtake. The
review observed 70 s (ticks ~1,200–5,400) with no gun solution at all after
`pursuer-1` closed to 3 m of the player, alongside prolonged full-deflection
control. Fixed by removing the floor: `atan2` already handles a negative or
zero x-argument correctly and needs no epsilon guard. New Tier 1 coverage: a
dead-astern case that previously commanded nothing now commands a real,
saturated turn (`controller.test.ts`).

**Declined:** a minimum engagement range / break-off maneuver, so
`pursuer-1` still closes to point-blank range and, since no aircraft-aircraft
collision is modeled anywhere in this codebase, passes through the player
rather than standing off. This is explicitly Plan 7b/7c territory (design
doc §5's "disengagement, defensive maneuvers") and not a defect this slice's
own claims depend on; the atan2 fix above already restores the pilot's
ability to fly a coherent turn back onto the target afterward, which was the
review's actual named cost ("never fires again for the remaining 70 s").

Fix-pass Tier 1: `npm run verify` → rc=0, 129 test files, 1,338 tests passed
(4 new), 1 pre-existing skip — no regression. Fix-pass Tier 2: re-ran
`tests/e2e/ai-pursuit.spec.ts` on the reference GPU; see below for the
current numbers.

## Tier 1 evidence

Final command:

```
npm run verify; rc=$?; echo rc=$rc
```

Result: `rc=0`; typecheck, ESLint (zero warnings) and dependency-cruiser
(126 modules, 365 dependencies) clean; 129 test files passed, 1,338 tests
passed and 1 pre-existing test skipped. Focused coverage: controller command
signs/damping/throttle/bounds/the dead-astern regression (6 tests), bounded
lead pursuit/gun gate/per-tick recomputation/array-order independence/
structured-clone determinism/player-seat AI/gate-steering agreement (26 tests
across `controller.test.ts`, `pursuit.test.ts`, `entities.test.ts`), airborne
scenario starts/pilot target validation/browser-Node loader parity/the
pursuit-range bundle/actual hits, not just shots (32 tests across
`scenario.test.ts`, `scenarioLoad.test.ts`, `dist.test.ts`). No existing
flight, combat, landing or replay golden changed.

## Reference-GPU evidence

Command, against the served Nexus checkout through the Windows Playwright
server:

```
PW_REMOTE=ws://localhost:39001/ \
PW_BASE_URL=https://ww2airsim.windomlane.org \
npx playwright test tests/e2e/ai-pursuit.spec.ts
```

Result: 1 passed in 24.3 s, exit 0, on the AMD RDNA 2 reference adapter at
2560×1440. The production keyboard/flight path observed, with the player
never touching a key:

- `pursuer-1`'s `headingRad` changed by more than 2 degrees from its spawn
  heading, before any gunfire — proof `controlsForDesiredVelocity` reached the
  airframe rather than the entity drifting under its spawn velocity;
- at least one tracer round fired while `combat().player.firing` stayed
  `false` throughout — the only possible source is `pursuer-1`'s own AI-held
  trigger, reaching `frame.controls.fire` the same way the player's own
  Space key does;
- **the player's own `combat().player.structure` dropped below 1** — a round
  from that fire actually landing, not just being fired. This assertion is
  the fix-pass addition; the pre-fix build passed everything above it and
  would have hung here (0 hits ever, over the full 90 s the review measured);
- `pursuer-1` moved more than 10 m from its spawn position;
- zero WebGPU validation errors;
- render-pass p95 0.860 ms over 3,094 samples, below the 6.0 ms ceiling.

The acceptance screenshot is `test-results/ai-pursuit.png` in the served
checkout's ignored test output.

## Commits

- `7b5eb26` — Start Plan 7a AI flight controller
- `7903a69` — Integrate fixed-tick pursuit pilots
- `732ea9d` — Add airborne AI pursuit range
- `9a0150e` — Plan 7a task 5: reference-GPU acceptance for AI pursuit
- `0cedf13` — Close Plan 7a AI pursuit (the original closure commit; this
  document's "Post-review correction" section and the numbers below it were
  edited in place afterward rather than left to contradict a later commit)
- The fix-pass commit (gun gate/steering agreement, the dead-astern
  controller fix, and this document's correction) follows this document.

## Remaining work

- Plan 7b/7c: pilot skill, reaction delay, energy-state utility scoring,
  disengagement, defensive maneuvers, formation keeping, landing AI and teams
  — the design doc's explicit deferred list (§5). Includes the declined
  minimum-standoff/break-off behavior from "Post-review correction" above:
  `pursuer-1` still closes to point-blank range on a first pass.
- The project still has one airframe, so `pursuit-range` is a systems test,
  not a historical matchup; aircraft identity and teams remain later content
  work.
- The unrelated low-tier tree-hiding incident remains tracked in
  `docs/incidents/2026-09-20-low-tier-hides-trees.md`.
