import type { ClipId } from './assets.js'

/**
 * The seam between this project's audio logic and the Web Audio API.
 *
 * Types only, deliberately. Node implements no Web Audio and neither does
 * jsdom, so switching `vitest.config.ts`'s environment would buy nothing --
 * the only way to test the WIRING is to inject something that records instead
 * of making a sound. Design §7.1.
 *
 * This is NOT the platform's audio-context type in disguise. It speaks six
 * verbs, each one or two
 * lines of real Web Audio on the far side, so a fake has to reimplement six
 * small methods rather than `AudioBuffer`, `GainNode` and `AudioParam`. The
 * narrower the seam, the less a fake can lie about.
 */
export type LoopHandle = {
  setGain(value: number, glideTauS: number): void
  setPlaybackRate(value: number, glideTauS: number): void
}

export type BackendState = 'suspended' | 'running' | 'closed'

export type AudioBackend = {
  state(): BackendState
  resume(): Promise<void>
  load(id: ClipId, url: string): Promise<void>
  /** The clips that decoded. A clip that failed to fetch or decode is absent,
   *  and `system.ts` will not play it -- silence beats a failure screen. */
  loaded(): readonly ClipId[]
  startLoop(id: ClipId, loopStartS: number, loopEndS: number): LoopHandle
  playOnce(id: ClipId, gain: number): void
  setMasterGain(value: number): void
}
