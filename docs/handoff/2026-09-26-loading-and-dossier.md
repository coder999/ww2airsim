# Handoff: loading strip and pilot Dossier (2026-09-26)

**Branch:** `worktree-loading-dossier`, in the worktree
`.claude/worktrees/loading-dossier`, served on `ww2airsim-3.windomlane.org`
(slot 3, port 5174) while it ran. Not merged to `main`, not pushed.
**Design:** [`2026-09-25-loading-and-dossier-design.md`](../superpowers/specs/2026-09-25-loading-and-dossier-design.md).
**Plan:** [`2026-09-25-loading-and-dossier.md`](../superpowers/plans/2026-09-25-loading-and-dossier.md).
**Ledger:** `.superpowers/sdd/2026-09-25-loading-and-dossier/progress.md`
(gitignored), with a report per task beside it.

`main` was merged into the branch twice: `dde82ae` at the start and `393ad3e`
before the cloud fix (Codex's cloud rewrite had landed on `main` by then).
**Update 2026-09-26:** `main` was merged a third time, at the end, bringing
in `47d8293` ("full march jitter for cumulus") and 17 other commits. Its
only `cloudField.ts` change was a comment (the one conflict); the jitter
edit is in `clouds.ts`'s view march, outside the density body. The laid-out
density still reads no uniform in its body and `laidOut()` is still called
once per `marchNode`. Re-measured on the merged code: `boot.spec.ts` longest
task 1 080 ms, `clouds.spec.ts` 11/11 with no console or WGSL errors,
`dossier.spec.ts` passes. The cloud side is recorded in `docs/clouds.md` §3.9
and §4.

## What changed

| Commits | What |
| --- | --- |
| `5bdedcf` | `bootProgress.ts`: ordered, weighted boot stages; ready when the shader build ends |
| `162dbc9` | Title loading strip with a compositor-driven stripe. Controls stay locked until ready; the Dossier is never locked |
| `ac4416e` | `main.ts` reports the renderer, sky, surface and shaders stages |
| `3796643` | `tests/e2e/boot.spec.ts` (red until `db044e1`, on purpose) |
| `e26127f` | `flightRecord.ts`: airborne seconds, peak altitude and peak true airspeed per segment |
| `5b908c6` | Roster `career` totals and a 200-entry `log`, migrated on read |
| `094e146`, `f8ebe38` | Each segment is recorded and banked with the debrief as a log entry; stepping is guarded on the world clock advancing |
| `2a06add`, `cf22706` | The Dossier sheet from each roster row (`src/render/dossier.ts`) |
| `3b5979f`, `edad3f4`, `1f5a0ed` | `hopAndLand` shared in the Tier 2 harness; `dossier.spec.ts`; five roster selectors rescoped (see Traps) |
| `db044e1`, `a53f198` | Cloud density as a per-material laid-out `Fn`, which removes the boot freeze; `cloudPixels.spec.ts` skips unless `CLOUD_PIXELS_OUT` is set |
| `395f23d` | Boot stage weights re-measured (below) |
| (this commit) | Handoff, §15 row 9, README pointer, GAMEPLAY roster fields; the design spec's wind claim corrected |

## Measured (reference GPU, RX 6700 XT, Playwright run-server, slot 3)

### The boot freeze (longest main-thread task, navigation to ready)

| When | Code | Longest task | Navigation to ready |
| --- | --- | --- | --- |
| 2026-09-25 (spec §A.1) | `main` before this branch | 13 014 ms | -- |
| 2026-09-26, Task 4 | branch after the first merge, before the fix | 11 590 ms | 12 139 ms |
| 2026-09-26, Task 10 | branch after the second merge (Codex cloud rewrite), before the fix | **38 978 ms** | 37 509 ms |
| 2026-09-26, Task 10 | after `db044e1`, 10 cold-cache fresh-browser runs | **median 1 240 ms**, max 1 401 | ~2.9 s |
| 2026-09-26, this task | full Tier 2 run's `boot.spec.ts` | 1 358 ms | 3 209 ms |
| 2026-09-26, this task | `boot.spec.ts` after the weight commit | 1 178 ms | 3 043 ms |

The plan was written against a 12 s freeze. When the Codex cloud rewrite
merged, it grew to 39 s: the stacked-lobe cumulus body is larger, and the
detailed density evaluates the winner and the runner-up. The same fix,
applied to the rewritten `cloudField.ts`, took it to 1.1-1.4 s.

**How it was measured:** `boot.spec.ts` records `longtask` entries with a
buffered `PerformanceObserver` from navigation until `data-ww2-ready="true"`.
The cold runs used a scratch Playwright config (not committed) that adds
`--disable-gpu-shader-disk-cache`, and a fresh browser for every run. Each
Playwright launch already gets a new temp profile, verified with
chrome://version (Ruling 8). Warm runs were no faster than cold ones, which
fits the CPU profile: the remaining cost is three's JS `NodeBuilder` graph
build, not GPU shader compilation. One post-fix CPU profile put the first
frame at 1 304 ms: `cloudPass.updateBefore` 723 ms (328 ms of that is
`buildFunctionNode` for the four laid-out density functions), the scene pass
~405 ms, atmosphere LUTs 43 ms.

**Margin is about 250 ms.** Under desktop contention one run hit 1 630 ms,
and the first run after the edit hit 4 181 ms, which did not reproduce (same
run: test 1 took 10.3 s to ready, so the whole browser was slow). If
`boot.spec.ts` goes red, rerun it before blaming code. If more headroom is
wanted, two options were not tried: laying out `candidate` (inlined twice in
the detailed density), and hoisting `thetaFor` to once per layer.

This fix also resolves the "Open, not S1's: a 25-45 s page load" item in
`main`'s [S1 handoff](2026-09-25-s1-ship-models.md). It is the same
`NodeBuilder.build` under `cloudPass.ts` `updateBefore`.

### Boot stage durations (`395f23d`)

To time each stage, throwaway `performance.mark` calls went into
`begin`/`end` (reverted before commit). Eight cold-cache fresh-browser boots,
2026-09-26:

| Stage | Median (ms) | Min-max | Share | Weight |
| --- | --- | --- | --- | --- |
| renderer | 305 | 280-310 | 0.131 | 2 |
| sky | 439 | 422-461 | 0.188 | 3 |
| surface | 422 | 408-432 | 0.181 | 3 |
| shaders | 1 165 | 1 139-1 177 | 0.500 | 8 |
| navigation to ready | 2 900 | 2 865-2 973 | -- | -- |

The previous weights were 1 / 2 / 2 / 3, from the pre-fix guess. The
`shaders` stage includes the one-paint wait (rAF, then `setTimeout(0)`)
before the first frame.

### Cloud pixels (the fix must not change the picture)

Captures were 1280x720, `?cloudTier=high`, paused and converged
(`cloudPixels.spec.ts`), with the per-channel delta taken over the frame.

| Pair | mean | p99.9 | max |
| --- | --- | --- | --- |
| before-1 vs before-2 (noise floor) | 0.267 | 11 | 188 |
| **after vs before-1 (acceptance)** | 0.196 | 11 | 188 |
| after vs before-2 | 0.184 | 5 | 166 |
| after-2 vs before-1 (same shader as after) | 0.243 | 17 | 188 |
| after vs after-2 (same shader twice) | 0.184 | 10 | -- |

The thresholds were mean ≤ 0.400 and p99.9 ≤ 13, derived from the noise
floor, and the acceptance pair passed. The max of 188 is the HUD fps
readout. The spec's "max channel delta ≤ 2" could not be used as written:
two captures of the same shader already differ by more than that. The last
two rows show that a two-frame noise floor understates the run-to-run
spread. A recapture of the committed shader scored p99.9 17 against
before-1, and 492 pixels outside the HUD differ by more than 10. The
tolerances were not changed.

## Tier 2 (full run, 2026-09-26, this branch at `a53f198` plus uncommitted docs)

`npm run test:tier2` **cannot collect** on this branch or on `main`.
`strike.spec.ts` imports `src/render/content.ts`, whose module-level
`import.meta.env.BASE_URL` throws under Node
(`TypeError: Cannot read properties of undefined (reading 'BASE_URL')`).
The import came in with `aeeea5e` on `main` (2026-09-24), and `main`'s S1
handoff records "Still uncollectable". This branch touches neither file. The
run below therefore passed every other spec by name:

```
specs=$(ls tests/e2e/*.spec.ts | grep -v strike.spec)
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-3.windomlane.org npx playwright test $specs
```

**Result: 136 passed, 12 failed, 2 skipped (34.1 min), rc=1.** The skips are
the audio spec's deliberate `test.skip` and `cloudPixels.spec.ts` (no
`CLOUD_PIXELS_OUT`). All of this branch's own specs passed: `boot.spec.ts`
2/2, `dossier.spec.ts`, and the five specs whose selectors it rescoped.

| Failure | Full run | Rerun alone (branch) | Rerun with pre-fix clouds | Verdict |
| --- | --- | --- | --- | --- |
| cloudShadow: carrier deck darkens under overcast | 0 (> 5) | **pass** | -- | flake |
| deckQuals: parked, sails with the carrier | 2.77 (> 3) | **pass** | -- | flake |
| deckQuals: deck run 1440p p95 | 8.09 ms (< 6) | 8.08 ms | -- | fixed on `main` after `393ad3e` by `efeb470` (tripwire to 8.33 ms, clouds' cost); merged into the branch 2026-09-26, not rerun |
| ships: deck-quals 1440p p95 | 7.70 ms (< 6) | -- | -- | same, `efeb470` |
| entities: task force 1440p p95 | 7.13 ms (< 6) | -- | -- | same, `efeb470` |
| deckQuals: rendered deck under the wheels (S1) | probe 0 hit nothing | same | -- | fixed on `main` after `393ad3e` by `b3abfe6` (the probe ignored the floating origin); merged into the branch 2026-09-26, not rerun |
| motionBudget: 4K camera motion | 4.103 (≤ 3.745) | 4.113 | 4.110 | pre-existing |
| sun: noon sky is blue | 164.4 (> 168.6) | 164.5 | 164.4 | pre-existing |
| sun: twilight is dusk, not black | 7.70 (> 8) | 7.71 | 7.70 | pre-existing |
| terrain: Leyte 1440p p95 | 6.222 ms (≤ 6) | 6.258 | 6.268 | pre-existing |
| terrainTextures: runway 1440p p95 | 7.791 ms (≤ 6) | 7.814 | 7.846 | pre-existing |
| terrainTextures: low-land-600 1440p p95 | 7.279 ms (≤ 6) | 7.237 | 7.284 | pre-existing |

**Why "pre-existing":** `main` cannot be served from slot 3, so the check
was a subtraction. Since `393ad3e` (the merge that equals `main` plus Tasks
1-9), this branch changes only `cloudField.ts` and `clouds.ts`. Checking
those two files out at `393ad3e` and rerunning the six persistent failures
reproduced every number to within noise (last column); the files were
restored afterwards. Tasks 1-9 change only `bootProgress.ts`, `dossier.ts`,
`flightRecord.ts`, `roster.ts`, `titleScreen.ts` and `main.ts`. The
`main.ts` changes are boot-stage calls and CPU-side segment stepping, and the
title overlay is hidden in flight. None of it draws anything these specs
measure. The budget overruns match the ~+3 ms the cloud VDB merge added
(its handoff, and `efeb470`'s message: entities 2.34 ms with
`cloudTier=off`). `main` has retuned three tripwires for this but not
`terrain`, `terrainTextures` or `motionBudget`. The two sun sky-color checks
were not investigated further. They are identical with and without this
branch's cloud change, so they belong to `main`'s cloud or sky work. Logs:
`scratch/tier2-full-2.log`, `rerun-deck.log`, `rerun-branch.log` and
`rerun-prefix.log` in the worktree.

## Traps for future work

- **three.js 0.186: a laid-out TSL `Fn` must be one instance per material,
  and must take uniforms as arguments.** `NodeBuilder.buildFunctionNode`
  caches a laid-out function's code per backend, keyed by the `Fn` object,
  with the binding names the *first* builder assigned. A second material
  that reuses the instance fails WGSL validation with
  `unresolved value 'nodeUniform3'`. One instance per *call* compiles, but
  it drove boot to 18.5 s. Uniforms read inside the body are the same trap,
  so pass them in as parameters. Captured textures resolve correctly once
  the instance is per-material. This applies to any shader work that adds
  `setLayout`. See `CloudField.laidOut()` in `src/render/scene/cloudField.ts`.
  Without a layout, TSL inlines an `Fn` at every call site. That inlining
  was the freeze: each inlined density copy in the light march cost 2-3 s to
  build.
- **The Dossier button's aria-label (`Dossier: <name>`) contains the pilot's
  name.** A loose `getByRole('button', { name: /<pilot>/ })` now matches two
  buttons in the row, and Playwright's strict mode fails the click. Five
  specs were rescoped to the row's own `button[aria-pressed]`, the marker
  `startGame()` already uses: `meta-game.spec.ts`, `scenarioPicker.spec.ts`,
  `settingsUi.spec.ts`, `title.spec.ts` and `meta-game-relaunch.spec.ts`. New
  specs must do the same.
- **The sim has wind.** Peak speed is air-relative:
  `length(airVelocity(state, world.wind))` (`src/sim/flight/model.ts`). The
  design spec said "the sim has no wind", which has been false since Plan 8
  (`56ff8b4`, `world.wind`). §B.1 is corrected. Using `|velocity|` would
  record ground speed, off by the scenario wind (a few knots).
- **A boot-time number from one run on the shared desktop is not a
  verdict.** Judge §A.4's gate by the cold-cache median (Ruling 8).

## `dossier.spec.ts`'s flying recipe

The spec uses `hopAndLand(page)` in `tests/e2e/harness.ts`, extracted from
`meta-game.spec.ts`. The flight is on Gunnery Range from the parked strip
spawn, so there is a real physics landing and no approach to hand-fly:

1. Full throttle until the aircraft has rolled 380 m.
2. Nose up (`ArrowDown`) for 1.5 s.
3. Wait until clear of `AIRBORNE_LATCH_M`.
4. Idle, with a 0.5 s nose-down pulse.
5. Below 8 m, run a closed-loop flare: tap nose-up whenever the sink rate
   exceeds 2 m/s.

It lands as a `field` landing. The harness comment records a touchdown
measured 2026-09-24 at 1.3 m/s sink and 46.5 m/s. The spec then returns to the title and checks four things:
- the title is unlocked at once, with no strip
- the newest log line reads Gunnery Range / Field landing
- the service record shows `0 trap · 1 field · 0 ditched` and a non-zero
  highest altitude
- Escape returns focus to the row's Dossier button

In the full run, both hops cleared the latch at 10.3 m and landed on the
wheels.

## Open items

- **Badges** stay empty ("No badges yet") until missions M2 writes
  `badges[]`. The Dossier needs no change when it does.
- **Roster export/import UI** is still open. `exportRoster`/`importRoster`
  apply the new `career`/`log` defaults, but no UI calls them yet (§15
  row 9).
- **`strike.spec.ts` is uncollectable**, and so is a bare
  `npm run test:tier2` (`main`'s bug, above).
- `main`'s 1440p tripwires for `terrain`, `terrainTextures` and
  `motionBudget`, and the two sun sky checks, fail after the cloud VDB merge.
  They belong to `main`.
- Deferred minors from the task reviews (ledger):
  - The main.ts wiring tests pin text counts only.
  - `thetaFor` runs on every density call, including light-march samples
    outside the slab.
  - `titleScreen.ts` has a dead `unsubscribeBoot?.()`.
  - A local `const boot` shadows `async function boot()` in `main.ts`.
- **Fix round 2 (final whole-branch review, 2026-09-26), all six findings
  closed** -- see `.superpowers/sdd/2026-09-25-loading-and-dossier/final-fix-report.md`:
  - `validatePilot` now validates every `log[]` entry field-by-field (drops
    an entry with a bad `at`/`scenarioId`/`aircraft`/`outcome`, zero-fills
    numeric fields and `killsByType`, falls back to the default loadout for
    an unrecognized `loadout`) instead of casting the array unchecked -- the
    minor above ("a hand-edited entry that lacks `killsByType` would throw
    in the Dossier") is fixed. `nextRankProgress` no longer throws on a
    negative `cumulativeScore` (reads as 0% progress toward the first rank).
  - The `laidOut()` unit test could never fail: it compared `bind()`
    closures, which are always fresh regardless of whether the underlying
    `Fn` was memoized. `laidOut()` now also returns `fns` (the raw laid-out
    `Fn` pair, doc-commented as test-only), and the test asserts identity on
    those instead -- the "uniform-in-body regression" note above no longer
    applies to THIS test (it never could have caught that class of bug).
  - The Dossier now sets `inert` on the title overlay's other children while
    open, restored on every close path including `destroy()` -- Tab/Enter/
    Space could previously reach a title control behind the sheet after a
    click on non-focusable sheet text dropped focus to `<body>`.
  - The loading strip now fades (CSS opacity transition, ~300ms) before
    hiding on the real "loading -> ready" transition, per spec §A.2. A title
    rebuilt already-ready (return-to-title, New game) still hides it at
    once with no fade, since it was never shown that build.
  - `dossier.spec.ts` now also asserts Close (not just Escape) returns focus
    to the row's Dossier button.
  - The trap/field split is extracted to `landingKind()` in
    `src/render/flightRecord.ts`, unit-tested for carrier/airfield/off-field,
    with `main.ts` wired through it.

## Rulings made on Mark's behalf

Each ruling is listed with what it costs if it turns out wrong. The full text
is in the ledger.

| # | Ruling | Cost if wrong |
| --- | --- | --- |
| 1 | Every `npm run verify` runs as `remote-run npm run verify` (nexus OOM'd on full suites; CLAUDE.md changed after the plan) | Nothing: remote-run falls back to local |
| 2 | True airspeed is `length(airVelocity(state, world.wind))`, not `\|velocity\|`: the spec's "no wind" was false (Plan 8, `56ff8b4`) | Fastest speed off by the scenario wind, a few knots |
| 3 | Task 4 committed `boot.spec.ts` red until Task 10, as planned (Tier 2 is outside verify) | A red Tier 2 run on the branch between Tasks 4 and 10 only |
| 4 | Verify's only acceptable failure was `terrainLoad.test.ts`'s finest-level handoff timeout, reproduced on untouched `dde82ae`. `main` retired it in `d57e277` | A missed pre-existing flake |
| 5 | The Dossier button sits in a trailing column of the pilot's row, not inside the Name cell (spec: "beside the name"), so the lock-critical select button stays separate | A cosmetic move if Mark wants it literally beside the name |
| 6 | Fixing the five roster-selector collisions this branch caused is in scope (tests only) | Nothing: tests-only selector scoping |
| 7 | Merged `main` again before Task 10 (`393ad3e`) and applied §A.3's principle to the rewritten `cloudField.ts` rather than the plan's stale code | A re-plan if the freeze cause had changed (it had not) |
| 8 | §A.4's < 1 500 ms gate is judged by the median of cold-cache fresh-browser runs, with every run printed | A false green if every run were somehow warm |
| 9 | The handoff email is sent by the controller after the final whole-branch review, not by Task 11 | A later email |
