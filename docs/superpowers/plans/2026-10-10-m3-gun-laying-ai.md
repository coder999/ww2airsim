# M3: gun-laying AI

**Status (2026-10-10):** complete on branch `m3-gun-laying-ai`, worktree
`/home/mark/projects/ww2airsim-m3-gun-laying`, cut from local `main`
`61297b23e10709288f9e19e264f1399494fb00ae` (`Checkpoint cloud rendering research`).
Master plan item: Track M, M3.
**Viewing checkpoint (Mark, 2026-10-10):** final product only.
**Run mode:** unattended.
**Location:** an isolated worktree. Do not modify `main`, E3, or either cloud worktree.
**Heavy jobs:** touched-file tests while iterating; tests, typecheck, lint and full
`npm run verify` through `REMOTE_RUN_OVERFLOW=0 remote-run ...` on Ryzen. Any browser
capture uses Ryzen's shared Playwright infrastructure without closing shared tunnels.

## Outcome

A ship mount chooses a legal hostile target, computes a ballistic lead, and publishes a
deterministic training/elevation pose. The renderer drives M1's separately instanced main
turrets and AA mounts from that pose. M2 consumes the same AA target choice and lead seam,
so a firing mount points where its director is laying it. Main-battery turrets lay onto
hostile ships or ground targets now, preparing the pose and target contract M4 will use,
but M3 does not fire a main-battery shell or change hull damage.

M2's calibrated timing, aim-error draws, damage, caps and lethality remain its contract.
M3 factors target choice and nominal lead out of `stepAa`; it does not retune M2 by making
visual slew a new firing gate.

## Validated starting point (read 2026-10-10)

| Fact | Evidence | Consequence |
| --- | --- | --- |
| Track M says M3 is “target choice, turret training and lead”; it drives M2 mounts and M4 turrets. M4 firing is the next item. | `MASTER_PLAN.md`, Track M items 3–4 | This plan owns laying only. Main-battery projectiles, sound, damage and mount knock-out stay out. |
| Twelve ship specs ship; every non-merchant has `armament`, while the Maru has none. | `content/ships/*.json`; enrolled M2 and ship-roster tests | Enroll every armed ship through content rather than adding per-class implementations. |
| Armament is already ordered bow-to-stern in three lists and carries ship-frame position, rest `bearingDeg`, `kit`, barrels and dual-purpose `aa`. | `src/sim/world/ships.ts` | Stable mount ids are `TurretN`, `HeavyAAN`, and `LightAAN`; no schema migration is needed. |
| A light-AA gallery is one sim fire position but renders one locator per barrel (`LightAA<N>_<i>`). | `ships.ts`; `docs/models.md`; M1 handoff | One laying pose fans out to every rendered locator with the same base name. |
| M1 already exposes `ShipMountView.setTraining` and `.setElevation`; nothing in the game loop calls them. | `src/render/scene/ship.ts`; `src/render/main.ts` | M3 adds a small render bridge; it does not rebuild models or mutate shared geometry. |
| M2 independently chooses the nearest aircraft per mount and solves light/heavy lead inside `stepAa`. | `src/sim/weapons/aaFire.ts` | Extract those decisions behind pure, tested functions and retain their firing behavior. |
| `CombatState.aa` is serialized with the world and is already the M2 renderer/audio seam. | `src/sim/weapons/combat.ts`; replay tests | Laying poses live beside AA timers in that deterministic state; replay gets them without a side channel. |
| `stepCombat` already receives live ships, structures, aircraft, aircraft sides and ship/structure sides each tick. | `combat.ts`; `loop.ts` | It can form both air and surface target sets without renderer imports or new global state. |

## Design

### 1. One pure director

Add `src/sim/weapons/gunLaying.ts`, with no renderer or browser dependency:

- Flatten an armament into stable named mounts. Preserve M2's existing AA order/keying so
  its hash-derived skill, reaction delay and fire cadence do not change.
- Represent legal targets as aircraft, ships, or structures with side, position, velocity
  and alive/down status decided by the caller.
- AA mounts select the nearest hostile airborne aircraft inside their existing M2 envelope.
  A dual-purpose main turret follows that aircraft while it is the M2 shooter.
- A main turret not engaging an aircraft selects the nearest hostile live ship, then a
  hostile standing ground target. This tie-break is explicit and stable. AA-only mounts
  never select surface targets.
- Light AA uses M2's existing `solveMuzzleLead`; heavy AA uses M2's current constant-speed
  velocity/acceleration intercept. Main batteries use a named director shell-speed value
  only to calculate the visual lead that M4 will consume; M4 may replace that value when
  its ammunition is specified.
- Convert the nominal world aim into ship-relative training from the mount's rest bearing
  and elevation above level. Angles are finite, training is wrapped to (-pi, pi], and an
  unsolved or absent target returns the mount to rest rather than publishing NaN.

The state is a bounded map by ship id and mount name. It contains only the current target id,
target kind, training and elevation. It does not duplicate target positions or grow with time.

### 2. Preserve M2's measured behavior

`stepAa` asks the director for the AA target and nominal lead. It then applies the same
per-mount ranging, skill, aim/fuse error, reaction delay, cadence and projectile construction
as today. The test that deliberately faults target selection and the existing calibration
pins must show the extraction is real and behavior-preserving.

A quiet world still returns the same state object when no owner can lay or fire. A ship with
only a distant surface target may update its bounded laying pose, but it emits no projectile.
Sunk ships, destroyed batteries, downed aircraft, friendly targets and entities without a
side are never selected.

### 3. Drive the render mounts

Add a pure render helper that applies one ship's laying map to its `ShipView.mounts`:

- exact name for ordinary locators;
- base-name match for a gallery's `LightAA<N>_<i>` locators;
- `setTraining` receives the sim's relative pose with the renderer's port-positive sign;
- `setElevation` remains clamped by the kit's own measured maximum;
- no pose means rest bearing and level, including after a target disappears or Restart.

Call it in `src/render/main.ts` beside `setDamage`, once per ship per rendered frame. Boxes
and mounts whose content `kit` is null stay harmless no-ops.

### 4. Inspection seam and final checkpoint

Extend the existing development combat diagnostics with bounded laying records (ship,
mount, target, bearing/elevation). Add a capture-gated E2E tool for `aa-range` or Range Test
that asserts at least one mount has a hostile aircraft target and records a close view of
trained/elevated mounts. This is evidence for the final-only checkpoint, not a correctness
gate. Correctness stays in deterministic tests.

## Executable tasks

1. Add failing table-driven director tests: enrollment/names, hostile target choice and stable
   tie-breaks, light/heavy/main lead, relative angle signs, invalid/absent target, sunk/friendly
   exclusions, gallery fan-out, determinism and bounded state.
2. Implement `gunLaying.ts`; fault the selector/lead once to prove the new tests detect it.
3. Refactor `aaFire.ts` to consume the director while preserving M2's state keys and every
   lethality input. Run AA director, combat, lethality and difficulty tests through Ryzen.
4. Build live surface targets in `stepCombat`, update bounded laying state, and add combat-level
   tests proving no main-battery projectile or hull damage occurs.
5. Add the render bridge and enrolled render tests proving exact and gallery-name mapping,
   training/elevation, reset-to-rest and absent-mount safety.
6. Add diagnostics and the capture-gated browser tool. Run its focused reference-GPU capture
   on Ryzen if a shared server/slot is available; do not disturb another run to obtain it.
7. Run focused tests while iterating, then `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`.
   If the AA calibration pins move, treat that as a defect unless the change is explained by
   a pre-existing untested target-choice ambiguity and record the measured before/after sweep.
8. Update only Track M's M3 ledger text, standing gameplay/model/testing docs that became
   stale, and `docs/handoff/2026-10-10-m3-gun-laying-ai.md`. Email the handoff with final
   evidence, commit all intentional files, and push the feature branch without merging it.

## Acceptance

- Every armed shipped ship is enrolled and every drawable mount can receive a finite pose.
- M2 AA selects a hostile aircraft and its published pose targets the same id/nominal lead.
- Main turrets select hostile ships/structures but M3 creates no main-battery projectile,
  impact, audio event or hull damage.
- Friendly, destroyed, sunk, parked and side-less entities are excluded according to their
