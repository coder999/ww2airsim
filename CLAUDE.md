# ww2airsim — Claude instructions

Read `~/projects/CLAUDE.md` first; this file wins where the two disagree.
This file holds only what an agent gets wrong without being told and cannot
derive from the code. It points at the documents that own each fact rather
than restating them, because a restated fact rots (2026-09-18: this file did
not exist, and three conventions below were being missed for that reason).

## Read these before touching anything

1. `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 — the only
   authoritative plan numbering and order, and the three couplings under it.
2. `docs/superpowers/plans/2026-09-12-plan1-rulings.md` — dated decisions with
   what each costs if reversed. Check it before "fixing" an apparent oversight.
3. The newest `docs/handoff/*.md` — the current trap list and open items. A
   handoff's diagnosis is a claim to re-measure, not a premise.
4. `docs/incidents/*.md` — dated post-mortems with an open fix; read the
   open ones before touching what they name.
5. `.superpowers/sdd/<plan>/progress.md` (gitignored) — the executing agent's
   rulings ledger. Write one for any plan you execute.
6. For cloud work, `docs/clouds.md` — what ships, what was tried and with
   what result, the traps, and the open issues. Update it in the same commit
   as any cloud change.

## This checkout

- **Ask Mark whether a task belongs on `main` or in a worktree — don't
  assume either way.** As a rule of thumb, parallel work (multiple sessions
  or worktrees active at once) is better isolated in its own worktree;
  isolated, single-session work is better done on `main`, in place, so the
  primary vite dev server can show Mark the live result. If it's on `main`,
  re-diff against `HEAD` right before every commit — other sessions commit
  here too.
- **Never run `git clean -fdx`.** `content/terrain/tiles/` and
  `tools/terrain/cache/` are ~275 MB of gitignored data that exists nowhere
  else. Its absence shows as extra named skips in the suite, not failures.
- **`main` and deploys are Mark's call; branches are not** (Mark, 2026-09-26).
  - **Never push `main` unasked.**
  - **Never merge a branch or worktree into `main` unasked.**
  - **Never deploy unasked.**
  - **A worktree branch may be pushed freely.**

  Pushing `main` releases nothing. The deploy command is in README's
  "Deployment".
- `npm run verify` (typecheck, lint at zero warnings, depcruise, tests) ends
  every task. Capture `rc=$?` directly; never gate on a grepped pipeline.
- **Full suites and `verify` go through `remote-run`** (`remote-run npm run
  verify`), which runs them on ryzen's 32 threads. On nexus, run only the
  files you are touching. Parallel full suites here have OOM-killed nexus.
  `remote-run` runs two jobs at once on ryzen and, when both slots are busy
  or a GPU measurement holds ryzen, overflows at most one to nexus; it says
  which it chose (`serverconfig/ryzen.md`, "Resource locks").
  How it works: `serverconfig/ryzen.md`, "WSL Ubuntu and compute offload".
  Gitignored and LFS data reaches ryzen only if it is listed in
  `.remote-run-data`. A new data-backed test whose data isn't listed there
  shows up as a named skip on ryzen and passes on nexus.
- **Blender is the blender.org 5.0.1 build on both machines** (since
  2026-09-27; `serverconfig/ryzen.md`, "Blender: the blender.org build"), not
  Ubuntu's package, which renders Mantaflow smoke as nothing in Cycles and was
  removed. Do not `apt install blender`. The Blender suites therefore run under
  `remote-run` too. Verified that day: all 16 Blender entries rebuilt
  byte-identically on both machines. There are no Blender "slots" like the
  dev-server ones: a build is stateless, CPU-only and writes inside its own
  worktree, so parallel worktrees can each run Blender on either machine. On
  nexus, though, `blender` on PATH is a shim that runs one at a time under
  `hwlock blender`, for memory (`serverconfig/scripts/blender-shim`); time
  spent waiting counts against `BLENDER_TIMEOUT_MS`. Rendering the fx
  flipbooks on ryzen's GPU (Cycles HIP, Windows side) was benchmarked
  2026-09-27 and is not faster: each frame is seven 256 px renders, which are
  overhead-bound (`serverconfig/ryzen.md`, "Cycles on the GPU"). If
  an upgrade moves one machine off the version pinned in
  `tools/models/blender/run.ts`, its Blender suites fail by name. They do not
  skip. Upgrade both machines together.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node
  core or a rendering library; `.dependency-cruiser.cjs` says why for each
  rule and `tests/architecture/boundary.test.ts` proves they bite.

## Showing Mark something

- **`ww2airsim.windomlane.org` is the host to send him to.** It serves the dev
  server off this working copy (`npm run dev:lan`; plain `npm run dev` binds
  loopback and the host returns 502). The production build is
  at `ww2airsim.marktuttle.dev`, reachable from work since 2026-09-29
  (`marktuttle.dev` passed 30 days; `ww2airsim.com` is still blocked). Before naming the host, assert it is up:
  `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/`
  must print `200`.
- **Email him every plan and spec, as HTML, when it is written** — do not wait
  to be asked: `python3 tools/mail-doc.py <file.md> "<subject>"`. Never re-run
  it with `--debug` to confirm a send that already exited 0.
- Send him the **bare URL** for the parked runway spawn. Any `?spawnX/Y/Z`
  override makes the flight airborne, gear up, 56 km from Tacloban.

## GPU work: the Windows desktop is on, with a Playwright server

nexus is headless. Anything visual, and every Tier 2 run, executes on the
Windows desktop (RX 6700 XT). Which side of ryzen does what (WSL for
`remote-run` and Blender, Windows session 0 for GPU browser work, the console
session only for trusted frame times), all reachable after WoL with nobody
logged in: `serverconfig/ryzen.md`, "What runs where". The console session
normally has `playwright run-server` up; from nexus:

```sh
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2
```

**Tier 2 runs share the desktop; clean numbers are opt-in.** Parallel
sessions may run Tier 2 at the same time, so a budget assertion (`p95 <
6.0`, `budget4k.spec.ts`) can fail from another session's rendering or a
`remote-run` job, not from your change. Before believing a budget failure, or
when a number is the deliverable (a perf investigation, a pre-merge budget
gate), re-run just those specs under `hwlock ryzen <cmd>`: it waits for other
opt-in holders, keeps `remote-run` jobs off ryzen, and frees itself if the
run dies. Hold it for the budget specs only, never a whole suite: while it is
held every other session's compute is squeezed onto nexus. Enforcing the lock
on every `PW_REMOTE` run was tried on 2026-09-27 and reverted the same day,
because one hour-long correctness run stalled every session. `hwlock status`,
or HA's `sensor.nexus_hwlock_compute_locks`, shows who holds what; details in
`serverconfig/ryzen.md`, "Resource locks".

**nexus's own Radeon 680M works for non-measurement runs** (since
2026-09-27): a local run (no `PW_REMOTE`) gets real WebGPU there, not
SwiftShader, needs no lock, and is the right place for correctness checks and
screenshots. Its budget numbers are about a quarter of the desktop's and mean
nothing, and the adapter guard passes it all the same;
`playwright.config.ts`'s `LOCAL_LINUX_ARGS` says why. A session started before
`mark` joined the `render` group falls back to SwiftShader: run it under
`sg render -c '...'`, or start a new session.

**No console login needed for correctness runs** (since 2026-09-27): a
`playwright run-server` started over SSH runs in session 0 and reaches the GPU
headless with `--use-angle=d3d11`; `PW_SESSION0=1` with
`PW_REMOTE=ws://localhost:39002/` sends that. `docs/testing.md` ("Tier 2: the GPU
harness") has the three-command recipe (server, tunnel, run) and how to stop
the server without killing another session's run. Use it whenever the console
server is down or busy. **Not for numbers yet:** its 1440p budget got 71 GPU
samples in 5 s against the console's ~500, probably other sessions sharing the
GPU; that comparison is an open item recorded in `docs/testing.md`.

`docs/testing.md` ("Tier 2: the GPU harness") is authoritative for the tunnels and the
one-time setup. Two facts it records that cost real time: headed Chromium
launched over SSH gets **no GPU** (session 0 has no display; headless needs
`--use-angle=d3d11`, above), and `__ww2` exists
before the keydown listener is attached, so wait for `waitForTerrain` before
pressing keys. Run Tier 2 at 1440p before trusting any GPU number; the budget
is gpu p95 under 6.0 ms. A throwaway spec that calls `page.screenshot()` gets
a PNG onto nexus you can read directly — never argue about a picture you have
not looked at.

**Two more dev-server slots exist for parallel worktree work**, each real
HTTPS wired the same way as the primary hostname above:
`ww2airsim-2.windomlane.org` (port 5175) and `ww2airsim-3.windomlane.org`
(port 5174). If a task is running in a worktree and needs the reference
GPU alongside another session's, point that worktree's own
`vite.config.ts` at one of these — change `TUNNEL_HOST` and `server.port`
to match, then `WW2AIRSIM_TUNNEL=1 npx vite --port 5175` (or `5174`) from
the worktree. That edit is local scratch, never committed. Both slots are
persistent, reusable infrastructure, not scoped to whichever plan first
needed one — see `docs/testing.md` and
`vps-local/shared/traefik/dynamic/ww2airsim-2-dev.yml` /
`ww2airsim-3-dev.yml` for the full wiring. Whichever worktree is using a
slot should say so if asked; there's no reservation system for ports (for
clean GPU numbers, see `hwlock ryzen` above).

## Fetching third-party models

Sketchfab downloads work headlessly from nexus:
`tools/models/sketchfab-fetch.sh <uid> <name>` puts `<name>.glb` plus a
license sidecar in the gitignored `content/models/candidates/` (token from
1Password `hal9000/sketchfab-api`, never printed; verified 2026-09-25). Do not
tell Mark a model "needs a manual download". A download is not a license
check: vet and record it per `ASSETS.md` before promoting anything.
The whole ingest, from search to a Hangar check, is `docs/models.md`.

## Where docs go

The table is in [README.md](README.md#where-docs-go), its only copy. One home
per kind of fact; point at it, never copy it. The rules that bite:

- **The README is not a ledger.** A landed plan gets a handoff and a §15 row,
  not a README paragraph. The old per-plan entries are frozen in
  `docs/status-log.md` (2026-09-29); do not append to it.
- A new standing doc gets one pointer, in the README if it is a subsystem
  people will look for, in this file's read-first list only if an agent gets
  something wrong without it. Not both by default.

## Conventions

- **US spelling** in new prose and identifiers. Existing `centre`-style
  identifiers and content JSON keys are a migration — ask before renaming.
- A plan's own numbers are claims: run its arithmetic against the repo before
  executing it. Prefer an assertion to a sentence; date cross-boundary claims.
- Every completed plan ends with a dated `docs/handoff/` document and its row
  in §15's table updated. Do not add a status paragraph to the README (see
  "Where docs go").
- Escape `|` as `\|` inside markdown table cells.
- **Imperial units, not metric**, in anything user-facing (HUD, instruments,
  docs, plan tables) — feet, miles, knots, mph, pounds, gallons, °F, inHg, as
  the 1940s aircraft and crews would have used. Ask before converting existing
  internal SI values or content JSON keys; that is a migration.
- **Prefer the AskUserQuestion tool over free-text questions** whenever the
  choices can be enumerated (Mark, 2026-09-28).

## How Mark works

Technical playground: the engineering is the deliverable. He flies the result,
and his eye and ear find what the suite cannot.

**His viewing is a checkpoint, never a test gate** (Mark, 2026-09-26). No test
waits on him; the automated tiers decide pass or fail. When and whether he
looks is decided per plan, up front:

- **When writing a plan, ask him to define his viewing checkpoints:**
  - intermediate steps (name the tasks),
  - the final product only, or
  - none.

  Record the answer in the plan's header.
- **Ask whether the run will be attended.**
  - **Attended:** stop at each checkpoint. Send the windomlane URL and
    captures, then wait for him before continuing.
  - **Unattended** (overnight, or he is away): run to completion without
    stopping. Collect the checkpoint captures in the handoff for when he is
    back.
- **If the plan's header does not say, and he cannot be asked, run unattended.** **When he
says he cannot perceive a difference, believe him and measure at the level he
is looking at.**
