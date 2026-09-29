# Spatial AI Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (run inline, unattended). Steps use checkbox syntax.

**Goal:** AI aircraft engines, distant gunfire, detonations and the carrier deck rumble are heard from where they are, relative to the camera.

**Architecture:** A new pure reducer `src/audio/spatial.ts` (`nextSpatial`) turns listener pose, nearby AI aircraft, decks and new detonations into listener-relative loop sources (gain, Doppler rate, lowpass, position) and due one-shots (a pending queue delays each by distance / 343 m/s). The Web Audio panner only pans (`rolloffFactor 0`); the reducer owns every distance decision, so the fake backend can assert them. `system.updateSpatial` applies the output through two new backend verbs. The player's engine, cockpit sounds and the sea bed stay non-positional.

**Tech Stack:** TypeScript, Web Audio (`webAudio.ts` is the only file that touches it), vitest with `tests/audio/fakeBackend.ts`.

**Spec:** `docs/superpowers/specs/2026-09-29-audio-expansion-design.md` §5.4 (listener placement, §9 item 3, resolved here as: the camera). Mark's decisions 2026-09-30: listener = camera (chase and cockpit); scope = AI engines (nearest 6, Doppler), gunfire and explosions as delayed lowpassed one-shots (incl. `flak_distant`, replacing the flat 1,500 m explosion cue), AI gunfire bursts, carrier deck rumble positioned at the ship; viewing checkpoint = final product only; unattended on `main`.

## Global Constraints

- `audio/` imports neither `sim/` nor `render/`; `render/audio.ts` is the only adapter.
- Speed of sound 343 m/s. Doppler: `rate = 343 / (343 + radialSpeed)` (radial positive = receding), clamped 0.7..1.4, glided.
- At most 6 live AI engine sources; the rest fade to gain 0.
- Every value reaching an AudioParam or PannerNode is finite.
- Held (paused replay): loops glide to 0, no one-shots; `prime` advances memory and drops the pending queue.
- All gain, distance and Doppler constants are reasoned guesses, never heard. Say so in the handoff.

## Review Focus

- A source on the pilot's right pans right (world frame is right-handed, north -z, east +x, up +y; right = forward x up). Task 1 test.
- Tick going backwards (restart, replay scrub) resets memory: no stale pending blasts. Task 1 test.
- Six AI aircraft stacked at 100 m must not clip the engine bus: summed loop gain capped. Task 1 test.
- Destroyed AI aircraft and the player's own id make no loop and no gunfire. Task 1 test.
- A salvo of 30 same-tick detonations does not queue 30 one-shots. Task 1 test.

---

### Task 1: The spatial reducer

**Files:** Create `src/audio/spatial.ts`, `tests/audio/spatial.test.ts`.

**Produces:**
```ts
export type Vec = { readonly x: number; readonly y: number; readonly z: number }
export type SpatialAircraft = { id: string; family: EngineFamily; position: Vec; velocity: Vec; shots: number; engineHealth: number }
export type SpatialInputs = {
  tick: number
  listener: { position: Vec; forward: Vec; up: Vec; velocity: Vec }
  aircraft: readonly SpatialAircraft[]
  decks: readonly { id: string; center: Vec; lengthM: number }[]
  blasts: readonly { tick: number; surface: string; position: Vec }[]
}
export type SpatialLoop = { key: string; layer: string; at: Vec; gain: number; rate: number; cutoffHz: number }
export type SpatialShot = { clip: ClipId; at: Vec; level: number; cutoffHz: number }
export type SpatialMemory = { tick: number | null; blastTick: number | null; guns: Readonly<Record<string, { shots: number; nextTick: number }>>; pending: readonly Pending[] }
export const NO_SPATIAL_MEMORY: SpatialMemory
export function nextSpatial(m: SpatialMemory, i: SpatialInputs): { memory: SpatialMemory; loops: SpatialLoop[]; shots: SpatialShot[] }
```
`at` is listener-relative in Web Audio axes (x right, y up, -z ahead).

- [ ] Write tests (right pan, reset on backwards tick, cap of 6 nearest, sum cap, destroyed/player skipped, delayed blast arrives at `round(d/343/DT)` ticks, lowpass falls with distance, salvo cap, Doppler approaching > 1 and receding < 1, deck loop centred when over the hull).
- [ ] Implement; run `npx vitest run tests/audio/spatial.test.ts`.
- [ ] Commit.

### Task 2: Backend verbs

**Files:** Modify `src/audio/backend.ts`, `src/audio/webAudio.ts`, `tests/audio/fakeBackend.ts`.

**Produces:** `startSpatialLoop(spec: LoopSpec): SpatialLoopHandle` (`LoopHandle` plus `setPosition(p, glideTauS)`), `playSpatial(id, bus, gain, rate, at, lowpassHz)`. Both panners: equalpower, `rolloffFactor 0`. The listener is fixed at the origin looking down -z, set once by the system.

- [ ] Add verbs to the type, webAudio and the fake (fake records `spatialLoops`, `spatialShots`); `npx tsc --noEmit` green.
- [ ] Commit.

### Task 3: System wiring

**Files:** Modify `src/audio/system.ts`, `src/audio/cues.ts`, `tests/audio/system.test.ts`, `tests/audio/cues.test.ts`.

**Produces:** `updateSpatial(inputs, rate?)`, `primeSpatial(inputs)`; `memory()`/`restore()` carry both memories; `hold` zeroes spatial loops. The deck rumble is no longer driven by the non-positional `deck` ambient layer. `cues.ts` stops cueing `explosion`/`water_crash` from `ordnanceBlast` (it still suppresses `hit_taken`).

- [ ] Tests through the fake: loop per source started once with the family clip, Doppler rate reaches the handle, out-of-range source glides to 0, held silences loops and one-shots, prime clears pending, blast plays `explosion` lowpassed after its delay, distant blast plays `flak_distant`.
- [ ] Implement; commit.

### Task 4: Adapter and main.ts

**Files:** Modify `src/render/audio.ts`, `src/render/main.ts` (~2471), `tests/render/audioInputs.test.ts`.

**Produces:** `spatialInputsFrom(frame: Pick<FrameState,'world'>, eye: { position: Vec3; attitude: Quat }): SpatialInputs`. Listener forward = `qRotate(attitude, (1,0,0))`, up = `qRotate(attitude, (0,1,0))`, velocity = the player's velocity. Aircraft = every non-player aircraft not destroyed.

- [ ] Adapter tests (player excluded, destroyed excluded, forward/up from attitude).
- [ ] Wire: live `audio.updateSpatial(spatialInputsFrom(current, view.eye))`; replay mirrors the existing prime/hold/update branch.
- [ ] Commit.

### Task 5: Verify and document

- [ ] `npx tsc --noEmit`, lint, depcruise; full suite and `verify` through `remote-run`, capturing `rc=$?`.
- [ ] Handoff `docs/handoff/2026-09-30-spatial-audio.md`, §15 row 15c, NOTICE/assets comment (`flak_distant` now wired).
- [ ] Email this plan as HTML once (`python3 tools/mail-doc.py`). Do not push `main`.
