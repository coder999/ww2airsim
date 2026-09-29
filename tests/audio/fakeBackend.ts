import type { ClipId } from '../../src/audio/assets.js'
import type { AudioBackend, BackendState, ListenerPose, LoopHandle, LoopSpec, Position, SpatialLoopHandle } from '../../src/audio/backend.js'
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

export type FakeSpatialLoop = FakeLayer & { readonly positions: Position[] }

export type FakeBackend = AudioBackend & {
  /** Every loop started with `startSpatialLoop`, in start order. */
  readonly spatialLoops: FakeSpatialLoop[]
  readonly spatialShots: { id: ClipId; bus: Bus; gain: number; rate: number; at: Position; lowpassHz: number }[]
  readonly loopsStarted: { id: ClipId; bus: Bus; startS: number | null; endS: number | null }[]
  readonly layers: FakeLayer[]
  readonly played: { id: ClipId; bus: Bus; gain: number; rate: number; at?: Position }[]
  readonly listeners: ListenerPose[]
  readonly masterGains: number[]
  /** The three below record only loops on the `engine` bus. */
  readonly engineGains: number[]
  readonly engineRates: number[]
  readonly engineGlides: number[]
  readonly resumed: number[]
  readonly cabins: { preset: CabinPreset; tauS: number }[]
  readonly distances: number[]
}

export function createFakeBackend(options: { failToLoad?: readonly ClipId[] } = {}): FakeBackend {
  const failToLoad = new Set(options.failToLoad ?? [])
  const decoded: ClipId[] = []
  const loopsStarted: FakeBackend['loopsStarted'] = []
  const layers: FakeLayer[] = []
  const played: FakeBackend['played'] = []
  const listeners: ListenerPose[] = []
  const masterGains: number[] = []
  const engineGains: number[] = []
  const engineRates: number[] = []
  const engineGlides: number[] = []
  const resumed: number[] = []
  const cabins: FakeBackend['cabins'] = []
  const distances: number[] = []
  const spatialLoops: FakeSpatialLoop[] = []
  const spatialShots: FakeBackend['spatialShots'] = []
  let state: BackendState = 'suspended'

  return {
    spatialLoops, spatialShots, loopsStarted, layers, played, listeners, masterGains, engineGains, engineRates, engineGlides, resumed, cabins, distances,
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
    startSpatialLoop: (spec: LoopSpec): SpatialLoopHandle => {
      const layer: FakeSpatialLoop = { clip: spec.clip, bus: spec.bus, gains: [], rates: [], cutoffs: [], glides: [], positions: [] }
      spatialLoops.push(layer)
      return {
        setGain: (value: number, glideTauS: number): void => { layer.gains.push(value); layer.glides.push(glideTauS) },
        setPlaybackRate: (value: number, glideTauS: number): void => { layer.rates.push(value); layer.glides.push(glideTauS) },
        setFilterCutoff: (hz: number, glideTauS: number): void => { layer.cutoffs.push(hz); layer.glides.push(glideTauS) },
        setPosition: (at: Position, glideTauS: number): void => { layer.positions.push(at); layer.glides.push(glideTauS) },
      }
    },
    playSpatial: (id: ClipId, bus: Bus, gain: number, rate: number, at: Position, lowpassHz: number): void => {
      spatialShots.push({ id, bus, gain, rate, at, lowpassHz })
    },
    playOnce: (id: ClipId, bus: Bus, gain: number, rate = 1, at?: Position): void => {
      played.push(at === undefined ? { id, bus, gain, rate } : { id, bus, gain, rate, at })
    },
    setListener: (pose: ListenerPose): void => { listeners.push(pose) },
    setMasterGain: (value: number): void => { masterGains.push(value) },
    setCabin: (preset: CabinPreset, tauS: number): void => { cabins.push({ preset, tauS }) },
    setDistanceGain: (gain: number): void => { distances.push(gain) },
  }
}
