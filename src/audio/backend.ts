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
  /** Moves the cabin stage (world lowpass and gain, radio lowpass and gain) to
   *  `preset`, gliding with `glideTauS`. */
  setCabin(preset: CabinPreset, glideTauS: number): void
}
