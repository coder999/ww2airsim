# Preflight graphics check — design

**Status:** approved direction from Mark's 2026-10-11 brainstorm; implementation in
worktree `gpu-quality-check`.

## Problem

The shipped A4 probe measures the first seconds of the first sortie, returns only a
High/Medium/Low render tier, and stores that result in the same key used by a player's
explicit choice. A first-time player therefore launches before the recommendation is
known, Form 4 exposes only part of the machine-level graphics configuration, and the
startup failure for a missing adapter gives developer-oriented prose rather than a
recoverable browser/OS path.

The application already has the important seams: WebGPU adapter acquisition at boot,
one settings model shared by the title and pause screens, live render-tier and render-
scale setters, and a deterministic boot world rendered behind the title.

## Product flow

1. Adapter acquisition remains the first graphics gate.
2. On a first visit, after the real boot scene and pipelines are ready, the title stays
   in its loading state while a short graphics check renders the canonical boot view.
3. The check tries curated profiles from most to least demanding and chooses the first
   profile that sustains the target. A profile is a render-quality tier plus render
   scale; Asset Quality is not part of the result because it is a network/storage axis.
4. The chosen profile is applied and saved before mission selection unlocks. The title
   reports the detected adapter and recommendation.
5. Main-menu Settings owns the full Visual Quality controls and can run the check again.
   The pause dossier mounts the same live-safe visual controls. Mission Form 4 no longer
   edits machine-level graphics state; it may show a read-only summary.

The check targets a smooth 60 Hz experience. The pass line is deliberately below a
perfect 60 fps so a 60 Hz display can qualify while leaving room for ordinary jitter.
Candidate order is a product choice, not a numeric sort:

1. High / 100%
2. High / 75%
3. Medium / 100%
4. Medium / 75%
5. Low / 75%
6. Low / 50%

This order prefers the full clouds/ocean/scenery feature set over a modest loss of 3D
sharpness. The HTML HUD remains native-resolution.

## Measurement

The check uses the real renderer, scene, post chain, resolution and browser queue. It
does not identify a GPU model and look up a table. Adapter strings are too coarse for
that to be honest.

For each candidate:

- apply its tier and scale without marking an explicit player choice;
- wait for asynchronous tier rebuilds and a warm-up window;
- sample submitted frames and their `GPUQueue.onSubmittedWorkDone()` completions;
- reject hidden-tab gaps and compute sustained completion rate plus completion latency;
- accept the first candidate meeting the target, otherwise keep Low / 50%.

The check runs against the canonical boot view with the simulation held. That makes it
mission-independent and repeatable while exercising the actual ocean, terrain,
vegetation, clouds, effects-capable frame pipeline and output resolution. Tests assert
the state machine and wiring; reference-GPU and nexus runs provide the dated thresholds.

## State and persistence

Recommendation and player intent are separate:

- `ww2airsim.graphicsCheck.v1`: versioned measurement record, including recommended
  profile, adapter identity available from WebGPU, resolution bucket, browser major,
  measured throughput/latency and date.
- `ww2airsim.quality.v1` and `ww2airsim.renderScale.v1`: the active explicit override,
  retained for compatibility.
- an explicit mode marker distinguishes `automatic` from `custom` so a new check can
  update automatic settings without overwriting a player choice.

Legacy saved quality/scale values migrate conservatively as custom choices. A player
can choose **Use recommended**, **Run graphics check again**, or **Customize**. Running
the check records a recommendation regardless of mode; it applies the result only in
automatic mode. A material benchmark-version, adapter, browser-major or resolution-
bucket change makes an automatic record stale and schedules a new check.

## Adapter and recovery states

Player-facing copy never claims the computer has no GPU. It says the browser did not
expose a usable graphics adapter and distinguishes:

- `navigator.gpu` absent: unsupported/outdated browser or insecure context;
- `requestAdapter()` returned null: graphics acceleration, policy, driver, blocklist,
  GPU-process or platform problem;
- software adapter: WebGPU exists but is not hardware accelerated;
- real adapter: show the coarse vendor/architecture the browser disclosed.

The recovery screen offers **Try again** and **Copy diagnostics**, then browser-specific
steps: update/relaunch; enable graphics acceleration; inspect `chrome://gpu` or
`edge://gpu`; update the driver; on multi-GPU Windows assign Chrome/Edge to High
performance under System > Display > Graphics; check managed policy. Unsafe WebGPU and
blocklist flags appear only in an Advanced section with a warning. Internal browser
URLs are shown as text because a web page cannot reliably open them.

## Shared UI ownership

`settings.ts` remains the single settings model. Its visual controls become a reusable
surface that can be mounted in the main dialog or pause dossier without duplicating
labels, persistence or callbacks. Gameplay settings remain main-menu-only. Asset
Quality remains main-menu-only because it does not apply to the held sortie.

The pause surface contains the live-safe profile, scale and advanced system controls.
The main surface additionally shows adapter/check status, rerun/use-recommended actions,
Asset Quality, Damage Model and Difficulty.

## Non-goals

- dynamic resolution or continuous mid-flight adaptation;
- a WebGL fallback;
- exact GPU model identification;
- choosing Asset Quality from GPU performance;
- bypassing a browser blocklist automatically;
- changing tier contents or the renderer's existing performance budgets.

## Verification

- deterministic tests for persistence/migration, stale-record rules, candidate order,
  state-machine transitions and explicit-choice protection;
- DOM/model tests for status/actions and removal of Form 4 editing;
- E2E correctness on a real GPU: first visit finishes before unlock, result persists,
  explicit choices survive rerun, main and pause surfaces share live settings, and
  diagnostics contain the adapter/check record;
- capture-only first-run and recovery screens;
- focused reference-GPU and nexus measurements, followed by `npm run verify` through
  `remote-run` and the focused E2E set.
