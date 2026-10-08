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
