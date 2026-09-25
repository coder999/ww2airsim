# F4F Wildcat default-aircraft handoff

2026-09-24. The implementation plan at
`docs/superpowers/plans/2026-09-24-f4f-wildcat-default-aircraft.md` is
complete on `main`. Every entity in the world — player and AI alike — now
renders and animates as a real, rigged Grumman F4F Wildcat glTF model instead
of the Hellcat's procedural mesh. The flight-model *physics* every scenario
actually flies are unchanged: they still come from `f6f-hellcat.json`, per
Plan 3's design.

This execution ran in a git worktree, against this repo's own convention of
working on `main` in place (the vite dev server serves the main checkout, not
a worktree, so none of this was visible to Mark until now). The worktree's
eight commits were fast-forward merged into `main` and the worktree retired
before this handoff was written.

## What landed

- `tools/models/build.ts` (`npm run models:build`) compresses the 73.9 MB raw
  Sketchfab download (CC-BY 4.0, rojatsu; cached locally, gitignored, never
  committed) into `content/aircraft/wildcat.glb`, a committed 5,573,356-byte
  (~5.3 MB) asset — WebP-recompressed 1024px textures, geometry and animation
  untouched. `--compress false` is load-bearing: `@gltf-transform/cli`
  defaults to meshopt geometry/animation compression, which this project has
  no decoder for and which made the first build unloadable at runtime
  (`20bcaa4`) despite passing every other check. `tests/tools/modelsBuild.test.ts`
  guards the file size, the three named nodes (`Helice`, `GRP_Rueda_Der`,
  `GRP_Rueda_Izq`) and the absence of `EXT_meshopt_compression`.
- `src/render/scene/wildcat.ts` is the new render module: async glTF load,
  a basis correction (model's native +Z nose onto sim +X forward) and a
  15.658 m → 13.06 m wingspan scale correction, plus gear animation driven by
  two measured node poses (`GEAR_DOWN`/`GEAR_UP`) rather than the source
  clip's baked keyframes, interpolated by `AircraftState.gearFraction`.
  `src/render/scene/stores.ts` was extracted from `hellcat.ts` (rack/rail
  offsets and `attachStores`) so both airframes share identical bomb/rocket
  mounting logic instead of duplicating it.
- `src/render/scene/airframe.ts` defines the shared `Airframe` interface both
  `hellcat.ts` and `wildcat.ts` now implement, letting
  `scenarioEntities.ts`'s `buildScenarioEntities` go async and load one
  `Airframe` per `world.aircraft` entry — **every aircraft in the scene,
  friendly and hostile, not just the player** — through `loadAirframe`,
  which defaults to `loadWildcat`. `hellcat.ts`'s `createHellcat` is
  preserved, fully tested, and still satisfies the shared interface, but has
  no remaining production caller.
- `content/aircraft/f4f-wildcat.json` (Task 3) is real, schema-validated
  content, but its `reference.source` field states explicitly: every
  aero/mass/engine/rates/gear/flap number in it is copied verbatim from
  `f6f-hellcat.json`'s F6F-5 Patuxent River trial data, not a genuine F4F-4
  figure. No scenario references this file yet — `content/scenarios/*.json`
  still name `"spec": "f6f-hellcat"` — so it exists as validated groundwork
  for a future multi-aircraft roster rather than something currently flown.
  `src/render/content.ts`'s `AIRCRAFT_CONTENT_PATH` deliberately stays
  pinned to `f6f-hellcat` for exactly this reason.
- `src/render/diagnostics.ts` gained a `gearFraction()` accessor
  (`Ww2Diagnostics`), wired in `main.ts` the same way `controls()`/
  `cameraMode()` already are. `tests/e2e/wildcat.spec.ts` is the new Tier 2
  spec: spawns airborne (a parked-runway KeyG press retracts the gear that's
  holding the aircraft up and crashes it — confirmed by hand during this
  handoff, see below), presses `KeyG` twice, and asserts `gearFraction()`
  crosses 0.95 then 0.05, with zero page/console errors and no impact.

## Found and fixed while writing this handoff

- **The worktree-vs-main gap above.** All eight of this plan's task commits
  existed only in `.claude/worktrees/f4f-wildcat-default-aircraft`; `main`
  was still 8 commits behind. Fast-forwarded (no conflicts, no rebase) and
  the worktree removed.
- **`.gitignore` regression.** Task 1's own commit (`f4770d4`) dropped the
  `/content/models/` line that `15f1519` had added specifically to keep raw,
  third-party candidate downloads out of git. It appears to have intended to
  relocate the raw Wildcat download to `tools/models/cache/` but never
  actually did, leaving the 74 MB raw file *and* 8 other roster-candidate
  downloads from `docs/handoff/2026-09-24-aircraft-model-candidates.md`
  (130 MB total) sitting untracked and unprotected. Restored the ignore line
  (`b43b1a2`); no files were deleted, since those candidates are exactly the
  future roster's raw material.
- **The plan's own `.superpowers/sdd/2026-09-24-f4f-wildcat-default-aircraft/
  progress.md` rulings ledger was not recovered.** It's gitignored by design
  and evidently existed only inside the now-removed worktree's working
  directory; its substance (the pre-flight fixes it documented) survives in
  `b2d7c3b`'s commit message and the plan text itself, but the detailed
  reasoning ledger is gone. Worth a convention note: for worktree-executed
  plans, either commit the ledger's key rulings into the plan doc directly,
  or copy it out before the worktree is retired.

## Tier 1 evidence

```sh
npm run verify; rc=$?; echo rc=$rc
```

Result: `rc=1` — one failure, `tests/render/gunzip.test.ts`'s "loads the sky
noise and the land cover from BOTH kinds of server" test, on a 30 s timeout.
Unrelated to this plan (not among the 24 files any Wildcat commit touched);
re-run in isolation (`npx vitest run tests/render/gunzip.test.ts`) passed
2/2 in 23.7 s. Typecheck, ESLint at zero warnings and dependency-cruiser were
clean; 143/144 test files and 1,519/1,521 tests passed on the full run.

## Reference-GPU evidence

Against the served nexus checkout through the Windows RX 6700 XT Playwright
server:

```sh
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org \
  npx playwright test tests/e2e/wildcat.spec.ts --reporter=list
```

Passed 1/1 in 22.6 s: gear crossed both thresholds, zero page/console errors,
no impact recorded.

Per this repo's "never argue about a picture you have not looked at," a
throwaway spec (not committed) additionally screenshotted the same airborne
spawn with gear up and gear down. Both were read directly: gear-up tucks the
wheels into the wing root exactly as the source model does; gear-down shows
both struts and wheels extended below the wing. Screenshots discarded after
viewing, per the plan's own Task 7 Step 4.

## Deliberate boundaries and remaining work

- **All flight-model numbers for the Wildcat are placeholders**, dated and
  reasoned in `content/aircraft/f4f-wildcat.json`'s own `reference.source`
  field (2026-09-24). A genuine F4F-4 performance-trial research pass is
  follow-up work on the same footing the Hellcat's own citation took.
- **No flap geometry exists on this model.** `ASSETS.md` records this;
  flaps remain visually absent regardless of `AircraftState` flap fraction.
- **Every aircraft in the world renders as a Wildcat**, including AI-flown
  enemies — there is no per-spec model selection yet. The other 10 roster
  aircraft from §9's table have no plan.
- Not pushed and not deployed. Those remain separate user decisions.
