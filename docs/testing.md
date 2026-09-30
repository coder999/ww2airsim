# Testing: Tier 2, the GPU harness

Moved from the README on 2026-09-29. Tier 1 is `npm run verify` (see the
README's "Getting started"); this file is the reference for Tier 2.


## The layers, and what each one is for

Checked against `.github/workflows/*.yml` and `package.json` on 2026-09-30.

| Layer | Runs | Needs a GPU | What it proves |
| --- | --- | --- | --- |
| **Tier 1**: `npm run verify` (`tests/` except `e2e/`) | locally, and in `ci.yml` on every push and PR | no | The code is correct as logic: typecheck, lint, dependency rules, and vitest unit tests of the sim, AI, audio cues, input, replay, content and render graph construction. Fast, deterministic, hosted. |
| **Nightly soak** (`nightly-soak.yml`) | GitHub, 09:00 UTC | no | A long simulation (`tests/sim/soak.test.ts`) stays stable; opens an issue on failure. |
| **Deploy** (`deploy.yml`, manual) | GitHub, on request | no | The *release artifact* is sound: `npm run verify`, `npm run build`, the build carries the terrain fallback, rsync, then the live site answers (homepage 200, noindex and no-cache headers, the hashed asset the page names is served, `robots.txt`). It never starts a browser. |
| **Tier 2 e2e** (`tests/e2e/`, `npm run test:tier2`) | ryzen, by hand or the nightly | yes | The *running game* works in a real browser on the reference GPU: it boots, flies, renders without WebGPU validation errors, sounds the right audio cues, and the UI, missions, replay and scoring hold together in a session. |

The deploy workflow and Tier 2 answer different questions. Deploy asks "did
the files we shipped arrive and get served?", and its checks are HTTP
assertions plus Tier 1. Tier 2 asks "does the game still work?", and no hosted
runner can answer that, because WebGPU needs the real GPU. So **a green deploy
says nothing about Tier 2**, and Tier 2 does not gate a deploy: the nightly
(below) is what tells you a merge broke it.

### What the Tier 2 specs do, conceptually

- **Drive the real game through diagnostics, not screenshots.** The page
  exposes `window.__ww2` (`src/render/diagnostics.ts`); specs read state
  (terrain loaded, cue counts, validation errors, cloud shadow at a point) and
  press keys, instead of comparing pictures. The reason: most visual changes
  are smaller than screenshot noise. A pixel diff of the terrain texture
  detail measured under 1/255 (2026-09-30), so `terrainTextures.spec.ts` now
  asserts the detail *state* and `tests/render/terrainSurface.test.ts` pins
  that the graph wires it in.
- **Boot and sweep:** `boot`, `title`, `adapter` (is the browser on the
  reference GPU, not a software rasterizer) and the camera sweeps
  (`terrain`, `ocean`, `clouds`, `atmosphere`) fail on any WebGPU validation
  error.
- **Fly it:** `takeoff`, `approach`, `recovery`, `gunnery`, `strike`,
  `flyableAll` and the AI specs (`furball`, `ai-pursuit*`) run scripted pilots
  against the live sim and assert outcomes.
- **Product flow:** `sortie`, `missions`, `meta-game*`, `scenarioPicker`,
  `settingsUi`, `instantReplay` and `audio` (for example: a sea crash sounds
  once live and once more in its replay, by design) check the UI and
  session-level behavior.
- **Pixel specs are the exception:** `fx*`, `hangar`, `cloudPixels`,
  `cloudShadow`, `sun` and `ordnance` read the rendered canvas for a specific
  thing (a flash appears, a shadow is where it should be). They need a real
  desktop session, which is why the nightly uses the RDP route below.
- **Budget specs** (titles matching `budget|p95|tripwire|frame time|Hz`,
  e.g. `budget4k`, `fx-budget`, `motionBudget`) measure frame time. They are
  the only tests whose numbers depend on the machine, and the nightly records
  rather than fails them (see Verdict below). To run everything else:
  `--grep-invert '/budget|p95|tripwire|frame time|\bHz\b/i'`. Last full
  non-budget run, 2026-09-30 from main a2e3e4f: 181 passed, 0 failed, 2 skipped.

Checks that need a real GPU and a browser cannot run in `npm run verify` or in
hosted CI: an adapter guard (confirms the browser is actually using the
reference GPU, not a software rasterizer), camera sweeps that assert zero
WebGPU validation errors, and the frame-time budget. Deliberately no
screenshot goldens — see `tests/e2e/adapter.spec.ts`'s doc comment for why.

WebGPU is exposed only in a secure context, and a plain-HTTP LAN address is
not one, so the dev server is never simply browsed at `http://<nexus>:5173`.
Two loops satisfy that; `vite.config.ts` is authoritative for both, and the
Playwright runner is separate from either — it has to be on a machine with a
real GPU.

```sh
# on nexus — real HTTPS, no tunnel (added 2026-09-16)
npm run dev:lan
# then open https://ww2airsim.windomlane.org on the Windows desktop
```

That hostname answers twice over: on the LAN a router record sends it straight
to nexus with a Let's Encrypt certificate, and from anywhere else it goes out
through Cloudflare behind an Access login. Plain `npm run dev` binds loopback
and this hostname then returns 502 — the same 502 as no server at all, which
is exactly why the `dev:lan` script exists. How it is wired, and what breaks
it, live in `vps-local/shared/traefik/dynamic/ww2airsim-dev.yml`.

```sh
# or the original loop — loopback plus an SSH tunnel, because
# http://localhost IS itself a secure context
npm run dev                              # on nexus
ssh -L 5173:localhost:5173 nexus         # on the Windows desktop
```

**Or drive the whole thing from nexus.** Playwright connects to a server on
the Windows box rather than being started there, and the desktop's browser
loads the app over the LAN from the hostname above — so only ONE tunnel is
needed, for Playwright's control channel:

```sh
# on nexus: dev server, then the control tunnel (backgrounded)
npm run dev:lan
ssh -N -L 39001:127.0.0.1:3000 ryzen    # this 39001 -> its Playwright server

PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2
```

Other sessions may be rendering on the same GPU. For budget numbers you
mean to trust, run just the budget specs under `hwlock ryzen <cmd>`
(`serverconfig/scripts/hwlock`); CLAUDE.md's GPU section says when.

Verified 2026-09-16: whole suite green against that URL, adapter guard
included, so the desktop really was on its own GPU and really did reach nexus
directly. This replaced a second, reverse tunnel
(`ssh -N -R 5173:localhost:5173 ryzen`) that existed only to make nexus's
loopback dev server visible to the desktop; if the LAN path is ever
unavailable, that reverse tunnel plus plain `npm run dev` is still the
fallback, with `PW_BASE_URL` left unset. An isolated worktree on another port
needs `PW_BASE_URL=http://localhost:5183` and the reverse tunnel, since only
5173 is routed — unless it uses one of the two dedicated slots below, which
route the same real-HTTPS way `ww2airsim.windomlane.org` does and need no
reverse tunnel at all.

**Two more slots exist for running a second and third dev server in
parallel** — e.g. two worktrees each mid-plan, both needing the reference
GPU at once. `ww2airsim-3.windomlane.org` routes to port 5174,
`ww2airsim-2.windomlane.org` to port 5175; both are real A records +
Traefik routes, wired exactly like the main hostname above (LAN goes
straight to nexus with a cert, off-LAN goes through the Cloudflare tunnel
and Access). To use one from a worktree: edit that worktree's own
`vite.config.ts` — change `TUNNEL_HOST` to the slot's hostname and
`server.port` to match — then run `WW2AIRSIM_TUNNEL=1 npx vite --port 5174`
(or `5175`) from the worktree. That edit is local scratch, not something to
commit: `vite.config.ts` on `main` stays pointed at the primary hostname and
port 5173, and each worktree that wants a slot points its own uncommitted
copy at it for as long as it needs the GPU. Whichever worktree is using a
slot should say so if asked, since only one dev server can bind a given port
at a time; there's no reservation system beyond that. Both routes are
persistent, reusable infrastructure, not scoped to whichever plan first
needed them — see `vps-local/shared/traefik/dynamic/ww2airsim-3-dev.yml`
and `ww2airsim-2-dev.yml` for the full wiring and history. (The 5174 slot
was originally named `ww2airsim-wt`, renamed to `ww2airsim-3` 2026-09-24
to match `ww2airsim-2`'s own generic naming.)

The one thing this cannot do for itself: **the `playwright run-server` it
connects to must already be running in the Windows console session** (started
there by hand, `npx playwright run-server --port 3000 --host 127.0.0.1 --unsafe`).
`--unsafe` is not optional: without it the server silently discards the
`args` this repo's `playwright.config.ts` sends it, so none of the Chromium
flags in `CHROMIUM_ARGS` apply on the reference platform (measured 2026-09-18
by reading `chrome://version` through a server started without it).
**Or with no console login at all: a server in session 0.** SSH on Windows
lands in session 0, the non-interactive session services use. Chromium there
gets the real GPU **only headless and only with `--use-angle=d3d11`**; with
ANGLE's default backend `requestAdapter()` returns null, which is what the
2026-09-13 note "Chromium over SSH gets no GPU" actually measured. Headed
launches fail there (no display). `PW_SESSION0=1` makes `playwright.config.ts`
send exactly that. From nexus, with ryzen awake (`serverconfig/ryzen.md`,
"Wake-on-LAN"):

```sh
# the server, in session 0 (reuse it if 3001 already listens; other sessions may be on it)
ssh ryzen 'if (-not (Get-NetTCPConnection -LocalPort 3001 -State Listen -EA 0)) { cd $env:USERPROFILE\projects; npx playwright run-server --port 3001 --host 127.0.0.1 --unsafe }' &
ss -ltn | grep -q 39002 || ssh -f -N -L 39002:127.0.0.1:3001 ryzen
PW_SESSION0=1 PW_REMOTE=ws://localhost:39002/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2
```

The server outlives its SSH connection. Stop it by port, and only when
`Get-NetTCPConnection -LocalPort 3001 -State Established` shows no one else on
it: `ssh ryzen 'Stop-Process -Id (Get-NetTCPConnection -LocalPort 3001 -State
Listen).OwningProcess -Force'`. Close the tunnel by its port too, not with
`pkill -f`, whose pattern matches your own shell: `kill $(ss -ltnpH 'sport =
:39002' | grep -oP 'pid=\K[0-9]+')`. `C:\Users\markt\projects` holds Playwright
1.63.0, the same as this repo; keep them matched.

Verified 2026-09-27: the adapter guard passes ("Reference platform: amd
rdna-2"), zero console errors, and `adapter.spec.ts` + `terrain.spec.ts`
passed 10 of 11. **Correctness only, for now:** the one failure was the 1440p
budget, which got 71 GPU samples in its 5 s window where the console session
gets about 500. Other sessions were probably rendering on the same GPU at the
time; that has not been separated from a headless/session-0 pacing effect.
**Open:** re-run `terrain.spec.ts`'s budget test here with the GPU otherwise
idle (`hwlock ryzen`) and compare with the console session; until then take no
frame-time number from session 0.

**Session 0 cannot run the pixel specs (measured 2026-09-29/30).** Headless
`page.screenshot()` of the WebGPU canvas is flat gray there: the nightly's first
run on main `dcb9a3f` failed 28 specs that read screenshots (`fx`, `hangar`,
`cloudShadow`, `ordnance`, `sun`: "the world never drew behind the title"), and
no Chromium flag tried fixed it (`--disable-gpu-compositing`, `--use-gl=angle`,
`--in-process-gpu`, `--disable-gpu-sandbox`, `CanvasOopRasterization` off,
GPU rasterization). Adapter, sweep, boot and `terrain.spec.ts` specs are fine
there. For a run that needs pixels and has no console login, use the RDP route:

**No console login, pixels included: an RDP session as `rdp`** (verified
2026-09-30: adapter guard plus the three `cloudShadow` pixel specs passed, twice).
ryzen has a local standard user `rdp` (in "Remote Desktop Users", not an
administrator; password in 1Password `hal9000/ryzen-rdp`; log in as
`MARKDESKTOP\rdp`). The hardware-graphics policy
`HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services\bEnumerateHWBeforeSW=1`
is set. The Playwright server runs from `C:\e2e` (1.63.0, its own browsers) on
port 3002, started by a one-shot interactive scheduled task inside the session,
and is driven headed like the console server: no `PW_SESSION0`. The mechanism is
`ww2airsim-e2e-nightly`'s `rdp_session()` (serverconfig/scripts); a manual
walkthrough with the expected output is `serverconfig/scripts/rdp-gpu-test.sh`.
Windows 10 Pro allows one interactive session, so never do this while someone is
logged in; the nightly checks. Frame times from it are informational only (the
120 Hz deck test read 10.9 ms (fail) and under 8.33 ms (pass) on two otherwise identical runs).

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

Expect every test to pass; the count is deliberately not written down here,
because it grows with each plan and a stale number reads as a failure. What
the suite covers is the adapter guard, camera sweeps that assert zero WebGPU
validation errors, the ocean's GPU-vs-CPU FFT and budget checks, and the
frame-time budget. If the adapter test fails, read its printed summary before
anything else — it is almost always telling you the browser fell back to a
software rasterizer, not that anything else is wrong.

**Flying somewhere specific.** The airplane spawns **parked on the runway at
Tacloban** and faces north, down the strip from the `tacloban` airfield record
in `content/bases/`. This paragraph said it spawned over open water 23 km from
land until 2026-09-17, which had been false since Task 14 moved the spawn
ashore — the exact doc rot `~/projects/CLAUDE.md`
warns about, found while deploying.

`?spawnX=&spawnY=&spawnZ=` moves it, and any of the three turns the ground
spawn OFF — an override means an airborne airplane at 120 m/s heading east
with its gear up, which is what Tier 2's terrain and ocean specs want and is
the opposite of what a take-off test wants (`hasSpawnOverride`). The
parameters exist in DEV only and `tests/build/dist.test.ts` asserts they are
absent from a production bundle.

`?scenario=deck-quals` starts a different world instead of the default one:
the player parked on the Essex's flight deck, 110 m aft of its center, with
the task force making 15 kn into 15 kn of wind. `?beaufort=` overrides the
sea state the scenario's wind would otherwise choose. Both are DEV-only and
covered by the same production-bundle assertion.

`?cloudTier=off|high|medium|low` fixes the cloud quality tier or removes the
pass, for measuring one scene with and without it, and `?cloudDebug=` paints
one link of the raymarch (`depth`, `layer`, `shape`, `density`, `slab`,
`point`, `eye`, or `nodepth` to ignore the scene depth) -- the way the first
GPU run of Plan 16a was diagnosed. Both are DEV-only.

`?scenario=gunnery-range` starts the player on a low run-in from the south,
lined up with Tacloban, with two chocked training Hellcats on the runway's
southern half: strafe them, then land straight ahead. It was a parked start
until 2026-09-29, when T1's 9.45 degree tail-down rest pitch put the parked
guns about 50 m over the target (plan
`2026-09-29-gunnery-range-strafing-pass`). The readout at the top of the
screen counts the rounds down and the hits up; `window.__ww2.combat()` reports
the same record to Tier 2 (`tests/e2e/gunnery.spec.ts`).

**The test pilot** (`tests/pilot/`) flies that pass, and every Tier 2
landing, by keys. `strafePilot.ts` is a pure control law (the harmonized sight
onto the target, then `approachControls`), and `keys.ts` turns its commands
into the keys a player would press. Tier 1 flies it through `nextFrameState`
(`tests/sim/gunneryRangePass.test.ts`); Tier 2 runs the same module in the
page every frame (`tests/e2e/pilot.ts`, imported from the dev server) and
reads the state it needs from `__ww2.playerFlight()`. The pass's numbers and
what each was measured against are in `tests/pilot/rangePass.ts`. Tune a
pass in Tier 1, where a flight takes seconds, not in the browser.

## Overnight run

Tier 2 is not part of CI, so nothing tells you a merge broke it. A nexus
systemd user timer does (set up 2026-09-29). It is the only copy of this
mechanism; the script header has the step order.

- **What:** `serverconfig/scripts/ww2airsim-e2e-nightly`, fired at 02:30
  America/Denver by `ww2airsim-e2e.timer` (units in
  `serverconfig/scripts/systemd/`, live copies in `~/.config/systemd/user/`;
  `Persistent=true`, and `loginctl enable-linger mark` is on).
- **Only when main moved:** it fetches, and exits silently and sends nothing
  if `origin/main` equals the SHA of the last run that tested a commit.
  `E2E_FORCE=1` overrides.
- **Where it runs:** a dedicated detached worktree of `origin/main`
  (`~/.local/state/ww2airsim-e2e/worktree`, never the served working copy),
  with the terrain data copied in, and its own vite on the `ww2airsim-3` slot
  (5174), so **that slot is reserved 02:30 onward**. If 5174 is in use the
  night is recorded `skipped-slot-busy`. The browser is ryzen's: the console
  session's Playwright server when it is up; else, if nobody is logged in, an RDP
  session as `rdp` with a server started inside it (above); if someone is logged
  in and no console server is up the night is `skipped-no-session`, never a
  takeover. The timer reads the `rdp` password from a
  `systemd-creds --user` encrypted credential (`~/.config/ww2airsim-e2e/ryzen-rdp.cred`,
  loaded by the unit); `op` is only the fallback for manual runs. After rotating the
  password, re-encrypt it (command in `serverconfig/ryzen.md`).
  It takes `hwlock ryzen` (waits up to 90 min, then records `skipped-lock`
  rather than hold the lock into the morning), wakes ryzen with WoL if needed,
  and shuts it down afterward only if it woke it and nobody else is on it.
  It never falls back to nexus.
- **Verdict:** any failing test is a hard failure, except titles matching
  frame-time budgets (`budget|p95|tripwire|frame time`), which are recorded
  with their numbers and do not turn the run red: only the console
  session gives trustworthy frame times (`Hz` titles count as budgets too). A test is *newly red* when it passed in
  the previous tested run.
- **Record:** one line per run in `~/.local/state/ww2airsim-e2e/runs.tsv`
  (date, SHA, status `ok|failed|error|skipped-*` (incl. `skipped-no-session`), counts, newly red/green,
  whether the mail sent), plus `report-<date>.json` and `results-<sha>.json`
  beside it. Every run that happens is emailed (subject has the counts and
  newly red; body lists them with the first error line); nights main did not
  move send nothing.
- **Reading it:** `e2e-status` prints the last run and whether main has moved
  since. The console tracks the job's health (not the tests') as the
  `ww2airsim-e2e-nightly` service: it fails if the timer has not fired in 50 h
  or the last line is `error`.
