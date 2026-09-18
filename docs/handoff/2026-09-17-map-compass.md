# Map handedness and compass repair

Continued Claude's interrupted work in the Windows checkout, based on
`801775f`. Changes are local and have not been deployed.

## Cause and correction

The geographic projection defined +X east, +Y up, +Z north. That geographic
frame has the opposite handedness from the renderer and aircraft body frame
(+X forward, +Y up, +Z right). Facing geographic north therefore put east on
screen left. Separately, the heading gauge treated the identity nose (+X,
east) as 000, so the parked northbound airplane displayed 090.

World coordinates now mean **+X east, +Y up, +Z south**. North is -Z.
The projection and inverse, terrain and depth CPU/GPU samplers, terrain
slope normal, offline resamplers, Tacloban spawn, and approach controller
use that convention. The compass uses `atan2(forward.x, -forward.z)`.
The flight model and camera basis rotation need no reflection or tuning.

Terrain and bathymetry binaries still have row zero at the north edge and
column zero at the west edge. Their bytes are unchanged. Tacloban is now
`(-29666, -47605)` in world X/Z; old debug URLs must negate their Z value.
Use the bare URL for the parked runway spawn. Geographic test fixtures and
the existing Tier 2 terrain, ocean and takeoff specs were updated accordingly.
The pinned terrain LOD error measurements still pass at the same geographic
camera locations; no tolerances or reference terrain heights were widened.

## Verification

- Typecheck, lint, dependency boundary command, and production build pass.
- Full unit suite: **907 passed, 11 failed, 6 skipped**. Before edits the
  same Windows checkout had **899 passed, 11 failed, 6 skipped**. All eight
  new geographic regression cases pass; no new failing tests.
- Existing failures: nine architecture harness cases (Windows process/link
  portability), one exact floating-point checkpoint comparison (differences
  around 1e-12), and the terrain JSON header byte digest (CRLF checkout).
  These were left unchanged. Missing source terrain/bathymetry caches account
  for the skipped source audits.
- New `tests/render/geography.test.ts` checks geographical axis signs, all
  four compass headings, east/west screen placement through both actual camera
  transforms, the spawn's geographic location, and known land/water landmarks.
- Existing real-terrain takeoff and scripted approach/landing unit tests pass.
- Inspected actual WebGPU output in the in-app browser, AMD RDNA-2 adapter:
  the northbound runway now shows mountains to the left and 000 in both the
  flight-data strip and cockpit tape. An eastbound airborne inspection over
  Leyte shows 090 and the corrected coastline. No browser error logs.
- The full Playwright Tier 2 suite was not run in this session.

Local preview: `http://127.0.0.1:5175/`. The remote development and production
sites have not been updated by this work.
