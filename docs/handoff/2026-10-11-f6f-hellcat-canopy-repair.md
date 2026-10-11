# Handoff: F6F Hellcat canopy section repair (2026-10-11)

Built in `/home/mark/projects/ww2airsim-repair-f6f-hellcat`, branch
`repair-f6f-hellcat-canopy`, from shared geometry foundation `de80aa1e`. This keeps the
Hangar-only asset id `f6f-hellcat-blender`; the downloaded flying model is unchanged.

## Result

The canopy now has an explicit transverse section at every longitudinal station:
fuselage rail, shoulder, roof edge and crown. Straight panes connect those points. The
front rail is about 24 inches wide instead of 14 inches, the authored roof over the pilot
is about 25 inches wide, and the lower rail is buried 0.79 inches into the local fuselage
skin. The windscreen therefore reads as a broad, blunt, raked pane instead of a narrow
bubble perched on the centerline. An aft bow was added where the real enclosure meets the
turtledeck.

The side silhouette was deliberately not moved. Its windscreen front, crown and canopy
rear still use the drawing-measured stations from the previous pass; this repair is the
missing cross-section pass.

The generated `content/aircraft/f6f-hellcat-blender.glb` is 788,292 bytes, 24,798
triangles and 12 draw calls. The source remains
`tools/models/blender/f6f-hellcat-blender.py`.

## Evidence and estimates

- **Measured:** the canopy's longitudinal side outline and plan position remain those read
  from Wikimedia Commons,
  [Grumman F6F Hellcat 3-view line drawing.svg](https://commons.wikimedia.org/wiki/File:Grumman_F6F_Hellcat_3-view_line_drawing.svg),
  fetched October 11, 2026 as a 1,920 by 2,334 pixel raster.
- **Photographic check:** the broad, straight-pane reading was checked against NACA
  Langley's May 5, 1944
  [XF6F-4 photograph EL-2000-00243](https://commons.wikimedia.org/wiki/File:Grumman_XF6F-4_Hellcat.jpg)
  and Mark's three supplied review views. The NACA aircraft is an XF6F-4, so it checks the
  Hellcat family's enclosure construction rather than claiming an F6F-5 dimension.
- **Estimate:** no factory canopy cross-section was available. Every rail, shoulder and roof
  width is therefore labeled `ESTIMATE` in the generator. The Commons front view and the
  period photograph constrain the shape, but they do not turn those transverse ordinates
  into cited dimensions.
- **Source fit:** the existing drawing-measured windscreen front, crown and rear were held
  fixed. Same-camera front and three-quarter renders were used to judge the newly visible
  transverse shape and its contact with the hull.

The before/after close views are in
[`2026-10-11-f6f-hellcat-canopy-repair.jpg`](2026-10-11-f6f-hellcat-canopy-repair.jpg).
The final game-rendered side and three-quarter views are in
[`2026-10-11-f6f-hellcat-canopy-hangar.jpg`](2026-10-11-f6f-hellcat-canopy-hangar.jpg).

## Regression check

`blenderDuplicates.test.ts` now measures the high canopy roof at the pilot station. The
old asset failed the check at 11.30 inches of half-width; the repaired asset passes the
source-checked 11.81 to 14.57 inch band. This check is intentionally transverse: the
existing eye/crown test cannot distinguish a broad trapezoidal canopy from a narrow bubble.

## Verification

Run on October 11, 2026:

- The fault-injection run against the old committed GLB failed only the new roof-width
  assertion, proving that the detector sees the reported regression.
- `remote-run npx vitest run tests/tools/models/blenderDuplicates.test.ts -t
  f6f-hellcat-blender`: 6 passed, 36 skipped.
- `remote-run npx vitest run tests/tools/models/blenderEntries.test.ts -t
  f6f-hellcat-blender`: the byte-identical rebuild passed (1 passed, 44 skipped).
- The four-file model run passed 673 checks, including all 22 dimension checks, all 42
  duplicate-fit checks, all 567 rig checks, and the Hellcat byte-identical rebuild. Its
  unfiltered `blenderEntries` portion also reported three expected byte differences for
  `a6m2-zero-blender`, `d3a-val-blender` and `ki-43-oscar-blender`: those parallel repair
  branches had not yet rebuilt their assets against the shared canopy foundation. They are
  unrelated to the Hellcat, whose rebuild passed in both the combined and isolated runs.
- `E2E_CAPTURE=1 ... blenderDuplicatesCapture.spec.ts --workers=1` against a local Vite
  server on Nexus WebGPU: 1 passed in 23.7 seconds. The final Hangar captures show no open
  side gap or rail floating above the fuselage.

## Remaining visual uncertainty

The repaired enclosure is now much closer to the supplied views in width and pane layout,
but its transverse ordinates are still an estimate. A factory F6F-5 canopy contour or frame
installation drawing could supersede them. The empty cockpit also makes the dark glazing
read flatter than a finished cockpit would; no interior was added in this pass.

## Scope

No dimensions, stance, weapons, stores, controls, landing-gear rig, paint roles, Library
card or flight-model data changed. No downloaded geometry was copied.
