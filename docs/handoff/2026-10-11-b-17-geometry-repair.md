# B-17G Blender geometry repair handoff

Date: 2026-10-11

Worktree: `/home/mark/projects/ww2airsim-repair-b17`

Branch: `repair-b17-geometry` from shared geometry foundation `de80aa1e`
Status: committed in its own worktree; not pushed or merged

## Result

`b-17-flying-fortress-blender` keeps its asset id, stance, working gear, four propellers, control surfaces,
bomb-bay doors and six gun groups. This pass corrects the two faults reported in the Hangar:

- The former tail treated the whole dorsal fillet as one 34 ft 4 in root-chord, 17 ft 1 in-high fin. The repaired
  model has a thin dorsal fillet and a separate drawing-measured main fin: 16 ft 3 in root chord, 12 ft 10 in from
  its embedded root to the top, and a 3 ft 11 in tip chord (`4.96`, `3.90`, and `1.19` m internally).
- The forward dorsal turret no longer starts in clear air. Its base is sampled over the full circular footprint of
  the shape-preserving fuselage loft, then sunk 1.6 in (`0.04` m) into the lowest sampled skin point. The resulting
  base is at `y=1.220 m`, versus `y=1.900 m` before. A joined 2 ft 8 in collar/dome keeps the gun trunnion above the
  cockpit so the full declared traverse and elevation remain mechanically clear.

The generated GLB is 1,173,420 bytes, 36,604 triangles and 29 draw calls, within the existing
5,000,000-byte / 100,000-triangle / 47-draw budgets.

## Evidence and estimates

The authoritative shape reference remains Wikimedia Commons
`Boeing B-17G Flying Fortress 3-view line drawing.svg` by Kaboldy, CC BY-SA 3.0. It is the exact B-17G variant.
The tail was independently re-read from a 1,920 px raster: the side-view airframe runs from nose x=33 to tail shell
x=1,385, or 59.7 px per meter over the cited 74 ft 4 in length. The main-fin root begins 58 ft 1 in aft of the nose;
the final source overlay set the embedded-root-to-top height to 12 ft 10 in and the tip chord to 3 ft 11 in. The
dorsal fillet begins about 40 ft aft of the nose and meets that structural fin.

The forward dorsal turret center, 20 ft 2 in aft of the nose, is read from the same side view. Its footprint is
seated from the actual generated fuselage loft rather than a drawing ordinate. Turret diameter, collar profile,
dome height, gun trunnion height and the fillet's 4 in approximate thickness remain **ESTIMATES** because the
three-view supplies outlines but no sections. The public AirCorps drawing index names Boeing fin-fairing set
15-7625, but the numerical sheets remain sign-in gated and were not used.

The overlay is honest about the remaining limitations: the procedural fin has straight loft segments rather than
the drawing's fully rounded leading edge and crown; the fillet thickness is not source-validated; and the pre-existing
fuselage, nose and canopy are simplified lofts rather than factory ordinates. No downloaded or Sketchfab geometry was
used as a measurement source.

## Regression coverage

`tests/tools/models/blenderDuplicates.test.ts` now pins two source-driven failure modes:

- the rudder's 11 ft 3 in (`3.43 m`) drawn height, which rejects the former all-in 15 ft (`4.58 m`) rudder;
- the dorsal turret base and collar/dome height, which reject the former floating `y=1.900 m` pivot.

The existing turret sweep test caught an intermediate mistake: simply lowering the old dome made its guns cross the
cockpit over 31 traverse/elevation samples. The final joined collar/dome seats on the skin and passes every declared
gun position.

## Verification

- `npm run models:build -- b-17-flying-fortress-blender --force`: passed; wrote the GLB above.
- Focused Ryzen run:
  `REMOTE_RUN_OVERFLOW=0 /home/mark/.local/bin/remote-run npx vitest run tests/tools/models/blenderEntries.test.ts tests/tools/models/blenderDuplicates.test.ts tests/tools/models/aircraftRigs.test.ts tests/tools/models/aircraftDimensions.test.ts -t "b-17-flying-fortress-blender|B-17G"`
  — 4 files passed, 36 tests passed, 634 skipped by the id filter. This includes the byte-identical Blender rebuild,
  cited dimensions, stance/store/eye fit, every rigged control and the complete turret-arc collision sweep.

The integration-wide model/render and Hangar E2E gates belong to the parent six-aircraft merge pass and were not run
again in this isolated worktree.

## Review images

The three ordinary JPEGs total 102,140 bytes:

- `docs/handoff/2026-10-11-b-17-geometry-repair-shots/side-before-after.jpg`
- `docs/handoff/2026-10-11-b-17-geometry-repair-shots/three-quarter-before-after.jpg`
- `docs/handoff/2026-10-11-b-17-geometry-repair-shots/drawing-overlay.jpg`

The before/after pairs use the same union camera. The overlay uses the freshly measured 59.7 px/m side-view
calibration and plots final projected vertices in red.
