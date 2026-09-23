# Plan 6b, strike slice — 2026-09-22

The second slice of [Plan 6](../superpowers/specs/2026-09-12-ww2airsim-design.md#15-first-steps)
(master spec §5 "Guns" and "Damage", §15 row 6). Design:
[strike design](../superpowers/specs/2026-09-20-strike-design.md); plan:
[strike plan](../superpowers/plans/2026-09-22-strike.md). The slice now has
both Tier 1 and reference-GPU Tier 2 acceptance. It does not close Plan 6:
structural-overload damage remains, torpedoes wait for a second airframe, and
AI is Plan 7. Nothing was pushed or deployed.

## Acceptance result

The reference RX 6700 XT run on ryzen completed against the served nexus
checkout:

```text
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2 -- tests/e2e/strike.spec.ts

Running 5 tests using 1 worker
5 passed (51.5s)
strike gpu p95 1.758 ms over 379 samples
```

The 1440p GPU result is comfortably below the 6.0 ms budget. All five cases
also asserted zero WebGPU validation errors. The suite proved the title-screen
`both` selection reaches combat, one bomb damages the anchored maru, three HVAR
pair releases raze Dulag hangar 1, pausing suppresses a held release, and
Restart restores stores, ship HP, and structure HP/destruction state.

All four screenshots were copied out before Playwright cleared its results and
read at full size:

- `strike-stores-chase.png`: the combat readout shows `B 2  R 6`; the attached
  stores are present but small at this chase distance.
- `strike-stores-cockpit.png`: the same `B 2  R 6` readout survives the camera
  change. The cockpit view intentionally hides the exterior airframe, so the
  readout—not under-wing geometry—is the meaningful stores evidence here.
- `strike-maru-fireball.png`: a bright orange impact/fire effect is visible on
  the maru and the readout has fallen to `B 1  R 6`.
- `strike-dulag-hangar-razed.png`: the readout shows `RAZED 1` and `B 2  R 0`.
  Dense trees make the exact rubble silhouette hard to isolate in the frame;
  the production diagnostics assertion independently pins hangar 1 at 0 HP.

## Defects the first Tier 2 run found

The first real run passed only 1 of 5 cases. Its failures exposed two live-path
bugs that the original Tier 1 coverage could not reach.

First, a quick V/E key release could vanish on a render frame that ran zero
fixed simulation steps. `main.ts` cleared the edge latch after one rendered
frame, while `nextFrameState` had no way to know that `advance()` consumed
nothing. `frame.ts` now retains an unconsumed bomb or rocket pulse across
zero-step render frames and spends it on the first eligible fixed step. It
deliberately discards releases while paused, waiting for terrain, crashed, or
destroyed. Regression tests cover both high-render-rate retention and the
paused-release discard.

Second, structure collision boxes were initially constructed at absolute
sea-level height (`y = 5`) before terrain arrived. Real terrain under Dulag
hangar 1 is about 10.38 m, so its collider was buried and rockets passed over
it. `buildStructures` now accepts terrain and anchors each box to local ground;
the world rebuilds structures when terrain arrives and when New game/Restart
rebuilds the world. A real-terrain unit test pins the hangar collider's bottom
to the sampled Dulag ground.

The Tier 2 geometry is measured rather than eyeballed. A level HVAR pass starts
400 m out at local ground + 17 m; the shipped rocket drops about 10.7 m over
that run. The bomb case starts 100 m before release. A new Tier 1 regression
runs the fully loaded Hellcat for 50 fixed ticks at idle power, measuring the
release at 117.6 m/s while descending 2.7 m/s, then pins the bomb's 17.37 s,
1,995.4 m trajectory. That is intentionally distinct from the pristine
projectile-only calibration below.

## Tier 1 verification

The final full pipeline completed with `rc=0`:

```text
✔ typecheck: clean
✔ lint: 0 warnings (src tests tools spike)
✔ depcruise: no dependency violations found (123 modules, 357 dependencies cruised)
✔ vitest: 126 test files, 1308 passed, 1 pre-existing skip
```

`tests/sim/strike.test.ts` alone has 23 passing tests. It covers release rules,
stores order and counts, the loaded-airframe browser calibration, bomb and
rocket flight, nearest-contact detonation, blast falloff and arming, ship and
structure damage, sinking, RAZED filtering, and deterministic continuation.

The projectile-only AN-M65 calibration remains useful as the content-level
reference: a perfectly level 120 m/s release from 1,500 m falls for 17.67 s,
travels 2,066.5 m, and reaches 202.9 m/s at the water. The original content
estimate of about 1,200 m was roughly 1.7× low; its 200 m/s speed estimate was
right. For HVAR, the dragless closed-form burn reaches launch speed + 419 m/s
(539 m/s from a 120 m/s launch) within 1%; shipped drag keeps burnout within
the tested 519–539 m/s bound.

## What the pilot gets

- A title-screen loadout picker: clean, bombs, rockets, or both (default both),
  carried through New game and Restart.
- V drops one 1,000 lb bomb per press; E fires the outermost remaining HVAR pair
  per press. Releases are edge-triggered and cannot repeat while held.
- Remaining stores affect mass and drag, hang under the wings, disappear as
  released, and appear as `B n  R n` in the combat readout.
- `?scenario=strike-range` includes a 240 HP anchored Type B cargo ship east of
  enemy-held Dulag. Ships burn and sink; hangars and the tower take damage,
  collapse, and count toward `RAZED`.
- Bomb-release and synthesized rocket-whoosh cues are driven by cumulative
  successful release counts.

## Remaining scope and one parked visual issue

Plan 6 remains in progress: structural-overload damage remains; torpedoes wait
for a second airframe. AI pilots are Plan 7. The earlier Task 8 review also
parked one cosmetic issue: the renderer infers impact effects from a projectile
disappearing, so a dud or lifetime expiry can produce a false fireball. Fixing
that honestly needs a simulation-level detonation signal; no state or damage
result is wrong.

Mark's manual flying queue still includes the Plan 6 gunnery slice, the title
screen, and 16c's movable sun (`?timeOfDay=17` for sunset). This automated
reference-GPU acceptance does not replace that eyes-on pass.
