# Audio foundation handoff (2026-09-29)

First sub-project of the audio expansion
(`docs/superpowers/specs/2026-09-29-audio-expansion-design.md`). Unattended run in
worktree `/home/mark/projects/ww2airsim-worktrees/audio-foundation`, branch
`worktree-audio-foundation`. **Not merged into `main`, not deployed.** Master spec
§15 (row 15a) holds the status.

## Verification status (2026-09-29): `verify` is NOT green

`remote-run npm run verify` returned rc=1 (3 failed of 354 files, 4088 tests
passed). None of the failures is in audio code; how each was established:

- `tests/sim/soak.test.ts` fails deterministically (3 of 200 flights sank
  through the ground, e.g. seed 1337 by 4 m). It reproduced on a ryzen re-run and
  on nexus. This branch has no `src/sim` diff. **Not checked on `main`.**
- `tests/architecture/boundary.test.ts` and `tests/render/skyLoad.test.ts` hit
  load timeouts under shared ryzen load and passed when re-run alone.
- Tier 2 `tests/e2e/audio.spec.ts` (local nexus 680M): 4 passed, 1 failed,
  1 skipped. The failure, "going into the sea fires ONE cue" (cuesFired 2),
  reproduced identically on a detached worktree at `ad1fbcc`, the commit before
  the audio work.
- The three older Tier 2 tests still carry a stale "KeyP unbound" comment; KeyP
  is now `toggleMissionMap`. The new test uses KeyY.

## What shipped

- **Bus graph** (`src/audio/webAudio.ts`, `src/audio/mix.ts`): engine, sfx and
  ambient buses feed a world stage (lowpass, gain); a radio bus with a bandpass
  (highpass plus lowpass) and distortion sits beside it.
- **Named layers**: `LAYERS` rows and `driveLayer` turn a per-frame drive value into
  gain and rate for a named looping clip. The engine is now the `engine` layer.
- **Cabin mix**: `system.setView` (wired in `main.ts`) selects a `cockpit` or `chase`
  preset and crossfades to it. Chase is the previous sound; cockpit is a touch duller
  (world lowpass 9 kHz).
- **Positioned one-shots**: `playAt(clip, position, rate)` and `setListener(pose)` on
  the backend seam. The snapshot gained `layers`, `view` and `spatialPlayed`.
- **Tier 2**: `tests/e2e/audio.spec.ts` asserts the engine layer exists and that
  cycling the camera reaches both cabin presets with nothing failed.

## Not built, and where it lands

- Radio squelch and static: sub-project 4.
- Listener wiring to the camera, and Doppler: sub-project 5. `setListener` exists
  but nothing calls it per frame yet.
- Per-bus snapshot fields were not added (bus membership is asserted in the Tier 1 fake,
  tests/audio/buses.test.ts); they would land with sub-project 2 if Tier 2 needs them.

## Trap list

- **Cabin presets are mild guesses**, as are the `ambient` and `radio` bus gains.
  They were tuned by reasoning, not by ear; Mark's listening below is the first check.
- **Deliberate deviation: the engine loop node now starts at gain 0 instead of 1.**
  This removes a start blip; the first `update` ramps it up.
- **Deliberate deviation: every loop gets a 20 kHz per-layer lowpass, held open**
  (`FILTER_OPEN_HZ`), so later layers can close it without restructuring the graph.
  At 20 kHz it is inaudible.
- The radio soft-clip curve tanh(2x)/tanh(2) has small-signal gain of about 2.07 (+6.3 dB) and
  nothing uses the radio bus yet, so the sub-project 4 gain budget must account for it.
- Any new `LAYERS` row needs its clip in `AUDIO_ASSETS` and a budget line.

## Mark's listening checkpoint (final product only; unattended, so not yet done)

Host: `https://ww2airsim.windomlane.org`. First
`curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/` must
print `200`. That host serves nexus's dev server off the **served copy**, which is on
`main`, so this branch must be checked out there, or a dev server started from the
worktree (`npm run dev:lan` in the worktree; the primary server must not be
running on the port). Nothing here started or changed the served copy.

Fly with the engine at several throttles in chase, press `C` to reach cockpit and
back, and confirm:

1. Gunfire sounds as before in chase; the chase engine is 3 dB quieter than before.
2. Cockpit has a louder, closer engine (+3 dB) and quieter effects (-3 dB), and chase's engine is 3 dB quieter than the original sound (engineTrim 0.7), for a measured 5 dB engine step between views (master output, full throttle, 2026-09-29: chase -22.3 dB RMS, cockpit -16.9). At +3 dB alone the step measured 2.4 dB and was not heard. A lowpass alone was inaudible: measured 2026-09-29, the propeller clip has 0.09% of its energy above 9 kHz and 90% below 163 Hz, so Mark heard no engine difference between views on the first build. Cockpit trims are guesses.
3. The switch crossfades without a click.
