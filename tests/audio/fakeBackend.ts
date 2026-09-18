import type { ClipId } from '../../src/audio/assets.js'
import type { AudioBackend, BackendState, LoopHandle } from '../../src/audio/backend.js'

/**
 * Records every call instead of making a sound.
 *
 * Typed as `AudioBackend`, not as a loose object: adding a verb to the
 * interface becomes a `tsc` error HERE rather than a production path that
 * silently no test ever exercises.
 */
export type FakeBackend = AudioBackend & {
  readonly loopsStarted: { id: ClipId; startS: number; endS: number }[]
  readonly played: { id: ClipId; gain: number }[]
  readonly masterGains: number[]
  readonly engineGains: number[]
  readonly engineRates: number[]
  readonly engineGlides: number[]
  readonly resumed: number[]
}

export function createFakeBackend(options: { failToLoad?: readonly ClipId[] } = {}): FakeBackend {
  const failToLoad = new Set(options.failToLoad ?? [])
  const decoded: ClipId[] = []
  const loopsStarted: { id: ClipId; startS: number; endS: number }[] = []
  const played: { id: ClipId; gain: number }[] = []
  const masterGains: number[] = []
  const engineGains: number[] = []
  const engineRates: number[] = []
  const engineGlides: number[] = []
  const resumed: number[] = []
  let state: BackendState = 'suspended'

  return {
    loopsStarted, played, masterGains, engineGains, engineRates, engineGlides, resumed,
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
    startLoop: (id: ClipId, startS: number, endS: number): LoopHandle => {
      loopsStarted.push({ id, startS, endS })
      return {
        setGain: (value: number, glideTauS: number): void => { engineGains.push(value); engineGlides.push(glideTauS) },
        setPlaybackRate: (value: number, glideTauS: number): void => { engineRates.push(value); engineGlides.push(glideTauS) },
      }
    },
    playOnce: (id: ClipId, gain: number): void => { played.push({ id, gain }) },
    setMasterGain: (value: number): void => { masterGains.push(value) },
  }
}
