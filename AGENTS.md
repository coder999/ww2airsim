# Agent instructions


## Read these before touching anything
1. `README.md` - Overview and also what docs go where.
1. `MASTER_PLAN.md` — what comes next: tracks, order, and the decisions
   they wait on. It is also the ledger (README, "Where docs go").

## General rules / user preferences
- Sending ww2airsim project handoffs, reports, and other requested project documents to `marktuttle1@gmail.com` is explicitly authorized and does not require separate confirmation.
  - When repository instructions call for `tools/mail-doc.py`, use it without `--debug`.
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
- Use "AskUserQuestion" tool instead of free text questions/answer where possible
- Use "grill-me" skill/plugin where indicated
- **His viewing is a checkpoint, never a test gate**. No test
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


## This checkout
- **Ask user whether a task belongs on `main` or in a worktree — don't
  assume either way.** As a rule of thumb, parallel work (multiple sessions
  or worktrees active at once) is better isolated in its own worktree;
  isolated, single-session work is better done on `main`, in place, so the
  primary vite dev server can show Mark the live result. If it's on `main`,
  re-diff against `HEAD` right before every commit — other sessions commit
  here too.
- **Never run `git clean -fdx`.** `content/terrain/tiles/` and
  `tools/terrain/cache/` are ~275 MB of gitignored data that exists nowhere
  else. Its absence shows as extra named skips in the suite, not failures.
- **deploys are the user's call**
  - Commits and pushes are okay unasked since they are reversible and don't touch production

## Hardware
- Ryzen (`serverconfig/ryzen.md`) is the Windows machine that has the reference GPU.  
  - It is not always on but can be woken with wake-on-lan to Session 0.   SSH / non-GPU testing works in session 0
  - If GPU is needed, need a real windows login.  This is accomplished with RDP.  Playwright server is installed.
- Nexus (`serverconfig/nexus.md`) is a headless linux development server.  It is the authoritative copy of the code and is the main development server.

## Software
- Blender is on both Ryzen and Nexus and is used heavily for 3D rendering work, particularly with assets (see `ASSETS.md`)

## Division of labor
- Work can be "outsourced" from Nexus to Ryzen due to it having the reference GPU and having more powerful processor but once tasks are complete on Ryzen commits go back to Nexus.
  - Nexus GPU (Radeon 680M): a local run (no `PW_REMOTE`) gets real WebGPU there, not
SwiftShader, needs no lock, and is an acceptable place for correctness checks and
screenshots. Its budget numbers are about a quarter of the desktop's and mean
nothing, and the adapter guard passes it all the same;
`playwright.config.ts`'s `LOCAL_LINUX_ARGS` says why. A session started before
`mark` joined the `render` group falls back to SwiftShader: run it under
`sg render -c '...'`, or start a new session.
- Since parallel agents may be doing work (and testing), this can throw off GPU testing (particularly budget tests).  If a GPU budget test is being pursued, can use hwlock on Ryzen.
- Multiple dev server slots exist: ww2airsim.windomlane.org, ww2airsim-2.windomlane.org, and ww2airsim-3.windomlane.org.  
  - each real HTTPS wired the same way as the primary hostname above:
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
per kind of fact; point at it, never copy it. 



## Conventions

- **US spelling** in  prose and identifiers. Existing `centre`-style (e.g. UK english)
  identifiers and content JSON keys are a migration — ask before renaming.
- A plan's own numbers are claims: run its arithmetic against the repo before
  executing it. Prefer an assertion to a sentence; date cross-boundary claims.
- Escape `|` as `\|` inside markdown table cells.
- **Imperial units, not metric**, in anything user-facing (HUD, instruments,
  docs, plan tables) — feet, miles, knots, mph, pounds, gallons, °F, inHg, as
  the 1940s aircraft and crews would have used. Ask before converting existing
  internal SI values or content JSON keys; that is a migration.
- **Prefer the AskUserQuestion tool over free-text questions** whenever the
  choices can be enumerated 

## How Mark works

Technical playground: the engineering is the deliverable. He flies the result,
and his eye and ear find what the suite cannot.

