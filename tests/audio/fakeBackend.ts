import type { ClipId } from '../../src/audio/assets.js'
import type { AudioBackend, BackendState, LoopHandle, LoopSpec } from '../../src/audio/backend.js'
import type { Bus, CabinPreset } from '../../src/audio/mix.js'

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
  readonly cabins: { preset: CabinPreset; tauS: number }[]
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
  const cabins: FakeBackend['cabins'] = []
  let state: BackendState = 'suspended'

  return {
    loopsStarted, layers, played, masterGains, engineGains, engineRates, engineGlides, resumed, cabins,
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
    setCabin: (preset: CabinPreset, tauS: number): void => { cabins.push({ preset, tauS }) },
  }
}
