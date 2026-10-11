# M3 gun-laying AI handoff

**Status (2026-10-10):** complete on branch `m3-gun-laying-ai`; not merged and not deployed.
**Worktree:** `/home/mark/projects/ww2airsim-m3-gun-laying`.
**Base:** local `main` at `61297b23e10709288f9e19e264f1399494fb00ae`
(`Checkpoint cloud rendering research`).
**Run mode / checkpoint:** unattended; final product only, as Mark approved.
**Plan:** `docs/superpowers/plans/2026-10-10-m3-gun-laying-ai.md`.

## Result

M3 now owns one deterministic director seam for target choice, nominal lead and
ship-relative mount pose:

- every M2 AA mount selects the nearest legal hostile airborne aircraft inside
  that mount's existing range, and its published pose names the same target and
  nominal lead the firing path uses;
- light AA uses the existing muzzle-lead solver, while heavy AA keeps M2's
  constant-speed/acceleration intercept; M2's ranging error, reaction delay,
  cadence, caps, damage and hash keys did not change;
- a main turret not occupied as dual-purpose AA selects the nearest hostile live
  ship, then a hostile standing structure, and lays onto a visual ballistic lead;
- main turrets do **not** fire, create impacts or sounds, or change hull points.
  The named 760 m/s main-battery director speed is a visual-only placeholder for
  M4 to replace when its ammunition is specified;
- the renderer applies each pose to M1's independent mounts. An ordinary locator
  matches exactly; one sim pose such as `LightAA5` fans out to every gallery
  locator such as `LightAA5_1`. Missing poses return mounts to rest;
- training is wrapped and finite, elevation is finite and the kit clamps it to
  its own measured limit. The world-to-ship conversion accounts for the content
  convention (clockwise/starboard) versus Three.js's port-positive rotation.

`AaState.laying` is bounded current state: ship id to current per-mount pose. It
does not retain history or target positions. The development combat diagnostics
flatten that map so capture tools can inspect ship, mount, target kind/id,
training and elevation without inferring behavior from pixels.

## Main files

- `src/sim/weapons/gunLaying.ts`: pure target/lead/pose director.
- `src/sim/weapons/aaFire.ts`: M2 consumption, stable mount names, bounded poses,
  and main-turret surface laying.
- `src/sim/weapons/combat.ts`: live ship/structure target records and stale-pose
  clearing.
- `src/render/scene/shipGunLaying.ts`, `src/render/main.ts`: exact/gallery render
  bridge and per-frame application.
- `src/render/combatReadout.ts`: the `__ww2.combat().aa.laying` inspection wire.

## Verification

All CPU-heavy work ran through Ryzen with `REMOTE_RUN_OVERFLOW=0 remote-run`.

- focused M3 integration: 6 files, **67/67 passed**;
- M2 lethality and M5 difficulty regressions: 5 files, **51/51 passed**;
- TypeScript, touched-file ESLint and dependency-cruiser: passed;
- full `npm run verify`: **401 files passed, 5,578 tests passed, 12 skipped**;
- the existing crowded Range Test cost/cap gate passed with M3 poses enabled.
  The previously recorded 0.27 ms/tick is explicitly retained as an M2 baseline,
  not relabeled as a new M3 timing. M3 adds no draw call, shader or GPU resource;
  it updates the matrices of mounts M1 already drew.

The capture-gated `tests/e2e/gunLayingCapture.spec.ts` passed **1/1**. It freezes
a close pass only after `aa.laying` reports an aircraft target, asserts a common
target plus finite training/elevation and at least one elevated mount, then
records `docs/handoff/2026-10-10-m3-gun-laying-ai-shots/aa-range-trained-mounts.png`.
All three shared web slots were occupied by other work, so this correctness/pixel
capture used an isolated localhost server on Nexus port 5176 and Nexus's real
Radeon 680M under the `render` group. That server was stopped; the shared Ryzen
Playwright servers, tunnels and web slots were left untouched. This is visual
evidence, not a reference-GPU performance measurement.

## Deliberate limits for M4

- no main-battery firing, shell flight, blast/audio, hull hit or mount knock-out;
- no turret slew-rate, traverse arc, occlusion or fire-permission gate. M2 remains
  calibrated because a visual slew was not made a new firing gate;
- surface laying has stable priority and lead but no M4 range/doctrine decision;
- ground batteries still fire through M2 but have no ship model/mount rig to pose;
- a dual-purpose main turret follows an aircraft while M2 owns it. M4 must not
  simultaneously fire that turret at the surface;
- M4 should replace `MAIN_BATTERY_LAYING.shellSpeedMps`, consume the same chosen
  target/pose seam, and add its own range, arc, cadence, shell, damage and sound
  contracts rather than duplicating target selection.

## Integration

The branch is based on local `main` `61297b23`, which was ahead of `origin/main`
when the worktree was cut. Rebase or merge onto the intended integration tip; do
not assume the remote default is an equivalent base.

E3 `e3-bombers-gunners` overlaps `MASTER_PLAN.md`, `docs/testing.md`,
`src/render/combatReadout.ts` and `src/sim/weapons/combat.ts`. Preserve both
features when resolving: E3's gunner step/projectile diagnostics and M3's surface
target construction, `stepAa` surface-target argument, quiet-state clearing and
`aa.laying` diagnostics. The director and render bridge themselves do not overlap
E3. Flattop Hunt overlaps only the standing gameplay/master-plan ledgers in this
change; keep both completion entries. No main, E3, cloud or Flattop Hunt worktree
was modified.
