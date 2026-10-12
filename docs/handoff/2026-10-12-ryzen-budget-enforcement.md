# Ryzen budget enforcement — 2026-10-12

## Result

Frame-budget E2E tests are now a distinct execution mode rather than a title
classification applied after an undifferentiated run. A normal
`npm run test:e2e` excludes titles matching
`budget|p95|tripwire|frame time|Hz`. Setting `E2E_BUDGET_RUN=1` selects that
complementary set and fails at Playwright configuration time unless
`HWLOCK_HELD` contains `ryzen-budget`.

The nightly runner in `serverconfig` executes correctness first without a
whole-machine lock and then runs only the budget set inside the exclusive
`ryzen-budget` lock. Its two Playwright JSON reports are combined before the
existing verdict and newly-red/newly-green comparison. `remote-run` now holds
the same resource shared while Ryzen executes its WSL command, so a waiting
budget run blocks new CPU jobs and waits for existing ones to finish.

## Tests updated

- `playwright.config.ts` owns the selection guard, while the nightly runner
  repeats the established budget-title pattern at the CLI boundary so either
  repository can roll forward safely. Default and budget list-mode runs prove
  the two sets are disjoint and
  that budget mode refuses a missing lock.
- The nightly shell script keeps the existing aggregate report and
  `runs.tsv` contract while recording both Playwright exit codes.
- `remote-run` participates in the budget resource without serializing its
  ordinary shared CPU jobs against each other.

## Tests still valid

- Budget thresholds and their 1440p High RX 6700 XT meaning are unchanged.
- Correctness failures, budget failures and the newly-red comparison remain
  one combined nightly verdict.
- Direct Windows applications and commands started inside Ryzen rather than
  through nexus remain outside `hwlock`'s visibility; a manual measurement
  still checks the desktop's CPU and GPU activity.

## Known gaps

- The lock coordinates work launched through nexus. It cannot prevent Mark or
  another desktop-local tool from opening a browser during a measurement.
- No deploy was requested or performed.
