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
