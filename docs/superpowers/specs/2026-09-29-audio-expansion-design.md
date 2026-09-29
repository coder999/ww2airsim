# Audio expansion — design

Extends `2026-09-18-audio-design.md` (Plan 15), which built one engine loop and
six one-shot cues. That document's constraints still hold: audio decisions are
a **pure reducer over state** with edge memory (`src/audio/cues.ts`), the
platform sits behind a narrow `AudioBackend` seam, and tests drive the
production wiring through a recording fake. Read its §2, §6 and §7 first.

Decisions below were made with Mark on 2026-09-29.

## 1. Goal and scope

Turn a nearly silent sim into one that gives feedback and atmosphere: aircraft
mechanics, environment, carrier operations, radio and Paddles voice, and
spatialized AI aircraft. Scope is the full set ("everything"), delivered as six
sub-projects in the order in §3, each with its own plan and build cycle.

Not in scope: music, a catapult (the game has none), a new access path to
Adobe Firefly (see §7).

## 2. Decisions

| Question | Decision |
| --- | --- |
| Sim-to-audio interface | Extend the state-derived reducer (`AudioInputs` + `AudioMemory`). No sim event queue in the foundation, because replay `prime`/`restore` depends on edge memory. |
| Engine sound variety | Four engine families, chosen per aircraft by data (`engineSound` key in the aircraft JSON), not one sound per airplane. |
| Cockpit vs chase | Different mixes: a `cabin` stage crossfades lowpass/gain presets between views. Same assets. |
| Paddles voice | Pre-rendered TTS lines through a shared radio filter chain. Not runtime `speechSynthesis`. Visual badge stays. |
| Asset sourcing | Firefly for effects (Mark generates by hand), a separate TTS tool for voice, code synthesis for simple mechanical sounds. |
| Firefly automation | Not required. Optional pilot via a logged-in browser session only with Mark's explicit go-ahead. Adobe's Run-Workflow MCP needs enterprise credentials and documents image/video workflows only, so it is not used. |

## 3. Sub-projects and order

1. **Foundation** (first, everything depends on it)
2. **Aircraft sounds**, 3. **Environment and carrier**, 4. **Radio, Paddles and chatter** (any order after 1)
5. **Spatial AI audio** (after 1; benefits from 2's engine families)
6. **Asset production** (runs alongside all of them)

## 4. Foundation (sub-project 1)

The `AudioBackend` seam grows from six verbs to a bus graph:

- Buses: `engine`, `sfx`, `ambient`, `radio` → `cabin` stage (lowpass + gain,
  cockpit/chase presets, crossfaded on view change) → master.
- **Named layered loops.** Each loop has independent gain, playback rate and
  optional filter cutoff. The engine, wind, sea and rumble are all this one
  primitive. Replaces the single hard-wired engine loop.
- **One-shots take an optional 3D position** so sub-project 5 is an addition,
  not a rewrite.
- The `radio` bus owns the bandpass/distortion/squelch chain.
- Vocabulary stays verbs, not Web Audio types, so the fake remains honest.
- Instant-replay rate scaling (design §7 of Plan 15) must apply to every new
  loop and one-shot, and replay scrub must remain silent (`prime`).
- `AudioSnapshot` gains bus and layer fields so Tier 2 can confirm layers start.

## 5. Sub-project designs

### 5.1 Aircraft sounds

- **Engine families:** `radial-small` (Wildcat, Zero, Oscar, Val), `radial-big`
  (Hellcat, Corsair, Frank), `multi-heavy` (B-17, B-29, Betty, Sally, two or
  more detuned copies for beating), `allison-v12` (P-38). Each family defines
  loop, rate range, gain curve and a blade-pass layer.
- **RPM is derived**, not simulated: throttle plus a small airspeed term. A
  dead-engine input drops to a sputter clip, then silence.
- **Wind:** shared synthesized noise loop, gain and lowpass follow airspeed.
- **Gear and flaps:** a motor loop while `gearFraction`/`flapFraction` is
  between 0 and 1; a lock clunk on the edge reaching 0 or 1. Synthesized.
- **Stall/structural:** buffet and warning buzz from a stall margin derived
  from airspeed against the stall speed the sim already computes; over-speed
  creak the same way.
- **Damage:** hit-taken impact one-shot (Firefly), engine sputter when damaged.

### 5.2 Environment and carrier

- **Sea:** wave loop with gain rising as height above water falls (about
  150 m to 10 m) plus a low-altitude hiss; only over water surface.
- **Wheel rumble:** looping while `onGround`, gated by ground speed, with
  runway/grass/deck presets keyed off `ContactSurface`.
- **Deck ambience:** ship-engine rumble and wind-over-deck, faded by proximity
  to the deck.
- **Wire and hook:** `arrested` false→true fires a wire-catch one-shot; a
  hook-extend clunk fires on `hookDown` using the gear edge pattern.

### 5.3 Radio, Paddles and chatter

- One radio chain: bandpass about 400 Hz–3.2 kHz, mild distortion, faint
  static bed, squelch click at start and end. Chase view adds a distance lowpass.
- **Paddles:** the seven `PaddlesCue` values map to about 15 pre-rendered TTS
  lines, 2–3 variants per cue, rotated.
- **Arbitration** lives in the pure reducer: cooldown per cue, one voice at a
  time, wave-off and cut preempt. Intervals are tuning constants set by flying.
- **Chatter** is the one place needing a small event channel (mission/AI
  events with no player-state edge). The list of usable events is
  **unverified**: confirm against the mission engine before committing to it.
  Only the pure `PassEvent` (`trapped`/`missed`) was seen in the code so far.

### 5.4 Spatial AI audio

- Listener is the camera; each nearby AI aircraft is a positioned source using
  its family loop. World state each frame means replay scrub needs no special
  handling.
- **Doppler is computed by hand** (`playbackRate *= 343 / (343 - radialSpeed)`,
  smoothed), because the Web Audio panner no longer does it.
- Cap on live sources (start with 6 nearest); fade at the cutoff.
- Distant gunfire and explosions are positioned one-shots delayed by
  distance / 343 m/s, low volume, lowpassed.
- Player engine and cockpit sounds stay non-positional.

## 6. Assets

- **Firefly (about 10):** four engine loops, engine sputter/death, hit-taken
  impact, wave/surf loop, carrier deck ambience, wire catch, optional distant
  flak/gunfire.
- **TTS (about 25–35 lines):** about 15 Paddles lines, 10–20 chatter lines if
  chatter is included.
- **Synthesized:** wind, gear/flap motors, lock/hook clunks, wheel rumble ×3,
  stall buffet/buzz, over-speed creak, radio squelch/static.
- Deliverables to Mark: a Firefly prompt sheet (prompt, duration, loop or
  one-shot, what to avoid) and a TTS voice script.
- Each new file gets a `content/audio/NOTICE.md` provenance line and a
  measured `peakFullScale` in `src/audio/assets.ts`.

## 7. Firefly access

No Firefly tool is configured in this environment. Default workflow: Claude
writes the prompt sheet, Mark generates clips in the Firefly web app and drops
WAVs in `content/audio/`. An optional pilot (2–3 clips) through a
logged-in browser session is possible using the login-once session pattern,
but: it spends Mark's generative credits, Adobe's terms on automating the web
app are **unchecked**, the UI is fragile, and it is a new access path, so it
needs Mark's explicit go-ahead first.

## 8. Testing

- Pure reducer tests: every new edge cue fires once, and replay scrubbing
  fires none.
- Wiring tests through the recording fake backend, against the real
  `createAudioSystem` path (Plan 15 §7's lesson).
- Gain budget: measured peaks, bus gains and master summed for the worst case
  (engine + wind + gunfire + radio at once) stay below clipping.
- Asset table checks: bytes and peaks asserted; the dist build test confirms
  every file lands on disk.
- Tier 2 e2e reads the extended snapshot to confirm layers start.
- **Not testable:** how it sounds. Doppler smoothing, radio filter, wave levels
  and engine timbres need Mark to fly it and listen. Their constants are
  reasoned guesses until then, the same standing as the existing gains.

## 9. Open questions

1. Which chatter events exist in the mission/AI code, and which lines and
   speaker roles are wanted (wingman, carrier control)?
2. Which TTS tool does Mark have access to?
3. Chase-view listener placement: camera or aircraft?
4. Indoor cases (hangar, closed canopy) for wind/wave loops: mix preset only,
   no new assets.
5. Should the optional Firefly browser pilot happen at all?
