# K Clouds v3: current-main focused integration test report

Date: 2026-10-11

Branch: `clouds-v3-integration-main`

Worktree: `/home/mark/projects/ww2airsim-clouds-v3-integration`

Main base: `2eff2943` (`E2E: ai-pursuit-difficulty times its keys in sim ticks, 3 s after Launch`)

Scope: focused integration testing and merge; not deployed, legacy clouds remain the default

## Result

The production Takram cloud integration was transplanted onto a clean
worktree from current `main` without the rejected Blender experiments or the
Takram spike history, then fast-forwarded into `main` at `92b9b6ee`.

The transplant exposed one genuine packaging defect: the production shader
adapter still imported its accepted WGSL baseline from the spike directory.
The accepted, self-contained WGSL source now lives with the production renderer
as `src/render/scene/takramReferenceShaders.ts`; the integration branch no
longer depends on any excluded spike file.

The tested game is live at:

`https://ww2airsim-3.windomlane.org/?spawnX=289068&spawnY=1300&spawnZ=-55605&launch&cloudRenderer=takram&cloudTier=high`

## Focused end-to-end results

These results cover the two Takram-specific Playwright tests below. They are
not the repository-wide `npm run test:e2e` suite described in
`docs/testing.md`. That full browser suite was not run, and this report does
not claim its coverage of boot, UI, missions, replay, audio and other systems.

### Flight, composition and camera cuts

Command target: `tests/e2e/takramGame.spec.ts`, test `flies the opt-in renderer with clean WebGPU validation and camera cuts`

- Passed: 1 of 1 in 14.4 seconds.
- Loaded a flyable in-deck game through the public slot-3 URL.
- Diagnostics reported renderer `takram` and an active cloud composite.
- Switching camera reset temporal history.
- Browser console, page errors and WebGPU validation errors were empty.

### Reference-GPU budget

Command target: `tests/e2e/takramGame.spec.ts`, test `Takram integrated cloud GPU budget is recorded at 1440p High`

The run held the exclusive `ryzen-budget` lock and used the RX 6700 XT at
2560x1440, High:

| Measure | GPU p95 | Samples |
| --- | ---: | ---: |
| Three frame, clouds off | 2.758 ms | 756 |
| Three frame with Takram selected | 3.919 ms | 512 |
| Native Takram march, temporal resolve and composite | 2.022 ms | 617 |
| Conservative total: off baseline plus native Takram | 4.779 ms | — |

Passed: native Takram clouds remain below the 4.0 ms cloud-only gate. The
conservative whole-frame estimate remains below the 8.33 ms 120 Hz gate.

## Full verification

`REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` ran on Ryzen and passed:

- TypeScript typecheck: passed.
- ESLint with zero warnings allowed: passed.
- Dependency cruise: passed, 305 modules and 1,054 dependencies, no violations.
- Vitest: 413 files passed; 5,696 tests passed; 11 skipped; zero failures.
- Production bundle/content checks passed, including the assets fetched by the
  Takram renderer and the rule that DEV-only selection code does not leak into
  the production bundle.

## State after testing and merge

- The integration was based on main at `2eff2943` and fast-forwarded into
  `main` at `92b9b6ee` on 2026-10-11.
- Only the production integration, assets, tests and documentation were
  transplanted; the rejected research commits were not merged.
- Slot 3 now serves this current-main integration worktree and returns HTTP 200.
- Takram remains selected only with `?cloudRenderer=takram` in DEV.
- No default flip or deployment was performed.

The full repository-wide E2E suite remains a separate, explicitly authorized
test run if it is wanted later.
