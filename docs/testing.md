# Testing

How tests are written here (Philosophy), what each layer is for, and the
reference for test groupings. Deterministic and E2E were called Tier 1 and
Tier 2 until 2026-10-08, and older handoffs and specs still say so.

## Philosophy

**Why the suite is this big.** Several agents commit to this repo at once,
often in parallel worktrees. None of them sees the others' work in progress.
A test is the contract that stops one agent's change from silently breaking a
feature another agent built, so most tests here protect *someone else's*
feature. Mark's viewing is a checkpoint, never a gate (AGENTS.md). Only the automated tiers decide pass or fail.

### What deserves a test, in order of value

1. **Behavior against an outside truth.** Examples:
   - The graded flight cards against historical trial data (`tests/sim/testcards/graded.test.ts`).
   - The GPU ocean against its CPU reference (`ocean.spec.ts`).
   - The golden trajectory, with a tolerance sized from measured drift.
2. **Invariants:**
   - determinism;
   - no energy gain;
   - the `sim/` boundary (`tests/architecture/boundary.test.ts`);
   - the soak.
3. **Seams other agents touch:** content schemas, enrollment lists, and the `__ww2` diagnostics shared with E2E.
4. **Wiring:** that a feature actually reaches the running game. In E2E this means reading `__ww2` state, not comparing pictures (below).

### Rules

- **Enroll, don't clone.** Coverage of every airframe, ship or scenario comes from one table-driven test that reads `content/`. A new airframe should be covered without a new test file. Examples: `graded.test.ts`, `trap.test.ts`, `carrierTakeoff.test.ts`, `flyableAll.spec.ts`.
  - Pin the enrolled list in the same test, so a filter that matches nothing fails instead of passing empty.
  - `trapCorsair.test.ts` and `trapVal.test.ts` were clones of `trap.test.ts` differing in two numbers. They were merged on 2026-10-08, which also covered the Zero and Wildcat for the first time.
  - Water-capable aircraft enroll in `tests/sim/waterOperations.test.ts` for
    hull support, takeoff, power-off rollout, arrow/rudder taxi steering and
    lateral grip; the ordinary ground conformance table covers their wheel
    path, and `flyableAll.spec.ts` covers the browser runway path. `afloatAt`
    and water-only sortie eligibility are held in `tests/sim/sortie.test.ts`.
  - `tests/sim/waterSurface.test.ts` pins the shared deterministic support sea,
    motion across wave slopes and hull-size filtering. Ship tests cover
    wave-supported heave/attitude; FX event tests require lapping at rest and
    separate planing spray that stops at liftoff, while
    `tests/render/waterWake.test.ts` enrolls both
    ships and water-supported aircraft in the common surface-wake contract and
    verifies its crest/churn geometry and fade-out.
- **A test is a correctness test or a budget test, never both.** Frame time is asserted only in `budget` (the gate: High gpu p95 ≤ 8.33 ms at 1440p in every view, H0 2026-10-08), `fx-budget`, `wake-budget`, `motionBudget`, `terrainTextures` and the frame-time tests in `terrain` and `strike`; every other spec records it with `recordFrameTime` (`tests/e2e/harness.ts`).
  - Budget test titles match `budget|p95|tripwire|frame time|Hz`. That is how the nightly tells budget misses apart (Overnight run, below), so keep those words out of other titles.
- **Assert behavior, not constants.** A bare `expect(SOME_CONST).toBe(0.25)` fails on every intentional tweak and protects nothing. Prefer:
  - a relationship: `MAP_TEXEL_M === MAP_SIDE_M / MAP_TEXELS`;
  - or the behavior the constant produces: `detailNormalFade(2000) === 0`.
- **A test must be able to fail.** Before trusting a green, see it go red once against the fault it exists for: the stimulus actually happens and the detector actually reads it. Guard against vacuous passes, such as a sample count that is zero or a loop over an empty list. That is why so many specs assert `gpu.length > 120`.
- **Tolerances come from measurement and only tighten.** Re-measure, date the number, and say where it came from. Never widen a tolerance to whatever passes.
- **Every skip has a reason the code can check.** `skipIf(terrain === null)` or `skipIf(!HAVE_BLENDER)` are fine: the data or tool is absent, and the skip names it. An unconditional skip is either:
  - waiting on a named ruling from Mark (say which, and in which handoff); or
  - a known gap, which belongs in "Known gaps" below, not in the suite as a skipped test.
- **Capture tools are not tests.** `tests/e2e/captureTools.ts` is the
  authoritative manifest. The normal Playwright configuration ignores every
  entry, so expected capture skips do not hide unexpected test skips. Run a
  tool explicitly with `npm run capture:e2e -- <file-or-grep>`;
  `playwright.capture.config.ts` supplies `E2E_CAPTURE=1`, while
  `E2E_CAPTURE_DIR` still selects the output directory. Measurement tools that
  report frame time still run under `hwlock ryzen-budget`.
  - The manifest includes visual checkpoints, scenario probes, and the L1/L2,
    combat, cockpit, PBY, vehicle, ship, terrain-memory and entity-scaling
    measurement programs. Their file headers own their knobs and outputs.
  - `drapeSpike.spec.ts` remains because its `1944` comparison is not covered
    by the current `synth`/`synthsr`/`synth2` land captures.
  - The one-off `cloudPixels.spec.ts` migration probe was retired on
    2026-10-13; its evidence remains in the dated plan and handoff.
- **C3 final visual checkpoint.** `cockpitFamiliesCapture.spec.ts` records one matched 1440p
  cockpit frame per flyable aircraft, named by its four-family enrollment, plus four representative
  views and a fourteen-aircraft contact sheet. Run it through
  `npm run capture:e2e -- cockpitFamiliesCapture.spec.ts`; `E2E_CAPTURE_DIR`
  selects the output. It asserts an empty WebGPU validation and console-error set, while its pixels
  remain evidence for review rather than a correctness oracle.
- **PBY-5A final visual checkpoint.** `pbyCapture.spec.ts` records three Hangar
  configurations (including the landing gear at mid-cycle) plus the
  torpedo-loaded aircraft afloat and after water
  takeoff. `waterOperations.spec.ts` is the corresponding correctness E2E:
  it asserts the authored afloat state, alternate racks, takeoff, float
  retraction and an empty WebGPU/console-error set.
- **L1/L2 final visual checkpoint.** `l1l2Capture.spec.ts` records fixed
  procedural/textured building views plus static and fixed-phase shore views.
  Run it through `npm run capture:e2e -- l1l2Capture.spec.ts`;
  `E2E_CAPTURE_DIR` selects the output.
  It asserts an empty WebGPU validation and console-error set, but its pixels
  remain evidence for a person to inspect rather than a correctness oracle.
- **Delete a test with its code.** Unwired code and its tests go together, because git remembers.
- **Grepping source is a last resort.** A few tests assert that `main.ts` contains a call (for example `bootQuality.test.ts`) because the wiring has no seam to call. They break on renames. The fix is to extract that wiring into a function a test can call, not to add more greps.
- **Keep files cheap.**
  - Compare large buffers with `Buffer.from(a).equals(Buffer.from(b))`, not `toEqual`. `toEqual`'s per-element diff spent about 110 s in `gunzip.test.ts` on its cloud volumes.
  - Full suites go through `remote-run` (`serverconfig/ryzen.md`, "WSL Ubuntu and compute offload"). On nexus, run only the files you touch: parallel full suites have OOM-killed it.
- **Comments say why, with a date.** Long rationale in a test is fine here: it is what the next agent reads before "fixing" it.

### Worktree closeout

"Merge, push, update docs and relevant testing, and clean up the worktree"
means that tests are reconciled with the finished product before the branch is
merged. It is not a request to add a test mechanically. Use this closeout:

1. Diff the branch against its merge base and list the player-facing
   contracts and diagnostics that changed: labels, controls, routes, default
   selections, lifecycle/ownership, and `__ww2` fields.
2. Search the existing suite for the old contract. Update an assertion when
   the behavior moved, replace it when the seam changed, and delete it with
   deleted behavior. A feature's new test does not make its old test current.
3. Classify affected tests in the handoff under **Tests updated**, **Tests
   still valid**, and **Known gaps**. Every removed assertion must land in one
   of those three buckets.
4. Run the focused deterministic or E2E specs that own those contracts on the
   branch. After merge, run `npm run verify`; GPU-facing changes also run the
   focused reference-GPU specs. Budget specs run separately under
   `hwlock ryzen-budget`.
5. Only then push and remove the worktree. The next overnight run is a broad
   backstop, not the first time changed E2E contracts are exercised.

Examples from 2026-10-12: removing the always-on flight legend requires the
deck-qualification hook check to open the pause dossier's Controls tab; making
Takram TSL the default requires the legacy reprojection-residual test to select
the legacy renderer explicitly, while default-renderer tests keep asserting
history resets and zero validation errors.

### Known gaps

Things nothing automated covers, recorded here rather than as skipped tests:

- **D3D12 and Vulkan disagree on TSL control-flow scope (found 2026-10-15).** A shared node first built inside an `If`/`Loop` (here `positionWorld`/`normalWorld` in `gameplayLights`) rendered every lit model near-black on ryzen's D3D12 while nexus's Vulkan was fine, so a green nexus run does not clear a shader change. Hangar case 15 (0.6x to 1.5x of flat) caught it only on ryzen; case 15b now pins the lighting node against `night=shaders:0`. Details: `docs/night.md`.
- **ryzen frame-time numbers are bimodal, and the cause is unknown (measured 2026-10-15).** The same unmodified view lands in a fast state (about 5-9 ms gpu p95) or a slow state (about 12-15 ms) depending on the page load, and slow mode shows roughly 50-65 samples/s instead of 120, so it looks like a low-frame-rate state, not just longer frames.
  - Round-robin A/B, 8 fresh loads per condition on `runway` and `low-land-600`, under `hwlock ryzen-budget`, console-session Playwright server, `origin/main` `996565d2`: stopping Agent DVR (a camera NVR service using about 40% of a core and some GPU 3D), stopping the ASUS `LightingService`, and the High performance power plan each made no consistent difference. Bimodality appeared in every condition. Raw samples and the restore log: [handoff](handoff/2026-10-15-ryzen-budget-noise-ab.md).
  - Not tested: display refresh behavior, a foreground against an occluded or minimized window, the `rdp` route against the console route, and a longer capture to see whether the state flips inside one page load.
  - So: read a single ryzen budget number as one draw from two modes. Use the median of at least 5 fresh page loads per view, and do not read one 13 ms nightly p95 as a regression by itself. An alternating on/off comparison inside one page load (lights on minus off, F6A gate c) cancels the page-load state and stays trustworthy.
- **Nightly 2026-10-16 (`main` `51f81ca8`, RDP route): 319 pass, 30 fail, 18 of them budget.** Verified from `report-2026-10-16*.json` the same day. Not product regressions as far as read so far:
  - `flightRecorder` "Dev sortie records…" and `hq` "export then import…" called `download.path()`, which throws over a remote Playwright server. Fixed 2026-10-16 with `saveAs()`; both pass on the RDP route.
  - Nearly every GPU budget spec failed (old and new alike, `terrainTextures` shows textures-on faster than off); read as the bimodal noise above, not a night-work regression. F6A/F6B gates still need a clean retake.
  - `cloudShadow` ×2 fail on `main` before this work. `sights` ×2, `friendly-fire` death, `hangar` case 3 and `qualityProbeChrome` are the known timing/contention flakes.
  - Not yet investigated: `fx` cloud ordering (takram), `instantReplay` auto-replay, `mission-ui` landing-at-rest.

- **A first-time visitor's audio context.** Nothing automated proves it starts suspended and resumes on the first gesture.
  - On the reference desktop the context is already `running` at boot. The likely cause, unverified, is Chrome's Media Engagement Index for an origin Mark flies on often. So the assertion would pass on a fresh profile and fail on the runner.
  - `void audio.resume()` in `main.ts`'s keydown listener is exercised by `audio.spec.ts`. That it runs before the first sound is wanted has to be checked by hand, once, in a fresh profile. Measured 2026-09-18.


## The layers, and what each one is for

Checked against `.github/workflows/*.yml` and `package.json` on 2026-09-30.

| Layer | Runs | Needs a GPU | What it proves |
| --- | --- | --- | --- |
| **Deterministic Test**: `npm run verify` (`tests/` except `e2e/`) | locally, and in `ci.yml` on every push and PR | no | The code is correct as logic: typecheck, lint, dependency rules, and vitest unit tests of the sim, AI, audio cues, input, replay, content and render graph construction. Fast, deterministic, hosted. |
| **Soak Test** (`nightly-soak.yml`) | GitHub, 09:00 UTC | no | A long simulation (`tests/sim/soak.test.ts`) stays stable; opens an issue on failure. |
| **End-to-end (E2E) Test** (`tests/e2e/`, `npm run test:e2e`) | ryzen, by hand or the nightly | yes | The *running game* works in a real browser on the reference GPU: it boots, flies, renders without WebGPU validation errors, sounds the right audio cues, and the UI, missions, replay and scoring hold together in a session. |
| **Deploy Verification** (`deploy.yml`, manual) | GitHub, on request | no | The *release artifact* is sound: `npm run verify`, `npm run build`, the build carries the terrain fallback, rsync, then the live site answers (homepage 200, noindex and no-cache headers, the hashed asset the page names is served, `robots.txt`). It never starts a browser. |

The deploy workflow and E2E answer different questions. Deploy asks "did
the files we shipped arrive and get served?", and its checks are HTTP
assertions plus Deterministic. E2E asks "does the game still work?", and no hosted
runner can answer that, because WebGPU needs the real GPU. So **a green deploy
says nothing about E2E**, and E2E does not gate a deploy: the nightly
(below) is what tells you a merge broke it.

### What the E2E specs do, conceptually

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
- **Pixel specs are the exception:** `fx*`, `hangar`,
  `cloudShadow`, `sun` and `ordnance` read the rendered canvas for a specific
  thing (a flash appears, a shadow is where it should be). They need a real
  desktop session, which is why the nightly uses the RDP route below.
- **Budget specs** (titles matching `budget|p95|tripwire|frame time|Hz`;
  the list is in Philosophy, above) measure frame time. They are the only
  tests whose numbers depend on the machine, and the nightly counts them as
  failures like any other (see Verdict below). Other specs record a
  `frame-time` annotation in the report instead of asserting. A normal
  `npm run test:e2e` is correctness-only: `playwright.config.ts` excludes
  this title pattern by default. The complementary budget set runs only with
  `E2E_BUDGET_RUN=1`, and the config refuses that mode unless
  `HWLOCK_HELD` contains `ryzen-budget`. Counts are deliberately not pinned
  here because enrollment grows; the overnight record owns each run's exact
  result.

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

PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:e2e
```

Other sessions may be rendering on the same GPU. Run the budget specs, and
only them, with:

```sh
hwlock ryzen-budget env E2E_BUDGET_RUN=1 npm run test:e2e
```

`playwright.config.ts` rejects budget mode without that lock, and ordinary
E2E excludes budget titles, so an unlocked result cannot look trusted by
accident. `remote-run` takes `ryzen-budget` shared while its WSL command runs;
the exclusive budget invocation therefore waits for existing CPU jobs and
blocks new ones. `hwlock ryzen` locks nothing: `ryzen` is in `~/.config/hwlock/off`
(`serverconfig/ryzen.md`, "Resource locks"). Work started on Ryzen itself
is invisible to either lock, so before trusting a number check that no other
browser is driving its GPU. On 2026-10-10, before `remote-run` joined the
shared lock, a concurrent `remote-run npm run verify` held ryzen's CPU at 45-60% and
pushed budget views from about 6 ms to 14-18 ms p95, with no other 3D client on the GPU
(H0 handoff, "Rulings and the as-merged result"). Direct WSL commands and
Windows applications still bypass nexus's lock, so check ryzen's CPU and GPU
before a manual measurement.


**Mark's console session (verified 2026-10-10, after a reboot).** When `markt` is logged in
at the console and no Playwright server is listening on ryzen port 3000, start one in
that session with a one-shot interactive scheduled task, tunnel it, and remove everything
afterwards. Chrome windows appear on his desktop; that is expected. Never do this while he
is logged out (use the RDP route below instead).

```sh
ssh ryzen '
Set-Content C:\e2e\serve-console.ps1 -Value @("`$env:PLAYWRIGHT_BROWSERS_PATH = ''C:\e2e\browsers''","Set-Location C:\e2e","npx playwright run-server --port 3000 --host 127.0.0.1 --unsafe") -Encoding ascii
$a = New-ScheduledTaskAction -Execute powershell.exe -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\e2e\serve-console.ps1"
$p = New-ScheduledTaskPrincipal -UserId MARKDESKTOP\markt -LogonType Interactive
Register-ScheduledTask -TaskName l3-serve-console-once -Action $a -Principal $p -Force | Out-Null
Start-ScheduledTask -TaskName l3-serve-console-once'
ssh -f -N -L 39001:127.0.0.1:3000 ryzen
# ... run with PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://<slot-host> ...
ssh ryzen 'Stop-ScheduledTask l3-serve-console-once; Unregister-ScheduledTask l3-serve-console-once -Confirm:$false; Get-NetTCPConnection -LocalPort 3000 -State Listen -EA 0 | % { Stop-Process -Id $_.OwningProcess -Force }; Remove-Item C:\e2e\serve-console.ps1'
```

Playwright on nexus and ryzen must be the same version (1.63.0 on 2026-10-10).

**No console login, correctness only: a server in session 0.** Chromium there
gets the GPU only headless with `--use-angle=d3d11` (`PW_SESSION0=1` sends it),
and its screenshots of the WebGPU canvas are blank, so the pixel specs need the
RDP route below. Stop the server by port when no one else is connected to 3001.

```sh
# the server, in session 0 (reuse it if 3001 already listens; other sessions may be on it)
ssh ryzen 'if (-not (Get-NetTCPConnection -LocalPort 3001 -State Listen -EA 0)) { cd $env:USERPROFILE\projects; npx playwright run-server --port 3001 --host 127.0.0.1 --unsafe }' &
ss -ltn | grep -q 39002 || ssh -f -N -L 39002:127.0.0.1:3001 ryzen
PW_SESSION0=1 PW_REMOTE=ws://localhost:39002/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:e2e
```

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
logged in; the nightly checks. Its frame-time budget results count as real failures: the
same budget specs also failed on the session-0 run before this route existed.

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
npm run test:e2e
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
with its gear up, which is what E2E's terrain and ocean specs want and is
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
the same record to E2E (`tests/e2e/gunnery.spec.ts`).

**The AA lethality calibration** (M2, 2026-10-10). How hard the guns hit is a measurement, not a
guess: `tests/sim/weapons/aaHarness.ts` flies a scripted Hellcat (the AI's own velocity-following
controller) over an anchored Fletcher in the shipped `aa-range` scenario, three ways, and
`aaLethality.test.ts` pins the result with tolerances (lingering 1,640 ft out at 300 ft: lost in about
20 s; a straight 290 kn pass over the ship: usually survives; 6,000 ft: the flak, slower). A run is
seconds because the AA draws only from hashes of (seed, mount, time), so a "seed" is the guns' luck and
the start phase. To retune, change `AA_TUNING` (`src/sim/weapons/aaFire.ts`, the one place) and read the
effect without editing the file: `REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/aaSweep.ts 32 fletcher-dd '{"light":{"aimErrorRad":0.014}}' orbit,pass,high`;
`tools/ai/aaTrace.ts` prints every hit and burst of one run. `aaCombat.test.ts` also steps the Range Test
with every warship armed and hostile and asserts it runs faster than real time (measured 0.27 ms per
tick, 60 s of it in under a second).

**The main-battery duel calibration** (M4, 2026-10-10). How fast ships sink each other is a measurement too:
`tests/sim/weapons/duelHarness.ts` puts two warships on parallel courses at a set range on an open sea, main
batteries on, and `duel.test.ts` pins the result (the tables are in the M4 handoff,
`docs/handoff/2026-10-10-m4-main-batteries.md`). To retune, change `MAIN_BATTERY`
(`src/sim/weapons/mainBattery.ts`) and read the effect without editing the file:
`REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/duelSweep.ts 16 fletcher-dd:kagero-dd@8047 '{"rangeErrorFraction":0.03}'`.

**The test pilot** (`tests/pilot/`) flies that pass, and every E2E
landing, by keys. `strafePilot.ts` is a pure control law (the harmonized sight
onto the target, then `approachControls`), and `keys.ts` turns its commands
into the keys a player would press. Deterministic test flies it through `nextFrameState`
(`tests/sim/gunneryRangePass.test.ts`); E2E runs the same module in the
page every frame (`tests/e2e/pilot.ts`, imported from the dev server) and
reads the state it needs from `__ww2.playerFlight()`. The pass's numbers and
what each was measured against are in `tests/pilot/rangePass.ts`. Tune a
pass in Deterministic test, where a flight takes seconds, not in the browser.

## Overnight run

E2E is not part of CI, so nothing tells you a merge broke it. A nexus
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
  (5174), or on `ww2airsim-2` (5175) when another session holds 5174 (added
  2026-10-09, after an idle worktree's vite skipped that night). Only when both
  are in use is the night recorded `skipped-slot-busy`. The browser is ryzen's: the console
  session's Playwright server when it is up; else, if nobody is logged in, an RDP
  session as `rdp` with a server started inside it (above); if someone is logged
  in and no console server is up the night is `skipped-no-session`, never a
  takeover. The timer reads the `rdp` password from a
  `systemd-creds --user` encrypted credential (`~/.config/ww2airsim-e2e/ryzen-rdp.cred`,
  loaded by the unit); `op` is only the fallback for manual runs. After rotating the
  password, re-encrypt it (command in `serverconfig/ryzen.md`).
  The nightly runs two complementary Playwright invocations: correctness first
  with budget titles excluded, then budget titles only under the exclusive
  `ryzen-budget` lock. `remote-run` holds that resource shared, so its WSL CPU
  work cannot overlap the measurement. If the budget lock is unavailable for
  90 minutes the night records `skipped-lock` and does not mark the commit as
  tested; a later run retries it. The non-budget suite takes no machine lock.
  The job wakes ryzen with WoL if needed, shuts it down afterward only if it
  woke it and nobody else is on it, and never falls back to nexus.
- **Verdict:** any failing test is a failure, frame-time budgets
  (`budget|p95|tripwire|frame time|Hz` titles) included; the mail says how many
  of the failures are budget misses (`budget_failed` in `runs.tsv` is that
  subset of `hard_failed`). Budget specs were record-only until 2026-10-01; they
  fail identically across session 0 and RDP runs, and the earlier claim that RDP
  frame times are untrustworthy rested on one pair of runs, so it is dropped as
  unproven. A test is *newly red* when it passed in the previous tested run.
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
