# Plan: fix the red Tier 2 suite, then run it overnight after days with changes

Status: proposed 2026-09-29, not started.

## Why

On 2026-09-29, running the full Tier 2 suite (217 Playwright tests, 51 files) on
ryzen, about 49 tests failed. The failures a baseline run has covered so far also
fail on unchanged `main`, so most of them predate the change under test. The
deploy was green because `deploy.yml`, like `ci.yml`, runs only `npm run verify`
(typecheck, lint, depcruise, vitest). No automated job runs Tier 2, because
GitHub runners have no GPU.

How the failures stayed hidden:

1. Nothing runs Tier 2 on a schedule. Agents run it by hand, scoped to the specs
   their change touches.
2. `docs/aircraft.md:403` says "check a red test against the base before owning
   it" and keeps a known-red list. Anything red on `main` gets classed as "not
   mine" and is never tracked.
3. The one scheduled job, `nightly-soak.yml`, failed on 2026-09-29 09:17 UTC with
   a real ground-penetration assertion (seed 1337, iteration 59, sank 2.0 m).
   That doc line also lists soak as known red.

## Phase 1: triage and fix (agent work, Mark's go-ahead per bug)

1. Take the full list of failures from the 2026-09-29 ryzen run and its
   `main`-baseline re-run (the Sonnet session's scratchpad, `base-run*.log`
   and the JSON report).
2. Sort each failure into one bucket:
   - **Real bug.** Example: gunnery fires 276 rounds with 0 hits.
   - **Stale test.** The game changed on purpose and the assertion did not.
   - **Budget or machine.** A frame-time assertion. `docs/testing.md` says
     session 0 must not be trusted for frame-time numbers yet, so these are
     suspect until re-measured in the console session under `hwlock ryzen`.
3. Fix the real bugs one at a time, each with its failing spec as the check.
   Update the stale tests with Mark's say-so. Re-measure the budget failures.
4. Fix or explain the soak failure.
5. Replace `aircraft.md:403`'s known-red list with a pointer to the run log
   (Phase 2). A red test on `main` becomes a tracked item, not a reason to
   move on.

Exit: the correctness group is green on ryzen at a recorded commit.

## Phase 2: overnight run, only when `main` moved

This is a script, not an agent. No tokens are spent overnight; an agent is
involved only when Mark asks it to triage a report.

- **Trigger.** A systemd user timer on nexus, around 02:30 MDT. It exits at once
  if `origin/main`'s SHA equals the last tested SHA. Days with no work cost
  nothing, and nobody has to remember to queue a run.
- **Checkout.** A dedicated detached worktree at `origin/main`, never the served
  working copy, so uncommitted work is never tested and never disturbed.
- **Run.** `hwlock ryzen` (exclusive, so it cannot collide with a late session),
  a session-0 Playwright server on ryzen (`docs/testing.md`), and the suite in
  two groups:
  - **correctness:** hard pass or fail
  - **budget:** numbers recorded, not failed, until session-0 pacing is
    settled
- **Record.** Append one line per run to
  `~/.local/state/ww2airsim-e2e/runs.tsv` (date, SHA, passed, failed, newly
  red, newly green) and keep that run's JSON report beside it. This record
  lives outside the repo so a cron job never commits to `main`.
- **Report.** Email a results summary after every run that happens. Runs only
  happen after days with changes, so this is not daily mail. The subject line
  carries the counts and the number newly red. The body lists newly red tests
  first, each with its first error line, then newly green tests, then the
  budget numbers. Skipped runs (ryzen did not wake, lock cutoff) also email,
  saying why. Nights when `main` did not move send nothing.
- **Order at the end of a run:** write the log line, send the email, then shut
  ryzen down if the job woke it. The shutdown waits for the send to finish
  (msmtp runs on nexus, so it does not depend on ryzen being up). A failed
  send is recorded in the log line and does not block the shutdown.
- **`e2e-status`.** A one-line command that prints the last run's date, SHA,
  and counts, and whether `main` has moved since. Sessions and Mark both use
  it.

### Open questions to settle while building

- The worktree needs the terrain data (the 275 MB that `git clean -fdx`
  destroys). It needs to be linked or copied from the main checkout, not
  rebuilt.
- ryzen needs a URL for the worktree's dev server. The windomlane slot hosts
  (`ww2airsim-2`/`-3`) already exist. Pick one for the nightly run and
  document that it is reserved at night.
- **Waking ryzen.** Wake-on-LAN already works from full shutdown (fixed and
  verified 2026-09-21; the three required settings are in
  `serverconfig/ryzen.md`, "Wake-on-LAN"). Reuse `remote-run`'s wake-and-wait
  logic (`serverconfig/scripts/remote-run`), which sends the packet and polls
  SSH; do not write a second copy. The session-0 Playwright server needs no
  login, so a machine woken by WoL can run the suite (`ryzen.md`). If ryzen
  does not come up within the wait, record the skip and email it. Never fall
  back to running Tier 2 on nexus; that is what overheated it on 2026-09-29.
- **Leaving ryzen as found.** If the job woke ryzen, shut it down afterward
  (`shutdown /s`). If ryzen was already on, leave it alone. Confirmed by Mark
  2026-09-29.
- A run takes about 40 minutes. If the lock waits past a cutoff, skip the run
  and record the skip. Never hold the lock into the morning.

## Phase 3: CLAUDE.md entry (ww2airsim)

Worth adding, kept short and pointing elsewhere rather than restating:

> **Tier 2 health.** Run `e2e-status` before calling a red Tier 2 test
> "pre-existing". The record is `~/.local/state/ww2airsim-e2e/runs.tsv`. A test
> that is red on `main` and not already in the latest report is new: report
> it, do not dismiss it. Mechanism: `docs/testing.md`, "Overnight run".

The mechanism itself goes in `docs/testing.md`, the one authoritative copy.
