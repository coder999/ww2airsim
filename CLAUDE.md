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
- **Never push or deploy unasked.** Both are Mark's call, separately. Pushing
  `main` releases nothing; the deploy command is in README's "Deployment".
- `npm run verify` (typecheck, lint at zero warnings, depcruise, tests) ends
  every task. Capture `rc=$?` directly; never gate on a grepped pipeline.
- `src/sim/` never imports `render/`, `input/`, `assists/`, `audio/`, Node
  core or a rendering library; `.dependency-cruiser.cjs` says why for each
  rule and `tests/architecture/boundary.test.ts` proves they bite.

## Showing Mark something

- **`ww2airsim.windomlane.org` is the host to send him to.** It serves the dev
  server off this working copy (`npm run dev:lan`; plain `npm run dev` binds
  loopback and the host returns 502). `*.marktuttle.dev` is unreachable from
  his work network. Before naming the host, assert it is up:
  `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/`
  must print `200`.
- **Email him every plan and spec, as HTML, when it is written** — do not wait
  to be asked: `python3 tools/mail-doc.py <file.md> "<subject>"`. Never re-run
  it with `--debug` to confirm a send that already exited 0.
- Send him the **bare URL** for the parked runway spawn. Any `?spawnX/Y/Z`
  override makes the flight airborne, gear up, 56 km from Tacloban.

## GPU work: the Windows desktop is on, with a Playwright server

nexus is headless. Anything visual, and every Tier 2 run, executes on the
Windows desktop (RX 6700 XT), which normally has `playwright run-server` up in
Mark's console session. From nexus:

```sh
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2
```

README's "Tier 2: the GPU harness" is authoritative for the tunnels and the
one-time setup. Two facts it records that cost real time: Chromium launched
over SSH gets **no GPU** (session problem, not headless), and `__ww2` exists
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
needed one — see README's "Tier 2: the GPU harness" and
`vps-local/shared/traefik/dynamic/ww2airsim-2-dev.yml` /
`ww2airsim-3-dev.yml` for the full wiring. Whichever worktree is using a
slot should say so if asked; there's no reservation system beyond that.

## Fetching third-party models

Sketchfab downloads work headlessly from nexus:
`tools/models/sketchfab-fetch.sh <uid> <name>` puts `<name>.glb` plus a
license sidecar in the gitignored `content/models/candidates/` (token from
1Password `hal9000/sketchfab-api`, never printed; verified 2026-09-25). Do not
tell Mark a model "needs a manual download". A download is not a license
check: vet and record it per `ASSETS.md` before promoting anything.

## Conventions

- **US spelling** in new prose and identifiers. Existing `centre`-style
  identifiers and content JSON keys are a migration — ask before renaming.
- A plan's own numbers are claims: run its arithmetic against the repo before
  executing it. Prefer an assertion to a sentence; date cross-boundary claims.
- Every completed plan ends with a dated `docs/handoff/` document, its row in
  §15's table updated, and a README paragraph that points at §15 rather than
  restating the order.
- Escape `|` as `\|` inside markdown table cells.

## How Mark works

Technical playground: the engineering is the deliverable. He asked to be kept
out of the testing loop, so never design in a manual verification step. He
flies the result, and his eye and ear find what the suite cannot. **When he
says he cannot perceive a difference, believe him and measure at the level he
is looking at.**
