import type { AdapterVerdict } from './adapterGuard.js'
import type { CameraMode } from './camera.js'
import type { Controls } from '../sim/flight/state.js'
import type { LookOffset } from '../input/lookAround.js'
import type { AssistSettings } from '../assists/index.js'
import type { Vec3 } from '../sim/math/vec3.js'

/**
 * The shape `window.__ww2` has in a DEV build. `main.ts` writes it, and
 * `tests/e2e/adapter.spec.ts` (Tier 2) reads it -- both sides import this one
 * type rather than each declaring their own copy.
 *
 * Task 15 review, round 1: the two sides previously typed this independently
 * (`main.ts` cast through `unknown`, the spec file redeclared the same shape
 * by hand), so renaming or dropping a field typechecked clean on both sides
 * and only failed at runtime, on the one machine here that cannot run it.
 * Sharing this type turns that into a `tsc --noEmit` error instead.
 *
 * Not present at all outside a DEV build -- see the `import.meta.env.DEV`
 * guard at the call site in `main.ts` for why, and `.gitignore`/the
 * production bundle check in the Task 15 report for confirmation it does
 * not survive `npm run build`.
 */
export type Ww2Diagnostics = {
  readonly reversedDepthBuffer: boolean
  readonly adapter: AdapterVerdict
  readonly validationErrors: readonly string[]
  readonly tick: () => number
  readonly cameraMode: () => CameraMode
  /** Added in round 1 review: proves the control-deflection phase of the
   *  camera sweep actually reached `frame.controls`, which `tick` advancing
   *  alone cannot (the render loop ticks from `requestAnimationFrame`
   *  regardless of whether a single key was ever delivered). */
  readonly controls: () => Controls
  /** Added in round 1 review: `lookOffsetFromKeys` is a pure snapshot that
   *  snaps back to centre the instant a look key is released
   *  (src/input/lookAround.ts), so proving a look key took effect has to
   *  read this while the key is still held, not after. */
  readonly look: () => LookOffset
  /**
   * Which assists are on (Plan 3 Task 5). Read-only on purpose: Tier 2 flips
   * them the way a pilot does, by pressing the toggle keys in
   * `src/input/bindings.ts`, and reads this to confirm the press landed --
   * exactly the pattern the camera sweep already uses for `KeyC` and
   * `cameraMode()`. A setter here would be a second write path into
   * `FrameState`, bypassing `nextFrameState`, which is the one function that
   * owns how a frame becomes the next frame; the keyboard path is also the one
   * a real pilot uses, so testing it tests something that ships.
   */
  readonly assists: () => AssistSettings
  /**
   * Metres of ground under the aeroplane, or `null` if no terrain field has
   * reached `World.terrain` yet.
   *
   * Added in Task 10 for one reason: that task loads a heightfield the
   * physics can collide with, and whether it arrived is invisible. The
   * terrain on screen comes from the renderer's own textures, so a
   * `World.terrain` still `null` -- which is what shipped until 2026-09-14 --
   * renders identically and merely means nothing can be hit. Reading a
   * plausible height here (0 over open water, hundreds of metres over Leyte)
   * is the check that the wire exists; the alternative was flying into a
   * mountain and observing that nothing happens either way.
   */
  readonly groundHeightM: () => number | null
  /**
   * The aeroplane's simulated world position, metres (+x east, +y up,
   * +z north). Added in Task 11, and it does two jobs no other member here
   * can:
   *
   * - **Proves the spawn landed.** Tier 2's terrain tests start the aeroplane
   *   over Leyte with `?spawnX/Y/Z` (see `spawn.ts`). If that never took
   *   effect the aeroplane is over open water, every terrain test reports an
   *   empty `validationErrors` list, and it passes for the wrong reason.
   * - **Proves the aeroplane moved.** `tick()` advances whenever the fixed
   *   step runs, which it does whether or not the aeroplane is going
   *   anywhere; `groundHeightM()` is flat over a coastal plain. Neither can
   *   stand in for a position that changed.
   *
   * Deliberately the SIMULATED position (`world.aircraft`), not the
   * interpolated render pose: the render pose is the thing under test in a
   * different sense, and a test that read it could pass on a frame that
   * happened to interpolate while the simulation was stalled.
   */
  readonly aircraftPositionM: () => Vec3
  /**
   * Frame intervals in milliseconds since the last `resetFrameTimes()`, in
   * order, capped at `FRAME_TIME_CAPACITY` samples.
   *
   * This is the `now - last` that `main.ts`'s render loop already computes
   * and hands to the dev overlay -- the interval between successive
   * `requestAnimationFrame` callbacks, i.e. wall-clock frame time including
   * the simulation, the scene update, three's draw submission and the
   * present. It is NOT a GPU pass duration.
   *
   * On the reference platform it is pinned at a fixed 10.0 ms cadence and
   * CANNOT carry the frame budget -- see `gpuFrameTimesMs` below, which can.
   * What it is still good for is the complementary question: whether the
   * frame made its deadline at all. An interval that has doubled is a missed
   * frame deadline, which no GPU-side pass duration reports.
   *
   * Recording STOPS at capacity rather than dropping the oldest sample, so
   * "the first N frames after the reset" is exactly what a caller gets and
   * the window is not silently redefined by how long the caller waited.
   */
  readonly frameTimesMs: () => readonly number[]
  /**
   * GPU render-pass durations in milliseconds since the last
   * `resetFrameTimes()`, one sample per resolved frame, capped the same way.
   *
   * This is the frame-time number Task 11's budget is written against, and it
   * exists because `frameTimesMs` above CANNOT carry one on this platform:
   * `requestAnimationFrame` fires every 10.0 ms on the reference desktop
   * whatever Chromium is launched with -- proven 2026-09-14 against a blank
   * page with no WebGPU on it at all, which reported the same 10.0 ms as the
   * game, and against `--disable-gpu` and headless, which also did. It is a
   * browser-side cadence, NOT the display: that monitor runs at 120 Hz
   * (8.33 ms). Design spec section 10 carries the evidence and is the
   * committed home for it -- Task 11's own report lives under the gitignored
   * `.superpowers/` and is not in a fresh clone.
   *
   * Read from WebGPU timestamp queries written around the render pass, so it
   * is the GPU's own clock and knows nothing about the cadence above, vsync,
   * the compositor or the present. It therefore EXCLUDES the simulation, the scene update and
   * three's submission work and native ocean compute (reported separately by
   * `oceanComputeTimesMs`) -- it is the render pass, not the whole
   * of one. Empty if `gpuTimestampsSupported` is false.
   */
  readonly gpuFrameTimesMs: () => readonly number[]
  /** Whether the adapter advertises `timestamp-query`, i.e. whether
   *  `gpuFrameTimesMs()` can ever be non-empty. Distinguishes "this GPU
   *  cannot be timed" from "nothing has been sampled yet", which an empty
   *  array alone cannot. */
  readonly gpuTimestampsSupported: boolean
  /** Discards everything `frameTimesMs()` and `gpuFrameTimesMs()` have
   *  collected and starts a fresh window. The only mutating member of this hook: it writes nothing the
   *  simulation or the renderer reads, unlike the `FrameState` setter
   *  `assists` above deliberately does not offer. */
  readonly oceanTier: () => string
  /** Separate GPU compute-pass costs, one sample list per active cascade. */
  readonly oceanComputeTimesMs: () => readonly (readonly number[])[]
  readonly oceanDisplacementSample: (cascade: number) => Promise<{
    timeS: number; values: number[]; phaseSeed: number
    options: import('./ocean/compute.js').OceanComputeOptions
  } | null>
  readonly resetFrameTimes: () => void
}

/**
 * How many samples `frameTimesMs` and `gpuFrameTimesMs` each hold after a
 * reset.
 *
 * 4,096 is ~41 s at the reference platform's 10.0 ms cadence, comfortably
 * more than the budget test's window, and bounds each array to 32 KB for a
 * session that never resets at all.
 */
export const FRAME_TIME_CAPACITY = 4096
