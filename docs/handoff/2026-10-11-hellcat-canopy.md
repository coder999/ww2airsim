# Handoff: Hellcat canopy photo correction (2026-10-11)

Built in worktree `/home/mark/projects/ww2airsim-hellcat-canopy`, branch `hellcat-canopy`, based on `main` at `f2bf528d`, and merged
to `main` in `4ca765ed` after both rounds of Mark's canopy review.

## Result

The Blender Hellcat canopy now follows Mark's side photograph: a steep windscreen reaches a high forward bow, then a long straight
roof descends aft into the turtledeck. The previous profile read as a low rounded bubble. Seven explicit side stations define the new
wedge, and canopy subdivision is disabled so spline refinement cannot soften its corners. Frame positions were adjusted to follow it.

Mark's second review found that the transverse section still read as a bubble pinched into the center of the hull. The replacement
`faired_canopy` primitive calculates each lower glass edge from the fuselage surface at that station. Broad, nearly vertical side panes
then rise directly from that seam to a flatter roof. The closed underside remains hidden inside the hull, so no rounded lower half can
break the continuous fuselage-to-glass surface.

The committed generated asset is `content/aircraft/f6f-hellcat-blender.glb` (788,316 bytes, 24,796 triangles, 12 draw calls). The
generator remains the source of truth in `tools/models/blender/f6f-hellcat-blender.py`.

## Review evidence

The normal whole-airframe capture makes the glass too small to judge, so `tests/e2e/blenderDuplicatesCapture.spec.ts` now also emits
close side and close three-quarter views centered on the canopy. The final close and whole-airframe captures are preserved in
[`2026-10-11-hellcat-canopy-shots/`](2026-10-11-hellcat-canopy-shots/).

Verification on 2026-10-11:

- `blenderEntries.test.ts`, `blenderDuplicates.test.ts`, `aircraftRigs.test.ts`, and `aircraftDimensions.test.ts`: 4 files, 525 tests,
  all passed. This includes a byte-identical headless rebuild of the Hellcat GLB.
- Gated Playwright Hangar capture: 1/1 passed.

## Scope

This changes only the Blender duplicate, its generated GLB, and the duplicate-review capture. It does not promote the duplicate over
the downloaded flight model or change flight behavior, eye point, dimensions, weapons, or rigs.
