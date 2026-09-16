# ww2airsim

A WWII Pacific air combat simulator that runs in the browser. Fly an F6F
Hellcat from carrier and land bases over a geographically real Leyte Gulf,
fight, and get back aboard — because your score does not count until you do.

Inspired by *Hellcats Over the Pacific* (Graphic Simulations, 1991) and its
*Missions at Leyte Gulf* expansion. Clean-room: no original code, assets, or
mission text. `ww2airsim` is a working title.

## Status

**Plans 1–5 implemented (2026-09-15; ocean branch).** A deterministic F6F Hellcat flight
model runs headlessly in Node under `src/sim/`, graded against cited
historical trial figures by the test-card harness in `tools/testcards/`, with
a golden-trajectory regression, a randomised soak, and CI (Plan 1). It is
flyable in the browser on a WebGPU renderer, with keyboard controls, a chase
and cockpit camera and a gauge panel (Plan 2). Three input assists — stall
limiter, auto-rudder and altitude hold — sit between the keyboard and the
simulation, each switchable in flight (Plan 3). And the water it flies over is
no longer empty: real Leyte Gulf is under it (Plan 4, below).

The sea now has deterministic, Beaufort-driven FFT waves, depth colour,
shallow-water attenuation and foam (Plan 5). See the
[ocean handoff](docs/handoff/2026-09-15-plan5-ocean.md) for GPU measurements,
visual comparisons and the remaining art-direction questions.

Ground contact, take-off and landing, ships and airfields, combat, AI and the
meta-game all remain ahead. Mark reordered them on 2026-09-16 so that the
ground under the airplane comes before there is anybody to shoot at; plan
numbers were deliberately NOT reused, for the reason the next paragraph
records. **Master spec §15 holds the order and the argument for it**, and this
paragraph does not restate either.

That count was genuinely unsettled until then, and this paragraph said so:
input assists were inserted into the slot the roadmap had given terrain, and
three design documents each shifted differently — the renderer design still
called terrain Plan 3 and the ocean Plan 4, the terrain design called the
ocean Plan 6, and the assists design reserved Plan 5 for combat. Those encoded
two different answers to "what comes after terrain" rather than three typos.
**The table in master spec §15 is now the only authoritative copy**; every
other document points at it.

The cockpit has a grey trapezoidal dashboard with a dark rim and raised centre,
occupying about 30% of screen height,
with smaller airspeed, altitude and climb dials, an attitude ball, a heading
tape, throttle and fuel columns, and a central **RADAR / RESERVED** bay for
the combat phase. Fuel has five marks from EMPTY to FULL. Slip remains a
diagnostic quantity but has no dedicated cockpit dial. The gunsight stays on
the boresight. Use a window at least 3:2 for the complete instrument row.

Follow view shows a small white numeric flight-data strip by default; **I**
or its Hide/Show button toggles it. The preference survives camera switches.
It includes speed, altitude, climb, heading, fuel, throttle, pitch and bank.
The follow camera eases farther behind the plane as speed increases and
closer as it slows. **C** switches views, including quick taps. See the
[cockpit feedback handoff](docs/handoff/2026-09-15-cockpit-feedback.md).

**T** runs the flight at triple time, as the 1991 original did, and **T**
again returns it to real time. Both camera modes show a **3× TIME** badge
while it is on. Compression multiplies the frame's elapsed time rather than
shortening the fixed step, so a compressed flight is the same trajectory
played faster and the waves speed up with it; the pilot's head still pans at
real speed. A machine slow enough to owe more than `MAX_STEPS_PER_FRAME` gets
less than 3x rather than a widening backlog.

The full design lives in
[`docs/superpowers/specs/2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md)
and remains the authoritative description of the project as a whole — read it
for intent, and the code for what is actually built.

## Ocean: trying Plan 5

Run `npm run dev -- --port 5183` in the ocean worktree. Compare
`http://localhost:5183/?spawnY=100&beaufort=2&oceanTime=17` with force `6`.
Remove `oceanTime` to animate. `oceanTier=high`, `medium` or `low` holds a
quality tier for development comparisons. These URL overrides are absent
from production builds. Default weather is Beaufort 4.

Three disjoint wave bands use 509/127/31 m periods. High quality runs three
256² FFTs, medium two 128² FFTs, low one 128² FFT. A one-time warm-up check
can reduce quality if measured cost exceeds its threshold. Water remains a
rendering effect: wave forces and water collision are future work.

## Terrain: what Plan 4 built, and what it did not

**What it is.** Copernicus GLO-30 elevation, resampled offline into one
8193 × 8193 heightfield — a 200 × 200 km tangent plane at 24.4 m posting,
centred on 10.8 N 125.3 E — drawn as a CDLOD quadtree out to 100 km with
camera-relative coordinates, a `d²/2R` horizon sink and aerial-perspective
fog. The simulation answers `heightAt(x, z)` from the same pyramid and fires
a crash event on contact (`src/sim/world/terrain.ts`). Design:
[`2026-09-13-terrain-design.md`](docs/superpowers/specs/2026-09-13-terrain-design.md).

**What it is not.** Each of these is deliberate, and each belongs to a later
plan rather than to a to-do list:

- **No surface materials.** The terrain is coloured by height and slope. The
  ESA WorldCover splat guide is 400 MB and a subject of its own.
- **Bathymetry arrived in Plan 5.** A 513 × 513 GEBCO grid drives ocean colour
  and shallow-water attenuation. It stores signed metre depths in 526,338
  bytes; the terrain pyramid and collision surface retain their own encoding.
- **No crash response or ground handling.** Contact records an impact, but
  does not yet stop the aircraft or present a crash/restart screen. Flying
  through water or land remains possible. No runways, gear or deck operations.
- **No trees, buildings or roads.** The surface is bare relief.

**Three things you will see that have already been ruled on**, recorded here
so they are not re-reported as bugs:

- ~~**The true beach is hidden by flat water.**~~ Fixed 2026-09-15: terrain
  and ocean use the same curvature sink, with reversed floating-point depth
  preventing long-range interleaving. Coastline detail is still limited by
  the source grids; judge the visual result in the Plan 5 captures.
- **Red/orange sea markers removed (2026-09-15).** These were an early
  kilometre-spaced test grid for scale and speed cues, not terrain artifacts.
- ~~**`main.ts`'s three-line physics-wiring call site is unasserted**~~ —
  closed 2026-09-14. The body moved to `applyTerrainLevel`
  (`src/render/terrain/load.ts`) and is driven by a test with a fake mesh;
  the call site is now one line. `window.__ww2.groundHeightM()` remains the
  check from outside, and is `null` if no field ever reached the simulation.

The hand-off to Mark — screenshots, the measured GPU frame cost, the LOD
height-error tables, and the one open question — is
[`docs/handoff/2026-09-14-plan4-terrain.md`](docs/handoff/2026-09-14-plan4-terrain.md).

## Getting started

Node 22 and npm.

```sh
npm ci
npm run verify   # typecheck -> lint -> depcruise -> tests
```

`npm run verify` is the gate: it runs `tsc --noEmit`, ESLint, the
dependency-cruiser boundary rules, and the full vitest suite, in that order.

## The terrain pyramid: a clone already flies

Nothing has to be downloaded to fly over Leyte. `content/terrain/` carries
`header.json` and `L4.bin`…`L12.bin` — 703,306 bytes, committed — and the
browser fetches five of those levels, L8 down to L4 (702,346 bytes), because
`LOD.rings` is 8 and no ring can sample anything coarser (`coarsestFetchedLevel`,
`src/render/terrain/lod.ts`). L4, at 390 m sample spacing, is what a fresh
clone draws and what the physics queries.

Rebuilding is therefore only needed to obtain **L0–L3**, which the browser has
never been able to fetch. One command, which fetches the eight source tiles
itself if the cache is empty:

```sh
npm run terrain:build    # tools/terrain/build.ts; prints bytes written and elapsed time
npm run bathy:build      # GEBCO subset → 513² int16 metre grid, 526338 bytes
```

Measured on nexus, 2026-09-14:

| | |
| --- | --- |
| Downloaded | **106,966,683 bytes** — eight Copernicus GLO-30 COGs into `tools/terrain/cache/`, gitignored |
| Written | **179,022,674 bytes** of pyramid — the 178,319,368 bytes of gitignored `L0`–`L3`, plus the 703,306 already-committed bytes, rewritten byte-identically |

(Plan 4 estimated "~90 MB of downloads". The eight tiles measure 107 MB; the
ninth 1° × 1° cell this world touches is 100% open ocean and Copernicus
publishes no tile for it — `ASSETS.md` has the confirmation.)

Two Tier 1 checks skip themselves **by name** without those files, rather than
vanishing: the mip-0 far-field height-error table in
`tests/render/terrainLod.test.ts`, and the built-grid-against-source-tiles
block in `tests/tools/terrainBuild.test.ts`. Both gate on `L0.bin` AND the
source cache, because both read both — until 2026-09-14 the second gated on the
cache alone, so running only the `fetch.ts` half of the command above turned
its named skip into an ENOENT. Everything else in `npm run verify` runs against
the committed levels.

## Tier 2: the GPU harness

Checks that need a real GPU and a browser cannot run in `npm run verify` or in
hosted CI: an adapter guard (confirms the browser is actually using the
reference GPU, not a software rasterizer), camera sweeps that assert zero
WebGPU validation errors, and the frame-time budget. Deliberately no
screenshot goldens — see `tests/e2e/adapter.spec.ts`'s doc comment for why.

The dev server binds loopback-only (`vite.config.ts`), because WebGPU needs a
secure context and a plain-HTTP LAN address is not one — so the loop is a dev
server on nexus, reached over an SSH tunnel, with the Playwright runner itself
on a machine with a real GPU:

```sh
# on nexus
npm run dev

# on the Windows desktop, in another terminal
ssh -L 5173:localhost:5173 nexus
```

**Or drive the whole thing from nexus** (verified 2026-09-14: 6 passed, real
RX 6700 XT). The tunnels simply run the other way, and Playwright connects to
a server on the Windows box rather than being started there:

```sh
# on nexus, both backgrounded
ssh -N -R 5173:localhost:5173 ryzen     # ryzen's localhost:5173 -> this dev server
ssh -N -L 39001:127.0.0.1:3000 ryzen    # this 39001 -> its Playwright server

PW_REMOTE=ws://localhost:39001/ npm run test:tier2
# An isolated worktree may use another forwarded port:
# PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=http://localhost:5183 npm run test:tier2
```

The one thing this cannot do for itself: **the `playwright run-server` it
connects to must already be running in the Windows console session** (started
there by hand, `npx playwright run-server --port 3000 --host 127.0.0.1`).
Chromium launched over SSH gets no GPU at all -- `requestAdapter()` returns
null, headless AND headed, because the SSH session is not the console session
(measured 2026-09-13). That is a session problem, not a headless one, so
`headless: false` is not a workaround for it.

One-time setup on the Windows desktop (a separate checkout — the test runner
has to be local to the GPU, the dev server does not):

```sh
git clone https://github.com/coder999/ww2airsim.git
cd ww2airsim
git checkout <branch-or-commit-with-this-work>   # until merged to main
npm ci
npx playwright install chromium
```

Then, with the tunnel open and `npm run dev` running on nexus:

```sh
npm run test:tier2
```

Expected: 6 passed — the adapter guard, the original camera sweep, three
sweeps over Leyte at 100 m / 3,000 m / 8,000 m, and the frame-time budget. If
the adapter test fails, read its printed summary before anything else — it is
almost always telling you the browser fell back to a software rasterizer, not
that anything else is wrong.

**Flying somewhere specific.** The airplane spawns over open water 23 km from
the nearest land, which is three minutes' flying. `?spawnX=&spawnY=&spawnZ=`
moves it (`src/render/spawn.ts`); the parameters exist in DEV only and
`tests/build/dist.test.ts` asserts they are absent from a production bundle.

## Deployment

Live at <https://ww2airsim.marktuttle.dev>, a public static site on the OVH
VPS. `noindex`, because it is unfinished.

Deploys are **manual**: `gh workflow run deploy.yml --repo coder999/ww2airsim`.
Pushing `main` releases nothing. The workflow runs `npm run verify`, builds,
rsyncs `dist/`, and then asserts the live site — including that the gitignored
L0–L3 terrain tiles never became public (`content/terrain/tiles/L0.bin` must
404).

The design, the facts it rests on and how each was verified are in
[`docs/superpowers/specs/2026-09-15-deployment-design.md`](docs/superpowers/specs/2026-09-15-deployment-design.md).
The VPS side lives in `vps-infra/sites/ww2airsim/`.

## What this is, and is not

This is a technical playground; the engineering is the point. Depth is
allocated unevenly and on purpose:

| Area | Depth |
| --- | --- |
| World and terrain — real DEM and bathymetry, CDLOD, 100 km views | Deep |
| Graphics — WebGPU, cascaded FFT ocean, volumetric cloud | Deep |
| Flight physics — honest forces, simplified moments | Good enough |
| Combat AI — pursuit, energy awareness, a small maneuver set | Basic |
| Content — eight scenarios, six aircraft | Minimal |

Explicitly not in scope: multiplayer, a persistent strategic campaign,
study-level aerodynamics, mobile, or VR.

## Requirements

A WebGPU-capable Chromium. There is no WebGL2 fallback in v1, though the
renderer boundary keeps one possible without touching the simulation.

## Architecture in one line

`sim/` never imports `render/` and never touches a browser global. That single
constraint is what makes ~90% of the logic testable headlessly in Node, and
what lets an AI pilot fly the player's seat in end-to-end tests.

## License

[AGPL-3.0](LICENSE). Copyright (C) 2026 Mark Tuttle.

Note the network clause: anyone who runs a modified version of this as a
network service must offer its source to users. Third-party code contributed
here must therefore be AGPL-compatible — permissive licenses such as MIT, BSD,
and Apache-2.0 are fine.

Bundled assets are licensed separately and individually recorded, with source
and license, in `ASSETS.md`. Terrain is derived from open government datasets
attributed in the same file, and the licence notice that must travel with the
derived data is committed beside it in `content/terrain/NOTICE.md`.
