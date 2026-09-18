# Plan 15: Audio — design

Written 2026-09-18 from decisions Mark took in chat the same day and recorded
verbatim in [`docs/handoff/2026-09-18-plan13c-in-progress.md`](../../handoff/2026-09-18-plan13c-in-progress.md)
("Also agreed but not yet written: the audio subsystem"). That section is
authoritative for *what* is built; this document is the *how*, and re-opens
none of it.

Every number below was measured on **2026-09-18** against the six WAV files as
committed at `0812fea`, by parsing their RIFF chunks directly. The measurement
commands are in §11 so any of them can be re-run.

Master spec §15's table is the authoritative plan numbering; this work takes
the next free identity, **Plan 15**. Nothing has been renumbered.

---

## 1. What this builds

The game makes no sound today. There is no `src/audio/`, no `AudioContext`
anywhere in the tree, and no mention of audio in the master spec. Six WAV
files sit **untracked by any consumer at the repository root** and are shipped
by nothing.

This plan builds:

- a **continuous engine loop** whose gain and playback rate both follow
  `controls.throttle`, silent at zero throttle;
- **three one-shot cues** — ditching, destruction, touchdown;
- a **mute** key with a row in the `/` controls panel;
- an `AudioContext` that resumes on the first keypress, with **no play-screen
  UI** (standing project rule).

`bombs_away.wav` and `machinegun.wav` are carried through the asset pipeline
— shipped, gain-budgeted, byte-pinned — and **wired to nothing**. Plan 6
(combat) is their consumer.

### What it deliberately does not build

No 3D panning, no Doppler, no distance attenuation, no wind or airframe noise,
no stall horn, no gear/flap actuation sounds, no volume slider, no persistence
of the mute setting across reloads. Each of those is a real thing a flight sim
has; none of them is decided, and inventing one here would be the same class
of mistake as the watermark Codex added to the play screen on 2026-09-17.

---

## 2. The three constraints that shape everything else

**(a) `vitest` runs in `node`, not `jsdom`.** `vitest.config.ts` sets
`environment: 'node'`. There is no `AudioContext`, no `AudioBuffer`, no
`decodeAudioData` and no `AudioParam` in the test runner, and there will not
be — switching the whole suite to `jsdom` to test one subsystem would slow 150
existing test files down to buy a *stub* of Web Audio anyway, since jsdom does
not implement it either. §7 is the answer.

**(b) `content/` is the only directory the build ships.** `copyContent()` in
[`vite.config.ts`](../../../vite.config.ts) copies `content/` and nothing else,
minus `content/terrain/tiles/`. Verified 2026-09-18 by reading that file: the
plugin's single `cp` call is rooted at `resolve(config.root, 'content')`. A WAV
at the repository root is invisible to `vite build`; `tests/build/dist.test.ts`
would not catch it, because that test only looks for files it is told to look
for. **The six WAVs must move to `content/audio/`.**

**(c) A browser will not start audio without a user gesture.** Chromium's
autoplay policy leaves a freshly-constructed `AudioContext` in state
`'suspended'`. The project has a standing rule of no play-screen UI, so there
is no "click to start" button to hang the resume off. The gesture is therefore
the pilot's **first keypress**, taken in the `keydown` listener `main.ts`
already installs.

---

## 3. The assets, measured

All six are **48 kHz, 16-bit stereo PCM** (`fmt` tag 1), written by
`Lavf60.16.100` (ffmpeg), each carrying a 684-byte XMP packet with an Adobe
C2PA provenance URI. Durations are exact round numbers, which is consistent
with generated rather than recorded audio.

| File | Bytes | Frames | Duration | Peak sample | Peak (FS) |
| --- | --- | --- | --- | --- | --- |
| `propeller.wav` | 1,536,770 | 384,000 | 8.000 s | 28,416 | 0.8672 |
| `explosion.wav` | 749,570 | 187,200 | 3.900 s | 32,768 | 1.0000 |
| `water_crash.wav` | 749,570 | 187,200 | 3.900 s | 32,640 | 0.9961 |
| `landing_squeak.wav` | 192,770 | 48,000 | 1.000 s | 18,048 | 0.5508 |
| `bombs_away.wav` | 192,770 | 48,000 | 1.000 s | 27,520 | 0.8398 |
| `machinegun.wav` | 250,370 | 62,400 | 1.300 s | 32,768 | 1.0000 |

Total **3,671,820 bytes**. The six files are byte-distinct (SHA-256 over each
`data` chunk); the equal sizes within pairs are equal durations, not
duplicates.

None has leading silence — every onset is inside the first 50 ms — so no cue
needs a start offset.

Two of them (`explosion`, `machinegun`) touch full scale. That is what makes
§5's gain budget a constraint rather than a formality.

### 3.1 Two open items this raises, neither of them a blocker

1. **Provenance is not recorded anywhere.** [`ASSETS.md`](../../../ASSETS.md)
   opens with "Every bundled asset is recorded here **before** it is
   committed: source URL, author, and license", and its "Textures and audio"
   table is empty. These six arrived in `0812fea` ("Add files via upload") with
   no row. The repo is public and AGPL-3.0, and ASSETS.md names unverifiable
   asset provenance as the project's main legal exposure. The C2PA manifests
   point at `cai-manifests.adobe.com`, which indicates an Adobe generative
   tool, but a manifest URI is not a licence. **Mark has to say where these
   came from before they ship.** The plan stops at that step rather than
   inventing a row.
2. **3.5 MB of uncompressed PCM is 2.5× everything the build ships today**
   (terrain 703,306 + bathymetry 526,338 + land cover 253,532 ≈ 1.48 MB).
   Opus at 96 kbps would be roughly a tenth. Not done here: neither ffmpeg nor
   sox is installed on this machine (the same constraint that put the loop
   points in code), and a re-encode is a change to a committed binary, which
   is exactly what Mark ruled against for the loop. Recorded as a follow-up.

---

## 4. The engine loop

### 4.1 Loop points, measured not guessed

`propeller.wav` has **no fade at either end** — RMS runs 6,185 to 10,400 across
all eighty 100 ms windows, with no taper. So `loop = true` with the default
`loopStart = 0`, `loopEnd = duration` splices the last sample to the first, and
those differ by **10,941 LSB** summed over the two channels: an audible click
once every eight seconds.

Searching for a pair (start near 0.5 s, end near 7.5 s) that minimises both the
value step and the slope step gives:

| | Frame | Seconds |
| --- | --- | --- |
| `LOOP_START_FRAME` | 24,276 | 0.505750 |
| `LOOP_END_FRAME` | 361,360 | 7.528333… |
| Loop length | 337,084 | 7.022583… |

with **|Δ| = 64 LSB** across both channels (L: 64, R: 0) and a slope mismatch of
**exactly 0**. That is a **171× reduction** on the naive wrap, and 64/32768 =
0.0020 of full scale.

Note the loop points are *not* zero crossings — both are near −12,500, about
−0.38 FS. Continuity is what removes a click; "find a zero crossing" is a folk
rule that happens to imply continuity when both ends are near zero and is
neither necessary nor sufficient here.

These two constants live in `src/audio/mix.ts` as frame counts, divided by the
sample rate at the point of use, so the intent is legible and the seconds value
is derived rather than transcribed. `AudioBufferSourceNode.loopStart` and
`.loopEnd` are seconds and are converted to frames internally, so a rounding of
±1 frame is possible and harmless at a seam this close.

**Why not re-cut the WAV:** Mark's ruling, 2026-09-18 — neither ffmpeg nor sox
is installed here, and a loop point in code is reviewable in a way a re-cut
binary is not. §9's test makes the constants mechanically checkable against the
shipped file, which a re-cut binary would not be either.

### 4.2 Gain and playback rate

Both track `controls.throttle`, which is `[0, 1]` (`src/sim/flight/state.ts`)
and is already ramped over `THROTTLE_SECONDS = 2.0` by `controlsFromKeys`
(`src/input/keyboard.ts`) — except for the throttle cut, `M`, which zeroes the
lever in a single frame.

```
engineGainFor(t)         = 0                     for t <= 0 or non-finite
                         = ENGINE_GAIN_MAX * t    otherwise, t clamped to 1
enginePlaybackRateFor(t) = ENGINE_RATE_MIN + (ENGINE_RATE_MAX - ENGINE_RATE_MIN) * t
```

| Constant | Value |
| --- | --- |
| `ENGINE_GAIN_MAX` | 0.50 |
| `ENGINE_RATE_MIN` | 0.75 |
| `ENGINE_RATE_MAX` | 1.15 |
| `ENGINE_GLIDE_TAU_S` | 0.02 |

`engineGainFor(0)` is **exactly 0**, which is the whole of "silent at zero
throttle" — there is no idle floor and no special case, because a linear law
already reaches zero. The source node keeps playing at gain 0 rather than being
stopped and restarted: restarting an `AudioBufferSourceNode` is a new node
every time and a new attack transient every time, and a muted node costs
nothing measurable.

Gain linear in **amplitude** means −6 dB at half throttle, which reads as a
strong power change. The rate range is a modest ±a few semitones rather than
the real R-2800's 4.5:1 idle-to-takeoff RPM ratio, because `playbackRate` at
4.5 would destroy the sample. **These four numbers are guesses until somebody
flies them**, and carry exactly the standing this codebase already gives
`RAMP_SECONDS` (`src/input/keyboard.ts`) and the `DITCH_*` gates
(`src/sim/contact.ts`). Expect to tune them.

`ENGINE_GLIDE_TAU_S` is why a glide exists at all: the throttle cut takes the
lever 1 → 0 in one frame, and writing an `AudioParam` instantaneously at that
step is a click. Both parameters are written through `setTargetAtTime`, whose
time constant this is (≈ 60 ms to settle, well under one throttle-lever
sweep and far above a frame).

### 4.3 The engine stops when the flight does

`main.ts` already gates the propeller mesh's spin on `current.world.impact ===
null`, with the reason written out at the call site: `advance` freezes the
world but `nextFrameState` keeps producing controls, so an ungated spin leaves
the propeller turning at full speed on a wreck sitting in its own fireball.
The engine sound takes the same gate for the same reason, and the plan points
at that comment rather than repeating the argument.

---

## 5. The cues, and the gain budget

| Event | Clip | Source of truth |
| --- | --- | --- |
| `impact.kind === 'ditched'` | `water_crash` | `ContactKind`, `src/sim/contact.ts` |
| `impact.kind === 'destroyed'` | `explosion` | same |
| `onGround()` false → true | `landing_squeak` | `onGround`, `src/sim/ground.ts` |
| — (unwired) | `bombs_away`, `machinegun` | Plan 6 |

`ContactKind` is confirmed to be exactly `'ditched' | 'destroyed'`, and
`Impact.kind` carries it (`src/sim/loop.ts`). Both strings in the handoff are
correct as written.

### 5.1 Gain budget

`MASTER_GAIN = 0.80`. Per-clip cue gains, and the worst case each can make when
it lands on top of a full-throttle engine:

| Clip | Cue gain | Peak (FS) | `MASTER × (ENGINE_GAIN_MAX × 0.8672 + gain × peak)` |
| --- | --- | --- | --- |
| `explosion` | 0.60 | 1.0000 | 0.827 |
| `water_crash` | 0.70 | 0.9961 | 0.905 |
| `landing_squeak` | 1.00 | 0.5508 | 0.788 |
| `bombs_away` *(unwired)* | 0.60 | 0.8398 | 0.750 |
| `machinegun` *(unwired)* | 0.50 | 1.0000 | 0.747 |

Every row is under 1.0, so nothing clips and no compressor is needed. This is a
**mechanical check, not a claim** — §9 asserts it in Tier 1 against peaks read
out of the shipped files, so re-gaining a clip or replacing a file fails the
suite rather than distorting in somebody's speakers.

`landing_squeak` + engine is the only row that actually co-occurs in normal
flight; a landing is flown with power on. The two impact rows are budgeted
anyway, because the cue fires on the same frame the engine gate closes and the
gain glide takes ~60 ms to get there.

---

## 6. Where it plugs in, and which way the dependencies run

```
 main.ts ──► audioInputsFrom(frame) ──► AudioInputs (a plain value)
   │                                        │
   │                                        ▼
   └──────────────► audioSystem.update(inputs) ──► nextAudio(memory, inputs)
                            │                          (pure reducer)
                            ▼
                      AudioBackend  ◄── the ONLY seam Web Audio sits behind
                            ▲
              webAudio.ts (production)   fakeBackend.ts (tests)
```

| Module | Responsibility |
| --- | --- |
| `src/audio/assets.ts` | The clip table: id → path, exact byte count, measured peak, cue gain. One table, read by the loader, the gain budget, `dist.test.ts` and the asset test. |
| `src/audio/mix.ts` | Pure arithmetic: `engineGainFor`, `enginePlaybackRateFor`, the loop constants, `worstCaseAmplitude`. No I/O, no types from anywhere else. |
| `src/audio/cues.ts` | The pure reducer `nextAudio(memory, inputs)`. Owns every "fire once" edge. |
| `src/audio/backend.ts` | The `AudioBackend` interface. **Types only — no implementation.** |
| `src/audio/system.ts` | `createAudioSystem(backend)`: load, update, mute, resume. The wiring under test. |
| `src/audio/webAudio.ts` | The one file in the repository allowed to name `AudioContext`. |
| `src/render/audio.ts` | `audioInputsFrom(frame: FrameState): AudioInputs`. Lives in `render/` so `audio/` never sees a renderer type. |

### 6.1 `AudioInputs` — and why `onGround` is `boolean | null`

```ts
export type AudioInputs = {
  /** `Controls.throttle`, [0, 1]. */
  readonly throttle: number
  /** `world.impact === null` — the flight is still live. */
  readonly engineRunning: boolean
  /** `world.impact`, narrowed to what audio needs. */
  readonly impact: { readonly tick: number; readonly kind: ContactKind } | null
  /** `onGround(spec, aircraft, heightAt(terrain, x, z))`, or `null` when
   *  `world.terrain` is still null — i.e. "not known yet", not "airborne". */
  readonly onGround: boolean | null
}
```

That `null` is load-bearing, and it is the single most important detail in the
cue design. **The default spawn is a ground spawn** (`DEFAULT_SPAWN_IS_GROUND
= true`, `src/render/spawn.ts`): the airplane is parked on the Tacloban strip,
held at zero elapsed time until the heightfield arrives seconds later
(`FrameState.groundSpawn`). Seed the reducer's memory with `false` and the
first frame that has terrain is a `false → true` transition, so **every flight
would open with a landing squeak before the pilot touched a key**.

Modelling "no terrain" as `null` rather than `false` makes that a
non-transition by construction: a cue fires only between two *known* values, so
`null → true` is silence and `false → true` is a touchdown. No special case,
no "first frame" flag, no `groundSpawn` knowledge inside `src/audio/`.

`AudioInputs` is a plain structural type that mentions `ContactKind` and
nothing else from the tree. `src/audio/` therefore has **zero import edges to
`src/render/`**, including type-only ones — which matters because
`.dependency-cruiser.cjs` documents that a type-only import produces no edge at
all in this configuration, so a type edge would be a rule this repo's tooling
cannot see.

### 6.2 The reducer

```ts
export type AudioMemory = {
  readonly firedImpactTick: number | null
  readonly wasOnGround: boolean | null
}
export const NO_AUDIO_MEMORY: AudioMemory = { firedImpactTick: null, wasOnGround: null }

export type AudioFrame = {
  readonly memory: AudioMemory
  readonly cues: readonly CueId[]
  readonly engine: { readonly gain: number; readonly playbackRate: number }
}

export function nextAudio(prev: AudioMemory, inputs: AudioInputs): AudioFrame
```

Rules, each of which is a test in §9:

1. **One cue per impact.** `World.impact` is never overwritten once set
   (`src/sim/loop.ts`), and `update` runs 60+ times a second afterward, so the
   cue is gated on `firedImpactTick !== impact.tick` — exactly the
   `shownImpactTick` guard `main.ts` already uses for the debrief modal.
2. **The squeak needs two known values.** Fires only when
   `prev.wasOnGround === false && inputs.onGround === true`.
3. **A wreck does not squeak.** The squeak is additionally gated on
   `engineRunning`. A destroyed airplane is frozen at or below the ground, and
   whether `onGround`'s ±0.25 m tolerance happens to bracket it is not
   something the cue should depend on.
4. **A bounce squeaks twice.** Deliberate, not an oversight: `onGround` goes
   false on the bounce and true again on the second contact, and that is what
   happened.
5. **Engine is silent when the flight is over**, per §4.3.

Everything above is a pure function of two plain values. It is the part most
likely to be wrong and it needs no browser at all.

---

## 7. Testing without an `AudioContext` — the central design question

The temptation is to write pure functions for the arithmetic, test those, and
leave the Web Audio wiring untested. **This project has already been bitten by
exactly that**, twice, and one of the two is recorded in the handoff this
design comes from:

> The general lesson, for 13d and after: a pure function beside an I/O function
> gives a green suite that proves nothing about the I/O.
> — `docs/handoff/2026-09-18-plan13c-in-progress.md`, on `openSeaMask` crashing
> on every real tile with a fully green suite

and before it, Plan 3, where the whole assists layer was inert in the browser
while every assist test passed, because the tests called `applyAssists`
directly and nothing threaded it into `advance`.

So the design is **not** "pure core, untested shell". It is a seam placed as
close to the platform as it can go, with the production code *above* the seam
being the code under test.

### 7.1 Four layers, each with the strongest check available to it

**Layer 1 — pure arithmetic (`mix.ts`, `cues.ts`).** Plain vitest. Gains,
rates, the loop constants, every cue edge, non-finite inputs. No fake needed.

**Layer 2 — the wiring (`system.ts`), against a fake backend.** This is the
layer that matters. `createAudioSystem` takes an `AudioBackend` as a
constructor argument — the same injection pattern `sim/loop.ts` already uses
for `Stepper` and `Assist`, and `updatePanel` uses for `makeTextTexture`.
`tests/audio/fakeBackend.ts` implements `AudioBackend` by recording calls into
arrays. The test then drives the **real** `createAudioSystem` — the code that
ships — and asserts on what reached the backend: that gain fell to 0 after a
throttle cut, that a hundred post-impact frames produced exactly one
`playOnce('water_crash')`, that a parked spawn produced no squeak.

`AudioBackend` is deliberately **not** `typeof AudioContext`. Faking
`AudioContext` means faking `AudioBuffer`, `GainNode`, `AudioParam`,
`currentTime` and the node graph, which is a second implementation of Web Audio
that can be wrong in ways the real one is not. The interface instead speaks in
the four verbs this subsystem actually needs — `load`, `startLoop`, `playOnce`,
`setMasterGain`, plus `resume`/`state` — each of which is one or two lines of
real Web Audio on the other side.

**Layer 3 — the seam is provably narrow.** A fake is only worth something if
nothing can go round it. `tests/architecture/boundary.test.ts` gains a
source-level assertion, in the same shape as the existing "the Earth-curvature
sink has exactly one home" test: **exactly one file under `src/` may mention
`AudioContext`, `decodeAudioData` or `createBufferSource`, and that file is
`src/audio/webAudio.ts`.** Plus three dependency-cruiser rules with negative
probes (§8). Without this, "audio is testable" is a convention; with it, it is
a check.

**Layer 4 — Tier 2, for the three things no fake can prove.** A real Chromium
on the reference desktop, via `window.__ww2.audio()`:

1. `decodeAudioData` actually accepts each shipped file. A fake cannot know
   whether a 48 kHz stereo WAV decodes; the browser can.
2. The context is `'suspended'` before any key and `'running'` after one. That
   is the autoplay policy, and it exists only in a browser.
3. All six clips loaded from the built URLs — i.e. the paths in `assets.ts`
   resolve in a served app, not just on disk.

`src/audio/webAudio.ts` is the only file with no Tier 1 coverage, and that is
stated rather than hidden. It is kept to roughly forty lines of node
construction with no branching, for the same reason `overlay.ts` and
`legend.ts` keep their DOM halves thin: "the vitest environment is `node`, so
everything worth asserting lives in the pure functions above" (`legend.ts`).

### 7.2 What is deliberately not tested

Nobody asserts what it sounds like. There is no spectral golden, no FFT of a
rendered `OfflineAudioContext` buffer. `OfflineAudioContext` does not exist in
node either, and a rendered-buffer golden would pin Chromium's resampler
version. §10's listening step is a human with speakers, which is honest about
what it is.

---

## 8. Module boundaries

Three rules join `.dependency-cruiser.cjs`, each with a negative probe in
`tests/architecture/boundary.test.ts` — that file's own standard is that a rule
never seen to fail is indistinguishable from one that matches nothing.

| Rule | From → To | Why |
| --- | --- | --- |
| `sim-must-not-import-audio` | `^src/sim` → `^src/audio` | Same argument as `sim-must-not-import-render`: the physics layer stays headless and deterministic. |
| `assists-must-not-import-audio` | `^src/assists` → `^src/audio` | Same argument as `assists-must-not-import-render`. |
| `audio-must-not-import-render` | `^src/audio` → `^src/render` | Audio needs no three.js, no DOM and no `FrameState`; `src/render/audio.ts` adapts in the other direction. Keeps the fake-backed tests free of the renderer. |

Legal and intended: `render → audio`, `audio → sim` (for `ContactKind` and the
`onGround`/`heightAt` call in `src/render/audio.ts` — which is in `render/`,
not `audio/`).

`.gitignore`'s existing `src/**/__*__.ts` already covers a probe written to
`src/audio/`, so no ignore rule is needed; `boundary.test.ts`'s `PROBE_FILES`
list and its per-path git-ignore assertion still have to learn the new path.

---

## 9. The assertions this design is worth

Stated as checks rather than prose, per the house rule. Each is a test the plan
writes.

| # | Assertion | Where |
| --- | --- | --- |
| A1 | `engineGainFor(0) === 0` exactly, and `engineGainFor(NaN) === 0`, and `engineGainFor(-1) === 0` | `tests/audio/mix.test.ts` |
| A2 | `engineGainFor` and `enginePlaybackRateFor` are non-decreasing across `[0, 1]` and clamp above 1 | same |
| A3 | The loop seam step in the shipped `propeller.wav`, at the committed frame constants, is ≤ 512 LSB **and** at least 10× smaller than the naive whole-file wrap (measured: 64 and 171×) | `tests/audio/loopPoints.test.ts` |
| A4 | Every clip's byte count and peak in `AUDIO_ASSETS` matches the file on disk exactly | `tests/audio/assets.test.ts` |
| A5 | For every clip, `MASTER_GAIN × (ENGINE_GAIN_MAX × peak(propeller) + cueGain × peak(clip)) ≤ 1.0`, using peaks read from disk | same |
| A6 | A ditching produces exactly one `water_crash` over 100 frames; a destruction exactly one `explosion` | `tests/audio/system.test.ts` |
| A7 | A ground spawn (`onGround` `null → true`) produces **no** squeak; a real touchdown (`false → true`) produces exactly one | same |
| A8 | Engine gain is 0 on every frame after `engineRunning` goes false | same |
| A9 | Mute sets master gain to 0 and unmute restores it | same |
| A10 | Exactly one file under `src/` mentions `AudioContext` | `tests/architecture/boundary.test.ts` |
| A11 | Each of the three new depcruise rules fires on its own probe, by name | same |
| A12 | The built `dist/` contains all six WAVs at their exact byte counts | `tests/build/dist.test.ts` |
| A13 | `BINDINGS` and `LEGEND_ROWS` still match exactly, with the mute row present | existing `tests/render/legend.test.ts`, which already enforces this |
| A14 | The context is `'suspended'` before a keypress and `'running'` after | Tier 2, `tests/e2e/audio.spec.ts` |
| A15 | All six clips report loaded in a served build | same |

A13 is free: `legend.test.ts` already asserts `LEGEND_ROWS` names every
`BINDINGS` entry exactly once, so adding a mute key without a panel row fails
the suite. That test exists because Mark could not find the throttle-down key
on 2026-09-15.

---

## 10. Mute, and the `/` panel

The `/` panel is [`src/render/legend.ts`](../../../src/render/legend.ts). It is
a `<pre>` with `pointer-events:none` — it deliberately never steals a click
from the canvas, and the only elements in it that take pointer events are the
two attribution links. **So "mute lives in the controls panel" means a key with
a row in that panel, not a button.** That is also the panel's whole idiom:
every row names a `BindingName` and the keys are derived from `BINDINGS`.

- **New binding `toggleMute`.** Proposed key: **`Q`**, mnemonic *quiet*. `M`,
  the obvious choice, has been the throttle cut since 2026-09-17. `Q` is free
  (the letters in use are A, B, C, D, F, G, I, L, M, R, S, T, W, X, Z). A plain
  letter with no modifier, for the reason `throttleDown` documents in
  `bindings.ts`. **Open for Mark to override — see §12.**
- **New `LEGEND_ROWS` row** `{ label: 'Mute', bindings: ['toggleMute'] }`.
- `LegendHandle` gains `setMuted(boolean)`, beside the existing `setOpen`, so
  the row reads `Mute  Q` or `Mute  Q  (muted)`. A mute the pilot cannot see
  the state of is the same defect as a binding nobody can find.
- **Mute state lives in `main.ts`, not `FrameState`**, next to `legendOpen` and
  for the reason written at that call site: `FrameState` is the deterministic
  simulation state the golden trajectory and the soak both replay, and page
  furniture does not belong in it. Audio is presentation; it changes no
  trajectory.
- Mute is `masterGain = 0`, not a teardown. Cues still fire while muted (they
  are inaudible), so unmuting mid-explosion does not resurrect a stale sound
  and the reducer's edge bookkeeping is unaffected by whether anyone is
  listening.
- Not persisted across reloads. `localStorage` is a new capability and nothing
  in this project persists anything yet.

### 10.1 Resume

In the existing `window.addEventListener('keydown', …)` in `main.ts`, beside
the latches already there: `void audio.resume()`. Unconditional on any key,
`e.repeat` irrelevant, and idempotent — `AudioContext.resume()` on a running
context is a resolved promise. It must be called **synchronously inside the
listener**; Chromium ties the gesture to the task, not to the promise chain.

### 10.2 Failure policy

A failed fetch or a failed `decodeAudioData` **must not** reach `showFailure`.
A flight sim with no sound is playable; a black failure screen is not. The
loader logs in DEV and leaves that clip absent; `playOnce` on a clip that never
loaded is a no-op.

That would make a shipping failure invisible, so it is caught elsewhere
instead: A12 catches "the build did not ship it" at Tier 1, and A15 catches
"the browser could not decode it" at Tier 2. This is the same layering
`copyContent()`'s own comment describes — the config is not trusted, the built
artifact is asserted.

---

## 11. Re-running the measurements

Every number in §3 and §4.1 comes from parsing the RIFF chunks. `tools/audio/`
carries two small Node programs so none of it has to be redone by hand:

- `tools/audio/wav.ts` — a minimal 16-bit PCM WAV reader (`node:fs`,
  `node:path`). Node-only, in `tools/` for the reason `tools/content/load.ts`
  is: `src/` must stay browser-loadable. The browser uses `decodeAudioData` and
  never this.
- `tools/audio/loop.ts` — prints the duration/peak table of §3 and re-runs
  §4.1's loop-point search, printing the winning pair and its seam step.

`tests/audio/loopPoints.test.ts` and `tests/audio/assets.test.ts` use the
reader, so the committed numbers are re-derived by `npm run verify` rather than
trusted.

---

## 12. Open questions for Mark

1. **Provenance of the six WAVs** (§3.1) — source, author, licence, for
   `ASSETS.md`. The plan's first task stops here rather than guessing. This is
   the only one that blocks shipping.
2. **The mute key.** `Q` is proposed for "quiet"; `M` is taken. `N`, `U`, `V`
   and `Y` are also free.
3. **Should mute silence the engine only, or everything?** Designed as
   everything (master gain).
4. **Plan number and ordering.** Taken as **Plan 15**, next free identity, with
   the §15 table's `Order` column set to `any` like the 13x rows — audio does
   not block Plan 12 and Plan 12 does not block it. Mark may want it sequenced.
5. **3.5 MB of PCM** (§3.1) — accept, or re-encode to Opus on a machine that
   has ffmpeg?
6. **Four tuning numbers** (§4.2) — `ENGINE_GAIN_MAX`, `ENGINE_RATE_MIN`,
   `ENGINE_RATE_MAX`, `MASTER_GAIN`. Guesses until flown, and expected to
   change after the first flight, exactly like `RAMP_SECONDS` did.

---

## 13. Assumptions recorded

Things this design takes as true that were reasoned rather than measured, so
that a later reader can check them instead of inheriting them:

- **Chromium leaves a fresh `AudioContext` suspended under Playwright.**
  `CHROMIUM_ARGS` in `playwright.config.ts` contains no
  `--autoplay-policy=no-user-gesture-required`, and the reference run is
  `headless: false`, so the normal policy should apply. If it does not, A14
  proves nothing — the Tier 2 step therefore *checks the precondition* and
  reports rather than accepting a pass (plan Task 7).
- **A Playwright `keyboard.press` is a trusted gesture.** It is dispatched
  through CDP as a real input event. If A14's "running after a key" half fails
  while a human keypress works, this is the assumption that was wrong.
- **`onGround` is stable during a ground roll.** `restOnSurface` clamps a
  supported airplane exactly onto the surface every tick, and
  `GROUND_CONTACT_TOLERANCE_M` (0.25 m) is set to absorb the 1.8 cm/step climb
  of the steepest measured terrain, so the predicate should not chatter and
  produce a burst of squeaks on a take-off roll. If it does, that is a finding
  about `onGround`, not a reason to add hysteresis in `src/audio/`.
