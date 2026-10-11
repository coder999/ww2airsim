# V2 Ground Vehicles Implementation Plan

- **Worktree:** `/home/mark/projects/ww2airsim-v2-ground-vehicles`
- **Branch:** `v2-ground-vehicles`
- **Base:** `b8c17fb7e09cb3a44e668ad5568e0678736aff39`
- **Execution:** unattended; final-product-only viewing checkpoint
- **Integration:** commit and push this branch only; no deployment or merge to `main`
- **Machines:** edit/model on nexus; use `remote-run` for repository verification; use a shared Playwright/Hangar slot only if available

## Goal

Promote the existing vehicle assets from Hangar-only exhibits into deterministic scenario entities. A scenario author can place a Willys MB, Type 97 Chi-Ha, or new Type 95 Kurogane on an authored waypoint route; each vehicle follows terrain, can be targeted and destroyed, stops at route end by default, and may loop when explicitly requested.

## Product boundaries

- Scenario-controlled vehicles only. No player driving, pathfinding, suspension simulation, traffic AI, or dynamic road graph.
- Route motion is deterministic fixed-step kinematics with bounded yaw rate and terrain-derived height/attitude.
- Destruction stops motion and leaves a modest persistent wreck treatment using the simplest established render effect.
- The Chi-Ha turret remains visual only; ground weapons are outside this change.
- The Type 95 Kurogane is the Japanese Willys-role counterpart. Build an original deterministic Blender model within the repository's vehicle budgets. Do not add a rider unless the vehicle is unreadable without one.
- Existing aircraft, ship, mission, and static-structure behavior must remain compatible.

## Data contract

1. Add versioned vehicle specs for dimensions, hit points, movement limits, and model identity.
2. Extend scenarios with `vehicles`, each containing identity, side, spec, initial route, speed, and optional `loop`.
3. Extend held groups with vehicle rows so authored mission waves can spawn them consistently.
4. Add a simulation entity/state/order seam with position, heading, terrain attitude, speed, current waypoint, cumulative distance, and deterministic tick.
5. Include live vehicles in combat contact selection, damage state, mission target lookup, objective evaluation, and entity view synchronization.

## Task 1: lock behavior with failing tests

Add focused tests for schema defaults and validation, unique ids, fixed-step route motion, stop-at-end, looping, yaw bounds, terrain pose, deterministic replay, destruction stop, nearest-contact selection, mission target resolution, and frame interpolation. Add failing Hangar/model manifest tests for the Kurogane asset and source row.

## Task 2: vehicle content and loading

Add specs for the existing Willys and Chi-Ha plus the Kurogane. Extend content helpers, browser loading, node test loading, scenario bundles, and static model registries without changing existing model URLs.

## Task 3: simulation entities

Create a small vehicle module parallel to ships. Build state from scenario placement, step toward the active waypoint using fixed-step speed and bounded steering, sample terrain for height/pitch/roll, advance or stop at endpoints, and wrap only when `loop: true`. Reject malformed routes and water-only placements with actionable messages once terrain data is available.

## Task 4: world and scenario integration

Thread vehicle specs and entities through scenario construction, held-group spawning, world state, terrain attachment, stable entity ordering, and reset/respawn paths. Preserve old scenario files by defaulting vehicle arrays to empty.

## Task 5: combat and missions

Give vehicle contacts dimensions and HP. Include them in projectile/bomb/rocket collision selection, damage application, destroyed checks, target positions, enemy target tables, and objective completion. Destroyed vehicles must not continue along routes.

## Task 6: rendering

Reuse `VehicleRig` and its `drive(distanceM, steer)` seam. Add a scenario vehicle view collection, interpolate poses between sim frames, advance wheels/tracks from cumulative distance, steer the Willys front wheels, and keep destroyed vehicles visible with a restrained wreck treatment. Avoid shared-material mutation.

## Task 7: original Kurogane asset

Implement a deterministic Blender generator under `tools/models/blender/`. Model the compact four-wheel Type 95 scout car silhouette, open cabin, spare wheel, lamps, grille, simple interior, and steering wheel. Use stable wheel names required by `VehicleRig`; omit a rider. Export `content/vehicles/type95-kurogane.glb`, record generator/provenance, and enforce the normal vehicle budget (1 MB, 20k triangles, 8 draw calls).

## Task 8: scenarios and documentation

Enroll at least one existing gameplay scenario with modest vehicle routes so the system is exercised without duplicating a test-only world. Update `MASTER_PLAN.md`, `GAMEPLAY.md`, `docs/models.md`, `ASSETS.md`, and appropriate handoff notes with behavior, authoring contract, provenance, and known limits.

## Task 9: verification

Run focused unit/schema/model/render tests first. Generate and inspect the Kurogane render and geometry report. If a shared browser slot is free, run one Hangar capture and one mission E2E/capture that demonstrates moving and destroyed vehicles. Finish with:

```sh
REMOTE_RUN_OVERFLOW=0 remote-run npm run verify
```

No task-specific local full-suite clone will be added.

## Final viewing checkpoint

The only manual viewing checkpoint is after implementation and automated checks: inspect the final Kurogane Hangar view and one mission view showing a vehicle route/wreck state. Earlier asset decisions use deterministic renders and test output.

## Done when

- Authored vehicles move deterministically, follow terrain, stop or loop as configured, and are mission targets.
- Weapons can damage and destroy them; destroyed vehicles stop and remain visibly wrecked.
- Existing scenarios remain valid without edits.
- The original Kurogane model passes repository geometry, size, rig-name, provenance, and Hangar checks.
- Documentation describes authoring and limitations.
- Focused checks and full remote verification pass, changes are committed, and the branch is pushed.

## Risks and mitigations

- **Cross-track overlap:** this work touches `src/sim/loop.ts`, mission target plumbing, shared tests, and planning docs also likely touched by asymmetric-yaw or Surigao work. Keep commits narrowly scoped and expect conflict resolution at integration.
- **Terrain readiness:** vehicle pose depends on asynchronously loaded terrain. Hold or reseat vehicles until terrain is attached, and test both transitions.
- **Collision cost:** vehicles add contact candidates. Keep simple bounded oriented boxes and the existing broad-phase pattern.
- **Model budget:** generator output can exceed draw/size limits. Prefer shared simple materials and procedural primitives, then measure before adding detail.
