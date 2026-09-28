# Instant Replay: design

Dated 2026-09-27. Requirements are Mark's, given in a brainstorming session the same day. Depends on `2026-09-27-orbit-camera-design.md` (the orbit offset, mouse input, and cameras over any entity) and is built after it.

## 1. Mark's requirements

| # | Requirement (Mark, 2026-09-27) | Where it is met |
| --- | --- | --- |
| 1 | Play back the last 5–10 seconds from a good viewpoint, interactive if desired. | §3, §5 |
| 2 | Pause, rewind, and play at 3×, 1× and 0.5×. | §6 |
| 3 | Triggered automatically after a crash or death: after the explosion/splash, **before** the debrief. A designated key skips to the debrief. | §4 |
| 4 | Triggered manually from the pause screen. | §4 |
| 5 | The automatic camera depends on what happened: flyby for a crash into ground or water, both planes framed for a shoot-down (Mark's choice, option C). | §5 |
| 6 | The automatic replay plays once and goes to the debrief. The debrief offers "Watch replay" to play it again. | §4 |
| 7 | Sound is replayed as it happened, following the replay speed (option A). | §7 |
| 8 | Pre-canned camera buttons on the replay screen, including a Manual camera. | §5 |
| 9 | Manual is a free-standing camera; the orbit covers "tethered". The orbit's automatic circling can be turned off. | §5 |
| 10 | Record game states (approach 1); keep input-log re-simulation (approach 2) as the fallback if 1 uses too much memory or has another drawback. | §3, §9 |

## 2. Rulings

| ID | Ruling | Why | Cost if reversed |
| --- | --- | --- | --- |
| IR-1 | Replay draws **recorded `World` states** through the live render path. It never re-simulates. | The sim is immutable (`advance` returns a new world, `src/sim/loop.ts`) and fixed at 60 Hz, so a replay is a list of references. Rewind is choosing an earlier one. Nothing can diverge from what happened. | See §9, the fallback. |
| IR-2 | The recording is **the last 10 s** (600 ticks), per tick. | Mark's "5–10 s", taking the top of the range. | Longer costs memory linearly (§9 limit). |
| IR-3 | A replay is **watch-only**. It never writes to the live `FrameState` or `World`. After a manual replay the live game is exactly as it was, still paused. | The live frame must not know a replay happened; that is what makes "back where you were" true by construction. | — |
| IR-4 | Scoring stays at impact, as today. Skipping or watching changes nothing banked. | `bankMissionResult` already runs at impact (main.ts). | — |
| IR-5 | The replay screen **owns the keyboard** while up: flight and assist bindings are suppressed. | R, L, Q, WASD, Space and the arrows are all flight or assist keys (`bindings.ts`). Inside a replay they mean replay controls (§6). | Without it, stepping a replay would toggle the stall limiter (L) or mute (Q). |
| IR-6 | Manual replay is **K** while paused, not R. | R is already `toggleAutoRudder`; K is unbound. | — |
| IR-7 | Manual and the Spin toggle exist **only in replays**. Live flight has only the orbit camera (spin off) and cockpit. | A free camera in live flight leaves nobody flying the plane; a circling camera while flying is disorienting. | — |

## 3. Architecture

Three units, each testable on its own.

**Recorder** (`src/replay/recorder.ts`). A ring buffer of the last 600 `World` references, pushed once per advanced tick from the frame loop (a paused or held frame pushes nothing, since the tick did not move). Operations: `push(world)`, `snapshot()` (returns an immutable `Recording` of what is held now; recording carries on whenever the world advances again, so a landing's Continue keeps one continuous buffer), `clear()`. It is cleared at every site that resets the flight: `resetFlightUi` (Restart, New game, Return to title).

**After the last tick.** After an impact or destruction the live world stops advancing (`advance` is fed zero elapsed time while the debrief is pending), and the fireball, splash and ocean keep moving because they run on render-side clocks (`fxSystem.step`, `postImpactOceanSeconds`). The recording therefore ends at the impact tick, and a replay's timeline may run past its last tick: there the world is held at the last recorded state while effects and the sky clock keep running. That is exactly what was seen live.

**Player** (`src/replay/player.ts`). A pure state machine: `{ recording, t (seconds into it), speed ∈ {0.5, 1, 3}, playing, camera, cameraParams }`, with `step(state, frameMs, input) → state`. The rendered world at time `t` is the recorded pair either side of `t`, interpolated exactly as the live renderer interpolates between ticks (`src/sim/interpolate.ts`). It stops at both ends: at the end it either finishes (automatic, and Watch replay) or holds (manual, paused), per §4.

**Cameras** (`src/render/cameras/`). One function per camera: `(world, params, surfaceHeight) → EyeTransform`. The orbit and cockpit functions are the orbit spec's, reused unchanged. The live game uses the same two.

**Wiring (`main.ts`).** A `replay: PlayerState | null` beside `frame`. While it is non-null:
- the renderer draws `player.worldAt(t)` with the camera's eye instead of `frame`
- the live `frame` is held (not advanced)
- effects and audio are driven from the replayed world (§7)
- the flight HUD is hidden, the replay bar is shown

## 4. When replay runs

**After a crash or shoot-down:**

1. Impact. Scoring banks (unchanged). The world stops advancing, so the recording's last tick is the impact.
2. The existing `DEBRIEF_DELAY_MS` (3 s) hold plays the fireball or splash live.
3. The automatic replay: t from impact − 8.0 s to impact + 1.5 s (the last 1.5 s past the final tick, per §3's "After the last tick"), camera Auto, speed 1×, playing. Esc skips.
4. The debrief, with a new **Watch replay** button. It plays the same span again on Auto and returns to the debrief at the end or on Esc.

`pendingDebrief` (main.ts) becomes the hand-off point: when its countdown ends it starts the replay, and the replay's end shows the debrief.

**Landing debriefs:** Watch replay is offered (a snapshot taken when the debrief is raised); nothing plays automatically. Continue resumes the flight and the recording.

**Manual:** while paused (Esc), **K** starts a replay of the whole recording, t = 0 to the live moment, camera Orbit (spin on), playing. It is offered only once at least 3 s have been recorded. At the end it **holds on the last frame**. Esc returns to the live game, which is still paused (IR-3). Recording resumes when the game is unpaused.

Watch replay is absent when the recording is empty or was cleared (Restart, New game, Return to title), so it can never show a previous flight.

## 5. Cameras

| Button | Key | Behavior |
| --- | --- | --- |
| **Auto** | 4 | Crash into ground or water → Flyby. Shoot-down (`destroyedAt` with an attacker present in the recording) → Target. Otherwise → Orbit. Chosen once at replay start. |
| **Orbit** | 5 | The orbit camera, spin on at 12°/s. A drag or wheel turns spin off. **O** / the Spin button toggles it. |
| **Flyby** | 6 | A fixed world point, chosen at replay start: along the player's velocity from 3 s before the event, projected 2 s ahead, offset 25 m to the side and 8 m up, clamped above the surface. It turns to keep the player in frame. |
| **Target** | 7 | Over the player's shoulder, framing the player and the attacker (a shoot-down) or the last-fired-at aircraft. Greyed out when there is no such aircraft in the recording. |
| **Cockpit** | 8 | The cockpit view as flown. The panel shows, since it is part of that view. |
| **Manual** | 9 | Free camera. WASD to move, Q/E down/up, mouse drag to look, wheel sets move speed (5–200 m/s). Starts at the previous camera's eye. **L** / the Lock button: stay put and turn to keep the player in frame (tripod). |

**C** cycles through them in the table order. Switching from Auto, Flyby or Target to Orbit by dragging starts the orbit from the current eye, so taking over never jumps. Every camera clamps above the surface (orbit spec OC-3).

## 6. Controls and screen

| Control | Key | Button |
| --- | --- | --- |
| Play / pause | Space | ▶ / ❚❚ |
| Step back / forward | ← / → (1 s; with Shift, one tick) | ◀◀ / ▶▶ |
| Speed | 1 / 2 / 3 = 0.5× / 1× / 3× | three buttons |
| Scrub | — | drag the timeline |
| Camera | C, 4–9 | six buttons |
| Spin / Lock | O / L | shown for Orbit / Manual only |
| Skip / exit | Esc | Skip |

Screen: a **REPLAY** label in the top corner, and a bottom bar with the timeline (event marker at impact), the transport buttons, speed, cameras and Skip. The flight HUD is hidden during replay. The bar follows the existing DOM UI pattern (a pure label/model function the Node suite asserts on, thin DOM under it, as `pauseBadge.ts`).

## 7. Effects, sound, sky

**Effects.** `nextFxEvents` derives triggers from world changes, and the fx system is seeded (`createFxSystem`, "exactly nine draws per particle… so a seed replays"). Playing forward, the replayed worlds drive `fxSystem.step` at `frameMs × speed / 1000`. On a backward jump or a scrub: `fxSystem.clear()`, then re-derive and re-step from recording start to `t` on the CPU, without drawing. Budget: a full 10 s re-run must take under 50 ms on nexus, measured in Tier 2. The fx seed is recorded with the replay so the re-run matches.

**Sound.** `nextAudio` (`src/audio/cues.ts`) is already driven by changes in the world and treats a tick moving backwards as a restart. During a replay the live audio is paused and a second cue memory follows the replayed world. Speed changes the engine loop's playback rate and one-shot pitch; `AudioBackend.playOnce` gains a `rate` argument, the one backend change. A jump primes the cue memory from the target state **silently**, so a scrub cannot fire every cue it skipped over. Paused means silent. Exiting restores the live audio exactly as it was.

**Sky.** `skyTimeS` (main.ts) is `tick × DT + accumulatorSeconds + postImpactOceanSeconds`. In a replay the first two come from the recorded world and the third is `max(0, t − last tick's time)`, so clouds and ocean match the moment. Cloud temporal history resets on every jump and camera switch (`shouldResetHistory`'s eye-jump path, or forced).

## 8. Testing

**Tier 1 (no browser):**
- Recorder: holds exactly 600, drops the oldest, pushes nothing on held frames (so it ends at the impact tick), keeps one continuous buffer across a landing Continue, is cleared at each `resetFlightUi` site, never holds a previous flight's world.
- Past the last tick: the world is held at the last state while the effects step and the sky clock advances.
- Exactness: run a scripted flight live to tick N; the recording's world at N is the identical object (`===`) the live frame had.
- Player: speeds, pause, step (1 s and one tick), scrub, clamping at both ends, finish vs. hold per §4.
- Effects: jumping to `t` gives the same particle state as playing from 0 to `t` (seeded).
- Sound: a scrub over an explosion fires nothing; playing through it fires it once; 0.5× halves the pitch; exit restores the live cue memory.
- Sequence: impact → 3 s hold → replay → debrief; Esc skips to the debrief; banking happens exactly once on both paths; Watch replay returns to the debrief; manual replay returns to the paused live frame unchanged (`===`).
- Keys: during replay, L/R/Q/WASD toggle no assist and move no control (IR-5). K while unpaused does nothing.
- Cameras: Auto's choice for crash, shoot-down, and neither. Flyby placed ahead of the path; the player passes through its view. Target greyed out with no attacker. Manual starts at the previous eye. No camera goes below the surface.
- **Memory limit (§9):** record the busiest shipped scenario for 10 s and measure the retained size. Fails above the limit.

**Tier 2 (browser):** a scripted crash into the sea plays the replay and raises the debrief; one screenshot per camera at a fixed t; playback frame time no worse than live; the 50 ms fx re-run budget.

**Mark:** one look on `ww2airsim.windomlane.org`, confirmed up with `curl` before asking.

## 9. Memory limit and the fallback

**Limit: 64 MB retained** for a 10 s recording, measured by the Tier 1 check above (heap delta with the recording held vs. released, after forced GC under `node --expose-gc`). The first implementation task measures it before anything else is built on the recorder.

- **Over the limit, first step:** record every 2nd tick (300 states) and interpolate over 1/30 s for display. That halves the memory; nothing else changes.
- **Still over, or another drawback found** (e.g. mutable sharing between recorded worlds breaks exactness): switch to **input-log re-simulation**. Snapshot one `World` 10 s back, record the player's inputs each tick, and re-run `advance` to reach t. The master spec §3 already describes a replay as `(seed, input log)`. Keyframes every 2 s bound a rewind's re-run to at most 120 ticks. Only the recorder and the player's `worldAt` change; the cameras, screen, effects and sound are untouched.

## 10. Out of scope

Bomb cam (the picture-in-picture window following ordnance): the cameras here already accept any entity, so it later becomes one more camera plus a second render view. A cinematic mode that cuts between cameras. Saving or sharing replays. Replays longer than 10 s.
