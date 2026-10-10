# Curved beaches and shorelines

**Status:** Implemented 2026-10-09 on branch `l2-curved-beaches`.  Worktree
`l2-curved-beaches`; unattended; visual checkpoints are the Tacloban prototype
and the completed integration, collected in the handoff.

## Goal

Replace the visibly rectilinear sand/sea boundary with a curvilinear beach
surface that tapers through dry sand, wet sand, the waterline and a submerged
edge.  The terrain DEM remains the simulation ground; this is a render surface,
not a terrain-data migration.

## Why the DEM is not the border to edit

The current border is emergent: terrain samples above zero draw, samples at
zero are discarded, and every CDLOD ring reads a different pyramid level.
Plan 13c proved that reshaping L0 and letting the tent-filtered pyramid carry
the result down does not preserve a narrow coast.  At coarser levels the raised
strip averaged back to zero, and the before/after reference frames were
indistinguishable (`eef5b4d6`).

The renderer therefore gets an explicit shoreline asset.  Its source remains
the terrain the simulation uses, so the project still has one land/sea truth.

## Source curve

The offline builder reads committed terrain level L1 (about 160-foot posting),
classifies land at the mission chart's existing `LAND_THRESHOLD_M`, and traces
that contour with marching squares.  L1 is deliberate:

- it is the default Asset Quality terrain and therefore aligns with what a
  first-time player sees;
- it is a normal Git object, so deterministic Blender rebuild tests do not
  depend on fetching the 134 MB LFS L0 file;
- smoothing and resampling turn its corners into a curve without claiming
  geographic detail the DEM does not contain.

The builder reuses the pure contour representation and Chaikin smoothing from
`src/render/mission/chartIso.ts`.  Closed loops stay closed.  Open contours at
the 200 km world edge are retained but capped outside the visible land.
Very small loops are dropped by a documented minimum perimeter rather than
turning every one-cell DEM speck into beach geometry.

## Blender-generated surface

The TypeScript build step writes a temporary, deterministic JSON description
of the smoothed polylines and their land-facing normals.  A Blender 5.0.1
Python script consumes it and exports one glTF asset.  The script is the source;
the `.blend` file is not committed.

Each shoreline cross-section has these lanes, all stored internally in metres:

1. inland seam, following the sampled terrain;
2. dry sand;
3. darker wet sand;
4. waterline/surf, just above mean sea level;
5. submerged edge, below the opaque ocean.

The measured lanes are 315 feet inland, 79 feet inland for the dry/wet stop,
210 feet seaward for the waterline, and 394 feet seaward for the submerged
edge (96, 24, -64 and -120 m).  This is intentionally wider than one diagonal
of the 160-foot L1 grid on both sides: the first 105-foot/13-foot prototype
left square terrain triangles visible behind a smooth line.  The inland seam
meets sampled terrain; the submerged edge hides below the ocean, so neither
outer edge needs a transparent terrain blend.  Every lane carries a normalized
cross-shore UV for the vegetation/sand/wet-sand gradient and feathered surf.

The asset is divided into world-space tiles inside one glTF.  Tiles give Three
real bounding volumes for frustum culling; one world-sized mesh would submit
the entire coastline from every camera.  Material roles are shared across
tiles, so visible tiles use dry, wet and surf pipelines rather than unique
materials per tile.  The final asset consolidates dry and wet sand into one
`ShoreSand` gradient role, beside `ShoreSurf`; this removed one draw per tile
after the first Ryzen A/B measured a 0.4 ms cost.

## Runtime integration

`src/render/scene/beaches.ts` loads the glTF, replaces its authoring materials
with WebGPU node materials and exposes `update(eyeX, eyeZ)` and
`dispose()`.

All lanes use `horizonSinkNode`; duplicating the curvature expression is
forbidden by the existing architecture test.  Dry and wet sand use the same
sun/sky irradiance uniforms as terrain.  Surf is a depth-tested, non-depth-
writing overlay whose opacity feathers across the Blender-authored UV.  Its
animation may move foam texture/noise, never vertices or the shoreline itself.

The scene's existing camera-relative translation supplies horizontal precision.
The beach updater supplies the eye position needed to calculate the same
curvature sink as terrain and ocean.

## Deliberate boundaries

- The DEM, terrain pyramid and `heightAt` do not change.
- Ground contact, bomb/round contact and land/sea mission logic do not change.
- The first implementation does not make ocean water transparent.  The
  underwater lane is geometric overlap that hides the seam; visible shallow
  water color and breaking-wave whitening remain later Track L2 work unless
  the prototype shows they are required to make the border read correctly.
- No hand editing in Blender.  Every committed binary must rebuild from the
  committed terrain and scripts.
- No deployment.  Commits and pushes are allowed by repository policy; a
  production deploy remains Mark's call.

## Acceptance

- The Tacloban prototype and final reference-GPU captures show a continuous,
  curvilinear waterline with no axis-aligned sand rectangles.
- At both Low (L1) and High (L0) Asset Quality the ribbon hides the visible
  gridded edge in the checkpoint views.
- There are no non-finite vertices, flipped land normals, open closed loops,
  or uncapped world-edge contours.
- The committed glTF rebuilds byte-identically with Blender 5.0.1.
- The normal verification gate passes.
- The shoreline-relevant High 1440p Ryzen views remain at or below the
  existing 8.33 ms p95 gate; this feature does not invent a separate budget.
  The branch-wide gate already has unrelated failing views with beaches
  disabled, so the handoff records the on/off A/B rather than claiming those
  baseline failures were introduced or fixed here.
