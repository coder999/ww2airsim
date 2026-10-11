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
wreck. Each spec selects an established scoring category: armored vehicles use
Tank (300 points) while light scout cars use Building. Same-side damage uses
the friendly-fire/discharge path and cannot award either score.

The current Tank Buster mission's six stationary 48-HP Chi-Ha targets were
migrated from the temporary structure representation onto this vehicle system,
preserving positions, headings, tags, objectives, model and Tank score. Live
vehicle positions also drive replay interpolation, held-spawn terrain seating,
render diagnostics and objective chart markers.

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
- Post-merge focused Vitest for vehicle sim/spawn/combat/friendly fire, replay,
  scenario/render/chart integration, Tank Buster, Surigao Strait, C4 asymmetric
  thrust and Blender duplicates: 13 files, 227 tests passed.
- Pre-review `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`: 414 test files passed;
  5,716 tests passed, 11 skipped (5,727 total), with typecheck, lint and
  dependency checks green.
- Post-merge full verify: typecheck, lint and dependency checks passed; Vitest
  passed 417 files / 5,913 tests with 11 skipped, but retained two current-main
  AI failures. `aiLethality.test.ts` exceeded its 30-second wall-clock limit
  under full-suite load and passed 10/10 in isolation. Escort's easy unescorted
  case lost one bomber rather than its asserted more-than-one both in-suite and
  isolated; normal/hard and the other seven Escort cases passed. No vehicle,
  Tank Buster, Surigao Strait, C4 or chart regression failed.
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
- Vehicles reuse the existing Building or Tank scoring rows rather than adding
  a separate vehicle row.
- Vehicle wrecks have a restrained geometric treatment; they do not yet emit a
  dedicated persistent smoke effect.
- The Kurogane has no rider. Add one only if a close-view scenario justifies
  the separate figure, rig and draw-call cost.
