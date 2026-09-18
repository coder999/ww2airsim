import type { ClipId } from './assets.js'
import type { AudioBackend, BackendState, LoopHandle } from './backend.js'

/**
 * The only file under `src/` that touches Web Audio, which
 * `tests/architecture/boundary.test.ts` asserts rather than trusts.
 *
 * Deliberately boring and deliberately untested at Tier 1, for the reason
 * `legend.ts` states about its own DOM half: the vitest environment is `node`,
 * so everything worth asserting lives in the pure code above this. Faking a
 * browser audio API in order to test the file whose entire job is to call that
 * API would be a second implementation of Web Audio, free to be wrong in ways
 * the real one is not. Task 7's Tier 2 spec is this file's coverage.
 *
 * No `try`/`catch` here: `load` rejects and `system.ts` turns that into
 * silence, so the failure policy lives in exactly one place (design §10.2).
 */
export function createWebAudioBackend(): AudioBackend {
  const context = new AudioContext()
  const master = context.createGain()
  master.connect(context.destination)
  const buffers = new Map<ClipId, AudioBuffer>()

  return {
    state: (): BackendState => context.state as BackendState,

    resume: async (): Promise<void> => { await context.resume() },

    load: async (id: ClipId, url: string): Promise<void> => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
      buffers.set(id, await context.decodeAudioData(await response.arrayBuffer()))
    },

    loaded: (): readonly ClipId[] => [...buffers.keys()],

    startLoop: (id: ClipId, loopStartS: number, loopEndS: number): LoopHandle => {
      const buffer = buffers.get(id)
      if (buffer === undefined) throw new Error(`startLoop before ${id} decoded`)
      const gain = context.createGain()
      gain.connect(master)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.loopStart = loopStartS
      source.loopEnd = loopEndS
      source.connect(gain)
      source.start(0)
      // `setTargetAtTime`, never a plain assignment: an AudioParam stepped in
      // one frame clicks, and `M` moves the throttle 1 -> 0 in one frame.
      return {
        setGain: (value: number, glideTauS: number): void =>
          { gain.gain.setTargetAtTime(value, context.currentTime, glideTauS) },
        setPlaybackRate: (value: number, glideTauS: number): void =>
          { source.playbackRate.setTargetAtTime(value, context.currentTime, glideTauS) },
      }
    },

    playOnce: (id: ClipId, value: number): void => {
      const buffer = buffers.get(id)
      if (buffer === undefined) return
      // A fresh source per call: AudioBufferSourceNodes are single-use by
      // specification. The `onended` disconnect is what stops a long flight
      // accumulating dead nodes on the master bus.
      const gain = context.createGain()
      gain.gain.value = value
      gain.connect(master)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      source.onended = (): void => { source.disconnect(); gain.disconnect() }
      source.start(0)
    },

    setMasterGain: (value: number): void => { master.gain.value = value },
  }
}
