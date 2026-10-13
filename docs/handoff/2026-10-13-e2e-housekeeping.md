# E2E housekeeping handoff — 2026-10-13

- Branch: `codex/e2e-housekeeping`
- Base: `origin/main` at `81e66025`
- Feature commit: `dab56bf7`

## Result

The ordinary Playwright suite no longer discovers capture and measurement
programs merely to skip them. `tests/e2e/captureTools.ts` is the explicit
29-file registry, `playwright.config.ts` excludes it, and
`playwright.capture.config.ts` selects it through `npm run capture:e2e`.

The mixed Takram file is now three contracts:

- `takramGame.spec.ts`: correctness and diagnostics;
- `takramGameBudget.spec.ts`: the locked 1440p comparison budget;
- `takramGameCapture.spec.ts`: the visual checkpoint.

The private `TAKRAM_GAME_BUDGET` gate is gone. The normal locked budget run
therefore executes the Takram budget instead of selecting and then skipping
it. The completed one-off `cloudPixels.spec.ts` migration probe was deleted.
`drapeSpike.spec.ts` remains because its `1944` comparison is still unique.

The contradictory pre-2026-09-18 Playwright launch commentary was reconciled
with the verified headed and session-0 routes. The current testing reference
now owns capture invocation and deliberately avoids stale fixed suite counts.

## Discovery

- Correctness: **227 tests in 55 files**; none of the capture manifest appears.
- Capture tools: **164 cases in 29 files**; exactly the manifest appears.
- Locked budget: **47 tests in 8 files**, including
  `takramGameBudget.spec.ts`.

## Verification

All CPU-heavy jobs ran through `remote-run` with `REMOTE_RUN_OVERFLOW=0`.
The budget case ran separately under the exclusive `ryzen-budget` lock.

- Focused classification guard: **4 passed**.
- TypeScript: passed.
- ESLint: passed.
- `npm run verify`: passed — **437 files, 6,394 passed, 12 named
  data-dependent skips**; dependency-cruiser reported no violations.
- Reference-GPU Takram correctness: **3 passed**; native and TSL renderer
  cuts were validation-clean.
- Locked reference-GPU Takram budget: **1 passed**. TSL total GPU p95 was
  **6.848 ms** against the 8.33 ms gate; native estimated total p95 was
  **6.024 ms**.

## Test reconciliation

### Tests updated

- Added `tests/tools/e2eClassification.test.ts`. It rejects capture-gated
  programs missing from the manifest, focused E2E tests, unapproved E2E skips,
  and restoration of the private Takram budget gate.
- Split the Takram correctness, budget and capture responsibilities without
  changing their assertions.
- Removed the non-asserting, completed `cloudPixels.spec.ts` probe.

### Tests still valid

- The 12 deterministic skips remain valid conditional coverage for absent
  source data or tooling; none is an unconditional stale behavior skip.
- `qualityProbeChrome.spec.ts` remains the one approved platform-conditional
  E2E skip because it requires a headed reference-desktop Chrome route.
- Existing correctness and budget title classification is unchanged.

### Known gaps

- The housekeeping change does not make capture pixels into correctness
  oracles. Capture tools remain evidence generators by design.
- Historical plans and handoffs retain the command forms and filenames that
  were true when they were written; standing instructions are in
  `docs/testing.md`.

No player-facing labels, controls, routes, defaults, lifecycle contracts, or
`__ww2` diagnostics changed.
