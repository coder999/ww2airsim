# Terrain

## Distant crown stand-ins (2026-10-13, opt-in prototype)

`?distantTrees=on` adds a DEV-only forest extension beyond the accepted soft
near trees. Production and an ordinary DEV visit keep it off pending visual
review. High extends crowns to approximately 2.6 miles, fading over the final
1.1 miles; Medium extends to 1.7 miles, fading over the final 0.75 miles. Low
draws neither representation. The near-tree range and appearance are unchanged.

Each stand-in is a camera-facing two-triangle crown with a three-lobe analytic
silhouette, a soft edge and rounded normal. It uses the existing sun/sky/fog
lighting and the same deterministic sites, palette, land cover and exclusions
as the detailed trees. It has no trunk, texture asset or shadow draw. The
stand-ins blend in across the near-tree fade band and blend out at their outer
range; they are rounder than the detailed tree art and do not guarantee an
invisible transition. Camera roll does not change their crown proportions.

`scene/treeCells.ts` now owns the shared cell constants and distance-disc
selection; `vegetation.ts` reexports them for existing callers. The distant
layer keeps 437 stable cell slots on High (96,140 potential crowns, about
2.93 MiB of CPU instance attributes plus their GPU copies). Unused slots
collapse to zero-size triangles. Up to four newly resident cells load per update,
stopping before another cell after roughly 1 ms of CPU work; an individual cell
can exceed that slice. This was added after initial-load updates reached 7.6 ms.
Only changed slot ranges upload. The near and far layers currently evaluate
the shared placement function separately. Cover or tier changes clear the
distant slots and refill incrementally. Initial loading is progressive.

`__ww2.vegetation().distant` exposes enabled/ready, pending cells, generated
cells, populated tree counts, draw visibility, outer range and the maximum
CPU update duration observed since construction. Draw counts describe
populated sites, while the GPU submits the fixed slot capacity. The existing
trees-visible diagnostic controls both layers. `DISTANT_TREES_CAPTURE=1`
enrolls on/off captures and isolated cost measurements in the existing tools.
See the [distant-tree handoff](handoff/2026-10-13-distant-trees.md).

## Accepted soft tree fade (2026-10-13, isolated branch)

Mark accepted the soft fade after finding pixel dissolve slightly better but
disliking its stipple. The default is now soft in DEV and production builds:
nearby trees stay opaque; trees in the original
distance band blend continuously over the scene without a pixel mask.
`treeFade=pixel` and `treeFade=whole` retain the previous comparisons.
These query overrides are DEV-only. The accepted change is on the isolated
branch; it has not been merged or deployed.

The prototype submits an opaque crown/trunk pair plus a transparent pair
sharing the same instance buffers. Their fragment masks are complementary:
fully opaque coverage goes through the depth-writing pair; partial coverage
goes through the blended pair without depth writes. Both pairs follow cell
repacking, quality tiers and altitude culling. `drawnInstances` still counts
tree sites, not the number of draw submissions.

This is transparency, not optical blur. Individual transparent instances and
crown lobes are not sorted, so overlapping transition trees can look different
from opaque trees. This is the tradeoff described in the
[Three.js transparency manual](https://threejs.org/manual/pages/transparency.html).
It adds drawing work and leaves the far-field boundary unresolved. Measurements
and review clips are in the [soft-fade handoff](handoff/2026-10-13-tree-soft.md).

## Tree pixel-dissolve checkpoint (2026-10-13, isolated branch)

Mark preferred the original close-range trees and reported popping beneath
the plane in the canopy trial. The worktree now restores original tree shapes,
colors, flat crown normals and tier distances. This checkpoint introduced
`?treeFade=pixel`; `treeFade=whole` selects the original whole-instance fade.
Both modes use the same material, placement and distance band. High starts
fading at approximately 0.87 miles and ends at 1.15 miles; Medium fades from
approximately 0.47 to 0.75 miles. Neither adds a distant tree representation.

`scene/treeFade.ts` supplies derivative-free interleaved gradient noise for
the fragment alpha threshold. Its screen-pixel pattern has no temporal jitter;
a stable site seed decorrelates overlapping crowns. Partial coverage trades
whole-crown switching for visible stipple in the transition band. The existing
derivative-based `alphaHash` path stays disabled because it failed Tint shader
compilation on the reference GPU. This earlier trial left production on the
whole-instance fade; the accepted soft fade above supersedes that choice.

Both modes retain the conservative altitude draw cull. Diagnostics expose
`fadeMode`, `fadeStartM`, `fadeEndM`, resident instances and submitted instances.
`TREE_FADE_CAPTURE=1 E2E_CAPTURE=1` enrolls the matched comparisons in the
existing land/terrain-cost capture tools. Measurements and review clips are in
the [pixel-dissolve handoff](handoff/2026-10-13-tree-fade.md).

## Continuous canopy checkpoint (2026-10-13, isolated branch)

The canopy material is now **opt-in** with `?canopy=on`; the worktree defaults
to the original ground. It no longer changes tree appearance or range.
Production retains the original surface. `?trees=off` independently hides nearby meshes.
The [checkpoint handoff](handoff/2026-10-13-canopy.md) holds captures, costs and
remaining visual limitations. The mountain-lighting trial below remains off.

`tools/terrain/bakeCanopy.ts` produces an original, periodic 1024-square crown
height material, encoded as slope/tone/enclosure rather than photographed
color. Its tile spans approximately 1,680 ft, with slight coordinate
distortion and mip filtering. One packed canopy sample replaces the forest's
albedo/normal samples; a separate coarse noise sample varies its coordinates.
Existing land-cover composition masks the material out of beaches, roads,
rock and water. Crown normal relief fades between approximately 3.1 and 8.7
miles; the color texture mips continuously into the far field. Terrain
geometry and collision heights do not change. Missing or malformed material
falls back to procedural forest color, with `__ww2.canopy()` reporting the error.

The shorter-range, dark, smooth tree treatment shown in the historical canopy
captures was rejected and removed. A conservative upper bound on resident tree
tops still skips both draw calls when all trees are vertically beyond range.
This does not skip CPU placement.
`__ww2.vegetation().drawnInstances` distinguishes submitted meshes from resident
instances and the separate DEV group-visibility override.

Use `LAND_CANOPY_CAPTURE=1 E2E_CAPTURE=1` with `landGapCapture.spec.ts` for the
three noon views plus recorded forward flights. Use the same flags with
`terrainCostCapture.spec.ts` under the exclusive `ryzen-budget` lock for the
matched cost comparison. `E2E_CAPTURE_DIR` selects durable artifact storage.

## Terrain lighting prototype (2026-10-13, isolated branch)

`terrain-lighting` tests mountain self-shadow and diffuse sky enclosure with
shipping ground colors; no drape is enabled. The attended checkpoints and
worktree/slot are in [the plan](superpowers/plans/2026-10-13-terrain-lighting.md).

`tools/terrain/bakeHorizons.ts` derives 16 directional horizons from the L1
DEM out to 15.5 miles, plus an integrated sky-visibility map normalized against
the receiver's local slope. An open inclined plane remains fully sky-lit.
The 1025-square output spans the whole theater at roughly 641 ft spacing;
it captures large landforms, not individual trees or narrow gullies. Directions
are interpolated and the sun transition is filtered over three degrees to
soften finite-raster artifacts. This is reconstruction filtering, not the
physical size of the sun. More resolution may be warranted after review.

`src/render/terrain/occlusion.ts` loads the maps asynchronously and retains
baseline illumination on a missing or mismatched asset. The DEV-only modes
are `?terrainLighting=off|sky|sun|on`; both DEV and production default to `off`.
Mark perceived no improvement at checkpoint 1, so the experiment is shelved.
The default path fetches no lighting maps and adds no shader texture reads;
explicit DEV opt-in remains only for reproducing the comparison.
`__ww2.terrainLighting()` reports mode, readiness,
errors and texture bytes. Terrain casts onto terrain only in this checkpoint;
airplanes, trees and buildings do not receive these mountain shadows.
Measured costs and the noon/canopy direction are in the
[checkpoint feedback](handoff/2026-10-13-terrain-cost.md).
`?trees=off` hides only tree draws in DEV; it preserves other scenery,
terrain textures and CPU tree placement for a controlled comparison.

The maps total 17,860,625 decoded bytes and 4,196,248 gzip bytes, excluding
the 309-byte header. They retain Copernicus attribution. Ground elevation,
collision, material colors, clouds and atmosphere are unchanged. The terrain
shader shares its existing world-coordinate interpolator to remain under
WebGPU's default 16 vertex-output-location limit.

The existing `landGapCapture.spec.ts` supports `LAND_LIGHTING_CAPTURE=1` for
matched morning/noon/afternoon views with the camera held at 6,000 ft.
Use `E2E_CAPTURE=1`; `DRAPE_VARIANTS=off,on` selects the lighting modes in
this capture configuration. Screenshots are visual evidence; the correctness
check in `terrainTextures.spec.ts` covers all four modes and an invalid map.

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

## Scenery materials

Corrugated steel, timber and concrete use separate mipmapped KTX2
albedo/OpenGL-normal pairs built by `npm run textures:scenery`.
`content/textures/scenery.json` is the checked runtime manifest; pinned CC0
Poly Haven sources, authors and hashes are in `ASSETS.md` and
`tools/textures/scenerySources.ts`. The runtime loader validates the
manifest and falls back to the former procedural materials if any scenery
texture fails. Building geometry, damage identity and material batching do not
change. In DEV, `?sceneryTextures=off` provides the exact A/B path.

The accompanying seven-cluster/four-branch tree pass was rejected and reverted
after visual review. A bounded follow-up removed the protruding branches but
still measured 3.678 ms versus 3.350 ms p95 for the exact legacy tree (+9.8%)
in the locked dense-jungle view. The original three-lobe crown, single trunk
and procedural leaf/bark materials therefore remain.

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

L2 keeps that same ribbon and draw, but its `ShoreSurf` material now layers a
shallow-water gradient, two shoreward breaker crests, broken foam and
backwash. Animation reads simulation time and therefore freezes on Pause; it
does not change the ocean or physics. In DEV, `?shoreFx=off` restores the
static feathered material, and `?shoreTime=<seconds>` fixes a phase for
deterministic captures.

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
