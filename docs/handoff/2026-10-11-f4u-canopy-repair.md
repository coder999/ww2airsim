# Handoff: F4U-1D Corsair canopy repair (2026-10-11)

Worktree `/home/mark/projects/ww2airsim-repair-f4u`, branch `repair-f4u-canopy`, based on the shared aircraft-geometry foundation
`de80aa1e`. This keeps the existing Hangar-only asset id `f4u-corsair-blender`; the download and flying spec are unchanged.

## Result

The closed elliptical canopy was a separate pod perched on the fuselage centerline. It is now seven measured longitudinal stations
with explicit rail, shoulder, roof and crown points. The rail at each station is buried about 0.6 inches into the local fuselage skin,
so the glass and frames meet the hull continuously when viewed from the front, side or three-quarter view. The visible side panes rise
nearly vertically from that rail and narrow into the roof instead of curling under as the lower half of an ellipse.

The canopy remains 5 feet 3 inches long. Its front is 13 feet aft of the spinner tip, its rear is 18 feet 3 inches aft, its maximum
half-width is 17 inches, and its crown is 4 feet 4 inches above the thrust line. The model origin, stance, gear, controls, guns, wing,
fuselage and stable asset id did not change.

## Sources and honesty

- **Matches the drawing:** front and rear position, side crown line and top-view rail half-widths come from Wikimedia Commons
  `Vought F4U-1 Corsair 3-view.svg`, read 2026-10-11. It is an F4U-1 drawing, not an exact F4U-1D factory drawing; that adjacent-variant
  limitation remains explicit in the generator.
- **Matches photographs:** the rail-to-shoulder continuity, near-vertical side panes and narrower rounded roof were checked against the
  Commons photographs `NASM - Vought F4U-1D Corsair - side.jpg` and `NASM - Vought F4U-1D Corsair - front.jpg`, read 2026-10-11.
- **Estimate:** the exact transverse shoulder and roof ordinates are photo-guided estimates. No public front-view ordinate table was
  available.
- **Primary drawing index, not numerical evidence:** AirCorps Library lists Chance Vought drawing 40204, *Lines & Ordinates - Fuselage -
  Cockpit Cabin - Windshield & Sliding Section*. The sheets require membership, so the index title confirms the right refinement source
  exists but contributes no dimensions here.
- The side overlay uses drawing pixels 22 (spinner tip), 1,252 (tail) and 309 (thrust line) against the cited 33-foot 8-inch length and
  the model origin 9 feet 5 inches aft of the spinner. The crown and fore/aft outline coincide with the drawing; the red points inside
  the windows are hidden fuselage vertices, not extra external skin.

Sketchfab geometry was not used as a measurement source. The downloaded Corsair appears only in earlier Hangar comparisons; this repair
uses the real-aircraft drawing and photographs.

## Regression and verification

`tests/tools/models/f4uCorsairCanopy.test.ts` reads the generated GLB and requires a connected near-vertical mesh edge from the local
fuselage rail to the canopy shoulder. It failed against the old GLB and passed after rebuilding, proving it detects the reported pod
shape rather than merely pinning a source constant.

- Rebuilt GLB: 798,592 bytes, 24,422 triangles, 14 draw calls (limits: 3 MB, 60,000 triangles, 47 draws).
- Focused canopy regression: 1 passed after the repair; the same test failed against the old GLB.
- Required model/render command on Ryzen: 64 files and 1,730 tests passed. Its one failing file was the catalog-wide byte-rebuild gate:
  five aircraft outputs inherited the shared foundation but had not yet been regenerated in their own parallel repair branches. The
  Corsair's first artifact had also been produced by Nexus Blender; regenerating its raw candidate and final GLB on Ryzen fixed that
  environment difference. The final focused byte-rebuild plus canopy run is green: 2 files, 2 tests passed (44 unrelated rows skipped).
  The four remaining stale outputs belong to the A6M2, D3A, F6F and Ki-43 repair branches, not this worktree.
- Targeted ESLint passed with zero warnings; `npx tsc --noEmit` passed on Ryzen.

## Review attachments

- [`f4u-canopy-before-after.jpg`](2026-10-11-f4u-canopy-repair-shots/f4u-canopy-before-after.jpg): same-camera close three-quarter crop,
  old closed ellipse beside the new rail/shoulder/roof section.
- [`f4u-canopy-source-fit.jpg`](2026-10-11-f4u-canopy-repair-shots/f4u-canopy-source-fit.jpg): calibrated source-drawing crop with generated
  model vertices in red.

The two JPEGs total 83,604 bytes, below the 0.5 MB attachment budget.
