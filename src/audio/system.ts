import { AUDIO_ASSETS, assetFor, audioUrl, type ClipId } from './assets.js'
import type { AudioBackend, BackendState, LoopHandle } from './backend.js'
import { NO_AUDIO_MEMORY, nextAudio, type AudioInputs, type AudioMemory } from './cues.js'
import { ENGINE_GLIDE_TAU_S, MASTER_GAIN, loopEndSeconds, loopStartSeconds } from './mix.js'

/**
 * The wiring: holds the reducer's memory and the loop handle, and applies each
 * frame to a backend. Everything platform-specific is behind `AudioBackend`,
 * so the tests drive THIS code -- the production path -- rather than a pure
 * copy of it sitting beside the real thing.
 *
 * That distinction is not academic here. `openSeaMask` crashed on every real
 * tile behind a fully green suite because its tests covered only the pure
 * function next to it, and Plan 3 shipped the whole assists layer inert in the
 * browser for the same reason. Design §7.
 */
/** What the audio system is doing, for Tier 2 (tests/e2e/audio.spec.ts).
 *  A granular value, not the system itself: a test that could reach in and
 *  drive it would stop being evidence about what the game does. */
export type AudioSnapshot = {
  readonly state: BackendState
  readonly loaded: readonly ClipId[]
  readonly failed: readonly ClipId[]
  readonly muted: boolean
  readonly masterGain: number
  readonly engineGain: number
  readonly enginePlaybackRate: number
  readonly cuesFired: number
}

export type AudioSystem = {
  load(): Promise<void>
  resume(): Promise<void>
  update(inputs: AudioInputs): void
  setMuted(muted: boolean): void
  muted(): boolean
  snapshot(): AudioSnapshot
}

export function createAudioSystem(backend: AudioBackend): AudioSystem {
  let memory: AudioMemory = NO_AUDIO_MEMORY
  let loop: LoopHandle | null = null
  let isMuted = false
  // Mirrored here rather than read back off the backend, because the real one
  // cannot be asked: an AudioParam's value after setTargetAtTime is a curve in
  // progress, not the target that was requested.
  let masterGain = 0
  let engineGain = 0
  let enginePlaybackRate = 0
  let cuesFired = 0
  const failed: ClipId[] = []

  return {
    async load(): Promise<void> {
      masterGain = MASTER_GAIN
      backend.setMasterGain(MASTER_GAIN)
      // Per clip, and each failure swallowed: a 404 on one sound must not
      // take the others down with it, and must never reject the boot. A
      // flight sim with no sound is playable; a failure screen is not.
      await Promise.all(
        AUDIO_ASSETS.map(async (asset) => {
          try {
            await backend.load(asset.id, audioUrl(asset.id))
          } catch {
            failed.push(asset.id)
          }
        }),
      )
    },

    async resume(): Promise<void> {
      await backend.resume()
    },

    update(inputs: AudioInputs): void {
      const frame = nextAudio(memory, inputs)
      memory = frame.memory
      const ready = backend.loaded()

      // Started lazily rather than in `load()`: the buffer has to have decoded
      // first, and starting it here means one call site handles both "decoded
      // late" and "never decoded at all".
      if (loop === null && ready.includes('propeller')) {
        loop = backend.startLoop('propeller', loopStartSeconds(), loopEndSeconds())
      }
      if (loop !== null) {
        // Glided, never assigned. `M` (throttle cut) moves the lever 1 -> 0 in
        // a single frame, and a step on an AudioParam is an audible click.
        engineGain = frame.engine.gain
        enginePlaybackRate = frame.engine.playbackRate
        loop.setGain(frame.engine.gain, ENGINE_GLIDE_TAU_S)
        loop.setPlaybackRate(frame.engine.playbackRate, ENGINE_GLIDE_TAU_S)
      }

      for (const cue of frame.cues) {
        if (!ready.includes(cue)) continue
        cuesFired++
        backend.playOnce(cue, assetFor(cue).cueGain)
      }
    },

    setMuted(muted: boolean): void {
      isMuted = muted
      masterGain = muted ? 0 : MASTER_GAIN
      // Master gain, not a teardown: the reducer keeps advancing while muted,
      // so unmuting cannot resurrect a sound whose moment has passed.
      backend.setMasterGain(muted ? 0 : MASTER_GAIN)
    },

    muted(): boolean {
      return isMuted
    },

    snapshot(): AudioSnapshot {
      return {
        state: backend.state(),
        loaded: backend.loaded(),
        failed,
        muted: isMuted,
        masterGain,
        engineGain,
        enginePlaybackRate,
        cuesFired,
      }
    },
  }
}
