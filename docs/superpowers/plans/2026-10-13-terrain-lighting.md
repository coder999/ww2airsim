# Terrain lighting and surface quality

**Mode: attended.** Mark requested an isolated worktree and a dev-server slot,
and confirmed pauses at these visual checkpoints: mountain lighting,
canopy/surface improvements, final comparison. Automated checks finish before
each checkpoint; viewing is not a test gate.

**Checkout:** `terrain-lighting`, `ww2airsim-terrain-lighting`; slot 2, port 5175.
The Vite hostname/port edit is local scratch, never committed.

## Direction

Make Leyte's mountains and ground read as a real landscape. Mark did not find
the previous drape substantially better and authorizes keeping or replacing it
on visual merit. Start with shipping terrain, without a drape. Preserve the
sim's elevation/contact surface and existing atmosphere. Work stays isolated
until reviewed; no production deployment.

## Work and checkpoints

1. Establish slot, matched views and a reproducible baseline.
2. Derive directional terrain horizons and sky visibility from the existing
   DEM. Sun visibility affects direct light; enclosure affects diffuse sky
   light. Keep both independent of albedo and cloud shadow. Prototype uses a
   whole-world raster with a documented resolution and memory cost; measure
   narrow-valley limitations before choosing final resolution.
3. Verify flat-ground/ridge/hollow behavior, shader compilation, asset loading
   and matched GPU captures at morning/noon/afternoon. **Checkpoint 1:** send
   working slot links and inspected before/after captures; pause for Mark.
4. Following his feedback, replace conspicuous repetition and forest-floor
   detail with irregular canopy-scale structure. Evaluate existing synthetic
   work as evidence, not as a prerequisite. **Checkpoint 2:** matched low,
   middle and high-altitude views; pause.
5. Integrate accepted choices, measure GPU cost against the reference budget,
   check shoreline/material transitions and changing sun. Existing terrain,
   surface and sun tests remain the starting coverage; add behavior tests for
   new horizon math, not snapshots of tuning constants.
6. Reconcile affected tests, update standing terrain documentation and record
   limitations and measured resource costs. **Checkpoint 3:** final live
   comparison and captures; pause before closeout decisions.

## First experiment

Precompute horizon elevation in 16 azimuth directions, plus a diffuse
sky-visibility estimate normalized against the local slope. Runtime reads
neighboring directions and blends them for a changing sun, with a softened
transition. A DEV-only comparison switch allows `off`, `sky`, `sun`, and `on`.
This separates changes in lighting from the subsequent surface work.

CPU baking/tests go through `remote-run` with overflow disabled. GPU captures
use the Ryzen Playwright server; GPU budget measurements take the exclusive
`ryzen-budget` lock. Leave shared tunnels and Playwright servers running.
