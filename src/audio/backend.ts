import type { ClipId } from './assets.js'
import type { Bus, CabinPreset } from './mix.js'

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

/** A loop that is placed in space: position is listener-relative (x right, y up, -z ahead)
 *  and only pans -- the reducer in spatial.ts owns all distance decisions. */
export type SpatialLoopHandle = LoopHandle & {
  setPosition(at: Position, glideTauS: number): void
}

/** A point in world space, metres. Defined here, not borrowed from `sim/`:
 *  `audio/` must not import the simulation. */
export type Position = { readonly x: number; readonly y: number; readonly z: number }

export type ListenerPose = {
  readonly position: Position
  readonly forward: Position
  readonly up: Position
}

export type BackendState = 'suspended' | 'running' | 'closed'

export type AudioBackend = {
  state(): BackendState
  resume(): Promise<void>
  load(id: ClipId, url: string): Promise<void>
  /** The clips that decoded. A clip that failed to fetch or decode is absent,
   *  and `system.ts` will not play it -- silence beats a failure screen. */
  loaded(): readonly ClipId[]
  /** A clip whose samples were made in code (synth.ts), mono at `sampleRate`, as if it had decoded. */
  loadSamples(id: ClipId, samples: Float32Array, sampleRate: number): void
  startLoop(spec: LoopSpec): LoopHandle
  startSpatialLoop(spec: LoopSpec): SpatialLoopHandle
  /** A one-shot at a listener-relative position (see SpatialLoopHandle), lowpassed at `lowpassHz`. */
  playSpatial(id: ClipId, bus: Bus, gain: number, rate: number, at: Position, lowpassHz: number): void
  /** `rate` defaults to 1 (its natural pitch). Instant replay (design §7)
   *  scales it with the replay speed, so a burst heard at 0.5x plays back at
   *  half pitch along with the engine loop, rather than at full pitch while
   *  everything else in the scene runs slow.
   *  `at` places the sound in the world; omitted, it is heard in the head. */
  playOnce(id: ClipId, bus: Bus, gain: number, rate?: number, at?: Position): void
  setListener(pose: ListenerPose): void
  setMasterGain(value: number): void
  /** Moves the cabin stage (world lowpass and gain, radio lowpass and gain) to
   *  `preset`, gliding with `glideTauS`. */
  setCabin(preset: CabinPreset, glideTauS: number): void
  /** Scales the whole world stage (not the radio) for camera distance. */
  setDistanceGain(gain: number, glideTauS: number): void
}
