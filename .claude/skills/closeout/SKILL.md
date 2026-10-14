---
name: closeout
description: Finish a ww2airsim branch or worktree — reconcile tests, update docs and ASSETS.md, run the full gate on ryzen, merge to main, push, watch CI, clean up. Use when Mark says merge, close out, or wrap up a branch/worktree. Never deploys.
---

# Closeout

Mark's "merge, update docs, update tests, do CI, clean up" means all of the steps
below, in order. Stop and report at the first failure; do not skip ahead.
Authority for each rule is the file named, not this list — read it, don't trust a copy.

1. **Scope.** In the branch's worktree: `git status` (only intended changes; a
   scratch `vite.config.ts` slot edit is discarded, never committed — `AGENTS.md`,
   "Multiple dev server slots"), then `git merge main` and resolve conflicts.
2. **Test reconciliation.** `docs/testing.md`, "Worktree closeout": diff against
   the base, name every changed player-facing contract or diagnostic, search the
   tests for the old labels/lists, and update them. Self-enrolling lists (Hangar
   `7b`/`7c`, library, budgets) go stale when assets are added — run the affected
   specs, not just unit tests. A new test must be shown to fail without its fix.
3. **Docs.** `MASTER_PLAN.md` entry (it is the ledger), the handoff, and
   `docs/status-log.md`; `README.md` "Where docs go" says where anything else lives.
   Date claims and say how they were verified.
4. **ASSETS.md, only if `content/` or `tools/models/` changed.** Every committed
   model, texture or sound needs its provenance row and cited-facts/ESTIMATE
   labels; `tests/tools/models/outputs.test.ts` and `modelCredits` fail the gate if
   a row is missing, so do it here, not after the gate.
5. **Gate.** `npm run verify` on ryzen, never nexus
   (`REMOTE_RUN_OVERFLOW=0 remote-run bash -c '...'`; `AGENTS.md`, "Heavy jobs").
   Gate on the real exit status, not a grep'd pipeline. A failure you did not
   cause still gets reported, never silently waved through.
6. **Merge.** In `~/projects/ww2airsim` (main): `git fetch`, check
   `origin/main..main` and `HEAD..origin/main` right before merging and pushing
   (concurrent sessions commit here), then merge and `git push origin main`.
   Pushing main deploys nothing.
7. **CI.** `gh run list --branch main`, `gh run watch <id> --exit-status`; report
   the conclusion honestly.
8. **Cleanup, only branches verified merged** (`git branch --merged main`):
   `git worktree remove`, `git branch -d`, delete the remote branch if one exists.
   Stop dev servers you started — by PID, not `pkill -f` (that pattern matches your
   own shell) — and never kill the primary or another slot's server. Leave other
   sessions' worktrees alone. `rm -rf` of leftover cache dirs needs Mark's explicit
   approval.

Never in closeout: deploy (`gh workflow run deploy.yml` is Mark's call), force-push,
or `git clean -fdx` (destroys ~275 MB of unrecoverable terrain data).
