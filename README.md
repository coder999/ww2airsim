# ww2airsim

A WWII Pacific air combat simulator that runs in the browser. Fly an F6F
Hellcat from carrier and land bases over a geographically real Leyte Gulf,
fight, and get back aboard — because your score does not count until you do.

Inspired by *Hellcats Over the Pacific* (Graphic Simulations, 1991) and its
*Missions at Leyte Gulf* expansion. Clean-room: no original code, assets, or
mission text. `ww2airsim` is a working title.

## Status

Flyable in the browser on WebGPU: a deterministic flight model in `src/sim/`
graded against cited trial figures, real Leyte Gulf terrain and sea, ground
handling and carrier and land-base landings, combat, AI pilots, missions,
a pilot roster and an instant-replay debrief. **Master spec §15 is the only
authoritative status table**; each plan's handoff in `docs/handoff/` holds its
measurements. The per-plan history that used to sit here is in
[docs/status-log.md](docs/status-log.md).

**Ground drape spike (2026-09-29):** an off-by-default `?drape=` experiment
for satellite-derived ground texture; findings, variants and traps are in
[docs/drape.md](docs/drape.md).

**Audio foundation (2026-09-29):** engine, effects and ambient buses, named looping layers, a cockpit/chase cabin mix, chase-camera distance falloff and positioned one-shots. `verify` was red for unrelated failures, see the [handoff](docs/handoff/2026-09-29-audio-foundation.md); master spec §15 holds the status, and the order of the rest is in `docs/superpowers/specs/2026-09-29-audio-expansion-design.md`.

## Flying it

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

Touching the ground or the sea now ends the flight (Plan 10). A gentle,
wings-level, near-stall arrival on water is a ditching the pilot survives;
everything else — any land contact, or a hard, banked, or fast water contact —
is a wreck. Water can be survived and land cannot because the F6F model has no
landing gear, flaps, or rolling friction to land on land *with*; there is
nothing to make a survivable land contact out of. Either way the simulation
freezes at the moment of contact, a debrief dialog reports what happened, and
the only control is a restart back to the spawn point. See master spec §15 for
where this sits in the roadmap and what comes next.

The full design lives in
[`docs/superpowers/specs/2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md)
and remains the authoritative description of the project as a whole — read it
for intent, and the code for what is actually built.

What the player sees — scoring and ranks, the aircraft, ship and building
rosters, the scenarios — is in [`GAMEPLAY.md`](GAMEPLAY.md).

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

- ~~**No surface materials.**~~ Fixed by Plan 13b, 2026-09-18: the terrain is
  coloured by ESA WorldCover class fractions, not by height and slope alone,
  and the shipped raster is 247.6 KiB, not the "400 MB splat guide" once
  assumed here. Handoff:
  [`2026-09-18-plan13b-land-cover.md`](docs/handoff/2026-09-18-plan13b-land-cover.md).
- **Bathymetry arrived in Plan 5.** A 513 × 513 GEBCO grid drives ocean colour
  and shallow-water attenuation. It stores signed metre depths in 526,338
  bytes; the terrain pyramid and collision surface retain their own encoding.
- ~~**No crash response.**~~ Fixed by Plan 10, 2026-09-16 (above). Contact now
  ends the flight and raises a debrief. **No ground handling yet**: no
  runways, gear or deck operations. Those are Plan 11.
- ~~**No trees, buildings or roads. The surface is bare relief.**~~ False
  since `daa1b39`, 2026-09-17: trees (`src/render/scene/vegetation.ts`) and
  the Tacloban airfield buildings (`scene/airfield.ts`) are drawn. Real
  OpenStreetMap towns/villages (deterministic hut rings), the Maharlika
  Highway alignment and Dulag's own smaller 1944 building layout landed in
  Plan 13d, 2026-09-24. Handoff:
  [`2026-09-23-plan13d-places.md`](docs/handoff/2026-09-23-plan13d-places.md);
  roadmap table in
  [`2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md)
  §15.

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

## Where docs go

One home per kind of fact. Point at it from elsewhere; never copy it.

| Kind of content | Home |
| --- | --- |
| Project status and plan order | Master spec §15, **only**. Never restate it. |
| Design of a feature or plan | `docs/superpowers/specs/<date>-<name>-design.md` |
| Executable plan, and dated rulings | `docs/superpowers/plans/` |
| What a finished plan measured, and what is still open | `docs/handoff/<date>-<plan>.md`, one per plan |
| Post-mortem with an open fix | `docs/incidents/<date>-<name>.md` |
| A subsystem's standing reference: what ships, what was tried, traps, open items | `docs/<topic>.md` (`clouds.md`, `models.md`, `aircraft.md`, `drape.md`, `testing.md`); update it in the same commit as the change |
| How to run tests and the GPU harness | `docs/testing.md` |
| Agent rules that cannot be derived from the code | this file, briefly |
| Overview, getting started, and pointers | `README.md` |
| Gameplay a player sees | `GAMEPLAY.md` |

The README is not a ledger: a landed plan gets a handoff and a §15 row, not a
paragraph here. The pre-2026-09-29 per-plan entries are frozen in
[docs/status-log.md](docs/status-log.md).

## Getting started

Node 22, npm, and **Git LFS** (`git-lfs`) — the last one is new as of Task 2
(2026-09-24) and easy to miss, because its absence does not look like a
missing tool. `content/terrain/L0.bin` is 134 MB, over GitHub's 100 MB
per-file limit, so it is committed via Git LFS rather than as a plain blob. A
checkout without git-lfs installed (or without `git lfs pull` run) gets a
~130-byte pointer file in its place, and `npm run verify` fails with an
exact-byte-count mismatch that reads exactly like data corruption, not like a
missing prerequisite. Install once per machine, then pull if a clone predates
this:

```sh
git lfs install        # once per machine, not per clone
git lfs pull            # if `content/terrain/L0.bin` is ~130 bytes, not ~134 MB
npm ci
npm run verify   # typecheck -> lint -> depcruise -> tests
```

`npm run verify` is the gate: it runs `tsc --noEmit`, ESLint, the
dependency-cruiser boundary rules, and the full vitest suite, in that order.
CI (`ci.yml`, `nightly-soak.yml`) deliberately does NOT fetch LFS content (a
bandwidth-cost decision against GitHub LFS's free 1 GB/month quota, made
because those workflows run on every push/PR or nightly — see `ci.yml`'s own
comment); the handful of tests that need L0's real bytes detect the pointer
and skip themselves by name instead of failing. `deploy.yml` (manual,
low-frequency) DOES fetch LFS content, and is where L0 is actually verified
before a release ships.

## The terrain pyramid: a clone already flies

Nothing has to be downloaded to fly over Leyte. Since Task 2 (2026-09-24),
`content/terrain/` carries the WHOLE pyramid, `header.json` and
`L0.bin`…`L12.bin` — 179,022,522 bytes, all committed (L0 via Git LFS, per
the prerequisite above; L1 and coarser as plain git blobs). The browser only
fetches part of it, though: `finestFetchedLevelFor` (`src/render/content.ts`)
resolves how far down the pyramid a page load goes from the persisted Asset
Quality tier, and until a later task wires that up from a real Settings
choice, every session uses the same placeholder, `'low'` — L8 down to L1,
eight levels, 44,771,216 bytes (`LOD.rings` is 8 and no ring can sample
anything coarser, `coarsestFetchedLevel` in `src/render/terrain/lod.ts`). L1,
at 49 m sample spacing, is what a fresh page load draws and what the physics
queries today; `'medium'`/`'high'`/`'ultra'` (not yet reachable without that
later task) go one level further, to L0 at 24 m.

Before Task 2, only L2–L12 (703,306 bytes) were committed and the pyramid
stopped at L4 (390 m) for both rendering and physics; L0–L3 lived gitignored
in `content/terrain/tiles/` and had to be rebuilt locally to even exist.
`npm run terrain:build` no longer unlocks anything the committed set lacks —
everything down to L0 is committed now — but it still regenerates the
pyramid from source, which matters for verifying the pipeline itself is
reproducible, or after changing the resampler, the mip filter, or the DEM.
One command, which fetches the eight source tiles itself if the cache is
empty:

```sh
npm run terrain:build    # tools/terrain/build.ts; prints bytes written and elapsed time
npm run bathy:build      # GEBCO subset → 513² int16 metre grid, 526338 bytes
```

Measured on nexus, 2026-09-14 (before Task 2; the committed byte counts above
are current):

| | |
| --- | --- |
| Downloaded | **106,966,683 bytes** — eight Copernicus GLO-30 COGs into `tools/terrain/cache/`, gitignored |
| Written | **179,022,674 bytes** of pyramid — at the time, the 178,319,368 bytes of gitignored `L0`–`L3`, plus the 703,306 already-committed bytes, rewritten byte-identically |

(Plan 4 estimated "~90 MB of downloads". The eight tiles measure 107 MB; the
ninth 1° × 1° cell this world touches is 100% open ocean and Copernicus
publishes no tile for it — `ASSETS.md` has the confirmation.)

Three Tier 1 checks skip themselves **by name** rather than vanishing when
their preconditions are not met: the mip-0 far-field height-error table and
the L0/L1 whole-surface error pin in `tests/render/terrainLod.test.ts`, the
L0-specific size/hash checks in `tests/tools/terrainBuild.test.ts`, and the
L0 byte-count assertion in `tests/build/dist.test.ts`. All three gate on
`tools/terrain/load.ts`'s `hasRealLevelFile(0)` — true only when `L0.bin` is
its real 134 MB, not an unsmudged LFS pointer — which is exactly the CI
situation described above. `tests/tools/terrainBuild.test.ts`'s
built-grid-against-source-tiles block additionally needs the gitignored
source cache; running only the `fetch.ts` half of the command above without
also running `terrain:build` turns that one's named skip into an ENOENT
(review 2026-09-14, finding M3). Everything else in `npm run verify` runs
regardless.

## Tier 2: the GPU harness

Checks that need a real GPU and a browser (adapter guard, validation-error
sweeps, the frame-time budget) cannot run in `npm run verify` or hosted CI.
The tunnels, servers, locks and recipes are in [docs/testing.md](docs/testing.md).

## Deployment

Live at <https://ww2airsim.com>, a public static site on the OVH
VPS. `noindex`, because it is unfinished.

Also served at <https://ww2airsim.marktuttle.dev> as of 2026-09-29: the
apex is blocked on the maintainer's work network until its registration is
30 days old, and `marktuttle.dev` is not. Both hosts are one Traefik router
(`vps-infra/sites/ww2airsim/compose.yml`); drop the second `Host()` once the
apex is confirmed reachable from work. Verified 2026-09-29: both returned 200.

Deploys are **manual**: `gh workflow run deploy.yml --repo coder999/ww2airsim`.
Pushing `main` releases nothing. The workflow checks out with `lfs: true`
(needed since Task 2, 2026-09-24: `content/terrain/L0.bin` is committed via
Git LFS), runs `npm run verify`, builds, rsyncs `dist/`, and then asserts the
live site — including that `content/terrain/L0.bin` IS public (200, by
design: it is committed content a real page load fetches) and that
the gitignored terrain scratch directory never became public
(`content/terrain/tiles/L6-preview.png` is a sentinel path that must 404 —
before Task 2 this checked `tiles/L0.bin`, which moved out of that directory).

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

**It also renders on Android Chrome** — observed on Mark's tablet 2026-09-17
against the live site, and the first non-AMD adapter this has ever run on.
Recorded as an observation, **not as a supported platform**: mobile is
explicitly out of scope above, and that has not changed.

Two things it happens to demonstrate, both by design rather than by luck:

- **It is view-only.** `src/input/` is `bindings.ts`, `keyboard.ts` and
  `lookAround.ts` — there is no touch, pointer or gamepad handling anywhere in
  the codebase, so nothing on a tablet can fly it. A paired Bluetooth keyboard
  would.
- **The player is told nothing about the unfamiliar GPU, and should not be.**
  `judgeAdapter` (`src/render/adapterGuard.ts`) returns `warn` for a real GPU
  that is not the RX 6700 XT, and a `warn` reaches only the DEV overlay, which
  `main.ts` builds as `null` in a production build. `warn` exists to stop
  *measurements* being trusted off the reference platform, which is a
  developer's problem and not a pilot's. Only `fail` — an actual software
  rasterizer — reaches the screen, through `showFailure`.

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
