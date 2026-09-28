# Instant Replay: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Viewing checkpoints: final product only** (Mark, 2026-09-27).

**Attended: no, run unattended** (Mark, 2026-09-27). Task 10's captures go in the handoff for when he is back.

**Where: a worktree** (Mark, 2026-09-27). Branch `worktree-instant-replay`, cut from `main` at or after `c5097e8` (the orbit camera merge). The branch may be pushed. Merging into `main`, pushing `main` and deploying are Mark's call. For Tier 2, point the worktree's own `vite.config.ts` at a spare dev slot: `ww2airsim-2` on port 5175, or `ww2airsim-3` on port 5174 (repo CLAUDE.md). That edit is local scratch and is never committed. Two other worktrees were active when this was written (`e2-flipbooks`, `r4-radio-radar`); re-diff `main.ts` against `main` before merging.

**Goal:** After a crash or shoot-down, the last seconds replay once on an automatic camera before the debrief. The debrief can replay it again. While paused, K replays the last 10 s. Every replay has pause, stepping, 0.5×/1×/3×, six cameras and its sound.

**Architecture:**
- **Pure units under `src/replay/`:**
  - the recorder
  - the posing of a recorded moment
  - the playback state machine
  - the cameras
  - the replay keys
  - the effects re-run
  - the crash → replay → debrief flow
- **Small API additions:** the audio system gets rate, prime, save/restore and hold; the effects system gets a reseed; the debrief gets a Watch replay button.
- **`main.ts` wiring:**
  - While a replay is up, the frame loop draws a `view` built from the recording instead of the live frame.
  - The live frame is held paused.
  - A root CSS class hides the flight HUD.
  - The replay owns the keyboard.

**Tech Stack:** TypeScript, three.js (WebGPU), Web Audio, vitest (node), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-instant-replay-design.md`. Read it in full before Task 1; this plan argues from it. Also read `docs/handoff/2026-09-27-orbit-camera.md` ("For Instant Replay") and `docs/superpowers/specs/2026-09-27-orbit-camera-design.md` §3 and §9: the orbit camera is reused as-is.

---

## Measured before writing this plan (`main` at `c5097e8`, 2026-09-27)

Claims to re-check before Task 1. Line numbers are `src/render/main.ts` and will drift; the anchors are named by code.

- **Worlds are immutable, and `advance` returns only the LAST world of a frame.** A frame that runs several ticks (triple time, a slow frame) hands back one world. A recorder in the frame loop therefore sees one world per *advanced frame*, not per tick (ruling R-1).
- **Each entity carries its own previous tick.** A world at tick N holds each entity's `previous` (N−1) and `state` (N). `posesFor(world, alpha)` (`src/render/frame.ts`, not exported) lerps them with `interpolateAircraft` / `interpolateShip` (`src/sim/interpolate.ts`, exported; alpha is clamped to [0, 1]).
- **The frame loop** is `frameFn` (~1976–2555). The order:
  1. `nextFrameState` (~2048)
  2. `frame = current` (~2068)
  3. meshes and camera from `current` (~2125–2249)
  4. effects (~2252–2271)
  5. the impact, destruction and landing debrief banking (~2276–2356)
  6. sky, ocean and clouds (~2358–2418)
  7. render (~2422–2475)
- **HUD span** ~2203–2216: flightData, timeBadge, autopilotBadge, pauseBadge, paddlesBadge, missionHud, combatReadout. Sound is `audio.update(audioInputsFrom(current))` at ~2203.
- **Effects** (~2252–2271): `nextFxEvents(fxMemory, {tick, combat, aircraft, poses, shipSmokeOrigins, structureAnchors})` → triggers / `setSustained` / `fxSystem.step(fxDtSeconds(frameMs/1000, paused, timeScale))`. `fxSystem` is created with `seed: 1944` (~1479), and its RNG cannot be reset (`const rng = createRng(o.seed)` in `src/render/fx/system.ts`). `resetFlightUi` clears it.
- **Debrief:** `debrief.show(model, onContinue?, onReturnToTitle?)` / `hide()` (`src/render/debrief.ts`). Buttons are built once in `createDebrief` and appended per `show` (~618–625). `pendingDebrief = { show, remainingMs: DEBRIEF_DELAY_MS }` at the crash (~2291) and destruction (~2308) sites. The countdown is `if (pendingDebrief !== null && !current.paused)` (~2310). Banking happens BEFORE `pendingDebrief` is set.
- **Keyboard:** the `keydown` listener (~1857) returns early only for `title.up()`. `chartOpen = navigationMapState.open || title.up()` (~2005) sends `NO_KEYS` and blocks the mouse (`mouseBlocked` includes `chartOpen`). Flight bindings in `src/input/bindings.ts` use Space, the arrows, WASD, Q, E, L, R, C, T, … but **not K, O or the digits** (grep `Digit` / `KeyK` / `KeyO`: none).
- **Sound:** `createAudioSystem` (`src/audio/system.ts`) keeps `memory: AudioMemory` in a closure with no save/restore. `update(inputs)` is the only driver. `AudioBackend.playOnce(id, gain)` has no rate (`src/audio/backend.ts`). `nextAudio` treats a backwards tick as a restart (`src/audio/cues.ts`). `audioInputsFrom(frame)` (`src/render/audio.ts`) reads only `frame.world` and `frame.controls`.
- **Sky:** `skyTimeS = oceanTime ?? current.world.tick * DT + current.world.accumulatorSeconds + postImpactOceanSeconds` (~2401).
- **Cloud/TRAA history cut** (~2454–2473): a cut when the eye jumps, when `paused` goes true → false, or when `cameraMode` changes.
- **HUD elements** are `position:fixed` children of `root` (`#app`), beside the canvas. None has a `setVisible`.
- **Diagnostics:** `__ww2.frameTimesMs()` / `resetFrameTimes()` exist (`src/render/diagnostics.ts`).
- **Headless world:** `worldFromScenario(loadScenarioBundle('furball-range'), null)` builds a busy airborne dogfight in Node (`src/sim/scenario.ts`, `tools/content/load.ts`).

## Plan rulings

| ID | Ruling | Why | Cost if wrong |
| --- | --- | --- | --- |
| R-1 | The recorder keeps one world per **advanced frame**, spanning the last 600 **ticks** (10 s of sim time). Poses between two recorded worlds are lerped entity by entity, matched by id, from the earlier world's `state` to the later's. | `advance` returns only a frame's last world. At triple time or on a slow frame, recorded worlds are 2–3 ticks apart, and a lerp across the gap is still smooth. This replaces spec §3's "per tick". | Samples are coarser at triple time. |
| R-2 | Replay time `t` is sim seconds (`tick × DT`). The sky clock in a replay is `t` itself, which continues past the last tick the way `postImpactOceanSeconds` does live. | One clock. Spec §7's formula reduces to this. | None visible. |
| R-3 | Effects in a replay use the one live `fxSystem`, reseeded with `REPLAY_FX_SEED` on entry and on every jump. The live system is cleared on entry and exit, and the live `fxMemory` is saved on entry and restored on exit. Re-runs use the current frame's ship and structure smoke anchors. | A second effects system means a second GPU pass. Clearing on exit loses only in-flight live bursts; sustained smoke and fire are re-derived from the live world on the next frame. | A fireball bursting at the moment you open a manual replay is gone when you return. |
| R-4 | Sound: on entry the live `AudioMemory` is saved, and on exit it is restored. Every jump **primes** the memory silently. A paused replay **holds** the engine at gain 0. Speed scales the engine rate and the one-shot rate. | Without a restore, replay → live is a forward jump, which re-fires gun, bomb and explosion cues. | — |
| R-5 | The flight HUD is hidden by one class on `root` and one CSS rule that hides every child except the canvas and `[data-replay-ui]`. The debrief is hidden by the same rule and reappears by itself on exit, so **Watch replay needs no re-show**. | The HUD modules have no `setVisible`. One rule cannot miss one. | A future HUD element that is not a child of `root` would show through. |
| R-6 | Target is the attacker when `damage.attacker` is in the recording. Otherwise it is the nearest other live aircraft within 3 km at the last recorded world. Otherwise the button is greyed out. | The spec's "last fired-at" is not recorded anywhere; nearest is the honest stand-in. | A slightly different aircraft framed in a furball. |
| R-7 | Orbit spin runs on real time, including while the replay is paused. | A slowly circling frozen moment is the point of pausing. | — |
| R-8 | Stepping (←/→) pauses playback. Play at the end of a held manual replay restarts it from its start. | Media-player convention. | — |
| R-9 | While a replay is up, the live frame is forced paused. Its own `paused` value is restored on exit. | Spec IR-3: the live game is untouched. A crash replay must not leave the frame paused for the debrief's Restart path, and a manual replay must return still paused. | — |
| R-10 | Manual camera controls: WASD move on the view's heading, Q/E down/up, drag to look (0.3°/px), wheel sets speed (×1.25 per notch; wheel up = faster; 5–200 m/s, starting at 30). L toggles the tripod lock (look at the player). | Spec §5 names the keys; the rates are this plan's. | Tuning only. |
| R-11 | The Flyby "event" is the last recorded tick: the impact for a crash, the live moment for a manual replay. | One rule for both. | — |
| R-13 | A drag handover from Flyby or Target keeps the eye's **bearing**, but its distance is clamped to the orbit's zoom range (0.4–4× the chase distance, about 105 m at most). | A Flyby eye can be a kilometre away early in the replay, and the orbit cannot hold that. Spec §5's "no jump" holds exactly whenever the eye is within range, which is the case near the event. | A far takeover visibly pulls the camera in. |
| R-12 | When the 64 MB memory check fails at `minTickGap` 1 and 2, **stop and ask Mark**. Do not start the input-log fallback. | Spec §9's fallback is a redesign of the recorder and player, and needs its own plan. | — |

## Global Constraints

- US spelling (repo CLAUDE.md). Escape `|` as `\|` inside markdown table cells.
- `src/sim/` imports nothing from `render/`, `input/` or `replay/`. `src/replay/` may import `sim/`, `input/` and `render/camera.ts` / `render/frame.ts` (pure modules), never `main.ts` or DOM modules. Check `.dependency-cruiser.cjs` accepts a new `src/replay/` directory. If a rule lists allowed directories, add `replay` beside `render` with the same restrictions, and say so in the commit.
- Recording: the last 600 ticks. Automatic window: last tick − 8.0 s to last tick + 1.5 s. Manual replay needs at least 3 s recorded.
- Speeds: exactly 0.5, 1, 3. Step: 1 s (Shift: one tick, `DT`).
- Memory limit: **64 MB retained** for a 10 s furball recording (spec §9).
- Effects re-run budget: a full 10 s re-run in **under 50 ms** on nexus (spec §7).
- Keys inside a replay: Space play/pause · ←/→ step · 1/2/3 speed · C cycle cameras · 4–9 cameras (Auto, Orbit, Flyby, Target, Cockpit, Manual) · O spin · L lock · Esc exit/skip · WASD/Q/E Manual movement. Live: **K while paused** starts a manual replay (spec IR-6).
- Every task ends with `remote-run npm run verify`; capture `rc=$?` directly. Known noise: at 16 workers ryzen times out slow tests this plan never touches (`skyLoad`, `gunzip`, `boundary`, `soak`), a different set each run (orbit camera ledger, 2026-09-27). When `rc=1`, confirm that every failure is `Test timed out`, then re-run with `remote-run npx vitest run --maxWorkers=8` and ledger it. Never wave away an assertion failure.

## Review Focus

1. **Flight keys leaking into a replay.** L (stall limiter), R (auto-rudder), Q (mute), P (chart), Tab (radar range), I, / and T must change nothing while a replay is up. Pinned: Task 10 Tier 2 presses each during a replay and asserts `__ww2.assists()`, `__ww2.audio().muted`, the chart state and the time scale are unchanged afterwards.
2. **Window blur mid-replay.** Held WASD in Manual must not keep flying the camera, and a long hidden-tab frame must not break playback. Pinned: Task 7 clears the replay's held-key set on `blur`, and Task 3 tests a 30 s `frameMs` (clamps to the end).
3. **A crash seconds after a restart, with a short or empty recording.** The window clamps to the recording's start. A one-world recording plays and finishes. No recording at all means straight to the debrief. Pinned: Tasks 3 and 9.
4. **Leaving a replay changes nothing live.** No re-fired sound cues or effects bursts; the tick, controls and paused state are the same. Pinned: Task 5 (sound restore fires no cue), Task 9 (flow), Task 10 Tier 2 (tick unchanged).
5. **Triple-time recording.** Recorded worlds 3 ticks apart still replay continuously. Pinned: Task 2 (`replayPosesAt` across a 3-tick gap is monotone and matches the lerp).

---

### Task 1: Recorder and the memory limit

**Files:**
- Create: `src/replay/recorder.ts`
- Test: `tests/replay/recorder.test.ts`, `tests/replay/memory.test.ts`

**Interfaces:**
- Produces:
  - `Recording = { readonly worlds: readonly World<undefined>[] }` (ascending ticks, never empty)
  - `Recorder = { push(world): void; snapshot(): Recording | null; clear(): void; size(): number }`
  - `createRecorder(o?: { spanTicks?: number; minTickGap?: number }): Recorder`
  - `REPLAY_SPAN_TICKS = 600`, `REPLAY_MIN_TICK_GAP` (1, or 2 per step 6)
  - `recordingStartS(r)`, `recordingEndS(r)`: seconds, `tick × DT`

- [x] **Step 1: Failing tests,** `tests/replay/recorder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createRecorder, recordingEndS, recordingStartS, REPLAY_SPAN_TICKS } from '../../src/replay/recorder.js'
import { DT } from '../../src/sim/flight/model.js'
import type { World } from '../../src/sim/loop.js'

// Only `tick` matters to the recorder; the cast keeps these tests independent of World's shape.
const w = (tick: number) => ({ tick }) as unknown as World<undefined>

describe('recorder (replay spec §3, plan R-1)', () => {
  it('is empty until something is pushed', () => {
    expect(createRecorder().snapshot()).toBeNull()
  })
  it('keeps the identical world objects, ascending', () => {
    const r = createRecorder()
    const a = w(1), b = w(2)
    r.push(a); r.push(b)
    expect(r.snapshot()!.worlds[0]).toBe(a)
    expect(r.snapshot()!.worlds[1]).toBe(b)
  })
  it('pushes nothing for a held frame (same tick)', () => {
    const r = createRecorder()
    const a = w(5)
    r.push(a); r.push(w(5)); r.push(w(5))
    expect(r.size()).toBe(1)
    expect(r.snapshot()!.worlds[0]).toBe(a)
  })
  it('spans the last 600 ticks and drops the oldest', () => {
    const r = createRecorder()
    for (let t = 1; t <= 2000; t++) r.push(w(t))
    const s = r.snapshot()!
    expect(s.worlds[0]!.tick).toBe(2000 - REPLAY_SPAN_TICKS)
    expect(s.worlds.at(-1)!.tick).toBe(2000)
  })
  it('spans ticks, not pushes: triple time records every 3rd tick over the same 10 s', () => {
    const r = createRecorder()
    for (let t = 3; t <= 3000; t += 3) r.push(w(t))
    const s = r.snapshot()!
    expect(s.worlds.at(-1)!.tick - s.worlds[0]!.tick).toBeLessThanOrEqual(REPLAY_SPAN_TICKS)
    expect(s.worlds.length).toBe(201)
  })
  it('a tick that goes backwards is a new flight: the buffer restarts', () => {
    const r = createRecorder()
    for (let t = 1; t <= 50; t++) r.push(w(t))
    r.push(w(0))
    expect(r.size()).toBe(1)
  })
  it('clear empties it; snapshot is a copy that later pushes do not change', () => {
    const r = createRecorder()
    r.push(w(1))
    const s = r.snapshot()!
    r.push(w(2))
    expect(s.worlds.length).toBe(1)
    r.clear()
    expect(r.snapshot()).toBeNull()
  })
  it('minTickGap 2 keeps every 2nd tick', () => {
    const r = createRecorder({ minTickGap: 2 })
    for (let t = 1; t <= 10; t++) r.push(w(t))
    expect(r.snapshot()!.worlds.map((x) => x.tick)).toEqual([1, 3, 5, 7, 9])
  })
  it('start and end are tick times', () => {
    const r = createRecorder()
    r.push(w(60)); r.push(w(120))
    expect(recordingStartS(r.snapshot()!)).toBeCloseTo(60 * DT, 12)
    expect(recordingEndS(r.snapshot()!)).toBeCloseTo(120 * DT, 12)
  })
})
```

- [x] **Step 2:** `npx vitest run tests/replay/recorder.test.ts`. Expected: FAIL (the module is missing).

- [x] **Step 3: Implement** `src/replay/recorder.ts`:

```ts
import type { World } from '../sim/loop.js'
import { DT } from '../sim/flight/model.js'

/**
 * The last 10 s of the flight, as the immutable `World`s the frame loop
 * produced (instant replay spec §3, IR-1). One world per ADVANCED FRAME, not
 * per tick (plan ruling R-1): `advance` hands back only a frame's last world,
 * so at triple time the recorded worlds are ~3 ticks apart and replay lerps
 * across the gap. The span is counted in ticks, so it is 10 s of sim time
 * however many frames that took.
 */
export const REPLAY_SPAN_TICKS = 600
/** 1 records every advanced frame; 2 halves memory (spec §9's first step). Set by Task 1's measurement. */
export const REPLAY_MIN_TICK_GAP = 1

export type Recording = { readonly worlds: readonly World<undefined>[] }

export type Recorder = {
  push(world: World<undefined>): void
  snapshot(): Recording | null
  clear(): void
  size(): number
}

export function createRecorder(o: { readonly spanTicks?: number; readonly minTickGap?: number } = {}): Recorder {
  const span = o.spanTicks ?? REPLAY_SPAN_TICKS
  const gap = o.minTickGap ?? REPLAY_MIN_TICK_GAP
  let worlds: World<undefined>[] = []
  return {
    push(world) {
      const last = worlds[worlds.length - 1]
      if (last !== undefined) {
        // A tick that went backwards is a new flight (Restart, New game).
        if (world.tick < last.tick) worlds = []
        // Held frame (paused, impact hold, ground spawn): the same world again.
        else if (world.tick - last.tick < gap) return
      }
      worlds.push(world)
      const oldest = world.tick - span
      let drop = 0
      while (drop < worlds.length - 1 && worlds[drop]!.tick < oldest) drop++
      if (drop > 0) worlds = worlds.slice(drop)
    },
    snapshot: () => (worlds.length === 0 ? null : { worlds: worlds.slice() }),
    clear() { worlds = [] },
    size: () => worlds.length,
  }
}

export const recordingStartS = (r: Recording): number => r.worlds[0]!.tick * DT
export const recordingEndS = (r: Recording): number => r.worlds[r.worlds.length - 1]!.tick * DT
```

- [x] **Step 4:** Run the tests again. Expected: PASS.

- [x] **Step 5: The memory measurement,** `tests/replay/memory.test.ts`. This is spec §9's gate; it runs first so nothing is built on a recorder that doesn't fit.

```ts
import { describe, it, expect } from 'vitest'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { createRecorder, REPLAY_MIN_TICK_GAP } from '../../src/replay/recorder.js'

// Spec §9: 64 MB retained for a 10 s recording of the busiest shipped scenario.
setFlagsFromString('--expose_gc')
const gc = runInNewContext('gc') as () => void
const LIMIT_BYTES = 64 * 1024 * 1024

describe('replay recording memory (spec §9)', () => {
  it('a 10 s furball with guns firing retains under 64 MB', () => {
    let f = initialFrameStateFor(worldFromScenario(loadScenarioBundle('furball-range'), null))
    const firing = new Set(['Space', 'ArrowLeft'])
    for (let i = 0; i < 300; i++) f = nextFrameState(f, 1 / 60, firing) // warm up: projectiles in flight
    const rec = createRecorder({ minTickGap: REPLAY_MIN_TICK_GAP })
    for (let i = 0; i < 900; i++) {
      f = nextFrameState(f, 1 / 60, i % 120 < 60 ? firing : new Set(['Space']))
      rec.push(f.world)
    }
    gc(); gc()
    const withRecording = process.memoryUsage().heapUsed
    rec.clear()
    gc(); gc()
    const without = process.memoryUsage().heapUsed
    const retained = withRecording - without
    console.log(`replay memory: ${(retained / 1048576).toFixed(1)} MB retained for ${900} frames (minTickGap ${REPLAY_MIN_TICK_GAP})`)
    expect(f.world.tick).toBeGreaterThan(1100) // the flight really ran
    expect(retained).toBeLessThan(LIMIT_BYTES)
  }, 120_000)
})
```

- [x] **Step 6: Run it and act on the number.** Run `npx vitest run tests/replay/memory.test.ts` and read the printed MB into the ledger.
  - **Under 64 MB:** done.
  - **Over:** set `REPLAY_MIN_TICK_GAP = 2`, re-run, and ledger both numbers.
  - **Still over:** STOP, per ruling R-12. Email Mark the numbers and the input-log fallback of spec §9, and wait.
  - If the furball's projectiles are all spent before the window ends (guns empty), note it in the ledger. The number is still the one to use: it is the shipped scenario.

- [x] **Step 7: Verify and commit.** `remote-run npm run verify` (`rc=0`, or the timeouts-only rule above). Commit `src/replay/recorder.ts`, `tests/replay/recorder.test.ts`, `tests/replay/memory.test.ts`, and `.dependency-cruiser.cjs` if it needed the new directory: "Instant replay Task 1: recorder; measured N MB for 10 s of furball".

---

### Task 2: Posing a recorded moment, and a shared surface-height helper

**Files:**
- Create: `src/replay/view.ts`
- Modify: `src/render/frame.ts`: export `surfaceHeightFor(world): SurfaceHeightAt` and use it inside `nextFrameState` (the orbit handoff's deferred minor)
- Test: `tests/replay/view.test.ts`

**Interfaces:**
- Consumes: `Recording` (Task 1). `interpolateAircraft`, `interpolateShip`, `RenderState`, `ShipPose` (`src/sim/interpolate.ts`).
- Produces:
  - `ReplayPoses = { world: World<undefined>; poses: RenderState[]; shipPoses: ShipPose[]; render: RenderState; speedMps: number; tickTimeS: number }`
  - `replayPosesAt(rec: Recording, tS: number): ReplayPoses`
  - `surfaceHeightFor(world: World<undefined>): SurfaceHeightAt` (from `frame.ts`)

- [x] **Step 1: Failing tests,** `tests/replay/view.test.ts`. Use a real flight so the poses are real:

```ts
import { describe, it, expect } from 'vitest'
import { initialFrameState, nextFrameState, surfaceHeightFor } from '../../src/render/frame.js'
import { createRecorder, recordingEndS, recordingStartS } from '../../src/replay/recorder.js'
import { replayPosesAt } from '../../src/replay/view.js'
import { playerAircraft } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3, length } from '../../src/sim/math/vec3.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const fly = (frames: number, elapsed = 1 / 60) => {
  let f = initialFrameState(f6f, createState({ position: v3(0, 2000, 0), velocity: v3(120, 0, 0) }))
  const rec = createRecorder()
  const lives = []
  for (let i = 0; i < frames; i++) {
    f = nextFrameState(f, elapsed, new Set(['ArrowLeft']))
    rec.push(f.world); lives.push(f)
  }
  return { rec: rec.snapshot()!, lives }
}

describe('replayPosesAt (spec §3, plan R-1)', () => {
  it('exactness: a recorded world is the identical object the live frame had', () => {
    const { rec, lives } = fly(120)
    const k = rec.worlds.length - 30
    expect(lives.some((l) => l.world === rec.worlds[k])).toBe(true)
  })
  it('at a recorded tick time, the player is exactly at that tick state', () => {
    const { rec } = fly(120)
    const w = rec.worlds[40]!
    const p = replayPosesAt(rec, w.tick * DT)
    expect(p.world).toBe(w)
    expect(p.render.position).toEqual(playerAircraft(w).state.position)
  })
  it('between two recorded worlds it lerps from the earlier state to the later', () => {
    const { rec } = fly(120)
    const a = rec.worlds[40]!, b = rec.worlds[41]!
    const mid = replayPosesAt(rec, ((a.tick + b.tick) / 2) * DT)
    const pa = playerAircraft(a).state.position, pb = playerAircraft(b).state.position
    expect(mid.render.position.x).toBeCloseTo((pa.x + pb.x) / 2, 9)
    expect(mid.world).toBe(b)
  })
  it('triple time: recorded worlds 3 ticks apart replay continuously (Review Focus 5)', () => {
    const { rec } = fly(120, 3 / 60)
    expect(rec.worlds[1]!.tick - rec.worlds[0]!.tick).toBe(3)
    let prevX = -Infinity
    for (let t = recordingStartS(rec); t <= recordingEndS(rec); t += DT / 2) {
      const x = replayPosesAt(rec, t).render.position.x
      expect(x).toBeGreaterThanOrEqual(prevX - 1e-9) // flying east: never jumps back
      prevX = x
    }
  })
  it('past the last tick the world is held at the last state; before the first, the first', () => {
    const { rec } = fly(60)
    const last = rec.worlds.at(-1)!
    const held = replayPosesAt(rec, recordingEndS(rec) + 1.5)
    expect(held.world).toBe(last)
    expect(held.render.position).toEqual(playerAircraft(last).state.position)
    expect(replayPosesAt(rec, recordingStartS(rec) - 1).world).toBe(rec.worlds[0])
  })
  it('reports the lerped player speed for the chase distance', () => {
    const { rec } = fly(60)
    const p = replayPosesAt(rec, rec.worlds[10]!.tick * DT)
    expect(p.speedMps).toBeCloseTo(length(playerAircraft(rec.worlds[10]!).state.velocity), 6)
  })
  it('a one-world recording poses without throwing (Review Focus 3)', () => {
    const one = { worlds: [fly(1).rec.worlds[0]!] }
    expect(() => replayPosesAt(one, 0)).not.toThrow()
  })
  it('surfaceHeightFor reads the sea when there is no terrain', () => {
    const { lives } = fly(1)
    expect(surfaceHeightFor(lives[0]!.world)(123, 456)).toBe(SEA_LEVEL_M)
  })
})
```

- [x] **Step 2:** Run. Expected: FAIL (the modules and exports are missing).

- [x] **Step 3: Implement.** In `frame.ts`, export the helper and use it in `nextFrameState` in place of the inline closure the orbit camera added:

```ts
/** The floor under any x/z of `world`: a deck, the terrain, or the sea
 *  before terrain exists (orbit spec OC-3). Shared with replay, which builds
 *  the same floor from a RECORDED world (orbit handoff, deferred minor). */
export function surfaceHeightFor(world: World<undefined>): SurfaceHeightAt {
  const decks = decksOf(world.ships)
  return (x, z) => groundUnder(world.terrain, decks, x, z)?.heightM ?? SEA_LEVEL_M
}
```

Import `type SurfaceHeightAt` from `./camera.js`. In `nextFrameState`, keep `decks` for `nextLandingTracking` and pass `surfaceHeightFor(advanced.world)` to `cameraTransformFor`. The orbit tests must stay green.

Create `src/replay/view.ts`:

```ts
import { playerAircraft, type World } from '../sim/loop.js'
import { interpolateAircraft, interpolateShip, type RenderState, type ShipPose } from '../sim/interpolate.js'
import { DT } from '../sim/flight/model.js'
import { length, v3 } from '../sim/math/vec3.js'
import type { Recording } from './recorder.js'

export type ReplayPoses = {
  /** The world everything but the poses is drawn from: the LATER of the pair, as live draws world N with lerp(N-1, N). */
  readonly world: World<undefined>
  readonly poses: readonly RenderState[]
  readonly shipPoses: readonly ShipPose[]
  readonly render: RenderState
  readonly speedMps: number
  /** `world.tick * DT`. */
  readonly tickTimeS: number
}

/**
 * The recorded moment at sim time `tS` (plan R-1, R-2). Between two recorded
 * worlds A and B, each entity is lerped from A's `state` to B's, matched by
 * id, so a gap of several ticks (triple time) is still continuous; an entity
 * that is not in A (a spawn) uses B's own previous -> state. Before the
 * first world it is the first; past the last, the last, held (spec §3
 * "After the last tick").
 */
export function replayPosesAt(rec: Recording, tS: number): ReplayPoses {
  const ws = rec.worlds
  let i = 0
  while (i + 1 < ws.length && ws[i + 1]!.tick * DT <= tS) i++
  const heldOrFirst = i === ws.length - 1 || tS <= ws[0]!.tick * DT
  const b = heldOrFirst ? ws[i]! : ws[i + 1]!
  const a = heldOrFirst ? b : ws[i]!
  const alpha = heldOrFirst ? 1 : (tS - a.tick * DT) / ((b.tick - a.tick) * DT)
  const aAircraft = new Map(a.aircraft.map((e) => [e.id, e.state] as const))
  const aShips = new Map(a.ships.map((s) => [s.id, s.state] as const))
  const poses = b.aircraft.map((e) => {
    const from = heldOrFirst ? undefined : aAircraft.get(e.id)
    return from === undefined ? interpolateAircraft(e.state, e.state, 1) : interpolateAircraft(from, e.state, alpha)
  })
  const shipPoses = b.ships.map((s) => {
    const from = heldOrFirst ? undefined : aShips.get(s.id)
    return from === undefined ? interpolateShip(s.state, s.state, 1) : interpolateShip(from, s.state, alpha)
  })
  const playerIndex = b.aircraft.findIndex((e) => e.id === b.player)
  const pb = playerAircraft(b).state.velocity
  const pa = heldOrFirst ? pb : (aAircraft.get(b.player)?.velocity ?? pb)
  const speedMps = length(v3(pa.x + (pb.x - pa.x) * alpha, pa.y + (pb.y - pa.y) * alpha, pa.z + (pb.z - pa.z) * alpha))
  return { world: b, poses, shipPoses, render: poses[playerIndex]!, speedMps, tickTimeS: b.tick * DT }
}
```

- [x] **Step 4:** Run `npx vitest run tests/replay/view.test.ts tests/render/orbitFrame.test.ts tests/render/camera.test.ts tests/render/frame.test.ts`. Expected: PASS.
- [x] **Step 5:** Verify and commit: "Instant replay Task 2: pose a recorded moment; shared surfaceHeightFor".

---

### Task 3: Playback state machine

**Files:**
- Create: `src/replay/player.ts`
- Test: `tests/replay/player.test.ts`

**Interfaces:**
- Consumes: `Recording`, `recordingStartS`, `recordingEndS` (Task 1).
- Produces:
  - `ReplaySpeed = 0.5 | 1 | 3`, `ReplayEnd = 'finish' | 'hold'`
  - `ReplayPlayer = { recording; startS; endS; tS; speed; playing; end; done; jumped }`
  - `ReplayCommand = { kind: 'togglePlay' } | { kind: 'step'; seconds: number } | { kind: 'speed'; speed: ReplaySpeed } | { kind: 'seek'; tS: number } | { kind: 'skip' }`
  - `startReplay(rec, window: { startS: number; endS: number }, end: ReplayEnd): ReplayPlayer`
  - `autoWindow(rec)`, `manualWindow(rec)`
  - `stepReplay(p, frameMs): ReplayPlayer`, `applyReplayCommand(p, cmd): ReplayPlayer`
  - `manualReplayAvailable(rec: Recording | null): boolean`
  - `AUTO_BEFORE_S = 8`, `AUTO_AFTER_S = 1.5`, `MANUAL_MIN_S = 3`, `STEP_S = 1`

- [x] **Step 1: Failing tests,** `tests/replay/player.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  applyReplayCommand, autoWindow, manualReplayAvailable, manualWindow, startReplay, stepReplay,
} from '../../src/replay/player.js'
import { DT } from '../../src/sim/flight/model.js'
import type { World } from '../../src/sim/loop.js'

const w = (tick: number) => ({ tick }) as unknown as World<undefined>
const rec = (first: number, last: number) => ({ worlds: [w(first), w(last)] })
const R = rec(600, 1200) // 10 s .. 20 s

describe('replay player (spec §4, §6; plan R-8)', () => {
  it('auto window: 8 s before the last tick to 1.5 s after, clamped to the recording start', () => {
    expect(autoWindow(R)).toEqual({ startS: 12, endS: 21.5 })
    expect(autoWindow(rec(600, 660)).startS).toBeCloseTo(10, 12) // Review Focus 3
  })
  it('manual window: the whole recording', () => {
    expect(manualWindow(R)).toEqual({ startS: 10, endS: 20 })
  })
  it('manual replay needs 3 s recorded', () => {
    expect(manualReplayAvailable(null)).toBe(false)
    expect(manualReplayAvailable(rec(600, 600 + 2.9 / DT))).toBe(false)
    expect(manualReplayAvailable(rec(600, 600 + 3 / DT))).toBe(true)
  })
  it('plays at speed x real time', () => {
    let p = startReplay(R, autoWindow(R), 'finish')
    p = stepReplay(p, 1000)
    expect(p.tS).toBeCloseTo(13, 9)
    p = stepReplay(applyReplayCommand(p, { kind: 'speed', speed: 3 }), 1000)
    expect(p.tS).toBeCloseTo(16, 9)
    p = stepReplay(applyReplayCommand(p, { kind: 'speed', speed: 0.5 }), 1000)
    expect(p.tS).toBeCloseTo(16.5, 9)
  })
  it('paused does not move', () => {
    let p = applyReplayCommand(startReplay(R, autoWindow(R), 'finish'), { kind: 'togglePlay' })
    p = stepReplay(p, 1000)
    expect(p.tS).toBe(12)
    expect(p.playing).toBe(false)
  })
  it('finish: reaching the end is done', () => {
    const p = stepReplay(startReplay(R, autoWindow(R), 'finish'), 60_000)
    expect(p.tS).toBe(21.5)
    expect(p.done).toBe(true)
  })
  it('a 30 s hidden-tab frame clamps to the end rather than overshooting (Review Focus 2)', () => {
    const p = stepReplay(startReplay(R, manualWindow(R), 'hold'), 30_000)
    expect(p.tS).toBe(20)
  })
  it('hold: reaching the end pauses on the last frame; play restarts from the start (R-8)', () => {
    let p = stepReplay(startReplay(R, manualWindow(R), 'hold'), 60_000)
    expect(p.done).toBe(false)
    expect(p.playing).toBe(false)
    p = applyReplayCommand(p, { kind: 'togglePlay' })
    expect(p.tS).toBe(10)
    expect(p.playing).toBe(true)
    expect(p.jumped).toBe(true)
  })
  it('step moves by the given seconds, clamps, pauses, and marks a jump', () => {
    let p = stepReplay(startReplay(R, autoWindow(R), 'finish'), 2000) // t = 14
    p = applyReplayCommand(p, { kind: 'step', seconds: -1 })
    expect(p.tS).toBeCloseTo(13, 9)
    expect(p.playing).toBe(false)
    expect(p.jumped).toBe(true)
    p = applyReplayCommand(p, { kind: 'step', seconds: -100 })
    expect(p.tS).toBe(12)
  })
  it('jumped lasts one frame', () => {
    let p = applyReplayCommand(startReplay(R, autoWindow(R), 'finish'), { kind: 'seek', tS: 15 })
    expect(p.jumped).toBe(true)
    p = stepReplay(p, 16)
    expect(p.jumped).toBe(false)
  })
  it('skip is done at once; commands after done change nothing', () => {
    const p = applyReplayCommand(startReplay(R, autoWindow(R), 'finish'), { kind: 'skip' })
    expect(p.done).toBe(true)
    expect(applyReplayCommand(p, { kind: 'seek', tS: 15 })).toBe(p)
  })
  it('a one-world recording plays and finishes (Review Focus 3)', () => {
    const one = { worlds: [w(600)] }
    const p = stepReplay(startReplay(one, autoWindow(one), 'finish'), 5000)
    expect(p.done).toBe(true)
  })
})
```

- [x] **Step 2:** Run. Expected: FAIL.

- [x] **Step 3: Implement** `src/replay/player.ts`:

```ts
import { recordingEndS, recordingStartS, type Recording } from './recorder.js'

/** Instant replay spec §4 and §6; plan rulings R-8, R-11. Pure: `main.ts` owns the clock. */
export type ReplaySpeed = 0.5 | 1 | 3
/** 'finish': the end is done (the crash replay and Watch replay). 'hold': pause on the last frame (manual). */
export type ReplayEnd = 'finish' | 'hold'

export type ReplayPlayer = {
  readonly recording: Recording
  readonly startS: number
  readonly endS: number
  readonly tS: number
  readonly speed: ReplaySpeed
  readonly playing: boolean
  readonly end: ReplayEnd
  readonly done: boolean
  /** True for the one frame after `tS` jumped (a seek, a step, a restart): effects and sound rebuild. */
  readonly jumped: boolean
}

export type ReplayCommand =
  | { readonly kind: 'togglePlay' }
  | { readonly kind: 'step'; readonly seconds: number }
  | { readonly kind: 'speed'; readonly speed: ReplaySpeed }
  | { readonly kind: 'seek'; readonly tS: number }
  | { readonly kind: 'skip' }

export const AUTO_BEFORE_S = 8
export const AUTO_AFTER_S = 1.5
export const MANUAL_MIN_S = 3
export const STEP_S = 1

export const autoWindow = (r: Recording) => ({
  startS: Math.max(recordingStartS(r), recordingEndS(r) - AUTO_BEFORE_S),
  endS: recordingEndS(r) + AUTO_AFTER_S,
})
export const manualWindow = (r: Recording) => ({ startS: recordingStartS(r), endS: recordingEndS(r) })
export const manualReplayAvailable = (r: Recording | null): boolean =>
  r !== null && recordingEndS(r) - recordingStartS(r) >= MANUAL_MIN_S - 1e-9

export function startReplay(recording: Recording, window: { readonly startS: number; readonly endS: number }, end: ReplayEnd): ReplayPlayer {
  return { recording, startS: window.startS, endS: window.endS, tS: window.startS, speed: 1, playing: true, end, done: false, jumped: true }
}

const clampT = (p: ReplayPlayer, t: number): number => Math.min(p.endS, Math.max(p.startS, t))

export function stepReplay(p: ReplayPlayer, frameMs: number): ReplayPlayer {
  if (p.done) return p
  if (!p.playing) return p.jumped ? { ...p, jumped: false } : p
  const tS = clampT(p, p.tS + (Math.max(0, frameMs) / 1000) * p.speed)
  if (tS >= p.endS) return p.end === 'finish' ? { ...p, tS, done: true, jumped: false } : { ...p, tS, playing: false, jumped: false }
  return { ...p, tS, jumped: false }
}

export function applyReplayCommand(p: ReplayPlayer, c: ReplayCommand): ReplayPlayer {
  if (p.done) return p
  switch (c.kind) {
    case 'togglePlay':
      // R-8: Play at the end of a held replay starts it over.
      if (!p.playing && p.tS >= p.endS) return { ...p, tS: p.startS, playing: true, jumped: true }
      return { ...p, playing: !p.playing }
    case 'step':
      return { ...p, tS: clampT(p, p.tS + c.seconds), playing: false, jumped: true }
    case 'seek':
      return { ...p, tS: clampT(p, c.tS), jumped: true }
    case 'speed':
      return { ...p, speed: c.speed }
    case 'skip':
      return { ...p, done: true }
  }
}
```

A one-world recording has `startS = recordingEndS − 0`, and the auto `endS` is 1.5 s later, so it plays the held last state and finishes. That is the correct degenerate behavior.

- [x] **Step 4:** Run. Expected: PASS. **Step 5:** Verify and commit: "Instant replay Task 3: playback state machine".

---

### Task 4: Replay cameras

**Files:**
- Create: `src/replay/cameras.ts`
- Test: `tests/replay/cameras.test.ts`

**Interfaces:**
- Consumes:
  - `ReplayPoses` (Task 2)
  - `cameraTransformFor`, `EyeTransform`, `SurfaceHeightAt`, `CHASE_OFFSET_M`, `chaseDistanceScale`, `CHASE_PITCH_FOLLOW`, `ORBIT_SURFACE_CLEARANCE_M` (`src/render/camera.ts`)
  - `OrbitOffset`, `ORBIT_ZERO`, `orbitFromMouse`, `MouseDelta`, `NO_MOUSE`, `ORBIT_RAD_PER_PX`, `ORBIT_PITCH_MIN_RAD`, `ORBIT_PITCH_MAX_RAD`, `ORBIT_ZOOM_MIN`, `ORBIT_ZOOM_MAX` (`src/input/orbit.ts`)
- Produces:
  - `ReplayCameraId = 'auto' | 'orbit' | 'flyby' | 'target' | 'cockpit' | 'manual'` and `REPLAY_CAMERAS` (in that order)
  - `ReplayCameraState` (below)
  - `initialCameraState(rec, surfaceHeightAt, kind: 'auto' | 'orbit'): ReplayCameraState`
  - `effectiveCamera(s): Exclude<ReplayCameraId, 'auto'>`
  - `replayEye(s, pose, surfaceHeightAt): EyeTransform`
  - `stepCameraState(s, input: { mouse: MouseDelta; held: ReadonlySet<string>; realDtS: number }, eye: EyeTransform, pose): ReplayCameraState`
  - `selectCamera(s, id, eye, pose): ReplayCameraState`
  - `toggleSpin(s)`, `toggleLock(s)`, `cycleCamera(s, eye, pose)`
  - `orbitFromEye(eye: Vec3, render: RenderState, speedMps: number): OrbitOffset`
  - `lookAt(from: Vec3, to: Vec3): Quat`

```ts
export type ManualCamera = { readonly position: Vec3; readonly yawRad: number; readonly pitchRad: number; readonly lock: boolean; readonly speedMps: number }
export type ReplayCameraState = {
  readonly selected: ReplayCameraId
  /** What Auto resolved to at replay start (spec §5): flyby, target or orbit. */
  readonly auto: 'orbit' | 'flyby' | 'target'
  readonly orbit: OrbitOffset
  readonly spin: boolean
  readonly flybyPoint: Vec3
  /** R-6: attacker, else nearest live aircraft within 3 km, else null (Target greyed out). */
  readonly targetId: string | null
  readonly manual: ManualCamera
}
```

**Behavior (spec §5, plan R-6, R-7, R-10, R-11):**
- **Auto resolution**, at the last recorded world:
  - player `impact !== null` → `'flyby'`
  - player `combat.aircraft[player].damage.destroyedAt !== null` and `targetId !== null` → `'target'`
  - otherwise `'orbit'`

  Check destroyed-with-target first, so a shoot-down that then hits the sea frames the attacker. Use `kind: 'orbit'` for a manual replay, which selects Orbit with spin on.
- **Orbit** is `cameraTransformFor('chase', spec, pose.render, LOOK_ZERO, pose.speedMps, s.orbit, surfaceHeightAt)`, where spec is the player's spec from `pose.world`.
  - Spin adds `12°/s × realDtS` to `orbit.yawRad`, wrapped, including while the replay is paused (R-7).
  - Any drag or wheel turns spin off.
- **Flyby** point:
  1. Take the recorded world nearest `lastTick − 3 s`: its player position `p` and velocity `v`.
  2. `q = p + v × 2`.
  3. `side` = the horizontal unit vector to the right of `v` (`normalize(v3(-v.z, 0, v.x))`).
  4. The point is `q + side × 25 + (0, 8, 0)`, with `y` clamped to `surfaceHeightAt(x, z) + 2`.

  The eye sits at the point and looks at `pose.render.position`.
- **Target:** `d = normalize(target − player)`. The eye is `player − d×25 + up×6 + right(d)×8`, clamped, and it looks at the target's pose. If `targetId` is not in `pose.world` at this moment, fall back to Orbit's eye.
- **Cockpit** is `cameraTransformFor('cockpit', spec, pose.render)`.
- **Manual:**
  - The attitude comes from yaw and pitch (`lookAt` along the forward vector), or `lookAt(position, player)` when `lock`.
  - Movement: `held` WASD/Q/E × `speedMps` × `realDtS`. W/S move along the forward vector projected horizontal, A/D strafe, Q/E move down/up.
  - A drag turns the view: `yaw −= dx × ORBIT_RAD_PER_PX`, `pitch −= dy × ORBIT_RAD_PER_PX`, with pitch clamped to ±85°.
  - Wheel: `speedMps × 1.25^(−notches)`, clamped to [5, 200].
  - The position is clamped to `surface + 2`.
- **`selectCamera`:**
  - To `'manual'`: start at the current eye. Take yaw and pitch from the eye's forward vector, `lock: false`, `speedMps: 30`.
  - To `'target'` with `targetId === null`: return the state unchanged.
  - Switching never changes `flybyPoint` or `auto`.
- **Drag takeover** (spec §5): in `stepCameraState`, a nonzero drag while the effective camera is `'flyby'` or `'target'` sets `selected: 'orbit'`, `orbit: orbitFromEye(eye.position, pose.render, pose.speedMps)` and `spin: false`, then applies the drag.
- **`orbitFromEye`** is exact, from the orbit spec's construction:
  1. Rebuild the chase attitude from `render` (heading plus 0.92 × pitch; copy `headingOf` / `pitchOf` from `camera.ts` or export them from there).
  2. `local = rotate(conj(chase), eye − render.position)`, `d = |local|`.
  3. `e0 = atan2(6, 22)` (the default elevation of `CHASE_OFFSET_M`).
  4. `pitch = asin(local.y / d) − e0`, `yaw = atan2(−local.z, −local.x)`, `zoom = d / (|CHASE_OFFSET_M| × chaseDistanceScale(speed))`.
  5. Clamp to the orbit limits.
- **`lookAt(from, to)`:** `f = normalize(to − from)`; `qNormalize(qMul(qFromAxisAngle(Y, atan2(−f.z, f.x)), qFromAxisAngle(Z, asin(f.y))))`. This is the same heading/pitch construction the chase camera uses (body +X forward).

- [x] **Step 1: Failing tests,** `tests/replay/cameras.test.ts`. The world is two aircraft flying level, built as `tests/render/audioInputs.test.ts` builds its worlds (`createWorldOf` with entity literals), with no AI:

```ts
import { describe, it, expect } from 'vitest'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { createRecorder, type Recording } from '../../src/replay/recorder.js'
import { replayPosesAt } from '../../src/replay/view.js'
import {
  effectiveCamera, initialCameraState, lookAt, orbitFromEye, replayEye, selectCamera, stepCameraState, toggleLock,
} from '../../src/replay/cameras.js'
import { cameraTransformFor } from '../../src/render/camera.js'
import { NO_MOUSE } from '../../src/input/orbit.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { LOOK_CENTRE } from '../../src/input/lookAround.js'
import { createWorldOf, playerAircraft, type World } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { v3, sub, length, normalize, dot, type Vec3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const sea = () => 0
const plane = (id: string, p: Vec3) => {
  const s = createState({ position: p, velocity: v3(120, 0, 0) })
  return { id, spec: f6f, state: s, previous: s, controls: NEUTRAL, assistMemory: undefined, impact: null, parked: false }
}
/** 4 s of level flight, player at 2000 m, a second airplane `otherAt` away. */
const record = (otherAt: Vec3 = v3(400, 2000, 300)): Recording => {
  let f = initialFrameStateFor(createWorldOf<undefined>({ aircraft: [plane('player', v3(0, 2000, 0)), plane('z1', otherAt)], player: 'player' }))
  const r = createRecorder()
  for (let i = 0; i < 240; i++) { f = nextFrameState(f, 1 / 60, new Set()); r.push(f.world) }
  return r.snapshot()!
}
const replaceLast = (rec: Recording, last: World<undefined>): Recording => ({ worlds: [...rec.worlds.slice(0, -1), last] })
const withImpact = (w: World<undefined>): World<undefined> => ({
  ...w,
  aircraft: w.aircraft.map((a) => a.id !== w.player ? a : {
    ...a, impact: { tick: w.tick, position: a.state.position, verticalSpeedMps: -30, groundHeightM: 0, surface: 'water' as const, kind: 'ditched' as const },
  }),
})
const withDestroyedBy = (w: World<undefined>, attacker: string): World<undefined> => {
  const mine = w.combat.aircraft[w.player]!
  return { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [w.player]: { ...mine, damage: { ...mine.damage, destroyedAt: w.tick, attacker } } } } }
}
const endPose = (rec: Recording) => replayPosesAt(rec, rec.worlds.at(-1)!.tick * DT)

describe('replay cameras (spec §5; plan R-6, R-7, R-10, R-11, R-13)', () => {
  it('orbitFromEye inverts the orbit placement (round trip)', () => {
    const pose = endPose(record())
    for (const o of [{ yawRad: 0.7, pitchRad: 0.3, zoom: 2 }, { yawRad: -2, pitchRad: -0.5, zoom: 0.6 }]) {
      const eye = cameraTransformFor('chase', f6f, pose.render, LOOK_CENTRE, pose.speedMps, o)
      const back = orbitFromEye(eye.position, pose.render, pose.speedMps)
      expect(back.yawRad).toBeCloseTo(o.yawRad, 6)
      expect(back.pitchRad).toBeCloseTo(o.pitchRad, 6)
      expect(back.zoom).toBeCloseTo(o.zoom, 6)
    }
  })

  it('lookAt points the eye +X at the target', () => {
    for (const to of [v3(100, 0, 0), v3(-30, 40, 80), v3(5, -60, -20)]) {
      const f = qRotate(lookAt(v3(0, 0, 0), to), v3(1, 0, 0))
      expect(dot(f, normalize(to))).toBeCloseTo(1, 9)
    }
  })

  it('auto: impact -> flyby; destroyed by a present attacker -> target; otherwise orbit', () => {
    const rec = record()
    const last = rec.worlds.at(-1)!
    expect(initialCameraState(rec, sea, 'auto').auto).toBe('orbit')
    expect(initialCameraState(replaceLast(rec, withImpact(last)), sea, 'auto').auto).toBe('flyby')
    expect(initialCameraState(replaceLast(rec, withDestroyedBy(last, 'z1')), sea, 'auto').auto).toBe('target')
    // Shot down, then into the sea: the attacker wins (checked first).
    expect(initialCameraState(replaceLast(rec, withImpact(withDestroyedBy(last, 'z1'))), sea, 'auto').auto).toBe('target')
    // A manual replay starts on Orbit with spin on.
    const manual = initialCameraState(rec, sea, 'orbit')
    expect(effectiveCamera(manual)).toBe('orbit')
    expect(manual.spin).toBe(true)
  })

  it('target: the nearest airplane within 3 km, else greyed out, and selecting it is then a no-op (R-6)', () => {
    expect(initialCameraState(record(), sea, 'auto').targetId).toBe('z1')
    const far = record(v3(5000, 2000, 0))
    const s = initialCameraState(far, sea, 'orbit')
    expect(s.targetId).toBeNull()
    const pose = endPose(far)
    expect(selectCamera(s, 'target', replayEye(s, pose, sea), pose)).toBe(s)
  })

  it('flyby is beside the path: the player passes within 40 m of the point (R-11)', () => {
    const rec = replaceLast(record(), withImpact(record().worlds.at(-1)!))
    const s = initialCameraState(rec, sea, 'auto')
    const closest = Math.min(...rec.worlds.map((w) => length(sub(playerAircraft(w).state.position, s.flybyPoint))))
    expect(closest).toBeLessThan(40)
  })

  it('manual starts exactly at the previous eye; W moves it speed x dt; lock looks at the player', () => {
    const rec = record()
    const pose = endPose(rec)
    const s0 = initialCameraState(rec, sea, 'orbit')
    const eye0 = replayEye(s0, pose, sea)
    const s1 = selectCamera(s0, 'manual', eye0, pose)
    const e1 = replayEye(s1, pose, sea)
    expect(length(sub(e1.position, eye0.position))).toBeLessThan(1e-9)
    const s2 = stepCameraState(s1, { mouse: NO_MOUSE, held: new Set(['KeyW']), realDtS: 1 }, e1, pose)
    const moved = sub(replayEye(s2, pose, sea).position, e1.position)
    expect(Math.hypot(moved.x, moved.z)).toBeCloseTo(s1.manual.speedMps, 6)
    const locked = replayEye(toggleLock(s2), pose, sea)
    const f = qRotate(locked.attitude, v3(1, 0, 0))
    expect(dot(f, normalize(sub(pose.render.position, locked.position)))).toBeCloseTo(1, 6)
  })

  it('no camera goes below the surface + 2 m', () => {
    const rec = replaceLast(record(), withImpact(withDestroyedBy(record().worlds.at(-1)!, 'z1')))
    const pose = endPose(rec)
    const floor = () => 1995 // 5 m under the airplane
    const s = initialCameraState(rec, floor, 'auto')
    for (const id of ['flyby', 'target'] as const) {
      expect(replayEye(selectCamera(s, id, replayEye(s, pose, floor), pose), pose, floor).position.y).toBeGreaterThanOrEqual(1997 - 1e-9)
    }
    const m = selectCamera(s, 'manual', replayEye(s, pose, floor), pose)
    const sunk = stepCameraState(m, { mouse: NO_MOUSE, held: new Set(['KeyQ']), realDtS: 10 }, replayEye(m, pose, floor), pose)
    expect(replayEye(sunk, pose, floor).position.y).toBeGreaterThanOrEqual(1997 - 1e-9)
  })

  it('dragging from flyby hands over to orbit from the same eye, when the eye is within zoom range (R-13)', () => {
    const rec = replaceLast(record(), withImpact(record().worlds.at(-1)!))
    const s = initialCameraState(rec, sea, 'auto')
    // The moment the player is nearest the flyby point, so the eye is ~26 m out: inside the orbit's zoom range.
    const near = rec.worlds.reduce((b, w) => length(sub(playerAircraft(w).state.position, s.flybyPoint)) < length(sub(playerAircraft(b).state.position, s.flybyPoint)) ? w : b)
    const pose = replayPosesAt(rec, near.tick * DT)
    const eye = replayEye(s, pose, sea)
    const s2 = stepCameraState(s, { mouse: { ...NO_MOUSE, dxPx: 1e-9 }, held: new Set(), realDtS: 0 }, eye, pose)
    expect(effectiveCamera(s2)).toBe('orbit')
    expect(s2.spin).toBe(false)
    expect(length(sub(replayEye(s2, pose, sea).position, eye.position))).toBeLessThan(1e-3)
  })

  it('spin turns orbit by 12 deg per real second, also while paused (R-7), and a drag stops it', () => {
    const rec = record()
    const pose = endPose(rec)
    const s = initialCameraState(rec, sea, 'orbit')
    const eye = replayEye(s, pose, sea)
    const spun = stepCameraState(s, { mouse: NO_MOUSE, held: new Set(), realDtS: 1 }, eye, pose)
    expect(spun.orbit.yawRad - s.orbit.yawRad).toBeCloseTo((12 * Math.PI) / 180, 9)
    const dragged = stepCameraState(spun, { mouse: { ...NO_MOUSE, dxPx: 10 }, held: new Set(), realDtS: 0 }, eye, pose)
    expect(dragged.spin).toBe(false)
  })
})
```

If `createWorldOf`'s entity literal needs a field these tests leave out (it has grown `side` and similar), copy the literal from the current `tests/render/audioInputs.test.ts` rather than guessing.

- [x] **Step 2:** Run. Expected: FAIL.
- [x] **Step 3:** Implement `src/replay/cameras.ts` per the behavior list above. Keep every function pure, with `surfaceHeightAt` passed in. If `camera.ts`'s `headingOf` / `pitchOf` are needed, export them (they are pure) rather than copying them.
- [x] **Step 4:** Run. Expected: PASS. **Step 5:** Verify and commit: "Instant replay Task 4: six replay cameras, drag handover, orbitFromEye".

---

### Task 5: Sound: rate, prime, save/restore, hold

**Files:**
- Modify: `src/audio/backend.ts` (`playOnce(id, gain, rate?)`), `src/audio/webAudio.ts` (set `source.playbackRate.value = rate ?? 1`), `src/audio/system.ts`, `src/render/audio.ts` (`audioInputsFrom(frame: Pick<FrameState, 'world' | 'controls'>)`)
- Test: the existing audio system test file (find it: `grep -rl createAudioSystem tests`); add a `describe('replay support (instant replay R-4)')`

**Interfaces:**
- Produces, on `AudioSystem`:
  - `update(inputs, rate?: number)`: rate defaults to 1 and scales the engine playback rate and one-shot rate
  - `prime(inputs): void`: advances the memory, plays nothing, touches no loop
  - `memory(): AudioMemory`, `restore(m: AudioMemory): void`
  - `hold(held: boolean): void`: while held, the engine loop glides to gain 0; `update` resumes it
- `audioInputsFrom` accepts any `{ world, controls }`. Replay passes `{ world: pose.world, controls: playerAircraft(pose.world).controls }`.

- [ ] **Step 1: Failing tests.** In `tests/audio/fakeBackend.ts`, change `playOnce` to record the rate: `playOnce: (id: ClipId, gain: number, rate = 1): void => { played.push({ id, gain, rate }) }`, and widen `played`'s element type to match. Existing tests compare `played.map((p) => p.id)`, so they are unaffected. Append to `tests/audio/system.test.ts`, which already defines `flying`:

```ts
describe('replay support (instant replay R-4)', () => {
  it('rate scales the engine and the one-shot rate', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    const full = fake.engineRates.at(-1)!
    audio.update({ ...flying, tick: 11, shots: 5 }, 0.5)
    expect(fake.engineRates.at(-1)).toBeCloseTo(full * 0.5, 9)
    expect(fake.played.at(-1)!.rate).toBe(0.5)
  })

  it('prime advances the memory without a sound', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    const before = fake.played.length
    audio.prime({ ...flying, tick: 20, shots: 50 })
    audio.update({ ...flying, tick: 21, shots: 50 })
    expect(fake.played.length).toBe(before)
  })

  it('restore after a replay fires no live cue (Review Focus 4)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update({ ...flying, tick: 100, shots: 10 })
    const live = audio.memory()
    audio.update({ ...flying, tick: 40, shots: 0 })     // replay: an older tick (restart)
    audio.update({ ...flying, tick: 41, shots: 3 }, 1)  // a replayed burst
    const afterReplay = fake.played.length
    audio.restore(live)
    audio.update({ ...flying, tick: 101, shots: 10 })   // live again, nothing new
    expect(fake.played.length).toBe(afterReplay)
  })

  it('hold silences the engine; the next update brings it back', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    audio.hold(true)
    expect(fake.engineGains.at(-1)).toBe(0)
    expect(audio.snapshot().engineGain).toBe(0)
    audio.hold(false)
    audio.update({ ...flying, tick: 11 })
    expect(fake.engineGains.at(-1)).toBeGreaterThan(0)
  })
})
```

The "rate" test depends on a shots rise at tick 11 firing a gun cue. If `nextAudio`'s gun gate (`gunCueUntilTick`) does not fire on the first rise, raise `shots` over two ticks until the existing gun-cue test in this file shows the pattern. Copy that pattern rather than guessing.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement: pure additions to the closure in `system.ts`, the optional `rate` on the backend, and the `Pick` in `audio.ts`. Keep `setMuted` untouched.
- [ ] **Step 4:** Run the audio tests plus `tests/render/audioInputs.test.ts`. Expected: PASS. **Step 5:** Verify and commit: "Instant replay Task 5: audio rate, prime, save/restore, hold".

---

### Task 6: Effects reseed and the effects re-run

**Files:**
- Modify: `src/render/fx/system.ts`: `let rng`, and `reset(seed: number): void` = `clear()` + `rng = createRng(seed)` + `nextSerial = 0`
- Create: `src/replay/fxReplay.ts`
- Test: `tests/render/fxSystem.test.ts` (reset), `tests/replay/fxReplay.test.ts`

**Interfaces:**
- Consumes: `Recording`, `ReplayPoses`/`replayPosesAt` (Tasks 1–2); `nextFxEvents`, `NO_FX_MEMORY`, `FxMemory` (`src/render/fx/events.ts`); `FxSystem`.
- Produces:
  - `REPLAY_FX_SEED = 1945`
  - `FxAnchors = { shipSmokeOrigins: ReadonlyMap<string, Vec3>; structureAnchors: ReadonlyMap<string, Vec3> }`
  - `rebuildReplayFx(fx, rec, tS, anchors): FxMemory`: reset, prime from the first world silently, then re-step every recorded world up to `tS` (dt = the tick gap × DT), then step the tail past the last tick
  - `stepReplayFx(fx, memory, pose: ReplayPoses, dtS, anchors): FxMemory`: one playing frame

- [ ] **Step 1: Failing tests.** Append to `tests/render/fxSystem.test.ts`, which already defines `make`, `layout`, `v3` and `ZERO`:

```ts
describe('reset(seed) (instant replay R-3)', () => {
  it('makes a run reproducible whatever the system did before', () => {
    const burst = (fx: FxSystem) => {
      fx.reset(7)
      fx.trigger('crash.water', v3(0, 0, 0), ZERO)
      for (let i = 0; i < 30; i++) fx.step(1 / 60)
      return { serials: fx.liveSerials(), live: fx.live() }
    }
    const fx = make()
    fx.trigger('crash.land', v3(10, 0, 0), ZERO) // consume the RNG first
    fx.step(0.2)
    const a = burst(fx)
    const b = burst(fx)
    expect(a.live).toBeGreaterThan(0)
    expect(b).toEqual(a)
  })
})
```

Create `tests/replay/fxReplay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FX_CATALOG } from '../../src/render/fx/catalog.js'
import { FX_SHEETS, type FxSheetLayout } from '../../src/render/fx/sheetManifest.js'
import { createFxSystem } from '../../src/render/fx/system.js'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { createRecorder } from '../../src/replay/recorder.js'
import { replayPosesAt } from '../../src/replay/view.js'
import { rebuildReplayFx, stepReplayFx } from '../../src/replay/fxReplay.js'
import { DT } from '../../src/sim/flight/model.js'

const layout: FxSheetLayout = { frames: 16, cols: 3, rows: 2, motionScale: 0.02, cellOf: Object.fromEntries(FX_SHEETS.map((s, i) => [s, i])) as FxSheetLayout['cellOf'] }
const fxSys = () => createFxSystem({ capacity: 4096, seed: 1944, catalog: FX_CATALOG, layout })
const anchors = { shipSmokeOrigins: new Map(), structureAnchors: new Map() }

const furball = () => {
  let f = initialFrameStateFor(worldFromScenario(loadScenarioBundle('furball-range'), null))
  const rec = createRecorder()
  for (let i = 0; i < 600; i++) { f = nextFrameState(f, 1 / 60, new Set(['Space'])); rec.push(f.world) }
  return rec.snapshot()!
}

describe('replay effects re-run (spec §7, §8; plan R-3)', () => {
  it('jumping to t equals playing to t, world by world', () => {
    const rec = furball()
    const target = rec.worlds[Math.floor(rec.worlds.length * 0.8)]!
    const tS = target.tick * DT
    const jumped = fxSys()
    rebuildReplayFx(jumped, rec, tS, anchors)
    const played = fxSys()
    let memory = rebuildReplayFx(played, rec, rec.worlds[0]!.tick * DT, anchors)
    for (let i = 1; i < rec.worlds.length && rec.worlds[i]!.tick <= target.tick; i++) {
      const w = rec.worlds[i]!
      memory = stepReplayFx(played, memory, replayPosesAt(rec, w.tick * DT), (w.tick - rec.worlds[i - 1]!.tick) * DT, anchors)
    }
    expect(played.liveSerials()).toEqual(jumped.liveSerials())
  })

  it('a full re-run completes and the furball produced some effects', () => {
    const rec = furball()
    const fx = fxSys()
    rebuildReplayFx(fx, rec, rec.worlds.at(-1)!.tick * DT, anchors)
    expect(fx.live()).toBeGreaterThan(0)
  })
})
```

If the furball's 10 s with the player firing produces no impact (`live()` is 0 at the end), fly 600 more frames before recording, and say so in a comment. Do not weaken the assertion.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** The `FxWorldView` for a recorded world `w` at pose `p`: `{ tick: w.tick, combat: w.combat, aircraft: w.aircraft, poses: p.poses, ...anchors }`. Prime is `nextFxEvents(NO_FX_MEMORY, view(first)).memory` with its triggers dropped: bursts from before the recording are not replayed, and the first frame must not replay every impact in the ring.
- [ ] **Step 4:** Run. Expected: PASS. **Step 5:** Verify and commit: "Instant replay Task 6: fx reseed and replay re-run".

---

### Task 7: `main.ts`: manual replay end to end (draw path, keys, camera, bar, HUD)

This task makes K-while-paused play a replay with the Orbit camera, the full bar and all six cameras. Effects and sound in replay come in Task 8, so during this task they are **cleared/held**: `fxSystem.clear()` on entry, `audio.hold(true)`.

**Files:**
- Create:
  - `src/replay/keys.ts`: `replayKeyAction(code, shift)`, pure
  - `src/render/replayBar.ts`: pure `replayBarModel(player, camera)` plus DOM `createReplayBar(root, handlers)`, and the one-time injected CSS rule of R-5
- Modify:
  - `src/input/bindings.ts`: `replay: ['KeyK']`
  - `src/render/legend.ts`: row `{ label: 'Replay (paused)', bindings: ['replay'] }` after Pause
  - `src/render/main.ts`
  - `src/render/diagnostics.ts`: `replay()`, `renderedPlayerPositionM()`
- Test: `tests/replay/keys.test.ts`, `tests/render/replayBar.test.ts`, `tests/render/legend.test.ts` (the existing exhaustiveness check covers the new binding)

**Interfaces:**
- `ReplayKeyAction = { kind: 'command'; command: ReplayCommand } | { kind: 'camera'; id: ReplayCameraId } | { kind: 'cycleCamera' } | { kind: 'spin' } | { kind: 'lock' } | { kind: 'exit' }`
- `replayKeyAction('Space')` → togglePlay; `'ArrowLeft'` → step −1 (Shift: `−DT`); `'Digit1'..'Digit3'` → speeds 0.5/1/3; `'Digit4'..'Digit9'` → cameras in `REPLAY_CAMERAS` order; `'KeyC'` → cycle; `'KeyO'` → spin; `'KeyL'` → lock; `'Escape'` → exit; anything else → `null` (WASD/Q/E are *held*, not actions).
- `replayBarModel` returns:
  - `label: 'REPLAY'`
  - `progress` in [0, 1] = `(tS − startS) / (endS − startS)`, or 1 when the window is empty
  - `eventMarker` = the fraction of `recordingEndS` in the window, clamped; `null` outside it
  - `speed`, `playing`
  - `cameras: { id, label, key, selected, disabled }[]`: Target is disabled when `targetId === null`; `selected` is the chosen id, `'auto'` included
  - `showSpin` when the effective camera is orbit, `spinOn`, `showLock` when manual, `lockOn`

**Steps:**

- [ ] **Step 1: Failing Tier 1 tests** for `replayKeyAction` (every key in the Global Constraints list, Shift-step = `−DT`, an unbound key → null) and `replayBarModel` (progress at start/end, eventMarker for an auto window = `8 / 9.5`, Target disabled, spin/lock visibility). Also run `tests/render/legend.test.ts` after adding the binding: it must fail until the legend row exists, then pass.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement `keys.ts`, `replayBar.ts` (the DOM root gets `data-replay-ui`, the bar is fixed to the bottom, and the timeline is clickable and draggable → `seek`), the binding and the legend row. **Step 4:** Tier 1 passes.

- [ ] **Step 5: Wire `main.ts`.** All in one commit, in this order. Each edit is anchored by code, not line number:
  1. **Recorder.**
     - Create it: `const recorder = createRecorder()` near the other flight-scoped state (beside `pendingDebrief`).
     - Push right after `frame = current`: `if (replay === null) recorder.push(current.world)`. The recorder ignores held frames by itself.
     - Clear it in `resetFlightUi`: `recorder.clear()`.
  2. **Session state:**
     ```ts
     type ReplaySession = {
       player: ReplayPlayer; camera: ReplayCameraState; returnTo: 'live' | 'debrief'
       liveWasPaused: boolean; liveFxMemory: FxMemory; liveAudio: AudioMemory; onDone: () => void
     }
     let replay: ReplaySession | null = null
     const replayHeld = new Set<string>()
     let replayHistoryCut = false
     ```
     `startReplaySession(kind: 'manual' | 'auto', onDone)`:
     1. Take a snapshot, and return if it is `null`.
     2. `camera = initialCameraState(rec, surfaceHeightFor(rec.worlds.at(-1)!), kind === 'manual' ? 'orbit' : 'auto')`.
     3. `player = startReplay(rec, kind === 'manual' ? manualWindow(rec) : autoWindow(rec), kind === 'manual' ? 'hold' : 'finish')`. Rename the import, e.g. `startPlayer`, to avoid the name clash.
     4. Save `frame!.paused`, `fxMemory` and `audio.memory()`.
     5. Call `clearMapInput()`, `replayHeld.clear()`, `fxSystem?.clear()`, `audio.hold(true)`, `root.classList.add(REPLAYING_CLASS)`, `replayBar.show(...)`, and set `replayHistoryCut = true`.

     `endReplay()`:
     1. `fxSystem?.clear()`, `fxMemory = session.liveFxMemory`, `audio.restore(session.liveAudio)`, `audio.hold(false)`.
     2. `frame = withPaused(frame!, session.liveWasPaused)` (R-9).
     3. `root.classList.remove(REPLAYING_CLASS)`, `replayBar.hide()`, `replayHistoryCut = true`, `clearMapInput()`, `replayHeld.clear()`.
     4. Take `const done = session.onDone`, set `replay = null`, then call `done()`.
  3. **Keyboard.**
     - At the top of the `keydown` listener, after the `title.up()` guard:
       ```ts
       if (replay !== null) { e.preventDefault(); onReplayKey(e); return }
       ```
       `onReplayKey` does `replayHeld.add(e.code)`. For a non-repeat event it maps `replayKeyAction(e.code, e.shiftKey)` onto the session: commands go to `applyReplayCommand`; camera, cycle, spin and lock go to the camera functions; exit sets `player = applyReplayCommand(player, { kind: 'skip' })`.
     - `keyup` also does `replayHeld.delete(e.code)`. `blur` also does `replayHeld.clear()` (Review Focus 2).
     - **K:** before the flight latches in `keydown`:
       ```ts
       if (BINDINGS.replay.includes(e.code as never) && !e.repeat && frame!.paused && !debriefOrHoldUp() && manualReplayAvailable(recorder.snapshot())) { startReplaySession('manual', () => {}); return }
       ```
       `debriefOrHoldUp()` is the existing `playerAircraft(frame!.world).impact !== null || destroyedAt !== null || landingShown` condition, extracted once and reused by the mouse gate.
  4. **Frame loop.**
     - `chartOpen` also covers `replay !== null` (→ `NO_KEYS`, and the mouse is blocked for the flight).
     - After the title line: `if (replay !== null) current = withPaused(current, true)`.
     - The mouse: capture `const replayMouse = mouseDelta` BEFORE `mouseDelta = NO_MOUSE`.
  5. **Build the view** right after `frame = current` / the recorder push, before `entityViews`:
     ```ts
     let view: RenderView = current
     if (replay !== null) {
       replay.player = stepReplay(replay.player, frameMs)
       if (replay.player.done) { endReplay() } else {
         const pose = replayPosesAt(replay.player.recording, replay.player.tS)
         const floor = surfaceHeightFor(pose.world)
         replay.camera = stepCameraState(replay.camera, { mouse: replayMouse, held: replayHeld, realDtS: frameMs / 1000 }, lastReplayEye ?? replayEye(replay.camera, pose, floor), pose)
         const eye = replayEye(replay.camera, pose, floor)
         lastReplayEye = eye
         view = { world: pose.world, eye, poses: pose.poses, shipPoses: pose.shipPoses, render: pose.render,
           controls: playerAircraft(pose.world).controls,
           cameraMode: effectiveCamera(replay.camera) === 'cockpit' ? 'cockpit' : 'chase',
           paused: !replay.player.playing, timeScale: replay.player.speed }
         if (replay.player.jumped || cameraChanged) replayHistoryCut = true
         replayBar.show(replayBarModel(replay.player, replay.camera))
       }
     }
     ```
     `RenderView = Pick<FrameState, 'world' | 'eye' | 'poses' | 'shipPoses' | 'render' | 'controls' | 'cameraMode' | 'paused' | 'timeScale'>`. `endReplay()` inside the loop is safe because `view` stays `current` for that frame.
  6. **Swap the drawing reads** from `current` to `view` in three spans:
     - entityViews → airfield sync
     - the effects block
     - sky dome recentre → render

     Every read in the measured list's "drawing" group, including `current.eye`, `current.poses`, `current.shipPoses`, `current.world.*`, `current.render`, `current.controls` (panel/airframe updates), `current.cameraMode` (visibility, history), `current.paused`/`timeScale` (fx dt, history).

     **Keep live:**
     - `player` (it feeds the debrief banking and `postImpactOceanSeconds`)
     - the HUD span
     - the three debrief blocks
     - `segment`

     Introduce `const viewPlayer = playerAircraft(view.world)` for the radar contacts and `updatePanel`.

     **Sky time:** `const skyTimeS = oceanTime ?? (replay !== null ? replay.player.tS : <the existing live formula>)` (R-2).

     **History cut:** `|| replayHistoryCut` in the `cut` expression, then `replayHistoryCut = false`.
  7. **Effects and sound in this task:** while `replay !== null`, skip the live `nextFxEvents` / `fxSystem.step` (fx was cleared on entry) and skip `audio.update` (held on entry). Task 8 fills both.
  8. **Diagnostics** (DEV):
     - `replay: () => replay === null ? null : { tS, startS, endS, speed, playing, camera: replay.camera.selected, effective: effectiveCamera(replay.camera), targetId: replay.camera.targetId }`
     - `renderedPlayerPositionM: () => ` the world position of the player's airframe root as drawn this frame, i.e. `view.poses[playerIndex].position`, kept in a variable at the pose step

- [ ] **Step 6: Typecheck and lint** (`npx tsc --noEmit -p .`, `npx eslint src/render/main.ts … --max-warnings 0`). Extend `tests/render/bootQuality.test.ts`'s source checks with a new `it`:
  - `main.ts` contains `if (replay === null) recorder.push(current.world)`
  - it contains `recorder.clear()`
  - the `keydown` listener routes to `onReplayKey` before the flight latches (regex `/if \(replay !== null\) \{[^}]*onReplayKey/`)

  Watch it fail before step 5's edits if you are doing them in order, or temporarily revert one line to see it fail.
- [ ] **Step 7: Tier 2 smoke** in `tests/e2e/instantReplay.spec.ts`, first test only (Task 10 adds the rest). Fly (`spawnUrl` at 1200 m), wait 6 s, Escape, KeyK. Then:
  - `__ww2.replay()` is non-null
  - the REPLAY label is visible
  - `renderedPlayerPositionM()` is more than 100 m from `aircraftPositionM()` (it is drawing the past)
  - Escape → `replay()` is null, and `__ww2.tick()` equals its value before K

  Run it on the worktree's dev slot under `sg render` (orbit camera ledger: a script file for `sg`; `PW_BASE_URL=https://ww2airsim-2.windomlane.org`).
- [ ] **Step 8:** Verify and commit: "Instant replay Task 7: manual replay end to end (K while paused)".

---

### Task 8: `main.ts`: effects and sound in replay

**Files:** modify `src/render/main.ts`. Test: `tests/render/bootQuality.test.ts` (source checks), and Tier 2 in Task 10.

- [ ] **Step 1: Effects.**
  - Add `replayFxMemory: FxMemory` to the session.
  - In the effects block, when `replay !== null`:
    ```ts
    const anchors = { shipSmokeOrigins, structureAnchors }
    if (replay.player.jumped) { const t0 = performance.now(); replayFxMemory = rebuildReplayFx(fxSystem, rec, tS, anchors); lastFxRebuildMs = performance.now() - t0 }
    else if (replay.player.playing) replayFxMemory = stepReplayFx(fxSystem, replayFxMemory, pose, (frameMs / 1000) * replay.player.speed, anchors)
    ```
  - `fxPass.setCount(fxSystem.writeInstances(view.eye.position, …))` as live.
  - Expose `__ww2.replayFxRebuildMs()`. The startReplay jump (`jumped: true` on the first frame) performs the initial build.
- [ ] **Step 2: Sound.** When `replay !== null`:
  - if `replay.player.jumped`: `audio.prime(audioInputsFrom(view))`
  - if `playing`: `audio.hold(false); audio.update(audioInputsFrom(view), replay.player.speed)`
  - otherwise `audio.hold(true)`

  The live `audio.update(audioInputsFrom(current))` runs only when `replay === null`. Entry's `audio.hold(true)` and exit's restore remain from Task 7.
- [ ] **Step 3: Source checks.** Add to `bootQuality.test.ts`: `main.ts` contains `rebuildReplayFx(`, `audio.prime(` and `audio.restore(session.liveAudio)` (or whatever the session variable is named; assert the exact text written). Typecheck, lint, then verify and commit: "Instant replay Task 8: effects and sound follow the replay".

---

### Task 9: The crash sequence and Watch replay

**Files:**
- Create: `src/replay/flow.ts` (pure)
- Modify: `src/render/debrief.ts` (a Watch replay button), `src/render/main.ts`
- Test: `tests/replay/flow.test.ts`, `tests/render/debrief.test.ts`

**Interfaces:**
- `ReplayFlow = { kind: 'live' } | { kind: 'hold'; remainingMs: number } | { kind: 'replay'; returnTo: 'debrief' | 'live'; firstShow: boolean } | { kind: 'debrief' }`
- `ReplayFlowEvent = { kind: 'crashBanked' } | { kind: 'frame'; frameMs: number; paused: boolean; recordingAvailable: boolean } | { kind: 'replayDone' } | { kind: 'watch' } | { kind: 'manual' } | { kind: 'landingDebrief' } | { kind: 'debriefClosed' } | { kind: 'reset' }`
- `ReplayFlowEffect = 'startAutoReplay' | 'startManualReplay' | 'showDebrief'`
- `stepFlow(flow, event): { flow: ReplayFlow; effects: readonly ReplayFlowEffect[] }`, and `DEBRIEF_DELAY_MS` moves here from main.ts (3000; same value)
- `debrief.show(model, onContinue?, onReturnToTitle?, onWatchReplay?)`: the button is labeled "Watch replay" and is appended only when `onWatchReplay` is given

**Transitions** (spec §4):

| From | Event | To | Effects |
| --- | --- | --- | --- |
| live | crashBanked | hold 3000 | none |
| hold | frame (not paused) | hold, remaining − frameMs | none |
| hold | frame, remaining ≤ 0, recording available | replay (returnTo: debrief, firstShow: true) | startAutoReplay |
| hold | frame, remaining ≤ 0, no recording | debrief | showDebrief (Review Focus 3) |
| replay | replayDone | if firstShow: debrief; else the returnTo value | showDebrief only when firstShow and returnTo is debrief |
| debrief | watch | replay (returnTo: debrief, firstShow: false) | startAutoReplay |
| live | manual | replay (returnTo: live, firstShow: false) | startManualReplay |
| live | landingDebrief | debrief | none |
| debrief | debriefClosed | live | none |
| any | reset | live | none |

Every other combination leaves the flow unchanged with no effects. A Watch replay ends back on `debrief` with no `showDebrief`, because R-5 reveals it.

- [ ] **Step 1: Failing tests,** `tests/replay/flow.test.ts`:
  - The skip path and the watch path each emit `showDebrief` **exactly once** per crash.
  - A crash with no recording shows the debrief after the hold.
  - The hold does not count down while paused.
  - Watch replay returns to `debrief` without a second `showDebrief`.
  - Manual returns to `live`.
  - `reset` from every state goes to `live`.
  - Events that don't apply are no-ops (`watch` while live, `manual` during a hold).

  In `debrief.test.ts`: the Watch replay button exists only when a handler is passed, and clicking it calls the handler. Follow the file's existing jsdom/DOM pattern; if it has none, pin it with the pure model the file already tests.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement `flow.ts` and the debrief button.
- [ ] **Step 4: Wire `main.ts`.**
  - Replace the `pendingDebrief` countdown with the flow:
    - The crash and destruction sites still bank exactly as now. They store `pendingDebrief = { show: () => showDebrief(model, banked, undefined, watchReplay) }` (drop `remainingMs`) and dispatch `crashBanked`.
    - Each frame dispatches `{ kind: 'frame', frameMs, paused: current.paused, recordingAvailable: recorder.snapshot() !== null }`.
  - Effects:
    - `showDebrief` → `pendingDebrief?.show()`, then `pendingDebrief = null`.
    - `startAutoReplay` → `startReplaySession('auto', () => dispatch({ kind: 'replayDone' }))`.
    - `startManualReplay` → `startReplaySession('manual', () => dispatch({ kind: 'replayDone' }))`, called from the K handler via `dispatch({ kind: 'manual' })` instead of calling `startReplaySession` directly.
  - `watchReplay = () => dispatch({ kind: 'watch' })`.
  - The landing site passes `watchReplay` to `showDebrief` too and dispatches `landingDebrief`. Its Continue handler dispatches `debriefClosed`.
  - `resetFlightUi` dispatches `reset` and ends any live session without calling its `onDone`:
    1. `if (replay) { const s = replay; replay = null; …restore live fx/audio, remove the class, hide the bar… }`.
    2. Factor that restore out of `endReplay` as `teardownReplay()`, so both paths share it.
  - `showDebrief` gains the 4th parameter and forwards it to `debrief.show`.
- [ ] **Step 5:** Typecheck, lint, the flow and debrief tests, and the bootQuality source checks (add `dispatch({ kind: 'crashBanked' })` and `onWatchReplay`). Verify and commit: "Instant replay Task 9: crash replay before the debrief, Watch replay".

---

### Task 10: Tier 2, captures, handoff

**Files:**
- `tests/e2e/instantReplay.spec.ts`: extend it
- `docs/handoff/2026-09-27-instant-replay.md`
- the §15 row (the "Orbit camera, then Instant Replay" row)
- a README paragraph
- `GAMEPLAY.md`, if it has a controls section by then; otherwise the README paragraph names the keys

- [x] **Step 1: Tier 2 cases.** Run all of them on the worktree's dev slot, nexus GPU, under `sg render`:
  1. **Crash:** `diveToSea(page)`. That helper waits for the debrief, so use a variant: poll `__ww2.replay()` non-null within 6 s of the impact tick, then wait for `replay()` to become null and the debrief to be visible. Check the roster/banked text shows one bank (the debrief's banked line appears once).
  2. **Skip:** crash again (Restart, dive). As soon as the replay starts, press Escape. The debrief is visible within 1 s.
  3. **Watch replay:** click it → `replay()` non-null, the debrief hidden. Press Escape → the debrief is visible again.
  4. **Controls:** manual replay (Task 7's test). Space → `playing` false. ArrowLeft → `tS` down by 1 s. `2`/`3`/`1` → speeds. `4`–`9` → the selected camera. A screenshot per camera at a fixed paused `tS`, to `test-results/replay/<camera>.png`.
  5. **Review Focus 1:** during a replay press L, R, Q, P, Tab, I, Slash, T. Then Escape, and assert against the values read before the replay: `__ww2.assists()` unchanged, `__ww2.audio?.()` muted unchanged (use whatever the hook is named; grep diagnostics), the chart closed, and the time scale unchanged.
  6. **Performance:**
     - `__ww2.replayFxRebuildMs()` after a seek to the window's end is under 50 ms.
     - Mean `frameTimesMs()` during 3 s of replay is no worse than 1.25× the mean during 3 s of live flight at the same place. This is a correctness-machine sanity bound, not a budget; ledger both numbers.
- [x] **Step 2: Read every PNG.** Each camera must frame the airplane (Target also the attacker, when there is one). Fix what is wrong before the handoff.
- [x] **Step 3: Whole-branch review** (`superpowers:requesting-code-review`, most capable model, with this plan's Review Focus verbatim and the ledger's rulings). Fix Critical and Important findings with RED→GREEN tests; ledger the Minor ones.
- [x] **Step 4: Handoff.** In the same format as `docs/handoff/2026-09-27-orbit-camera.md`: what shipped, the controls table, captures (downscaled 1280×720 JPEGs in `docs/handoff/`), rulings R-1..R-12 plus the executor's, the memory number, the Review Focus pin list, test status, deferred minors, and Mark's final checkpoint. Update the §15 row (Instant Replay complete on its branch; bomb cam still a future idea) and add a README paragraph pointing at §15.
- [x] **Step 5:** Push the branch and email the handoff. Completed 2026-09-28; Mark explicitly overrode the original no-merge instruction and requested the verified branch be merged and pushed to `main`, the handoff emailed, and the worktree removed. Merge commit: `e73e173`.
