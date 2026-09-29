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
  /** `rate` defaults to 1. Instant replay (design §7) drives this with the
   *  replay speed, which scales the engine loop's playback rate and any
   *  one-shot fired this frame -- so a burst heard at 0.5x plays back a full
   *  octave down along with everything else in the scene, not at its live
   *  pitch. */
  update(inputs: AudioInputs, rate?: number): void
  /** Advances the cue memory past `inputs` without making a sound and
   *  without touching the engine loop. Instant replay uses this to jump the
   *  replayed cue memory to a scrub target silently: without it, scrubbing
   *  past a burst or an impact would fire every cue it skipped over. */
  prime(inputs: AudioInputs): void
  /** The live cue memory, so instant replay can put it aside before driving
   *  `update`/`prime` with the replayed world, and bring it back with
   *  `restore` on exit -- "exiting restores the live audio exactly as it
   *  was" (design §7). */
  memory(): AudioMemory
  restore(m: AudioMemory): void
  /** While held, the engine loop glides to gain 0 -- "paused means silent"
   *  (design §7), for a paused replay. The next `update` call resumes it: a
   *  hold has no inputs of its own to compute a gain from. */
  hold(held: boolean): void
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
  // Instant replay's pause (design §7): forced to gain 0 by `hold(true)`
  // rather than by suppressing `update` calls, because the held frame is
  // still rendered while a replay is paused, and nothing else about it may
  // change.
  let held = false

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

    update(inputs: AudioInputs, rate = 1): void {
      const frame = nextAudio(memory, inputs)
      memory = frame.memory
      const ready = backend.loaded()

      // Started lazily rather than in `load()`: the buffer has to have decoded
      // first, and starting it here means one call site handles both "decoded
      // late" and "never decoded at all".
      if (loop === null && ready.includes('propeller')) {
        loop = backend.startLoop({ clip: 'propeller', bus: 'engine', loopStartS: loopStartSeconds(), loopEndS: loopEndSeconds() })
      }
      if (loop !== null) {
        // Glided, never assigned. `M` (throttle cut) moves the lever 1 -> 0 in
        // a single frame, and a step on an AudioParam is an audible click.
        // Held (a paused replay) overrides the computed gain with 0, same as
        // `hold(true)` itself -- see that method.
        engineGain = held ? 0 : frame.engine.gain
        // Scaled by the replay speed (design §7): at 0.5x the engine sounds
        // half as fast as it does live, matching the replayed world.
        enginePlaybackRate = frame.engine.playbackRate * rate
        loop.setGain(engineGain, ENGINE_GLIDE_TAU_S)
        loop.setPlaybackRate(enginePlaybackRate, ENGINE_GLIDE_TAU_S)
      }

      // Silent while held: a paused replay renders the same frame repeatedly,
      // and re-evaluating cues against it must not re-fire them.
      if (held) return

      for (const cue of frame.cues) {
        if (!ready.includes(cue)) continue
        cuesFired++
        const asset = assetFor(cue)
        backend.playOnce(cue, asset.bus, asset.cueGain, rate)
      }
    },

    prime(inputs: AudioInputs): void {
      // The reducer only -- no backend call of any kind, which is what makes
      // this silent: a scrub jump must advance past every cue it skipped
      // without sounding any of them (design §7).
      memory = nextAudio(memory, inputs).memory
    },

    memory(): AudioMemory {
      return memory
    },

    restore(m: AudioMemory): void {
      memory = m
    },

    hold(isHeld: boolean): void {
      held = isHeld
      if (held && loop !== null) {
        engineGain = 0
        loop.setGain(0, ENGINE_GLIDE_TAU_S)
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
