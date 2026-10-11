# B-17G Flying Fortress Blender duplicate handoff

Date: 2026-10-11  
Worktree: `/home/mark/projects/ww2airsim-b17-blender`  
Branch: `blender-b17` (from main `14fb2cad`)  
Status: committed in its own worktree; not pushed or merged

## Delivered

`b-17-flying-fortress-blender` is an original, Hangar-only duplicate beside the downloaded
`b-17-flying-fortress`. Its source is `tools/models/blender/b-17-flying-fortress-blender.py`, built from
`kit.py`; the library entry has a model and deliberately no flight spec.

The 1,163,684-byte GLB has 36,408 triangles and 29 draw calls (limits: 5,000,000 / 100,000 / 47). It has
four exactly three-fold `Prop1..4` nodes, moving `GearL`, `GearR` and `Tailwheel`, ailerons, flaps,
elevators and rudder, six historic gun-position groups, two bay doors, and wings that accept the existing
spec's eight internal racks. The stance is fitted to the existing B-17 spec: main wheel bottoms 2.548 m
below the origin at x 0.852 m, tail contact 1.097 m below at x -10.623 m. The real-cockpit eye proposed for
promotion is `[4.65, 1.66, 0]`.

All requested registration points are present: entry, library card, rig, `ASSETS.md`, dimensions, duplicate,
rig, gunner-mount and Hangar checks. `docs/blender-aircraft.md` now records two process gaps found here:
search public factory-drawing indexes without treating gated metadata as numerical evidence, and handle
turrets/bay doors on no-spec Hangar duplicates separately from flyable gunner/travel-time assertions.

## What is evidence and what is estimated

**English Wikipedia Specifications (B-17G), read 2026-10-11:** span 31.62 m (103 ft 9 in), length 22.66 m
(74 ft 4 in), wing area 131.92 m2 (1,420 sq ft), NACA 0018 root / NACA 0010 tip, four Wright R-1820
engines, three-bladed Hamilton-Standard constant-speed propellers, and 13 .50-inch M2 Brownings in nine
positions. These are tagged `CITED` in the script header. Wikipedia's propeller-diameter field is blank;
3.54 m is therefore explicitly `ESTIMATE`, measured from the drawing.

**Wikimedia Commons drawing, read 2026-10-11:**
`Boeing B-17G Flying Fortress 3-view line drawing.svg` by Kaboldy, CC BY-SA 3.0, fetched through
`Special:FilePath` as a 1,600-width PNG. Nose-relative tables in the script record fuselage top/bottom and
half-widths, windscreen/canopy stations, tailplane, fin/dorsal fillet, and the wing quarter-chord at 30%
semispan (8.90 m aft of the nose, the model origin). The committed overlay caught and corrected the first
fin's missing dorsal fillet. The final authored fuselage/canopy/fin centerline follows the drawing closely;
straight loft segments and the belly between measured stations remain an approximation rather than factory
ordinates.

**AirCorps Library public metadata, read 2026-10-11:** the official [B-17 catalog](https://app.aircorpslibrary.com/aircraft/b-17)
advertises 53,855 searchable drawings. Public index pages identify Boeing 8-1070 `CONTOURS COCKPIT &
FAIRING`, 14-3469 `CONTOURS - INBOARD WING`, 9-3053 `ORDINATES WING RIB`, 15-7625 `LINES FIN FAIRING -
STA 8-11`, 15-7361 `LINES REAR GUN ENC. FAIRING`, and 8-1265 `RIB CONTOURS STAB.` The numerical drawing
sheets require member sign-in. No gated values were used or claimed; these sets are the recommended next
refinement under authorized access.

**Estimates:** section interpolation, wing taper/sweep/dihedral, nacelle/cowl sections, control gaps,
turret geometry and arcs, one-hinge gear motions, bomb-bay cross-section, surface finish and marking
placement. The existing combat gun list is empty, so visible historic gun positions are not claimed as a
new flight-model combat fit. Cockpit interior, individual bomb racks, turbo plumbing, de-icers, crew,
ammunition, serials and nose art are omitted.

## Verification

- Focused remote checks after the overlay/turret corrections: 3 files, 34 tests passed (490 skipped by id filter).
- Exact required remote command:
  `remote-run npx vitest run tests/tools/models tests/render/hangar tests/render/airframes.test.ts`
  — **64 files, 1,552 tests passed**, 204.44 s.
- Exact Hangar command against local Vite port 5197:
  `PW_BASE_URL=http://localhost:5197 npx playwright test tests/e2e/hangar.spec.ts --workers=1`
  — 19 passed; checks 1, 3 and 7b hit the documented 60-second load timeout. Isolated reruns: check 1 passed
  in 49.0 s; check 3 passed in 52.0 s; check 7b initially reproduced a real no-spec Cycle-button assumption,
  was corrected to use direct bench pose for Hangar-only entries, then passed in 14.5 s with the new doors
  changing 78 pixels. Check 17 independently fails before reaching mount animation because the checkout has
  13 visible ship specs while its unrelated pin still expects 12; isolated rerun reproduced `Expected: 12,
  Received: 13`. This branch does not change ship content or that unrelated pin.
- `npm run models:build -- b-17-flying-fortress-blender --force` rebuilt the committed GLB; the full suite's
  byte-identical rebuild check passed.

## Review images

The three ordinary JPEGs total 128,879 bytes (under 0.5 MB):

- `docs/handoff/2026-10-11-b-17-flying-fortress-blender-shots/side-contact.jpg`
- `docs/handoff/2026-10-11-b-17-flying-fortress-blender-shots/front-contact.jpg`
- `docs/handoff/2026-10-11-b-17-flying-fortress-blender-shots/drawing-overlay.jpg`

The download/new contact sheets use the same `preview.py` camera for each view. They show the procedural
model's intentionally simpler surfacing and markings; the overlay is the dimensional check, not a claim of
download-level detail.

## Follow-up

Before promotion, decide whether to adopt the drawing-derived eye, remeasure stores with
`npm run models:mounts`, and use authorized factory ordinates to refine the fuselage/wing/tail loft. The
procedural fin is a straight-edged approximation of the drawing's curved leading and trailing edges. Do not
change the flight model merely to accommodate this display-only duplicate.
