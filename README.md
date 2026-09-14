# ww2airsim

A WWII Pacific air combat simulator that runs in the browser. Fly an F6F
Hellcat from carrier and land bases over a geographically real Leyte Gulf,
fight, and get back aboard — because your score does not count until you do.

Inspired by *Hellcats Over the Pacific* (Graphic Simulations, 1991) and its
*Missions at Leyte Gulf* expansion. Clean-room: no original code, assets, or
mission text. `ww2airsim` is a working title.

## Status

**Plans 1-3 of 7 complete (2026-09-13).** A deterministic F6F Hellcat flight
model runs headlessly in Node under `src/sim/`, graded against cited
historical trial figures by the test-card harness in `tools/testcards/`, with
a golden-trajectory regression, a randomised soak, and CI (Plan 1). It is
flyable in the browser on a WebGPU renderer over flat water, with keyboard
controls, a chase and cockpit camera and a gauge panel (Plan 2). Three input
assists -- stall limiter, auto-rudder and altitude hold -- sit between the
keyboard and the simulation, each switchable in flight (Plan 3).

Terrain, the ocean, weapons, damage, AI, carrier operations and the meta-game
are the four later plans and do not exist yet.

The full design lives in
[`docs/superpowers/specs/2026-09-12-ww2airsim-design.md`](docs/superpowers/specs/2026-09-12-ww2airsim-design.md)
and remains the authoritative description of the project as a whole — read it
for intent, and the code for what is actually built.

## Getting started

Node 22 and npm.

```sh
npm ci
npm run verify   # typecheck -> lint -> depcruise -> tests
```

`npm run verify` is the gate: it runs `tsc --noEmit`, ESLint, the
dependency-cruiser boundary rules, and the full vitest suite, in that order.

## Tier 2: the GPU harness

Two checks need a real GPU and a browser and so cannot run in `npm run
verify` or in hosted CI: an adapter guard (confirms the browser is actually
using the reference GPU, not a software rasterizer) and a camera sweep that
asserts zero WebGPU validation errors. Deliberately no screenshot goldens —
see `tests/e2e/adapter.spec.ts`'s doc comment for why.

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

**Or drive the whole thing from nexus** (verified 2026-09-13: 2 passed, real
RX 6700 XT, with a screenshot pulled back). The tunnels simply run the other
way, and Playwright connects to a server on the Windows box rather than being
started there:

```sh
# on nexus, both backgrounded
ssh -N -R 5173:localhost:5173 ryzen     # ryzen's localhost:5173 -> this dev server
ssh -N -L 39001:127.0.0.1:3000 ryzen    # this 39001 -> its Playwright server

PW_REMOTE=ws://localhost:39001/ npm run test:tier2
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

Expected: 2 passed. If the adapter test fails, read its printed summary
before anything else — it is almost always telling you the browser fell back
to a software rasterizer, not that anything else is wrong.

## What this is, and is not

This is a technical playground; the engineering is the point. Depth is
allocated unevenly and on purpose:

| Area | Depth |
| --- | --- |
| World and terrain — real DEM and bathymetry, LOD streaming, 60–100 km views | Deep |
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
attributed in the same file.
