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
export type AudioSystem = {
  load(): Promise<void>
  resume(): Promise<void>
  update(inputs: AudioInputs): void
  setMuted(muted: boolean): void
  muted(): boolean
  snapshot(): {
    readonly muted: boolean
    readonly state: BackendState
    readonly loaded: readonly ClipId[]
    readonly failed: readonly ClipId[]
    readonly engineRunning: boolean
  }
}

export function createAudioSystem(backend: AudioBackend): AudioSystem {
  let memory: AudioMemory = NO_AUDIO_MEMORY
  let loop: LoopHandle | null = null
  let isMuted = false
  let engineRunning = false
  const failed: ClipId[] = []

  return {
    async load(): Promise<void> {
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
        engineRunning = true
      }
      if (loop !== null) {
        // Glided, never assigned. `M` (throttle cut) moves the lever 1 -> 0 in
        // a single frame, and a step on an AudioParam is an audible click.
        loop.setGain(frame.engine.gain, ENGINE_GLIDE_TAU_S)
        loop.setPlaybackRate(frame.engine.playbackRate, ENGINE_GLIDE_TAU_S)
      }

      for (const cue of frame.cues) {
        if (!ready.includes(cue)) continue
        backend.playOnce(cue, assetFor(cue).cueGain)
      }
    },

    setMuted(muted: boolean): void {
      isMuted = muted
      // Master gain, not a teardown: the reducer keeps advancing while muted,
      // so unmuting cannot resurrect a sound whose moment has passed.
      backend.setMasterGain(muted ? 0 : MASTER_GAIN)
    },

    muted(): boolean {
      return isMuted
    },

    snapshot() {
      return {
        muted: isMuted,
        state: backend.state(),
        loaded: backend.loaded(),
        failed,
        engineRunning,
      }
    },
  }
}
