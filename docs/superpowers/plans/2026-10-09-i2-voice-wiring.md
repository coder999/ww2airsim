# I2 voice wiring, plus gear and flap sounds — plan

Mark, 2026-10-09: "wire in the gear cycle and flaps cycle. let's do the voice lines now too ... the squelch should be heard before and after the voice. go ahead and work in a worktree and go for it."

- **Branch:** `i2-voice-wiring`, worktree `../ww2airsim-i2`.
- **Viewing checkpoint:** the final product only (he said "go for it"). The run is unattended until then.
- **Tracks:** MASTER_PLAN Track I (I2 voice, I3 recorded effects).

## 1. Gear and flaps

`gear_cycle` and `flaps_cycle` are already in `AUDIO_ASSETS` at `cueGain` 0.35.

- **When it plays:** each clip plays once, when its device **starts** to travel, up or down. `AudioInputs` gains `gearFraction` and `flapFraction`.
- **Edge rule:** the same rule the bomb-bay door motor uses (`doorsMovedTick`, C2). "Moving" means the fraction changed within `MOTOR_HOLD_TICKS`. The cue fires on the first moving frame after a still one.
- **Why not "fraction changed this frame":** a render frame that ran no fixed step would read as stopped, and the next frame would re-cue.
- **Reversing mid-travel:** this does not re-cue, because the device never stops.
- **Replay:** `prime` silences scrubs, as it does for every cue.

## 2. Radio lines

### What triggers a line

- **Mission messages:** a line plays when the **HUD radio line changes** to a new message (`missionHud.text().radio`). The voice follows exactly what the player reads, including its pacing (one message per 5 s) and its freeze under pause and debriefs.
- **Text to clip:** a table in `src/audio/radio.ts` maps the exact message text to a clip stem.
  - A message that maps to `null` is deliberately silent, e.g. `No wave-offs: failed`, which lands on the same frame as the wave-off call (the prompt sheet's reuse map).
  - Text that is not in the table at all is silent.
- **Paddles:** the LSO's `PaddlesCue` (the badge) is voiced on each **change** of cue. Each cue rotates through its 2 or 3 takes.
  - Corrections (high, low, fast, slow, roger) are dropped while another transmission is on the air, because a stale correction is wrong.
  - At most one correction plays every 2.5 s.
  - `cut` and `wave-off` **preempt** whatever is playing.
- **One transmission at a time.** A mission line that arrives while the radio is busy waits for it to finish.
- **Live only.** Nothing plays in replay, behind the title, while paused, or with a debrief up. These are the HUD's own gates, plus `replay === null`.

### What a transmission sounds like

- **Shape:** squelch at 0 s, the voice at **0.22 s**, and squelch again when the voice ends. Measured: `radio_squelch.wav` is a 0.2 s noise burst followed by silence, so the voice starts as the burst dies.
- **Mix:** all three parts go through the radio bus, which applies band-pass, soft clip and the cabin preset.

### Language and loading

- **Language** comes from the player's side (`sideOf`): `axis` is Japanese, everything else US English (CONTEXT.md, "Voice").
- **Loading:** the 34 lines of that language load **on first use**, not at boot. They total 16 MB for both languages, and `system.ts` loads all of `AUDIO_ASSETS` at boot.
- **Not yet decoded:** a line that hasn't decoded yet is skipped, which is the same silence-beats-failure rule as every clip.

### Code shape

- **`src/audio/radio.ts` (pure):**
  - the line tables;
  - `voiceLanguageFor`;
  - `nextRadio(memory, inputs)`, which returns the transmission to start, if any. Its memory holds the last message seen, the last paddles cue, the busy-until time, the correction cooldown and the take rotation.
- **`system.ts`:**
  - `updateRadio({ message, paddles, language })` loads the language's lines, runs the reducer and schedules the three parts.
  - The clock is the backend's audio time.
- **`backend.ts` / `webAudio.ts`:** new verbs `now()`, `duration(id)`, `playRadio(parts)` (each part delayed from now) and `stopRadio()`. Voice ids are `radio_..._us|ja` strings beside `ClipId`.
- **`main.ts`:** one call per live, unpaused frame, after `missionHud.update`.

### Content fix found while mapping

The Dulag takeoff message now says "Dulag strip is **nineteen miles** south" (imperial). The US recording still says "thirty kilometers".

- **US:** I regenerate it in Clyde and correct the prompt sheet.
- **Japanese:** it keeps 三十キロ, the period-correct unit for a Japanese controller. On-screen text stays English.

## 3. Tests

Per docs/testing.md, Philosophy.

- **`tests/audio/radio.test.ts`:**
  - **Enrolled from `content/scenarios`:** every scenario `message` action has a table entry, voiced or deliberately `null`, so an edited message cannot silently lose its voice. Every voiced stem names a file in `content/audio/voice/` for both languages. All 34 lines are reachable from some trigger.
  - **Reducer behavior:**
    - one transmission at a time;
    - mission lines queue;
    - stale corrections drop;
    - cut and wave-off preempt;
    - takes rotate;
    - a restart (message log shrinking) resets it.
- **`tests/audio/system.test.ts` (the fake backend):** a mission line schedules squelch, voice and squelch at 0, 0.22 and 0.22 + the voice's duration on the radio bus, and Japanese loads only `_ja` files.
- **`tests/audio/cues.test.ts`:** gear and flaps cue once per travel start, not per frame, and not again on reversal.

Each new test is seen to fail once against the fault it guards.

## 4. Not in scope

- Radio static bed (I1).
- Speaker-label variations.
- Anything for messages the sheet has no line for, such as "Raid 1 of 2" or the dev scenarios. Those stay silent.
