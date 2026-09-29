# Audio foundation handoff (2026-09-29)

First sub-project of the audio expansion
(`docs/superpowers/specs/2026-09-29-audio-expansion-design.md`). Unattended run in
worktree `/home/mark/projects/ww2airsim-worktrees/audio-foundation`, branch
`worktree-audio-foundation`. **Not merged into `main`, not deployed.** Master spec
§15 (row 15a) holds the status.

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

## Trap list

- **Cabin presets are mild guesses**, as are the `ambient` and `radio` bus gains.
  They were tuned by reasoning, not by ear; Mark's listening below is the first check.
- **Deliberate deviation: the engine loop node now starts at gain 0 instead of 1.**
  This removes a start blip; the first `update` ramps it up.
- **Deliberate deviation: every loop gets a 20 kHz per-layer lowpass, held open**
  (`FILTER_OPEN_HZ`), so later layers can close it without restructuring the graph.
  At 20 kHz it is inaudible.
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

1. The engine and gunfire still sound as before in chase.
2. Cockpit is a touch duller.
3. The switch crossfades without a click.
