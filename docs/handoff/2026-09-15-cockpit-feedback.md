# Cockpit and follow-view feedback — 2026-09-15

Based on Mark's feedback after merge `6809e79`; approved for commit and
deployment after visual review. Mark explicitly deferred crash response and terrain
surface detail to a later pass. Mark subsequently supplied the 1991 reference:
the fascia now follows its narrow raised centre, shallow shoulders, grey face,
dark rim and centrally placed radar bay, while retaining the smaller height.

## Changes

- Dashboard visible height reduced from about 45% to 30% of the screen.
  The reduction is two thirds in projected space, anchored to the bottom.
  Instrument dimensions are reduced proportionally; round instruments stay
  round. The coaming has sloping trapezoidal shoulders and resizes with aspect.
- Airspeed, altitude and climb retain dials; attitude retains its ball and
  heading its tape. The gunsight retains its position and angular size.
- Fuel becomes a vertical column with five marks at 0/25/50/75/100%, a longer
  halfway hash, and EMPTY/FULL labels. Fill uses `fuelKg / fuelCapacityKg`,
  avoiding the rounded 250-gallon display scale. Throttle remains a column.
- Slip's dedicated dial is removed. The existing diagnostic calculation is
  retained: it measures the sideways fraction of velocity in aircraft axes.
  Auto-rudder is enabled by default; slip does not need a large cockpit dial.
- An actual, bounded RADAR / RESERVED recess replaces the invisible layout
  reservation. No sweep or contacts are fabricated. Combat will supply those.
- Follow view defaults to a white numeric strip showing speed, altitude,
  climb, heading, fuel percentage/gallons, throttle, pitch and bank. `I` or the
  Hide/Show button toggles it; the preference survives camera changes, and
  both strip and button disappear in cockpit view. Numeric values are not
  clamped to the analog dial limits. DOM fields update only when changed.
- Follow-camera distance varies smoothly with interpolated speed: 17.6 m
  aft below 40 m/s, 22 m at 120 m/s, 26.4 m above 200 m/s. Height scales with
  distance to preserve framing; roll remains excluded. Cockpit view is rigid.
- Quick `C` taps are latched until a frame consumes them. Previously a tap
  entirely between frames was lost (also recorded in the earlier handoff).
- The orange/red kilometre-spaced test boxes are removed from the scene.
  Their unused construction helper remains available to existing unit tests.

## Verification

- Typecheck, lint and dependency rules pass.
- Targeted render/input suite: **318 passed, 2 skipped**.
- Final full suite: **670 passed, 6 skipped, 12 pre-existing failures**.
  All twelve failures reproduce against an untouched archive of `6809e79`:
  nine architecture checks use Unix-style executable paths or privileged
  directory symlinks on Windows; two tests assert exact floating-point values
  differing in their final digits on this platform; the terrain header digest
  compares LF source bytes with a CRLF checkout (`git ls-files --eol` confirms
  `i/lf w/crlf`). The archive additionally fails four git-ignore checks because
  it has no `.git` directory. The temporary archive/copy was removed afterward.
- Production build succeeds with the existing bundle-size warning.
- Browser checks on the AMD RDNA-2 reference GPU: actual cockpit inspected at
  1280×720 and 1500×1000; numeric strip, button, keyboard toggle, quick camera
  taps, and camera-specific visibility checked. No browser console errors
  observed. The full automated Tier 2 suite was not rerun.
- New geometry tests check actual trapezoid coverage, reduced projected
  height, radar bounds, fuel marks/fill/base, camera speed routing and numeric
  data. Existing attitude, heading alignment and containment tests still pass.
- After receiving the reference image, the panel-only suite was rerun:
  **55 passed**, plus typecheck, lint and production build. Containment now
  raycasts the actual shoulder geometry (including the rim/fascia seam),
  and the radar check also pins its centre. This refinement was visually
  inspected at 16:9 and 3:2 with no console errors observed.

## Follow-up scope

Impact detection already records contact but deliberately does not stop the
aircraft. A crash/restart response remains to be implemented. Ocean waves are
visual and are not yet a physical collision surface. Terrain currently has
height/slope colours, without beach/jungle surface textures or vegetation.
Neither area changed in this pass.
