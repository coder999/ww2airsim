# F3 campaign definition and source lock: plan (2026-10-14)

MASTER_PLAN Track F3 freezes both six-chapter Leyte campaigns before reusable-asset production,
campaign systems, canonical-site construction, or mission scripting begins.

## Header

- **Branch:** `f3-campaign-lock`, worktree
  `/home/mark/projects/ww2airsim-f3-campaign-lock`, cut from `main` at `96e65e30`.
- **Viewing checkpoint:** final source lock only: the twelve-mission matrix, source ledger, canonical
  site-state table, reusable-asset inventory, and dependency graph.
- **Run:** unattended to the final checkpoint. This is the repository default pending Mark's answer
  to the checkpoint question asked at kickoff.
- **Heavy jobs:** none. F3 is research, arithmetic, content reconciliation, and documentation.
- **Delivery:** commit and push this branch. Do not merge, deploy, render assets, or begin F4 until
  Mark reviews the F3 lock.

## Fixed inputs

- `GAMEPLAY.md`, "Planned Leyte campaigns," owns the approved player-facing rules.
- `MASTER_PLAN.md`, Track F, owns sequence and acceptance gates.
- `docs/superpowers/notes/2026-10-12-leyte-campaign-brainstorm.md` is a working record, not an
  implementation contract. F3 resolves its alternatives rather than copying them.
- Existing content is reused unless this lock names a new individual asset. Whole-base layouts,
  mud, water, damage, repeated clutter, and state transitions belong to F8.
- A campaign chapter succeeds only through primary-objective success plus its authored recovery.
  Normal failure banks legitimate destruction points; explicit abandonment and player-caused
  friendly destruction do not.
- Both finales retain the fixed population target: 24 airborne aircraft including the player,
  10 simultaneously present ships, and at most 16 aircraft in the close-combat set.

## Tasks

1. Audit `AGENTS.md`, `README.md`, `GAMEPLAY.md`, `MASTER_PLAN.md`, the campaign brainstorm,
   current `content/`, `ASSETS.md`, and the model/Library pipeline. Record shipped reuse separately
   from new individual assets.
2. Verify the campaign chronology, airfield states, major mission premises, force types, and
   recovery geography against official wartime plans, reports, official histories, and service
   records. Date every read and state what each source does and does not prove.
3. Freeze all twelve chapter rows: date, honesty label, player aircraft, minimum pilot rank,
   launch state, weather/light, first-action and recovery budgets, primary/secondary objective
   graph, exact bounded order of battle, authored recovery, canonical-state input/output, opening
   actors, and briefing source.
4. Check each mission's ordinary-cruise distance against its stated time budget. Where exact final
   coordinates depend on F8 layout placement, freeze a maximum path length rather than inventing a
   coordinate.
5. Freeze the dated canonical state sequence for Tacloban, Dulag, Buri, Bayug, San Pablo, Tanauan,
   San Pedro Bay, Ormoc, and the landing beaches. Separate historical state from the J6 alternate
   branch and name all intentionally compressed or invented details.
6. Produce one exact reusable-asset inventory. For each item, name its mission/site consumers,
   articulation, Library/Hangar test-bench requirement, initial source family, and F4 work group.
7. Produce an explicit non-asset list for procedural/instanced F8 treatments and F6/F7 effects so
   later work cannot silently turn every crate, lamp glow, or mud patch into a new Hangar card.
8. Freeze the 12 opening-scene cards and two victory-scene cards at actor/action/duration level,
   sufficient to prevent late asset discovery without prematurely authoring camera coordinates.
9. Replace the master plan's 10–16-plan estimate with a dependency-checked execution count and
   worktree grouping. Keep the F4 hard gate and the existing F5–F11 order intact.
10. Run one-off consistency assertions without adding a source-grep test to the product suite:
    unique chapter ids, required rows, action/recovery caps, finale arithmetic, asset counts and
    source-ledger coverage. Record the command and result in the handoff.
11. Reconcile `GAMEPLAY.md` only if the frozen lock changes an already approved player-facing fact.
    Do not restate project status there.
12. Run Markdown/link/schema checks and the new focused lock tests. Re-diff against the branch base,
    write the F3 handoff, and email the plan, design lock, and handoff as HTML with
    `tools/mail-doc.py`.
13. Commit and push `f3-campaign-lock`. Stop at the review gate; F4 branches are created only after
    Mark accepts or amends the lock.

## Acceptance

- Every chapter row is complete, internally consistent, and either sourced or candidly labeled as
  a composite/alternate-history invention.
- Every row has a finite simultaneous population and a first-action path no longer than 7 minutes
  at ordinary cruise; the preferred 2–4 minute target is used wherever the premise allows it.
- Every success path names one exact authored recovery, with conditional alternates only when the
  primary recovery is physically unavailable because of mission state.
- The two finales each total exactly 24 simultaneous airborne aircraft and 10 ships, with a staged
  close-combat set of no more than 16 aircraft.
- Every new individual reusable model appears exactly once in the frozen F4 inventory and every
  consumer points to it. Procedural scene work is separately bounded.
- Canonical sites have one layout identity and dated state deltas; no mission owns a private
  contradictory version of a base or port.
- The source ledger distinguishes direct support, official-history synthesis, game compression,
  and unresolved geometry provenance reserved for F4.
- The dependency plan gives a concrete plan count and names which work may run in parallel without
  crossing the F4 review gate.
- No implementation or asset rendering has begun before Mark's review.

## Stop condition

F3 ends with reviewable documents, checks, and a handoff. A green test suite does not waive the
human review gate. Rejection or requested changes reopen the lock; approval releases the four F4
asset groups for parallel worktrees.
