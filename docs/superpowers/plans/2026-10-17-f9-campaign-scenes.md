# F9 in-engine campaign scenes and director mode: plan (2026-10-17)

MASTER_PLAN Track F9 (plan 16 of the 22 in the
[F3 dependency table](../specs/2026-10-14-leyte-campaign-definition.md#11-dependency-checked-plan-count)).
**Status: built 2026-10-17 on branch `f9-scenes`, with one scope change (below); see `docs/handoff/2026-10-17-f9-scenes.md`.** Original status: plan only (Mark added the Codex plugin and restarted the session).

> **Scope change (Mark, 2026-10-17, during the build).** The chapter missions A1-J6 do not exist until F10, so Task 7 (author fourteen scenes) became two demo scenes, and the gate "all fourteen approved" moves to F10. Mark also ruled the camera needs no FOV and no roll (scenes never use the cockpit or HUD view), so keyframes carry neither and Task 4 shrank to the camera applier. The scenario `scene:` block of the Design was dropped: the scene file already carries `durationS` and `handoff`, and the world builder is untouched, which makes "a world with no scene is byte-identical" true by construction. F5A-F5C, F7 and F8 are merged on `main`; F9 consumes
`scenesSeen` (F5A) and the canonical sites (F8). Grilled with Mark 2026-10-17; decisions below are binding.

## Header

- **Branch:** worktree `~/projects/ww2airsim-worktrees/f9-scenes`, cut from `main` when building starts.
- **Run mode: unattended to the scene review** (Mark, 2026-10-17). He then reviews and approves all fourteen scenes in the game,
  adjusting any camera work in director mode (Task 6). F9's own gate requires that approval.
- **Delegation:** building will use Codex for some tasks once the plugin is installed (Mark, 2026-10-17); the split is decided
  at start. Tasks 1-5 touch shared sim and shell files (`loop.ts`, `main.ts`, mission step, recorder) and are the ones to keep
  with one agent at a time.
- **Heavy jobs:** `remote-run` on ryzen for the gate; budget specs under `hwlock ryzen-budget`, trees off and on, fresh vite,
  at least 6 interleaved loads, median. **Budget gates stay as written**; a red is documented with numbers, never tuned.
- **Size:** M in the master plan; this is on the large side of M (about 10 tasks, plus 14 authored scenes).

## Decisions (Mark, 2026-10-17)

| # | Decision |
| --- | --- |
| 1 | **A scene is the first N seconds of the mission's own scenario** (openings 10-20 s; the two victory scenes 45-60 s), with the player's airplane held or AI-flown and the **mission clock inert until handoff**. The mission's real start state is the state at handoff; F3's start positions and the F8 mission-fit checks are measured there. |
| 2 | **Skip runs the same N seconds headless**, so it lands in the identical state and writes the identical `scenesSeen`. F3: skipping changes no simulation state. |
| 3 | The scene file's **world source is an extensible union**. Only `mission` (the mission's own scenario) is built now. Later variants (a fresh world, or a mission world with edits) must not change the file format. |
| 4 | A scene file carries **camera keyframes (position, orientation, FOV; no roll)**, subtitle cues, the duration and the handoff. |
| 5 | **Scene-only orders** on top of the mission triggers: `message` (subtitle and radio), `order` (existing ship, vehicle and aircraft AI orders on named entities), `fx` (existing effect kinds only; no new effect art) and `spawn` (release a held group). All deterministic, all from existing sim primitives. |
| 6 | **Subtitles always; audio only from existing recorded voices.** A line with no voice stem is text-only (`RADIO_LINES` maps it to `null`). A new ElevenLabs run is a separate follow-up Mark approves. |
| 7 | **Openings play on the first launch of each chapter** (`scenesSeen`), always skippable, replayable from an HQ "Watch opening" action. **Victory scenes play once after the final debrief, before HQ shows the campaign won**, skippable and replayable from HQ. Banking always precedes a victory scene. |
| 8 | **Director mode (Dev only)** on the replay camera: pause a scene's world, fly a free camera, drop keyframes or record a flown path (sampled into keyframes), preview, save the scene JSON. |
| 9 | **Authoring:** I author a first pass of keyframes for all fourteen scenes from F3 section 6; Mark adjusts in director mode and approves all fourteen. |

## Findings that shaped this plan (verified 2026-10-17, main `6fd106bc`)

1. **The replay camera is narrower than hoped.** Instant replay stores world snapshots and plays them back (`src/replay/recorder.ts`,
   `view.ts`), and its six cameras read the recorded *player* aircraft. Only the **manual** camera (`ManualCamera`, `stepManual`,
   `lookAt`, `clampAbove`) is nearly standalone and can be lifted out. There is **no FOV control and no roll**: `CAMERA_VFOV_DEG = 60`
   is set at construction and updated only on resize, and `main.ts` lines near 1511, 3818 and 3851 plus the cockpit panel
   (`scene/panel.ts`) read it. A scene camera, a FOV channel and the keyframe format are new work.
2. **Headless pre-roll already exists as a pattern.** `verifyFlightRecord` (`src/flightRecorder/verify.ts`) advances the world with
   `advance(...)` per tick, injecting `requestBailout`, `orderWingmen` and similar between ticks. Skip reuses it.
3. **Mission triggers have no camera or order actions.** `TriggerObject {id, when, then[]}` supports `{at: seconds}` and
   `{spawn}` / `{message}` only (`src/sim/mission/schema.ts`, `step.ts`). Decision 5's vocabulary is therefore a scene-side layer, not
   an extension of the mission union (which is `.strict()`).
4. **Radio is keyed by exact message text** (`src/audio/radio.ts`, `RADIO_LINES`; a test requires every scenario message to have an
   entry). The subtitle is the HUD radio line (`src/render/mission/hud.ts`); there is no separate component. A missing voice file
   fails silently (the line is dropped after 6 s, text still shows). 38 Japanese takes exist.
5. **`scenesSeen: string[]` exists but nothing sets it** (`src/campaign/schema.ts:124`). F9 adds a `markSceneSeen` reducer
   (`revision + 1`); the field's shape does not change, so **no schema bump**. `session.bank()` already returns
   `victory`, unused by the shell (`src/render/campaignSession.ts:185`).
6. **Insertion points:** an opening goes after `onLaunch` and the briefing and before the flight (`bootHq.ts`, `titleScreen.ts`
   `beginSortie`); a victory scene goes after `bankScored` and the final debrief and before HQ (`main.ts` near the debrief return).
7. **No existing title or tutorial camera script** to reuse.

## Design

**Scene file.** `content/scenes/<id>.json`, zod-strict (`src/sim/scene/schema.ts`), URL helper in `src/render/content.ts`, copied to
`dist/` (guard in `tests/build/dist.test.ts`). Fields: `id`, `chapter`, `kind` (`opening` or `victory`), `durationS`,
`world: { source: 'mission', scenario }`, `camera: [{ t, position, yawDeg, pitchDeg, fovDeg, ease }]`, `cues: [{ t, order }]`
(orders per decision 5), and `handoff` (what the player's airplane does at N). Keyframes and cues are sorted by `t`.

**Pre-roll scenario block.** A scenario may carry `scene: { durationS, player: 'held' | 'ai' }`. During the pre-roll the mission
clock, objectives and radio are inert and the player's controls are locked; an airborne start (A2, A3, J3, A5, J2, J4) is AI-flown
by the existing assist/AI path until handoff. Everything else is the normal deterministic sim.

**Engine.** Pure `sceneAt(scene, t)` returns the interpolated camera (position lerp, orientation slerp, FOV, easing) and the due
cues. `runScene(world, scene, {render})` steps the sim at `DT`, applies due orders between ticks (like `verifyFlightRecord`), and
either drives the renderer (live) or does nothing visual (skip). Live and skip share one stepping function, so equality of the
final world checksum is a test, not a hope.

**Renderer.** A `sceneCamera` applies the eye and FOV, hides the HUD (reuse the replay `REPLAYING_CLASS`), shows subtitles through the
HUD radio line, and restores FOV 60 on exit. A small FOV hook keeps the systems that read `camera.fov` in step.

**State.** `markSceneSeen(campaign, sceneId)` returns a new Campaign (`revision + 1`), idempotent, and is the only thing a scene writes.
Skip and completion both call it once; a scene never writes progress.

**Director mode (Dev).** `?director=<sceneId>` pauses the scene's world at t=0, shows the free camera (lifted `ManualCamera`) with a
keyframe bar: drop key, delete key, scrub, play preview, record flown path, FOV slider, save. Save writes the scene JSON as a download
and copies it to the clipboard (nothing writes into `content/` from the browser); I commit it.

## Tasks

Each names its failing test first. Tasks 1-5 are sequential; 6 can run in parallel after 2; 7 after 1-6.

1. **Scene schema, loader, `scenesSeen` reducer.** Tests: a malformed scene fails; sorted keyframes; unknown order kinds rejected;
   `markSceneSeen` is idempotent, bumps `revision` once, and leaves progress and scores untouched; schema version unchanged.
2. **Pre-roll world and headless skip.** `scene` block in the scenario schema, mission clock inert, player held or AI-flown, skip loop
   shared with the live path. Tests: a world with no `scene` is byte-identical (golden recordings); skip and live end at the same
   `worldChecksum`; mutation: let the mission clock run in the pre-roll and the test fails.
3. **Scene engine and orders.** `sceneAt`, `message`, `order`, `fx`, `spawn`, applied between ticks. Tests: interpolation endpoints and
   easing; every order is deterministic across two runs; an order naming a missing entity fails the load, not the flight.
4. **Scene camera and FOV hook.** Lift the manual camera, add the FOV channel, restore on exit. Tests: FOV consumers read the scene FOV
   (cockpit panel, HUD projection) and 60 after; the camera is never below the surface clamp.
5. **Flow integration.** Opening after launch and the briefing; victory after the final debrief; HQ "Watch opening" and "Watch epilogue";
   Esc skips; first-launch-only via `scenesSeen`. Tests: skip and completion persist the same campaign (compare serialized); victory
   banks before it plays; a missing scene or asset fails safely and the flight proceeds; an E2E for the first launch, a skip and a replay.
6. **Director mode.** As above. Tests: the keyframe model (drop, delete, record-sampling) is pure and round-trips through the schema;
   an E2E opens `?director=A1` on a slot and saves a valid scene.
7. **Author the fourteen scenes.** From F3 section 6's table (durations, actors, action), using each mission's scenario, existing AI,
   and the orders vocabulary. Each cue line gets a `RADIO_LINES` entry (a stem where an existing voice fits, otherwise `null`). No
   actor or reusable model beyond F3 sections 7-8 and 13 (the lock says F9 may not add one without reopening F3). Test: every scene
   loads, runs headless to its handoff deterministically, and ends with its mission-fit start state still valid.
8. **Captures and budget.** A capture spec shoots each scene's keyframes for Mark's review; a budget spec for the heaviest scene (the
   A6/J6 finale populations, 24 airborne and 10 ships) on ryzen, trees off and on. Gates stay as written; a red is documented.
9. **Docs and closeout.** `docs/campaign-data.md` (scene contract), `MASTER_PLAN.md`, README, `docs/testing.md` Known gaps, the
   handoff with Tests updated / still valid / Known gaps, the full verify on ryzen gated on its exit status, then the closeout skill.

## Acceptance gate (F3 section 11 and MASTER_PLAN, restated)

| Gate item | How it is proven |
| --- | --- |
| skip and completion produce identical persisted state | Task 5 serialized-campaign comparison, plus Task 2 world checksum |
| missing assets or audio fail safely | Task 5 missing-scene and missing-voice cases; the flight still launches |
| save banking precedes victory playback | Task 5 ordering test |
| all fourteen scenes visually approved | Mark, in game, using director mode for any changes |

## Risks

- **FOV consumers.** The cockpit panel and HUD projections read the camera FOV; a missed one shows as a distorted cockpit during a scene.
  Task 4 enumerates them with a grep-based test.
- **AI-flown player during the pre-roll.** Airborne starts depend on the existing AI/assist path holding formation for N seconds; if it
  drifts, the handoff state differs from F3's start position. The mission-fit tests are re-run at handoff.
- **Pre-roll shifts mission timing.** The mission clock starts at handoff, so F3's "action begins within 7 minutes" is measured from
  handoff; openings sit outside the budget (F3 section 2).
- **Order determinism.** `order` and `fx` touch the sim between ticks. They must go through the same tick-boundary path as
  `orderWingmen`, never during a step, and be covered by the checksum test.
- **Scope.** Director mode is a keyframe tool, not a timeline editor: no tracks, curves or effects. Anything beyond that is out.
- **Budget.** A finale scene is the heaviest case; the gate is Mark's two-tier proposal in
  `docs/handoff/2026-10-16-budget-reevaluation.md`, which he has not yet ruled on. Not applied.
