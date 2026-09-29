import type { ClipId } from './assets.js'
import type { AudioBackend, BackendState, ListenerPose, LoopHandle, LoopSpec, Position } from './backend.js'
import { BUS_GAIN, FILTER_OPEN_HZ, RADIO_BAND_HIGH_HZ, RADIO_BAND_LOW_HZ, RADIO_DRIVE, CABIN_PRESETS, PANNER_REF_DISTANCE_M, type Bus, type CabinPreset } from './mix.js'

/**
 * The only file under `src/` that touches Web Audio, which
 * `tests/architecture/boundary.test.ts` asserts rather than trusts.
 *
 * Deliberately boring and deliberately untested at Tier 1, for the reason
 * `legend.ts` states about its own DOM half: the vitest environment is `node`,
 * so everything worth asserting lives in the pure code above this. Tier 2
 * (tests/e2e/audio.spec.ts) is this file's coverage.
 *
 * No `try`/`catch` here: `load` rejects and `system.ts` turns that into
 * silence, so the failure policy lives in exactly one place (design §10.2).
 *
 * Graph: engine, sfx and ambient buses feed the world stage (lowpass, gain);
 * the radio bus feeds a highpass, lowpass and soft clipper (the radio voice,
 * spec §5.3) and then its own cabin lowpass and gain. Both reach master. The
 * cabin stage is what `setCabin` moves between cockpit and chase (spec §2).
 */
function softClipCurve(drive: number): Float32Array {
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive)
  }
  return curve
}

export function createWebAudioBackend(): AudioBackend {
  const context = new AudioContext()
  const master = context.createGain()
  master.connect(context.destination)
  const buffers = new Map<ClipId, AudioBuffer>()

  const start = CABIN_PRESETS.chase

  // World stage: buses -> lowpass -> gain -> master.
  const worldFilter = context.createBiquadFilter()
  worldFilter.type = 'lowpass'
  worldFilter.frequency.value = start.worldLowpassHz
  const worldGain = context.createGain()
  worldGain.gain.value = start.worldGain
  worldFilter.connect(worldGain)
  worldGain.connect(master)

  const radioHigh = context.createBiquadFilter()
  radioHigh.type = 'highpass'
  radioHigh.frequency.value = RADIO_BAND_LOW_HZ
  const radioLow = context.createBiquadFilter()
  radioLow.type = 'lowpass'
  radioLow.frequency.value = RADIO_BAND_HIGH_HZ
  const radioShaper = context.createWaveShaper()
  radioShaper.curve = softClipCurve(RADIO_DRIVE) as Float32Array<ArrayBuffer>
  radioHigh.connect(radioLow)
  radioLow.connect(radioShaper)
  const radioCabinFilter = context.createBiquadFilter()
  radioCabinFilter.type = 'lowpass'
  radioCabinFilter.frequency.value = start.radioLowpassHz
  const radioCabinGain = context.createGain()
  radioCabinGain.gain.value = start.radioGain
  radioShaper.connect(radioCabinFilter)
  radioCabinFilter.connect(radioCabinGain)
  radioCabinGain.connect(master)

  const busNode = (bus: Bus, into: AudioNode): GainNode => {
    const node = context.createGain()
    node.gain.value = BUS_GAIN[bus]
    node.connect(into)
    return node
  }
  const buses: Record<Bus, GainNode> = {
    engine: busNode('engine', worldFilter),
    sfx: busNode('sfx', worldFilter),
    ambient: busNode('ambient', worldFilter),
    radio: busNode('radio', radioHigh),
  }

  return {
    state: (): BackendState => context.state as BackendState,

    resume: async (): Promise<void> => { await context.resume() },

    load: async (id: ClipId, url: string): Promise<void> => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
      buffers.set(id, await context.decodeAudioData(await response.arrayBuffer()))
    },

    loaded: (): readonly ClipId[] => [...buffers.keys()],

    startLoop: (spec: LoopSpec): LoopHandle => {
      const buffer = buffers.get(spec.clip)
      if (buffer === undefined) throw new Error(`startLoop before ${spec.clip} decoded`)
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = FILTER_OPEN_HZ
      // Starts silent: the system writes the real gain immediately after, and a
      // default of 1 would glide down from full volume for ~50 ms first.
      const gain = context.createGain()
      gain.gain.value = 0
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      if (spec.loopStartS !== null && spec.loopEndS !== null) {
        source.loopStart = spec.loopStartS
        source.loopEnd = spec.loopEndS
      }
      source.connect(filter)
      filter.connect(gain)
      gain.connect(buses[spec.bus])
      source.start(0)
      // `setTargetAtTime`, never a plain assignment: an AudioParam stepped in
      // one frame clicks, and `M` moves the throttle 1 -> 0 in one frame.
      return {
        setGain: (value: number, glideTauS: number): void =>
          { gain.gain.setTargetAtTime(value, context.currentTime, glideTauS) },
        setPlaybackRate: (value: number, glideTauS: number): void =>
          { source.playbackRate.setTargetAtTime(value, context.currentTime, glideTauS) },
        setFilterCutoff: (hz: number, glideTauS: number): void =>
          { filter.frequency.setTargetAtTime(hz, context.currentTime, glideTauS) },
      }
    },

    playOnce: (id: ClipId, bus: Bus, value: number, rate?: number, at?: Position): void => {
      const buffer = buffers.get(id)
      if (buffer === undefined) return
      // A fresh source per call: AudioBufferSourceNodes are single-use by
      // specification. The `onended` disconnect is what stops a long flight
      // accumulating dead nodes on the bus.
      const gain = context.createGain()
      gain.gain.value = value
      let panner: PannerNode | null = null
      if (at === undefined) {
        gain.connect(buses[bus])
      } else {
        panner = context.createPanner()
        panner.panningModel = 'equalpower'
        panner.distanceModel = 'inverse'
        panner.refDistance = PANNER_REF_DISTANCE_M
        panner.rolloffFactor = 1
        panner.positionX.value = at.x
        panner.positionY.value = at.y
        panner.positionZ.value = at.z
        gain.connect(panner)
        panner.connect(buses[bus])
      }
      const source = context.createBufferSource()
      source.buffer = buffer
      // A plain assignment: a one-shot's rate is fixed for its short life.
      source.playbackRate.value = rate ?? 1
      source.connect(gain)
      source.onended = (): void => { source.disconnect(); gain.disconnect(); panner?.disconnect() }
      source.start(0)
    },

    setListener: (pose: ListenerPose): void => {
      const l = context.listener
      l.positionX.value = pose.position.x
      l.positionY.value = pose.position.y
      l.positionZ.value = pose.position.z
      l.forwardX.value = pose.forward.x
      l.forwardY.value = pose.forward.y
      l.forwardZ.value = pose.forward.z
      l.upX.value = pose.up.x
      l.upY.value = pose.up.y
      l.upZ.value = pose.up.z
    },

    setMasterGain: (value: number): void => { master.gain.value = value },

    setCabin: (preset: CabinPreset, glideTauS: number): void => {
      const now = context.currentTime
      worldFilter.frequency.setTargetAtTime(preset.worldLowpassHz, now, glideTauS)
      worldGain.gain.setTargetAtTime(preset.worldGain, now, glideTauS)
      radioCabinFilter.frequency.setTargetAtTime(preset.radioLowpassHz, now, glideTauS)
      radioCabinGain.gain.setTargetAtTime(preset.radioGain, now, glideTauS)
    },
  }
}
