# Aircraft geometry repair plan

Date: 2026-10-11  
Viewing checkpoint: attended final comparison sheets for all six aircraft; do not stop at intermediate screenshots unless a source conflict needs Mark's ruling.

## Objective

Repair the Hangar-only Blender duplicates called out during visual review:

- `a6m2-zero-blender`: restore credible aft-fuselage volume into the empennage.
- `f6f-hellcat-blender`: replace the pinched hood with a broad, straight-pane canopy faired into the fuselage.
- `b-17-flying-fortress-blender`: separate the dorsal fillet from the vertical fin and seat the upper turret on the fuselage skin.
- `ki-43-oscar-blender`: remove station-to-station fuselage waviness.
- `f4u-corsair-blender`: replace the bulbous canopy pod with a fitted hood.
- `d3a-val-blender`: fair the fuselage and canopy, close the visible canopy-side gap, and attach the fixed gear structure to the airframe.

Authoritative shape evidence remains primary documentation and the closest exact-variant three-view available through Wikimedia Commons. Period photographs check volume and joins. Downloaded/Sketchfab models are visual sanity checks only: they are not measurement sources and no geometry is copied from them.

## Implementation

1. Add opt-in, shape-preserving fuselage interpolation to `kit.py`. Existing aircraft retain their historical Catmull-Rom result until explicitly migrated.
2. Extend `faired_canopy` with explicit rail, shoulder, roof, and crown stations. Keep the closure inset beneath the fuselage rail so no side opening or centerline pod is visible.
3. Give each aircraft its own worktree and agent. Each workstream must re-check its cited drawing and photographs, change only its model and directly related tests/docs, rebuild the committed GLB, and write an honest handoff distinguishing cited dimensions, drawing fits, photographic checks, and estimates.
4. Merge reviewed repair commits to `main` without pushing. Preserve every duplicate asset id so all candidates remain selectable in the Hangar.
5. Update `docs/blender-aircraft.md` to forbid downloaded-model silhouette/canopy measurements and to require front/side/top fit checks plus surface-intersection checks for canopy, turrets, and fixed gear.

## Verification

- Deterministic rebuild of each changed Blender model.
- Focused model, dimensions, and rig tests while each aircraft is being repaired.
- `remote-run npx vitest run tests/tools/models tests/render/hangar tests/render/airframes.test.ts` after integration.
- Hangar Playwright test against a local Vite server, rerunning an isolated timeout once before treating it as a failure.
- Same-camera before/after front, side, and three-quarter renders, assembled into review JPEGs under 0.5 MB total.
- Final working tree clean; no push or deploy.
