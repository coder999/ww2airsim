# Audio Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the audio backend seam from one engine loop and plain one-shots into a bus graph with named layered loops, a cockpit/chase cabin mix, and optional positioned one-shots, with no change to what plays today.

**Architecture:** `AudioBackend` (types only, `src/audio/backend.ts`) gains buses, a `LoopSpec` for any number of looping layers, `setCabin`, `setListener` and an optional position on `playOnce`. `createAudioSystem` routes the existing engine through a generic `driveLayer`, so later sub-projects (aircraft, environment, radio, spatial) add layers by adding a table row, not new plumbing. `src/audio/webAudio.ts` stays the only file that touches Web Audio. The state-derived reducer in `cues.ts` is untouched.

**Tech Stack:** TypeScript, Web Audio API, Vitest (Tier 1, recording fake backend), Playwright (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-29-audio-expansion-design.md` §4 (this plan is sub-project 1 of 6). Builds on `docs/superpowers/specs/2026-09-18-audio-design.md` §2, §6, §7.

**Viewing checkpoint (Mark, 2026-09-29):** final product only, run unattended. Nothing here is very audible on its own; the handoff (Task 5) lists what to listen for on `https://ww2airsim.windomlane.org` (assert it returns 200 first) once Mark is back. No test waits on him.

**Where:** a worktree (Mark, 2026-09-29): `~/projects/ww2airsim-worktrees/audio-foundation`, branch `worktree-audio-foundation`. Never push or merge `main`; the branch may be pushed.

## Global Constraints

- `src/audio/webAudio.ts` is the only file under `src/` that names Web Audio (asserted by `tests/architecture/boundary.test.ts`).
- `src/audio/` never imports `render/`, `sim/`, `assists/` or `input/`. New position/listener types are defined in `src/audio/backend.ts`, not borrowed from `sim/`.
- `src/audio/mix.ts` imports nothing. Type-only imports *of* it are fine.
- Every AudioParam write goes through `setTargetAtTime` with a positive glide, never a step; a non-finite value must never reach an AudioParam (it throws inside the render loop).
- A clip that failed to decode degrades to silence, never an error or failure screen.
- Replay: `prime` stays silent; `hold(true)` silences every layer and every one-shot; `update(inputs, rate)`'s `rate` scales every loop's playback rate and every one-shot.
- US spelling. `npm run verify` (typecheck, lint at zero warnings, depcruise, tests) ends every task; capture `rc=$?` directly, never gate on a grepped pipeline.
- Full suites and `verify` go through `remote-run` (`remote-run npm run verify`). On nexus run only the files you touch: `npx vitest run tests/audio`.

## Review Focus

Failure modes the spec implies but no obvious task test covers; each is pinned by a test in the task named.

1. A layer whose clip never decoded: `driveLayer` must be a silent no-op, not a throw (Task 2).
2. NaN or Infinity as a layer gain, rate or cutoff, or as a one-shot position: must be sanitized or dropped, never reach the backend as a NaN (Tasks 2, 4).
3. `setView` called every frame with an unchanged view must reach the backend once, not restart the crossfade 60 times a second (Task 3).
4. A paused replay (`hold(true)`) must silence every layer and drop positioned one-shots, then restore on the next drive (Tasks 2, 4).
5. An unknown layer id is a programmer error and must throw loudly rather than silently do nothing (Task 2).

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/audio/mix.ts` | modify | Adds `BUS_GAIN`, `Bus`, `FILTER_OPEN_HZ`, cabin presets and glide, radio band constants, panner reference distance. Still imports nothing. |
| `src/audio/backend.ts` | modify | Seam v2: `LoopSpec`, `LoopHandle.setFilterCutoff`, `playOnce(..., bus, ..., at?)`, `setCabin`, `setListener`, `Position`, `ListenerPose`, `View`. Types only. |
| `src/audio/assets.ts` | modify | Adds `bus` to every `AudioAsset`. |
| `src/audio/layers.ts` | create | The `LAYERS` table (engine only for now), `LayerDrive`, `finiteOr`. |
| `src/audio/system.ts` | modify | `driveLayer`, `setView`, `playAt`, `setListener`; engine goes through `driveLayer`; wider snapshot. |
| `src/audio/webAudio.ts` | modify | Builds the bus graph (world buses to a cabin filter, radio bus through highpass, lowpass and soft clip), layered loops, cabin glide, panner one-shots. |
| `src/render/main.ts` | modify | One line: `audio.setView(...)` before the audio update. |
| `tests/audio/fakeBackend.ts` | modify | Records the wider seam. |
| `tests/audio/{buses,layers,cabin,positional}.test.ts` | create | One per task 1-4. |
| `tests/e2e/audio.spec.ts` | modify | Tier 2: buses live, view follows the camera. |
| `docs/handoff/2026-09-29-audio-foundation.md`, `README.md`, spec §15 row | create/modify | Handoff, README pointer, plan table row. |

---

### Task 1: Buses and a wider backend seam (no behavior change)

**Files:**
- Modify: `src/audio/mix.ts`, `src/audio/backend.ts`, `src/audio/assets.ts`, `src/audio/system.ts`, `src/audio/webAudio.ts`, `tests/audio/fakeBackend.ts`
- Create: `tests/audio/buses.test.ts`

**Interfaces:**
- Produces (`mix.ts`): `BUS_GAIN`, `type Bus = keyof typeof BUS_GAIN` (`'engine' | 'sfx' | 'ambient' | 'radio'`), `FILTER_OPEN_HZ`, `RADIO_BAND_LOW_HZ`, `RADIO_BAND_HIGH_HZ`, `RADIO_DRIVE`.
- Produces (`backend.ts`): `LoopSpec = { clip: ClipId; bus: Bus; loopStartS: number | null; loopEndS: number | null }`; `LoopHandle` gains `setFilterCutoff(hz, glideTauS)`; `AudioBackend.startLoop(spec: LoopSpec): LoopHandle`; `AudioBackend.playOnce(id, bus, gain, rate?)`.
- Produces (`assets.ts`): `AudioAsset.bus: Bus`.

- [ ] **Step 1: Create the worktree**

```bash
cd ~/projects/ww2airsim
git status --short   # must be clean
git worktree add ~/projects/ww2airsim-worktrees/audio-foundation -b worktree-audio-foundation main
cd ~/projects/ww2airsim-worktrees/audio-foundation
ls node_modules >/dev/null 2>&1 || npm ci
```

Expected: worktree created on a new branch; all later paths are relative to it.

- [ ] **Step 2: Write the failing test** — create `tests/audio/buses.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { AUDIO_ASSETS, assetFor } from '../../src/audio/assets.js'
import { BUS_GAIN } from '../../src/audio/mix.js'
import { createAudioSystem } from '../../src/audio/system.js'
import type { AudioInputs } from '../../src/audio/cues.js'
import { createFakeBackend } from './fakeBackend.js'

const flying: AudioInputs = {
  throttle: 1, engineRunning: true, impact: null, onGround: false, groundSurface: 'land', heightM: 50, sinkMps: 0, tick: 10, shots: 0,
  bombsDropped: 0, rocketsFired: 0,
}

describe('buses (spec §4)', () => {
  it('names a real bus for every clip, and the propeller is the engine bus', () => {
    const buses = Object.keys(BUS_GAIN)
    for (const clip of AUDIO_ASSETS) expect(buses, clip.id).toContain(clip.bus)
    expect(assetFor('propeller').bus).toBe('engine')
    expect(assetFor('water_crash').bus).toBe('sfx')
  })

  it('gives every bus a gain in (0, 1]', () => {
    for (const [bus, gain] of Object.entries(BUS_GAIN)) {
      expect(gain, bus).toBeGreaterThan(0)
      expect(gain, bus).toBeLessThanOrEqual(1)
    }
  })

  it('starts the propeller loop on the engine bus', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    expect(fake.loopsStarted[0]!.bus).toBe('engine')
  })

  it('plays a one-shot on its clip\'s bus', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update({ ...flying, throttle: 0, engineRunning: false, impact: { tick: 900, kind: 'ditched', surface: 'water' } })
    expect(fake.played.map((p) => [p.id, p.bus])).toEqual([['water_crash', 'sfx']])
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/audio/buses.test.ts`
Expected: FAIL (type/compile errors: `bus` does not exist on `AudioAsset`, `BUS_GAIN` not exported).

- [ ] **Step 4: Implement**

`src/audio/mix.ts` — append (after `worstCaseAmplitude`):

```ts
/** Per-bus output gain, applied in the audio graph after each bus's sources.
 *  `engine` and `sfx` are 1 so today's mix is unchanged (the gain budget in
 *  tests/audio/assets.test.ts is arithmetic on exactly those); `ambient` and
 *  `radio` are reasoned guesses until somebody flies them. */
export const BUS_GAIN = { engine: 1, sfx: 1, ambient: 0.6, radio: 0.9 } as const

export type Bus = keyof typeof BUS_GAIN

/** A lowpass at this frequency is inaudible: the "open" position of every
 *  per-layer filter. */
export const FILTER_OPEN_HZ = 20_000

/** The radio chain's pass band (spec §5.3) and how hard its soft clipper is
 *  driven. */
export const RADIO_BAND_LOW_HZ = 400
export const RADIO_BAND_HIGH_HZ = 3_200
export const RADIO_DRIVE = 2
```

`src/audio/backend.ts` — replace the file with:

```ts
import type { ClipId } from './assets.js'
import type { Bus } from './mix.js'

/**
 * The seam between this project's audio logic and the Web Audio API.
 *
 * Types only, deliberately. Node implements no Web Audio and neither does
 * jsdom, so switching `vitest.config.ts`'s environment would buy nothing --
 * the only way to test the WIRING is to inject something that records instead
 * of making a sound. Design §7.1.
 *
 * This is NOT the platform's audio-context type in disguise. Each verb is one
 * or two lines of real Web Audio on the far side, so a fake has to
 * reimplement a handful of small methods rather than `AudioBuffer`,
 * `GainNode` and `AudioParam`. The narrower the seam, the less a fake can lie
 * about.
 */

/** One looping layer: which clip, which bus it feeds, and its loop points.
 *  Both points `null` loops the whole file. */
export type LoopSpec = {
  readonly clip: ClipId
  readonly bus: Bus
  readonly loopStartS: number | null
  readonly loopEndS: number | null
}

export type LoopHandle = {
  setGain(value: number, glideTauS: number): void
  setPlaybackRate(value: number, glideTauS: number): void
  /** Lowpass cutoff for this layer alone, Hz. Starts fully open. */
  setFilterCutoff(hz: number, glideTauS: number): void
}

export type BackendState = 'suspended' | 'running' | 'closed'

export type AudioBackend = {
  state(): BackendState
  resume(): Promise<void>
  load(id: ClipId, url: string): Promise<void>
  /** The clips that decoded. A clip that failed to fetch or decode is absent,
   *  and `system.ts` will not play it -- silence beats a failure screen. */
  loaded(): readonly ClipId[]
  startLoop(spec: LoopSpec): LoopHandle
  /** `rate` defaults to 1 (its natural pitch). Instant replay (design §7)
   *  scales it with the replay speed, so a burst heard at 0.5x plays back at
   *  half pitch along with the engine loop, rather than at full pitch while
   *  everything else in the scene runs slow. */
  playOnce(id: ClipId, bus: Bus, gain: number, rate?: number): void
  setMasterGain(value: number): void
}
```

`src/audio/assets.ts` — add `import type { Bus } from './mix.js'` under the header comment (change its first sentence to "Imports nothing at runtime but `import.meta.env.BASE_URL`"), add `readonly bus: Bus` to `AudioAsset`, and set `bus: 'engine'` on `propeller` and `bus: 'sfx'` on the other six rows (add it after `path`, e.g. `{ id: 'explosion', path: '...', bus: 'sfx', bytes: ...`).

`src/audio/system.ts` — two call-site edits, no structural change yet:

```ts
// in update(): the loop start
loop = backend.startLoop({ clip: 'propeller', bus: 'engine', loopStartS: loopStartSeconds(), loopEndS: loopEndSeconds() })
// in update(): the cue loop
const asset = assetFor(cue)
backend.playOnce(cue, asset.bus, asset.cueGain, rate)
```

`src/audio/webAudio.ts` — replace with:

```ts
import type { ClipId } from './assets.js'
import type { AudioBackend, BackendState, LoopHandle, LoopSpec } from './backend.js'
import { BUS_GAIN, FILTER_OPEN_HZ, RADIO_BAND_HIGH_HZ, RADIO_BAND_LOW_HZ, RADIO_DRIVE, type Bus } from './mix.js'

/**
 * The only file under `src/` that touches Web Audio, which
 * `tests/architecture/boundary.test.ts` asserts rather than trusts.
 *
 * Deliberately boring and deliberately untested at Tier 1, for the reason
 * `legend.ts` states about its own DOM half: the vitest environment is `node`,
 * so everything worth asserting lives in the pure code above this. Tier 2
 * (tests/e2e/audio.spec.ts) is this file's coverage.
 *
 * No `try`/`catch` here: `load` rejects and `system.ts` turns that into
 * silence, so the failure policy lives in exactly one place (design §10.2).
 *
 * Graph: engine, sfx and ambient buses feed one world stage; the radio bus
 * feeds a highpass, lowpass and soft clipper (the radio voice, spec §5.3).
 * Both reach master. The cabin stage between them and master arrives in Task 3.
 */
function softClipCurve(drive: number): Float32Array {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive)
  }
  return curve
}

export function createWebAudioBackend(): AudioBackend {
  const context = new AudioContext()
  const master = context.createGain()
  master.connect(context.destination)
  const buffers = new Map<ClipId, AudioBuffer>()

  const world = context.createGain()
  world.connect(master)

  const radioHigh = context.createBiquadFilter()
  radioHigh.type = 'highpass'
  radioHigh.frequency.value = RADIO_BAND_LOW_HZ
  const radioLow = context.createBiquadFilter()
  radioLow.type = 'lowpass'
  radioLow.frequency.value = RADIO_BAND_HIGH_HZ
  const radioShaper = context.createWaveShaper()
  radioShaper.curve = softClipCurve(RADIO_DRIVE) as Float32Array<ArrayBuffer>
  radioHigh.connect(radioLow)
  radioLow.connect(radioShaper)
  radioShaper.connect(master)

  const busNode = (bus: Bus, into: AudioNode): GainNode => {
    const node = context.createGain()
    node.gain.value = BUS_GAIN[bus]
    node.connect(into)
    return node
  }
  const buses: Record<Bus, GainNode> = {
    engine: busNode('engine', world),
    sfx: busNode('sfx', world),
    ambient: busNode('ambient', world),
    radio: busNode('radio', radioHigh),
  }

  return {
    state: (): BackendState => context.state as BackendState,

    resume: async (): Promise<void> => { await context.resume() },

    load: async (id: ClipId, url: string): Promise<void> => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
      buffers.set(id, await context.decodeAudioData(await response.arrayBuffer()))
    },

    loaded: (): readonly ClipId[] => [...buffers.keys()],

    startLoop: (spec: LoopSpec): LoopHandle => {
      const buffer = buffers.get(spec.clip)
      if (buffer === undefined) throw new Error(`startLoop before ${spec.clip} decoded`)
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = FILTER_OPEN_HZ
      // Starts silent: the system writes the real gain immediately after, and a
      // default of 1 would glide down from full volume for ~50 ms first.
      const gain = context.createGain()
      gain.gain.value = 0
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      if (spec.loopStartS !== null && spec.loopEndS !== null) {
        source.loopStart = spec.loopStartS
        source.loopEnd = spec.loopEndS
      }
      source.connect(filter)
      filter.connect(gain)
      gain.connect(buses[spec.bus])
      source.start(0)
      // `setTargetAtTime`, never a plain assignment: an AudioParam stepped in
      // one frame clicks, and `M` moves the throttle 1 -> 0 in one frame.
      return {
        setGain: (value: number, glideTauS: number): void =>
          { gain.gain.setTargetAtTime(value, context.currentTime, glideTauS) },
        setPlaybackRate: (value: number, glideTauS: number): void =>
          { source.playbackRate.setTargetAtTime(value, context.currentTime, glideTauS) },
        setFilterCutoff: (hz: number, glideTauS: number): void =>
          { filter.frequency.setTargetAtTime(hz, context.currentTime, glideTauS) },
      }
    },

    playOnce: (id: ClipId, bus: Bus, value: number, rate?: number): void => {
      const buffer = buffers.get(id)
      if (buffer === undefined) return
      // A fresh source per call: AudioBufferSourceNodes are single-use by
      // specification. The `onended` disconnect is what stops a long flight
      // accumulating dead nodes on the bus.
      const gain = context.createGain()
      gain.gain.value = value
      gain.connect(buses[bus])
      const source = context.createBufferSource()
      source.buffer = buffer
      // A plain assignment: a one-shot's rate is fixed for its short life.
      source.playbackRate.value = rate ?? 1
      source.connect(gain)
      source.onended = (): void => { source.disconnect(); gain.disconnect() }
      source.start(0)
    },

    setMasterGain: (value: number): void => { master.gain.value = value },
  }
}
```

`tests/audio/fakeBackend.ts` — replace with:

```ts
import type { ClipId } from '../../src/audio/assets.js'
import type { AudioBackend, BackendState, LoopHandle, LoopSpec } from '../../src/audio/backend.js'
import type { Bus } from '../../src/audio/mix.js'

/**
 * Records every call instead of making a sound.
 *
 * Typed as `AudioBackend`, not as a loose object: adding a verb to the
 * interface becomes a `tsc` error HERE rather than a production path that
 * silently no test ever exercises.
 */
export type FakeLayer = {
  readonly clip: ClipId
  readonly bus: Bus
  readonly gains: number[]
  readonly rates: number[]
  readonly cutoffs: number[]
  readonly glides: number[]
}

export type FakeBackend = AudioBackend & {
  readonly loopsStarted: { id: ClipId; bus: Bus; startS: number | null; endS: number | null }[]
  readonly layers: FakeLayer[]
  readonly played: { id: ClipId; bus: Bus; gain: number; rate: number }[]
  readonly masterGains: number[]
  /** The three below record only loops on the `engine` bus. */
  readonly engineGains: number[]
  readonly engineRates: number[]
  readonly engineGlides: number[]
  readonly resumed: number[]
}

export function createFakeBackend(options: { failToLoad?: readonly ClipId[] } = {}): FakeBackend {
  const failToLoad = new Set(options.failToLoad ?? [])
  const decoded: ClipId[] = []
  const loopsStarted: FakeBackend['loopsStarted'] = []
  const layers: FakeLayer[] = []
  const played: FakeBackend['played'] = []
  const masterGains: number[] = []
  const engineGains: number[] = []
  const engineRates: number[] = []
  const engineGlides: number[] = []
  const resumed: number[] = []
  let state: BackendState = 'suspended'

  return {
    loopsStarted, layers, played, masterGains, engineGains, engineRates, engineGlides, resumed,
    state: (): BackendState => state,
    resume: async (): Promise<void> => { resumed.push(resumed.length); state = 'running' },
    load: async (id: ClipId): Promise<void> => {
      // Rejects rather than resolving quietly, because that is what a failed
      // fetch or a rejected decodeAudioData does, and `load()` swallowing it
      // per clip is the behaviour under test.
      if (failToLoad.has(id)) throw new Error(`fake: refusing to load ${id}`)
      decoded.push(id)
    },
    loaded: (): readonly ClipId[] => decoded,
    startLoop: (spec: LoopSpec): LoopHandle => {
      loopsStarted.push({ id: spec.clip, bus: spec.bus, startS: spec.loopStartS, endS: spec.loopEndS })
      const layer: FakeLayer = { clip: spec.clip, bus: spec.bus, gains: [], rates: [], cutoffs: [], glides: [] }
      layers.push(layer)
      const isEngine = spec.bus === 'engine'
      return {
        setGain: (value: number, glideTauS: number): void => {
          layer.gains.push(value); layer.glides.push(glideTauS)
          if (isEngine) { engineGains.push(value); engineGlides.push(glideTauS) }
        },
        setPlaybackRate: (value: number, glideTauS: number): void => {
          layer.rates.push(value); layer.glides.push(glideTauS)
          if (isEngine) { engineRates.push(value); engineGlides.push(glideTauS) }
        },
        setFilterCutoff: (hz: number, glideTauS: number): void => { layer.cutoffs.push(hz); layer.glides.push(glideTauS) },
      }
    },
    playOnce: (id: ClipId, bus: Bus, gain: number, rate = 1): void => { played.push({ id, bus, gain, rate }) },
    setMasterGain: (value: number): void => { masterGains.push(value) },
  }
}
```

- [ ] **Step 5: Run to verify it passes, and nothing else regressed**

Run: `npx vitest run tests/audio && npm run typecheck`
Expected: PASS. If an existing `system.test.ts` case reads a fake field this task renamed, adjust the *test's* expectation to the new field name only (behavior must be identical); do not change `system.ts` behavior to fit a test.

- [ ] **Step 6: Commit**

```bash
git add src/audio tests/audio
git commit -m "$(cat <<'EOF'
Audio: buses and a wider backend seam, no behavior change

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Named layers and `driveLayer`

**Files:**
- Create: `src/audio/layers.ts`, `tests/audio/layers.test.ts`
- Modify: `src/audio/system.ts`

**Interfaces:**
- Consumes: `LoopSpec`, `LoopHandle`, `AudioBackend`, `Bus`, `ENGINE_GLIDE_TAU_S`, `FILTER_OPEN_HZ`, `loopStartSeconds`, `loopEndSeconds` from Task 1 and existing modules.
- Produces (`layers.ts`): `LayerDef = { clip: ClipId; bus: Bus; loopStartS: number | null; loopEndS: number | null; glideTauS: number }`, `LayerTable = Readonly<Record<string, LayerDef>>`, `LAYERS` (has `engine`), `LayerDrive = { gain: number; rate: number; cutoffHz?: number }`, `finiteOr(x: number, fallback: number): number`.
- Produces (`system.ts`): `createAudioSystem(backend, layers: LayerTable = LAYERS)`; `AudioSystem.driveLayer(id: string, drive: LayerDrive, rate?: number): void`; `AudioSnapshot.layers: Readonly<Record<string, { gain: number; rate: number; cutoffHz: number | null }>>`.

- [ ] **Step 1: Write the failing test** — create `tests/audio/layers.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createAudioSystem } from '../../src/audio/system.js'
import { LAYERS, finiteOr, type LayerTable } from '../../src/audio/layers.js'
import { FILTER_OPEN_HZ } from '../../src/audio/mix.js'
import type { AudioInputs } from '../../src/audio/cues.js'
import { createFakeBackend } from './fakeBackend.js'

const flying: AudioInputs = {
  throttle: 1, engineRunning: true, impact: null, onGround: false, groundSurface: 'land', heightM: 50, sinkMps: 0, tick: 10, shots: 0,
  bombsDropped: 0, rocketsFired: 0,
}

// A second layer on a clip that is already committed, so the test needs no new asset.
const twoLayers: LayerTable = {
  ...LAYERS,
  wind: { clip: 'machinegun', bus: 'ambient', loopStartS: null, loopEndS: null, glideTauS: 0.1 },
}

describe('finiteOr', () => {
  it('passes finite numbers through and replaces NaN and infinities', () => {
    expect(finiteOr(0.5, 9)).toBe(0.5)
    expect(finiteOr(Number.NaN, 9)).toBe(9)
    expect(finiteOr(Number.POSITIVE_INFINITY, 9)).toBe(9)
  })
})

describe('driveLayer (spec §4: named layered loops)', () => {
  it('starts each layer once, on its own bus, with its own loop points', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    audio.driveLayer('wind', { gain: 0.4, rate: 1 })
    audio.update(flying)
    expect(fake.loopsStarted.map((l) => [l.id, l.bus, l.startS, l.endS])).toEqual([
      ['machinegun', 'ambient', null, null],
      ['propeller', 'engine', expect.any(Number), expect.any(Number)],
    ])
  })

  it('writes gain, rate and cutoff, and multiplies rate by the replay rate', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.driveLayer('wind', { gain: 0.3, rate: 1.2, cutoffHz: 800 }, 0.5)
    const wind = fake.layers[0]!
    expect(wind.gains.at(-1)).toBe(0.3)
    expect(wind.rates.at(-1)).toBeCloseTo(0.6, 12)
    expect(wind.cutoffs.at(-1)).toBe(800)
    expect(wind.glides.every((tau) => tau === 0.1)).toBe(true)
  })

  it('does not touch the cutoff when the drive has none', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    expect(fake.layers[0]!.cutoffs).toEqual([])
    expect(audio.snapshot().layers['wind']!.cutoffHz).toBeNull()
  })

  it('is a silent no-op when the layer\'s clip never decoded (Review Focus 1)', async () => {
    const fake = createFakeBackend({ failToLoad: ['machinegun'] })
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    expect(() => audio.driveLayer('wind', { gain: 0.3, rate: 1 })).not.toThrow()
    expect(fake.loopsStarted).toEqual([])
  })

  it('never lets NaN or Infinity reach the backend (Review Focus 2)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.driveLayer('wind', { gain: Number.NaN, rate: Number.POSITIVE_INFINITY, cutoffHz: Number.NaN })
    const wind = fake.layers[0]!
    expect([...wind.gains, ...wind.rates, ...wind.cutoffs].every(Number.isFinite)).toBe(true)
    expect(wind.gains.at(-1)).toBe(0)
    expect(wind.rates.at(-1)).toBe(1)
    expect(wind.cutoffs.at(-1)).toBe(FILTER_OPEN_HZ)
  })

  it('throws loudly on an unknown layer id (Review Focus 5)', async () => {
    const audio = createAudioSystem(createFakeBackend(), twoLayers)
    await audio.load()
    expect(() => audio.driveLayer('nope', { gain: 1, rate: 1 })).toThrow(/no audio layer named nope/)
  })

  it('holds every layer at zero, then restores on the next drive (Review Focus 4)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.update(flying)
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    audio.hold(true)
    expect(fake.layers.every((l) => l.gains.at(-1) === 0)).toBe(true)
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    expect(fake.layers[1]!.gains.at(-1)).toBe(0)
    audio.hold(false)
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    expect(fake.layers[1]!.gains.at(-1)).toBe(0.3)
  })

  it('exposes every layer in the snapshot, and keeps the engine fields Tier 2 reads', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.update(flying)
    const snap = audio.snapshot()
    expect(snap.engineGain).toBe(snap.layers['engine']!.gain)
    expect(snap.enginePlaybackRate).toBe(snap.layers['engine']!.rate)
    expect(snap.engineGain).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/audio/layers.test.ts`
Expected: FAIL (`layers.js` does not exist).

- [ ] **Step 3: Implement**

Create `src/audio/layers.ts`:

```ts
import type { ClipId } from './assets.js'
import type { Bus } from './mix.js'
import { ENGINE_GLIDE_TAU_S, loopEndSeconds, loopStartSeconds } from './mix.js'

/**
 * Every looping layer the audio system can drive, by name.
 *
 * Adding a sound that runs continuously (wind, sea, wheel rumble, a second
 * engine) is adding a row here and calling `driveLayer` with its id; no new
 * backend verb. Loop points are `null` for a clip that loops whole.
 */
export type LayerDef = {
  readonly clip: ClipId
  readonly bus: Bus
  readonly loopStartS: number | null
  readonly loopEndS: number | null
  /** Time constant for every parameter write on this layer. Must be > 0: a
   *  step on an AudioParam is an audible click. */
  readonly glideTauS: number
}

export type LayerTable = Readonly<Record<string, LayerDef>>

export const LAYERS = {
  engine: {
    clip: 'propeller',
    bus: 'engine',
    loopStartS: loopStartSeconds(),
    loopEndS: loopEndSeconds(),
    glideTauS: ENGINE_GLIDE_TAU_S,
  },
} as const satisfies LayerTable

export type LayerDrive = {
  readonly gain: number
  readonly rate: number
  /** Omit to leave the layer's lowpass where it is (initially fully open). */
  readonly cutoffHz?: number
}

/** `x` if finite, else `fallback`. A non-finite value reaching an AudioParam
 *  throws inside the render loop. */
export function finiteOr(x: number, fallback: number): number {
  return Number.isFinite(x) ? x : fallback
}
```

`src/audio/system.ts` — apply these edits:

1. Imports: add `import { LAYERS, finiteOr, type LayerDrive, type LayerTable } from './layers.js'`; remove `loopEndSeconds, loopStartSeconds` and `ENGINE_GLIDE_TAU_S` from the `mix.js` import, and add `FILTER_OPEN_HZ` (keep `MASTER_GAIN`).
2. `AudioSnapshot`: add `readonly layers: Readonly<Record<string, { readonly gain: number; readonly rate: number; readonly cutoffHz: number | null }>>`. Keep `engineGain` and `enginePlaybackRate`.
3. `AudioSystem`: add
```ts
  /** Drives one named looping layer (`LAYERS`). Starts it on first use once its
   *  clip has decoded; a layer whose clip failed is a silent no-op. `rate` is
   *  the replay speed, multiplied into the layer's playback rate. */
  driveLayer(id: string, drive: LayerDrive, rate?: number): void
```
4. Signature: `export function createAudioSystem(backend: AudioBackend, layers: LayerTable = LAYERS): AudioSystem {`
5. In the closure, replace the `loop`, `engineGain`, `enginePlaybackRate` variables with:
```ts
  const handles = new Map<string, LoopHandle>()
  const layerState = new Map<string, { gain: number; rate: number; cutoffHz: number | null }>()
```
   and add, before `return {`:
```ts
  function driveLayer(id: string, drive: LayerDrive, rate = 1): void {
    const def = layers[id]
    if (def === undefined) throw new Error(`no audio layer named ${id}`)
    if (!backend.loaded().includes(def.clip)) return
    let handle = handles.get(id)
    if (handle === undefined) {
      // Started lazily: the buffer has to have decoded first, and starting it
      // here means one call site handles "decoded late" and "never decoded".
      handle = backend.startLoop({ clip: def.clip, bus: def.bus, loopStartS: def.loopStartS, loopEndS: def.loopEndS })
      handles.set(id, handle)
    }
    // Glided, never assigned (see LayerDef.glideTauS). Held (a paused replay)
    // overrides the computed gain with 0, same as `hold(true)` itself.
    const gain = held ? 0 : finiteOr(drive.gain, 0)
    const playbackRate = finiteOr(drive.rate, 1) * rate
    handle.setGain(gain, def.glideTauS)
    handle.setPlaybackRate(playbackRate, def.glideTauS)
    let cutoffHz: number | null = null
    if (drive.cutoffHz !== undefined) {
      cutoffHz = finiteOr(drive.cutoffHz, FILTER_OPEN_HZ)
      handle.setFilterCutoff(cutoffHz, def.glideTauS)
    }
    layerState.set(id, { gain, rate: playbackRate, cutoffHz })
  }
```
6. `update`: delete the old lazy-start and `if (loop !== null) { ... }` block; in its place put
```ts
      driveLayer('engine', { gain: frame.engine.gain, rate: frame.engine.playbackRate }, rate)
```
   (keep `const ready = backend.loaded()` for the cue loop).
7. Add `driveLayer,` to the returned object.
8. `hold(isHeld)`: replace the body's `if (held && loop !== null)` block with
```ts
      held = isHeld
      if (held) {
        for (const [id, handle] of handles) {
          handle.setGain(0, layers[id]!.glideTauS)
          const s = layerState.get(id)
          if (s !== undefined) layerState.set(id, { ...s, gain: 0 })
        }
      }
```
9. `snapshot()`: replace `engineGain, enginePlaybackRate,` with
```ts
        engineGain: layerState.get('engine')?.gain ?? 0,
        enginePlaybackRate: layerState.get('engine')?.rate ?? 0,
        layers: Object.fromEntries(layerState),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio && npm run typecheck`
Expected: PASS, including every pre-existing `system.test.ts` case (the engine now goes through `driveLayer`; its observable behavior must be identical).

- [ ] **Step 5: Commit**

```bash
git add src/audio tests/audio
git commit -m "$(cat <<'EOF'
Audio: named looping layers and driveLayer

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Cabin mix (cockpit vs chase)

**Files:**
- Modify: `src/audio/mix.ts`, `src/audio/backend.ts`, `src/audio/system.ts`, `src/audio/webAudio.ts`, `src/render/main.ts`, `tests/audio/fakeBackend.ts`
- Create: `tests/audio/cabin.test.ts`

**Interfaces:**
- Consumes: Task 1's `world` stage and radio chain in `webAudio.ts`.
- Produces (`mix.ts`): `type View = 'cockpit' | 'chase'`, `CabinPreset`, `CABIN_PRESETS: Record<View, CabinPreset>`, `CABIN_GLIDE_TAU_S`.
- Produces (`backend.ts`): `AudioBackend.setCabin(preset: CabinPreset, glideTauS: number): void`.
- Produces (`system.ts`): `AudioSystem.setView(view: View): void`; `AudioSnapshot.view: View | null`.

- [ ] **Step 1: Write the failing test** — create `tests/audio/cabin.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { CABIN_GLIDE_TAU_S, CABIN_PRESETS, RADIO_BAND_HIGH_HZ, RADIO_BAND_LOW_HZ } from '../../src/audio/mix.js'
import { createAudioSystem } from '../../src/audio/system.js'
import { createFakeBackend } from './fakeBackend.js'

describe('cabin presets (spec §2: cockpit and chase are different mixes)', () => {
  it('makes the chase view brighter for the world and quieter and farther for the radio', () => {
    expect(CABIN_PRESETS.chase.worldLowpassHz).toBeGreaterThan(CABIN_PRESETS.cockpit.worldLowpassHz)
    expect(CABIN_PRESETS.chase.radioLowpassHz).toBeLessThan(CABIN_PRESETS.cockpit.radioLowpassHz)
    expect(CABIN_PRESETS.chase.radioGain).toBeLessThan(CABIN_PRESETS.cockpit.radioGain)
  })

  it('never puts a preset gain above 1 or a cutoff at or below zero', () => {
    for (const p of Object.values(CABIN_PRESETS)) {
      expect(p.worldGain).toBeGreaterThan(0)
      expect(p.worldGain).toBeLessThanOrEqual(1)
      expect(p.radioGain).toBeGreaterThan(0)
      expect(p.radioGain).toBeLessThanOrEqual(1)
      expect(p.worldLowpassHz).toBeGreaterThan(0)
      expect(p.radioLowpassHz).toBeGreaterThan(0)
    }
  })

  it('keeps the radio pass band ordered and glides with a positive tau', () => {
    expect(RADIO_BAND_LOW_HZ).toBeGreaterThan(0)
    expect(RADIO_BAND_HIGH_HZ).toBeGreaterThan(RADIO_BAND_LOW_HZ)
    expect(CABIN_GLIDE_TAU_S).toBeGreaterThan(0)
  })
})

describe('setView', () => {
  it('sends the matching preset with the glide, once per change (Review Focus 3)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    for (let i = 0; i < 100; i++) audio.setView('cockpit')
    expect(fake.cabins).toEqual([{ preset: CABIN_PRESETS.cockpit, tauS: CABIN_GLIDE_TAU_S }])
    for (let i = 0; i < 100; i++) audio.setView('chase')
    expect(fake.cabins.map((c) => c.preset)).toEqual([CABIN_PRESETS.cockpit, CABIN_PRESETS.chase])
    audio.setView('cockpit')
    expect(fake.cabins).toHaveLength(3)
  })

  it('reports the view in the snapshot, null before the first call', async () => {
    const audio = createAudioSystem(createFakeBackend())
    expect(audio.snapshot().view).toBeNull()
    audio.setView('cockpit')
    expect(audio.snapshot().view).toBe('cockpit')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/audio/cabin.test.ts`
Expected: FAIL (`CABIN_PRESETS`, `setView`, `fake.cabins` do not exist).

- [ ] **Step 3: Implement**

`src/audio/mix.ts` — append:

```ts
export type View = 'cockpit' | 'chase'

/** What the cabin stage does to the mix in one view (spec §2). The world
 *  buses go through one lowpass and gain; the radio through its own. The
 *  initial numbers are deliberately mild, reasoned guesses: the default view is
 *  chase and today's mix must not change audibly until Mark has flown the
 *  presets and tuned them. */
export type CabinPreset = {
  readonly worldLowpassHz: number
  readonly worldGain: number
  readonly radioLowpassHz: number
  readonly radioGain: number
}

export const CABIN_PRESETS: Readonly<Record<View, CabinPreset>> = {
  cockpit: { worldLowpassHz: 9_000, worldGain: 1, radioLowpassHz: 20_000, radioGain: 1 },
  chase: { worldLowpassHz: 16_000, worldGain: 0.9, radioLowpassHz: 2_200, radioGain: 0.7 },
}

/** Crossfade time constant when the view changes. */
export const CABIN_GLIDE_TAU_S = 0.25
```

`src/audio/backend.ts` — change the mix import to `import type { Bus, CabinPreset } from './mix.js'` and add to `AudioBackend`:

```ts
  /** Moves the cabin stage (world lowpass and gain, radio lowpass and gain) to
   *  `preset`, gliding with `glideTauS`. */
  setCabin(preset: CabinPreset, glideTauS: number): void
```

`tests/audio/fakeBackend.ts` — add `import type { CabinPreset } from '../../src/audio/mix.js'` (merge with the existing `Bus` import), add to the `FakeBackend` type `readonly cabins: { preset: CabinPreset; tauS: number }[]`, create `const cabins: FakeBackend['cabins'] = []`, include `cabins` in the returned object, and add the verb:

```ts
    setCabin: (preset: CabinPreset, tauS: number): void => { cabins.push({ preset, tauS }) },
```

`src/audio/system.ts` — import `CABIN_GLIDE_TAU_S, CABIN_PRESETS, type View` from `./mix.js`; add `readonly view: View | null` to `AudioSnapshot`; add `setView(view: View): void` to `AudioSystem` (doc: "Called every frame; reaches the backend only when the view changes"); in the closure add `let view: View | null = null`; in the returned object:

```ts
    setView(next: View): void {
      if (next === view) return
      view = next
      backend.setCabin(CABIN_PRESETS[next], CABIN_GLIDE_TAU_S)
    },
```
and add `view,` to `snapshot()`.

`src/audio/webAudio.ts` — add `CABIN_PRESETS, type CabinPreset` to the `mix.js` import. Replace the `world` gain node and radio tail with a cabin stage that starts on the **chase** preset (the app's default `cameraMode`, `src/render/frame.ts`):

```ts
  const start = CABIN_PRESETS.chase

  // World stage: buses -> lowpass -> gain -> master.
  const worldFilter = context.createBiquadFilter()
  worldFilter.type = 'lowpass'
  worldFilter.frequency.value = start.worldLowpassHz
  const worldGain = context.createGain()
  worldGain.gain.value = start.worldGain
  worldFilter.connect(worldGain)
  worldGain.connect(master)
```
then use `worldFilter` where `world` was in `buses` (`engine: busNode('engine', worldFilter)`, etc.), delete the `world` node, and change the radio tail to `radioShaper -> radioCabinFilter -> radioCabinGain -> master`:

```ts
  const radioCabinFilter = context.createBiquadFilter()
  radioCabinFilter.type = 'lowpass'
  radioCabinFilter.frequency.value = start.radioLowpassHz
  const radioCabinGain = context.createGain()
  radioCabinGain.gain.value = start.radioGain
  radioShaper.connect(radioCabinFilter)
  radioCabinFilter.connect(radioCabinGain)
  radioCabinGain.connect(master)
```
(remove the old `radioShaper.connect(master)`), and add to the returned backend:

```ts
    setCabin: (preset: CabinPreset, glideTauS: number): void => {
      const now = context.currentTime
      worldFilter.frequency.setTargetAtTime(preset.worldLowpassHz, now, glideTauS)
      worldGain.gain.setTargetAtTime(preset.worldGain, now, glideTauS)
      radioCabinFilter.frequency.setTargetAtTime(preset.radioLowpassHz, now, glideTauS)
      radioCabinGain.gain.setTargetAtTime(preset.radioGain, now, glideTauS)
    },
```
Update the file header's last sentence: the cabin stage now exists.

`src/render/main.ts` — immediately before the line `if (replay === null) audio.update(audioInputsFrom(current))` (near line 2469) add:

```ts
    audio.setView(view.cameraMode === 'cockpit' ? 'cockpit' : 'chase')
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio && npm run typecheck && npm run lint`
Expected: PASS. If `view.cameraMode` does not typecheck, the value is on `current` (`current.cameraMode`, used by `flightData.update` a few lines below); use whichever is in scope, `view` preferred because it follows a replay's drawn camera.

- [ ] **Step 5: Commit**

```bash
git add src tests/audio
git commit -m "$(cat <<'EOF'
Audio: cockpit and chase cabin mix

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Positioned one-shots and the listener

**Files:**
- Modify: `src/audio/mix.ts`, `src/audio/backend.ts`, `src/audio/system.ts`, `src/audio/webAudio.ts`, `tests/audio/fakeBackend.ts`
- Create: `tests/audio/positional.test.ts`

**Interfaces:**
- Produces (`backend.ts`): `Position = { x; y; z }`, `ListenerPose = { position: Position; forward: Position; up: Position }`, `playOnce(id, bus, gain, rate?, at?: Position)`, `setListener(pose: ListenerPose): void`.
- Produces (`system.ts`): `AudioSystem.playAt(clip: ClipId, at: Position, rate?: number): void`, `AudioSystem.setListener(pose: ListenerPose): void`, `AudioSnapshot.spatialPlayed: number`.
- Produces (`mix.ts`): `PANNER_REF_DISTANCE_M`.
- Not in this plan: wiring `setListener` to the camera and any Doppler; that is sub-project 5 (spec §5.4). This task makes the seam ready and covers it.

- [ ] **Step 1: Write the failing test** — create `tests/audio/positional.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { assetFor } from '../../src/audio/assets.js'
import { createAudioSystem } from '../../src/audio/system.js'
import { createFakeBackend } from './fakeBackend.js'

const at = { x: 100, y: 20, z: -300 }
const pose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } }

describe('playAt (spec §4: one-shots take an optional position)', () => {
  it('plays the clip on its bus, at its cue gain, with the position', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.playAt('explosion', at, 0.5)
    expect(fake.played).toEqual([{ id: 'explosion', bus: 'sfx', gain: assetFor('explosion').cueGain, rate: 0.5, at }])
    expect(audio.snapshot().spatialPlayed).toBe(1)
  })

  it('does not play a clip that failed to decode', async () => {
    const fake = createFakeBackend({ failToLoad: ['explosion'] })
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.playAt('explosion', at)
    expect(fake.played).toEqual([])
  })

  it('drops a non-finite position instead of passing NaN on (Review Focus 2)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.playAt('explosion', { x: Number.NaN, y: 0, z: 0 })
    audio.playAt('explosion', { x: 0, y: Number.POSITIVE_INFINITY, z: 0 })
    expect(fake.played).toEqual([])
  })

  it('is silent while a replay is held (Review Focus 4)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.hold(true)
    audio.playAt('explosion', at)
    expect(fake.played).toEqual([])
    audio.hold(false)
    audio.playAt('explosion', at)
    expect(fake.played).toHaveLength(1)
  })
})

describe('setListener', () => {
  it('passes the pose to the backend, dropping any pose with a non-finite component', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    audio.setListener(pose)
    audio.setListener({ ...pose, forward: { x: Number.NaN, y: 0, z: -1 } })
    expect(fake.listeners).toEqual([pose])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/audio/positional.test.ts`
Expected: FAIL (`playAt`, `setListener`, `fake.listeners` do not exist).

- [ ] **Step 3: Implement**

`src/audio/mix.ts` — append:

```ts
/** Distance at which a positioned one-shot is at its recorded level; beyond it
 *  the panner's inverse-distance model attenuates. Placeholder until
 *  sub-project 5 tunes rolloff by flying it. */
export const PANNER_REF_DISTANCE_M = 100
```

`src/audio/backend.ts` — add the types and verbs:

```ts
/** A point in world space, metres. Defined here, not borrowed from `sim/`:
 *  `audio/` must not import the simulation. */
export type Position = { readonly x: number; readonly y: number; readonly z: number }

export type ListenerPose = {
  readonly position: Position
  readonly forward: Position
  readonly up: Position
}
```
change `playOnce` to `playOnce(id: ClipId, bus: Bus, gain: number, rate?: number, at?: Position): void` (extend its doc: "`at` places the sound in the world; omitted, it is heard in the head") and add `setListener(pose: ListenerPose): void`.

`tests/audio/fakeBackend.ts` — import `ListenerPose, Position` types; `played` element type becomes `{ id: ClipId; bus: Bus; gain: number; rate: number; at?: Position }`; add `readonly listeners: ListenerPose[]`; `playOnce` becomes
```ts
    playOnce: (id: ClipId, bus: Bus, gain: number, rate = 1, at?: Position): void => {
      played.push(at === undefined ? { id, bus, gain, rate } : { id, bus, gain, rate, at })
    },
    setListener: (pose: ListenerPose): void => { listeners.push(pose) },
```
(and `listeners` created and returned like the other arrays).

`src/audio/system.ts` — import `finiteOr`-adjacent helper not needed; add to the closure `let spatialPlayed = 0` and

```ts
  const finitePosition = (p: Position): boolean => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
```
add `playAt(clip: ClipId, at: Position, rate?: number): void` and `setListener(pose: ListenerPose): void` to `AudioSystem` (with `Position, ListenerPose` type imports from `./backend.js`) and `readonly spatialPlayed: number` to `AudioSnapshot`; implement:

```ts
    playAt(clip: ClipId, at: Position, rate = 1): void {
      // Same rules as any cue: silent while held, never a failed clip, never
      // a NaN position (a non-finite value on a PannerNode throws).
      if (held) return
      if (!backend.loaded().includes(clip)) return
      if (!finitePosition(at)) return
      const asset = assetFor(clip)
      spatialPlayed++
      backend.playOnce(clip, asset.bus, asset.cueGain, rate, at)
    },

    setListener(pose: ListenerPose): void {
      if (!finitePosition(pose.position) || !finitePosition(pose.forward) || !finitePosition(pose.up)) return
      backend.setListener(pose)
    },
```
and `spatialPlayed,` in `snapshot()`.

`src/audio/webAudio.ts` — add `PANNER_REF_DISTANCE_M` to the `mix.js` import and `Position, ListenerPose` to the `backend.js` type import; replace `playOnce` with:

```ts
    playOnce: (id: ClipId, bus: Bus, value: number, rate?: number, at?: Position): void => {
      const buffer = buffers.get(id)
      if (buffer === undefined) return
      const gain = context.createGain()
      gain.gain.value = value
      let panner: PannerNode | null = null
      if (at === undefined) {
        gain.connect(buses[bus])
      } else {
        panner = context.createPanner()
        panner.panningModel = 'equalpower'
        panner.distanceModel = 'inverse'
        panner.refDistance = PANNER_REF_DISTANCE_M
        panner.rolloffFactor = 1
        panner.positionX.value = at.x
        panner.positionY.value = at.y
        panner.positionZ.value = at.z
        gain.connect(panner)
        panner.connect(buses[bus])
      }
      const source = context.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = rate ?? 1
      source.connect(gain)
      source.onended = (): void => { source.disconnect(); gain.disconnect(); panner?.disconnect() }
      source.start(0)
    },

    setListener: (pose: ListenerPose): void => {
      const l = context.listener
      l.positionX.value = pose.position.x
      l.positionY.value = pose.position.y
      l.positionZ.value = pose.position.z
      l.forwardX.value = pose.forward.x
      l.forwardY.value = pose.forward.y
      l.forwardZ.value = pose.forward.z
      l.upX.value = pose.up.x
      l.upY.value = pose.up.y
      l.upZ.value = pose.up.z
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/audio && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests/audio
git commit -m "$(cat <<'EOF'
Audio: positioned one-shots and listener pose on the backend seam

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tier 2 coverage, handoff, and the full check

**Files:**
- Modify: `tests/e2e/audio.spec.ts`, `README.md`, `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15 table)
- Create: `docs/handoff/2026-09-29-audio-foundation.md`

- [ ] **Step 1: Add the Tier 2 cases** — append to `tests/e2e/audio.spec.ts`

```ts
test('the engine runs as a named layer on the engine bus, and the view follows the camera', async ({ page }) => {
  // The one thing no fake can know: the bus graph and cabin stage built by
  // src/audio/webAudio.ts accept the writes system.ts makes, in the shipped app.
  await page.goto('/')
  await waitForTerrain(page)
  await page.keyboard.press('KeyP') // deliberately UNBOUND: a gesture that changes nothing
  await expect
    .poll(() => page.evaluate(() => Object.keys((window as DiagWindow).__ww2!.audio().layers)), { timeout: 30_000 })
    .toContain('engine')

  // Every camera mode maps to cockpit or chase, so after a full cycle of KeyC
  // the snapshot's view has taken BOTH values at some point.
  const seen = new Set<string>()
  const initialMode = await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())
  for (let i = 0; i < 8; i++) {
    await page.keyboard.down('KeyC')
    await page.waitForTimeout(400)
    await page.keyboard.up('KeyC')
    await page.waitForTimeout(300)
    const view = await page.evaluate(() => (window as DiagWindow).__ww2!.audio().view)
    if (view !== null) seen.add(view)
    if (seen.size === 2) break
    if ((await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())) === initialMode && i > 0) break
  }
  expect([...seen].sort(), 'cycling the camera should reach both cabin presets').toEqual(['chase', 'cockpit'])
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().failed)).toEqual([])
})
```

- [ ] **Step 2: Run the audio Tier 2 spec locally on nexus** (non-measurement run; real WebGPU on the 680M; see `CLAUDE.md`)

Run: `npx playwright test tests/e2e/audio.spec.ts`
Expected: all cases PASS, including the pre-existing ones. If the dev server or base URL must be provided, follow README's "Tier 2: the GPU harness" recipe; if the session lacks the `render` group, prefix with `sg render -c '...'`. If the new case fails only because `cameraMode()` never reaches a `cockpit` mode in the fixed 8 presses, read `MODES` in `src/render/frame.ts` and adjust the loop count, not the assertion.

- [ ] **Step 3: Write the handoff** — create `docs/handoff/2026-09-29-audio-foundation.md` with: what shipped (bus graph, `LAYERS`/`driveLayer`, cabin mix, positioned one-shots; radio squelch/static, listener wiring and Doppler deliberately not built and where they land); the trap list (cabin presets are mild guesses; `ambient` and `radio` bus gains are guesses; the engine layer now starts silent instead of at gain 1, a deliberate blip fix; any LAYERS row needs its clip in `AUDIO_ASSETS` and a budget line); and **Mark's listening checkpoint**, on `https://ww2airsim.windomlane.org` (first `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/` must print `200`; the host serves nexus's dev server off the working copy, so this branch must be checked out in the served copy or its dev server started from the worktree with `npm run dev:lan`): fly with the engine at several throttles in chase, press `C` to reach cockpit and back, and confirm (1) the engine and gunfire still sound as before in chase, (2) cockpit is a touch duller, (3) the switch crossfades without a click.

- [ ] **Step 4: Update the plan table and README**

```bash
grep -n "^| 15 " docs/superpowers/specs/2026-09-12-ww2airsim-design.md   # find row 15's format
grep -n -i "audio" README.md | head                                     # find the audio paragraph
```
Add a row to §15's table directly after row 15, using the next free number or letter in the same column format (read the neighbours before choosing; do not invent a scheme): "Audio foundation: buses, named layers, cabin mix", status "Complete 2026-09-29; [handoff](../../handoff/2026-09-29-audio-foundation.md)". Add one sentence to README's audio paragraph pointing at §15 and `docs/superpowers/specs/2026-09-29-audio-expansion-design.md`, not restating the order.

- [ ] **Step 5: Run the full check on ryzen**

Run: `remote-run npm run verify; echo rc=$?`
Expected: `rc=0`. Capture `rc=$?` directly; do not pipe through grep.

- [ ] **Step 6: Commit and stop**

```bash
git status --short
git add tests/e2e/audio.spec.ts docs README.md
git commit -m "$(cat <<'EOF'
Audio foundation: Tier 2 coverage, handoff and plan table row

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
git push -u origin worktree-audio-foundation   # a branch, not main
```
Do **not** merge into `main` and do **not** deploy; both are Mark's call.

---

## Self-review

- **Spec coverage (§4):** buses + cabin crossfade (Tasks 1, 3); named layered loops (2); one-shots with optional 3D position (4); radio bus with bandpass (highpass + lowpass) and distortion (1; squelch and static are sub-project 4, noted in the handoff); vocabulary stays verbs (all seam additions are verbs); replay rate and silent scrub (2, 4; `prime` untouched); snapshot fields (2, 3, 4, Tier 2 in 5). Listener-to-camera wiring is deferred to sub-project 5, stated in Task 4.
- **Placeholders:** none; every code step has code. The two "look it up first" instructions (§15 row format, README paragraph) are because those files' formats are not fixed by this plan, and each says what to look for.
- **Type consistency:** `LoopSpec`, `LayerDef`, `LayerDrive`, `CabinPreset`, `View`, `Position`, `ListenerPose` are each defined once (tasks 1, 2, 3, 3, 4, 4) and used with those names later; `driveLayer` signature is identical in tests and implementation; the fake's field names (`layers`, `cabins`, `listeners`, `played[].bus/at`) match the tests.
- **Review Focus:** items 1, 2, 4, 5 have tests in Task 2 or 4; item 3 in Task 3.
