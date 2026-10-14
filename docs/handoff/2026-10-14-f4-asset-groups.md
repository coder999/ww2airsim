# F4 asset groups — implementation handoff

**Date:** 2026-10-14  
**Integration branch:** `f4-night-site-assets`  
**Base:** `main` at `d6d0ff9e`  
**Attendance:** unattended implementation; one final attended Hangar checkpoint remains before merging F4 to `main`.

## Outcome

F4 is implemented as 17 original, deterministic Blender assets in four independently reviewable groups. The three first groups were built on Ryzen; the final night/site group was built on Nexus. The integration branch contains all four groups, the new `equipment` library kind, render registration, rigs, provenance, and generated GLBs.

No third-party mesh or texture was incorporated. Every generator records cited facts and labels estimates; every GLB records its script and `AGPL-3.0-or-later` provenance.

## Branches and commits

| Group | Branch | Implementation commit | Assets |
| --- | --- | --- | ---: |
| Airborne | `f4-airborne-assets` | `1a0a0875` | 4 |
| Ground support | `f4-ground-support-assets` | `e3f108d5` | 4 |
| Maritime/rescue | `f4-maritime-rescue-assets` | `8eedfc0f` | 4 |
| Night/site | `f4-night-site-assets` | `171e11b1` | 5 |

The integration branch merges the first three branches before the night/site implementation. All four planning documents are under `docs/superpowers/plans/2026-10-14-f4-*.md` and were emailed before implementation.

## Delivered catalog

### Airborne

| Asset ID | Output | Size | Triangles | Draws | Review motion |
| --- | --- | ---: | ---: | ---: | --- |
| `ki-57-ii-topsy` | `content/aircraft/ki-57-ii-topsy.glb` | 327,360 B | 5,678 | 21 | propellers, gear, bay doors, flight surfaces |
| `parachuting-person-rig` | `content/equipment/parachuting-person-rig.glb` | 42,224 B | 560 | 5 | fixed deployed rig |
| `paratrooper-supply-bundle` | `content/equipment/paratrooper-supply-bundle.glb` | 43,476 B | 468 | 5 | fixed deployed bundle |
| `m24-aircraft-parachute-flare` | `content/equipment/m24-aircraft-parachute-flare.glb` | 28,656 B | 324 | 4 | fixed deployed flare |

### Ground support

| Asset ID | Output | Size | Triangles | Draws | Review motion |
| --- | --- | ---: | ---: | ---: | --- |
| `type94-cargo-truck` | `content/vehicles/type94-cargo-truck.glb` | 49,212 B | 364 | 6 | wheel roll and front steering |
| `type38-75mm-field-gun` | `content/vehicles/type38-75mm-field-gun.glb` | 44,132 B | 316 | 6 | traverse and elevation |
| `gmc-cckw-353` | `content/vehicles/gmc-cckw-353.glb` | 56,116 B | 484 | 8 | wheel roll and front steering |
| `caterpillar-d7-3t` | `content/vehicles/caterpillar-d7-3t.glb` | 60,744 B | 276 | 6 | track motion, blade raise, blade tilt |

### Maritime and rescue

| Asset ID | Output | Size | Triangles | Draws | Review motion |
| --- | --- | ---: | ---: | ---: | --- |
| `lcvp` | `content/vehicles/lcvp.glb` | 37,028 B | 136 | 3 | bow ramp |
| `usaaf-63ft-rescue-boat` | `content/vehicles/usaaf-63ft-rescue-boat.glb` | 64,320 B | 648 | 6 | propellers and rudders |
| `type-a3-life-raft-survivors` | `content/equipment/type-a3-life-raft-survivors.glb` | 100,624 B | 1,048 | 3 | fixed survivor tableau |
| `pby-mooring-buoy` | `content/equipment/pby-mooring-buoy.glb` | 20,556 B | 232 | 2 | fixed buoy |

### Night and site

| Asset ID | Output | Size | Triangles | Draws | Review motion |
| --- | --- | ---: | ---: | ---: | --- |
| `m1942-60in-searchlight` | `content/equipment/m1942-60in-searchlight.glb` | 58,872 B | 436 | 5 | train and elevation |
| `portable-runway-flare-pot` | `content/equipment/portable-runway-flare-pot.glb` | 53,088 B | 268 | 3 | fixed light marker |
| `panirugan-red-harbor-light` | `content/equipment/panirugan-red-harbor-light.glb` | 68,020 B | 224 | 3 | fixed red harbor light |
| `ranger-temporary-nav-light` | `content/equipment/ranger-temporary-nav-light.glb` | 56,224 B | 204 | 3 | fixed temporary light |
| `suluan-damaged-lighthouse` | `content/equipment/suluan-damaged-lighthouse.glb` | 46,412 B | 316 | 5 | fixed damaged state |

The red and warm lamp surfaces are deliberately flat review colors, not emissive gameplay lighting. Gameplay placement, light projection, survivor behavior, parachute descent, and mission scripting remain later-phase work.

## Verification

- Every one of the repository's 57 Blender entries rebuilt byte-identically to its committed output on Nexus; the F4 assets therefore pass deterministic-build verification.
- F4 provenance and aircraft dimensions: 250/250 tests pass.
- Airborne focused suite: 636 tests pass; typecheck and lint pass.
- Ground focused suite: 104 tests pass; typecheck and lint pass.
- Maritime focused suite: 118 tests pass; typecheck and lint pass.
- Night/site focused suite: 123 tests pass; typecheck, lint, and dependency-cruiser pass.
- Final integrated `npm test`: 441 test files passed; 6,608 tests passed and 12 expected tests skipped (6,620 total). The run included byte-identical rebuilds of all 57 Blender entries.

## Final attended Hangar checkpoint

Use `f4-night-site-assets`, open the Hangar, and inspect the 17 IDs above at low, eye-level, and overhead angles.

Acceptance checklist:

1. Silhouettes read correctly at normal gameplay distance and do not look materially over-detailed beside the existing fleet.
2. Origins, ground/water contact, forward axes, and scale feel coherent across each group.
3. Ki-57 controls move the intended propellers, gear, bay doors, and control surfaces without detached geometry.
4. Truck wheels steer/roll, Type 38 traverses/elevates, D7 tracks/blade move, LCVP ramp opens, rescue boat propellers/rudders move, and searchlight trains/elevates.
5. Warm/red review surfaces remain visible but do not bloom as if they were gameplay light sources.
6. The intentionally provisional Ki-57 dimensions and F3-approved estimate-based site silhouettes are acceptable for this phase.

If this checkpoint passes, fast-forward or merge `f4-night-site-assets` into `main`, run the normal gate once more from `main`, and push.

