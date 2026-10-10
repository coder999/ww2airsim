# Terrain

**What it is.** Copernicus GLO-30 elevation, resampled offline into one
8193 × 8193 heightfield — a 200 × 200 km tangent plane at 24.4 m posting,
centred on 10.8 N 125.3 E — drawn as a CDLOD quadtree out to 100 km with
camera-relative coordinates, a `d²/2R` horizon sink and aerial-perspective
fog. The simulation answers `heightAt(x, z)` from the same pyramid and fires
a crash event on contact (`src/sim/world/terrain.ts`). Initial Design:
[`2026-09-13-terrain-design.md`](superpowers/specs/2026-09-13-terrain-design.md).

The first hand-off (screenshots, the measured GPU frame cost, the LOD
height-error tables) is
[`handoff/2026-09-14-plan4-terrain.md`](handoff/2026-09-14-plan4-terrain.md).

## Height textures: L0 is a window around the camera

Since L1.1 (2026-10-10) the default Asset Quality is Medium, whose finest level is L0. The mesh
holds L0 as a 1025-square window around the camera, refilled from the decoded level when the
camera nears its edge, and every coarser level whole; the ocean reads L1, the finest whole level.
How and why, with the measured reach: `src/render/terrain/mesh.ts` (`FINEST_WHOLE_LEVEL`,
`WINDOW_SAMPLES`, `WINDOW_REACH_SAMPLES`). Memory, download and time to ready, before and after:
[`handoff/2026-10-10-l1-1-terrain-on-demand.md`](handoff/2026-10-10-l1-1-terrain-on-demand.md).

Every level ships gzipped (`L<n>.bin.gz`, since L1.1a, 2026-10-10), the `cover.bin.gz` pattern:
`tools/terrain/build.ts` writes it, `src/render/gunzip.ts` inflates it in the browser and says
why it decides by the bytes and not the response header. Sizes and timings:
[`handoff/2026-10-10-l1-1a-compress-terrain.md`](handoff/2026-10-10-l1-1a-compress-terrain.md).

The release build excludes obsolete uncompressed `terrain/L<n>.bin` files that may
remain in local or remote build caches after L1.1a; only the `.bin.gz` levels ship.

## Curved shoreline render surface

The simulation DEM and `heightAt` still define land, contact and physics.  The
visible beach border is a separate, deterministic Blender-built ribbon
(`content/scenery/beaches.glb`) traced from committed terrain L1, then smoothed
and resampled.  It overlaps more than one L1 cell diagonal on each side of the
zero contour, slopes from the sampled inland height through sand and wet sand,
and ends below the ocean.  That overlap is required: a narrow smooth line does
not hide the terrain mesh's square silhouette.

Rebuild it with `npm run shoreline:build`.  The source is
`tools/shoreline/geometry.ts` plus `tools/shoreline/beaches.py`; no `.blend`
file is authoritative.  `tests/tools/shorelineBuild.test.ts` rebuilds the GLB
byte-for-byte with Blender 5.0.1.  Runtime material replacement and shared
horizon curvature live in `src/render/scene/beaches.ts`.  In DEV only,
`?beaches=off` provides an exact visual/performance ablation.

Design and measured result:
[`2026-10-09-curved-beaches-design.md`](superpowers/specs/2026-10-09-curved-beaches-design.md),
[`handoff/2026-10-09-curved-beaches.md`](handoff/2026-10-09-curved-beaches.md).

## The DEM is not the weak link (measured 2026-10-09)

Mark asked whether Blender or the DEM could lift land render quality. Measured, read only,
nothing changed ([L3 plan](superpowers/plans/2026-10-09-l3-land-quality.md), Phase 0 results):

- The source files are `Copernicus_DSM_COG_10_*`: a surface model, canopy included.
- OSM rivers are already valleys in the heights (centerline 25 to 43 ft below the banks at a
  490 ft offset on the long reaches). Carving them is not needed.
- Canopy shows as roughness of about 1 to 2 ft per post, confounded with relief. Not worth removing.
- Bicubic against the shipped bilinear resample differs by 2.5 ft RMS (12 ft max) in hills on 80 ft
  posts. Not worth regenerating 13 levels.
- Rivers and roads as ribbons were already tried and gave no gain
  (`drape.md`; the river mask costs 0.1 ms per frame), so that proposal was withdrawn.

What would move land quality is the ground texture and the objects on it:
[`drape.md`](drape.md).
