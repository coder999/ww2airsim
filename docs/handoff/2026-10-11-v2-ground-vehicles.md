# V2 Ground Vehicles handoff

Date: 2026-10-11
Branch: `v2-ground-vehicles`
Plan: `docs/superpowers/plans/2026-10-11-v2-ground-vehicles.md`

## Shipped behavior

Scenario and held-group `vehicles` are deterministic world entities. Each names
a vehicle spec and an authored `[x, z]` waypoint route. The vehicle advances at
its capped requested speed with a bounded yaw rate, samples terrain under its
center and footprint for height/pitch/roll, stops at its final waypoint by
default, and optionally loops. There are intentionally no player controls,
pathfinding, avoidance, suspension forces or road-network assumptions.

Vehicles participate in gun, rocket and blast collision/damage. Their hit
points live in combat state; destruction permanently stops the simulation
entity, resolves vehicle mission targets, and leaves a modest leaned/squashed
wreck. Vehicle kills reuse the established Building score/category.

The Gunnery Range includes a Type 95 Kurogane route near Tacloban. The Type 95
is a new original deterministic Blender model and reuses the V1 jeep rig seam.

## Content and provenance

- `content/vehicles/type95-kurogane.glb`: 128,976 bytes, 892 triangles, seven
  draw calls; authored for this project under AGPL-3.0-or-later.
- Dimensions: 3.60 x 1.52 x 1.68 m from the German Wikipedia article
  `Typ 95 Aufklarungswagen`, read 2026-10-11.
- Identity/service cross-check: Australian War Memorial collection record
  C110415, read 2026-10-11.
- Wheelbase, wheels, track, panels, seats and fittings are explicitly labeled
  estimates in `tools/models/blender/type95-kurogane.py`.
- The researched CC-BY fallback was not used. No new third-party model credit
  or rider asset is required.

## Verification

Recorded after implementation:

- `npm run typecheck`: pass.
- Focused Vitest for vehicle sim, scenario integration, combat, vehicle rig and
  vehicle-model conformance: five files, 103 tests passed.
- Localized regression rerun after the first full-suite findings: three files,
  86 tests passed.
- `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`: 414 test files passed;
  5,716 tests passed, 11 skipped (5,727 total), with typecheck, lint and
  dependency checks green.
- Bounded nexus local-GPU E2E (isolated loopback Vite port; no shared
  HTTPS slot): Gunnery Range strafing-pass mission plus the vehicle Hangar
  capture tool, two tests passed in 1.4 minutes. The mission recorded 144 shots,
  50 hits, one kill, a stopped runway landing, and zero WebGPU validation
  errors.
- Final Hangar checkpoint captures are in
  `test-results/v2-ground-vehicles/type95-kurogane-{left,right,front}.png`.
  All three were inspected at original resolution: silhouette, wheel placement,
  steering pose, fittings and framing are coherent; no clipping or missing
  materials was visible.

## Deliberate limits and follow-up

- Routes are authored coordinates, not pathfinding: content authors must keep
  them on usable land and clear of obstacles.
- Vehicles reuse Building scoring rather than adding UI and progression rows.
- Vehicle wrecks have a restrained geometric treatment; they do not yet emit a
  dedicated persistent smoke effect.
- The Kurogane has no rider. Add one only if a close-view scenario justifies
  the separate figure, rig and draw-call cost.
