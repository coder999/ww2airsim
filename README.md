# ww2airsim

A WWII Pacific air combat simulator that runs in the browser. Fly an F6F
Hellcat from carrier and land bases over a geographically real Leyte Gulf,
fight, and get back aboard — because your score does not count until you do.

Inspired by *Hellcats Over the Pacific* (Graphic Simulations, 1991) and its
*Missions at Leyte Gulf* expansion. Clean-room: no original code, assets, or
mission text. `ww2airsim` is a working title.

## Master Plan & Ledger
The authorotative master plan lives at `MASTER_PLAN.md`.  Details of execution for portions of the master plan may be kept in `docs/superpowers/plans` but the master plan remains the authorotative plan and ledger.   Each plan's handoff in `docs/handoff/` holds its
measurements. The per-plan history that used to sit here is in [docs/status-log.md](docs/status-log.md).

The README is not a ledger

## Overview

Flyable in the browser on WebGPU: a deterministic flight model in `src/sim/`
graded against cited trial figures, real Leyte Gulf terrain and sea, ground
handling and carrier and land-base landings, combat, AI pilots, missions,
a pilot roster and an instant-replay debrief.

## Design

The full design lives in
[`docs/superpowers/specs/2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md)
and remains the authoritative description of the project as a whole — read it
for intent, and the code for what is actually built.

What the player sees — scoring and ranks, the aircraft, ship and building
rosters, the scenarios — is in [`GAMEPLAY.md`](GAMEPLAY.md).


The hand-off to Mark — screenshots, the measured GPU frame cost, the LOD
height-error tables, and the one open question — is
[`docs/handoff/2026-09-14-plan4-terrain.md`](docs/handoff/2026-09-14-plan4-terrain.md).

## Where docs go

One home per kind of fact. Point at it from elsewhere; never copy it.

| Kind of content | Home |
| --- | --- |
| Project status and plan order | `MASTER_PLAN.md`, **only**. Never restate it. |
| Design of a component of master plan| `docs/superpowers/specs/<date>-<name>-design.md` |
| Executable plan, and dated rulings | `docs/superpowers/plans/` |
| What a finished plan measured, and what is still open | `docs/handoff/<date>-<plan>.md`, one per plan |
| Post-mortem with an open fix | `docs/incidents/<date>-<name>.md` |
| A subsystem's standing reference: what ships, what was tried, traps, open items | `docs/<topic>.md` (`clouds.md`, `terrain.md`, `models.md`, `aircraft.md`, `drape.md`, `testing.md`); update it in the same commit as the change |
| How tests are written (philosophy), how to run them, and the GPU harness | `docs/testing.md` |
| Agent rules that cannot be derived from the code | `Agents.md` |
| Overview, getting started, and pointers | `README.md` |
| Gameplay a player sees | `GAMEPLAY.md` |



## Getting started

Node, npm, and **Git LFS** (`git-lfs`). `content/terrain/L0.bin` is large, over GitHub's 100 MB
per-file limit, so it is committed via Git LFS rather than as a plain blob. A
checkout without git-lfs installed (or without `git lfs pull` run) gets a
~130-byte pointer file in its place, and `npm run verify` fails with an
exact-byte-count mismatch that reads exactly like data corruption, not like a
missing prerequisite. Install once per machine, then pull if a clone predates
this:

```sh
git lfs install        # once per machine, not per clone
git lfs pull            # if `content/terrain/L0.bin` is ~130 bytes, not ~134 MB (estimate, may grow as game grows)
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

One command, which fetches the eight source tiles itself if the cache is
empty:

```sh
npm run terrain:build    # tools/terrain/build.ts; prints bytes written and elapsed time
npm run bathy:build      # GEBCO subset → 513² int16 metre grid, 526338 bytes
```

Measured on nexus (last measured 2026-09-14):

| | |
| --- | --- |
| Downloaded | **106,966,683 bytes** — eight Copernicus GLO-30 COGs into `tools/terrain/cache/`, gitignored |
| Written | **179,022,674 bytes** of pyramid — at the time, the 178,319,368 bytes of gitignored `L0`–`L3`, plus the 703,306 already-committed bytes, rewritten byte-identically |

## Deployment

Live at <https://ww2airsim.com> , a public static site on the OVH
VPS. `noindex`, because it is unfinished.  Also served at <https://ww2airsim.marktuttle.dev> as of 2026-09-29: the
apex is blocked on the maintainer's work network until its registration is
30 days old, and `marktuttle.dev` is not. Both hosts are one Traefik router
(`vps-infra/sites/ww2airsim/compose.yml`); drop the second `Host()` once the
apex is confirmed reachable from work. 

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

This is a hobbyist gamet. Depth is allocated unevenly and on purpose:

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


### Machines with two GPUs (Intel + NVIDIA)

If the DEV overlay reports the integrated GPU on a two-GPU machine, the code is
not at fault: `requestAdapter({ powerPreference: 'high-performance' })`
(`src/render/renderer.ts`) already asks for the discrete GPU, and WebGPU offers
no way to enumerate or force one. On Windows the browser's GPU process runs on
whichever GPU Windows assigns it, and that assignment wins over the hint.

Fix, no admin needed (verified 2026-09-29 on Mark's work desktop, Intel iGPU +
RTX 3060): Settings -> System -> Display -> Graphics, add `chrome.exe` (or
`msedge.exe`), Options -> High performance, then fully quit and relaunch the
browser. To diagnose, run this in DevTools and check the vendor of each result
(Chrome reports coarse `info`, so the 3060 shows as `nvidia` / `ampere`, with
empty `device` and `description`):

```js
for (const p of [undefined, 'low-power', 'high-performance']) {
  const i = (await navigator.gpu.requestAdapter(p ? { powerPreference: p } : {}))?.info
  console.log(p ?? 'default', i && { vendor: i.vendor, arch: i.architecture })
}
```

If every result is Intel, Chrome cannot see the discrete GPU at all; check
`chrome://gpu`.

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
