# Preflight graphics check — implementation plan

**Date:** 2026-10-11  
**Branch/worktree:** `gpu-quality-check` / `~/projects/ww2airsim-gpu-quality-check`  
**Run mode:** unattended unless Mark selects the offered attended checkpoint before the
UI checkpoint is reached.  
**Viewing checkpoints:** final product only by default; first-run, recovery, main-menu
and pause-screen captures go in the handoff.

Design: `docs/superpowers/specs/2026-10-11-preflight-graphics-check-design.md`.

## Tasks

1. Add a pure graphics-check domain module: curated profiles, result/record schema,
   persistence, automatic/custom mode, legacy migration and stale-record decisions.
2. Add a renderer queue seam and a deterministic graphics-check state machine that
   applies one candidate at a time, waits for readiness/warm-up, samples completion
   throughput/latency, and emits progress/result without browser globals in its logic.
3. Enroll the check in boot after shader compilation. Keep the title locked until a
   first-run automatic check completes; reuse a current record when valid; expose the
   adapter and check state through diagnostics.
4. Change `bootQuality.ts` so recommendation, automatic application and explicit user
   overrides are distinct. Preserve DEV query precedence and migrate existing saved
   values as custom.
5. Refactor the Settings DOM into shared visual controls plus main-menu-only sections.
   Add adapter/result status, Use recommended and Run graphics check again actions.
6. Mount the shared live-safe controls directly in the pause dossier; keep Asset
   Quality, Damage Model and Difficulty out of the held-sortie surface.
7. Remove the editable Render Quality ballot from mission Form 4 and replace it with a
   compact read-only graphics summary/change affordance only if it materially helps the
   launch review.
8. Replace startup failure prose with an actionable recovery model and DOM: accurate
   failure classification, Chrome/Edge/Windows steps, Try again, Copy diagnostics and
   an Advanced flags warning.
9. Add deterministic tests and see each new detector fail against its intended fault.
   Add focused E2E correctness and gated capture coverage without mixing budget claims
   into correctness tests.
10. Measure/tune on nexus and the RX 6700 XT, run focused checks, `remote-run npm run
    verify`, and focused reference-GPU E2E. Record exact scope and numbers in a handoff.
11. Update the standing docs and `MASTER_PLAN.md` ledger, mail this plan/spec/handoff as
    HTML per `AGENTS.md`, then rebase or merge current `main`, re-run the affected gates,
    commit and push the branch. Do not deploy.

## Stop conditions

- No measurement threshold is accepted from one machine alone if it produces an
  implausible recommendation on the other available GPU.
- A benchmark failure falls back to a visible conservative recommendation and recovery
  detail; it never silently unlocks with an unrecorded High default.
- An explicit player choice is never overwritten by a check.
- Production does not retain continuous timestamp instrumentation after the check.
