import { AUDIO_ASSETS, assetFor, audioUrl, type ClipId } from './assets.js'
import type { AudioBackend, BackendState, ListenerPose, LoopHandle, Position, SpatialLoopHandle } from './backend.js'
import { NO_AUDIO_MEMORY, nextAudio, type AudioInputs, type AudioMemory } from './cues.js'
import { ENGINE_LAYER_FOR, LAYERS, finiteOr, type LayerDrive, type LayerTable } from './layers.js'
import { NO_SPATIAL_MEMORY, nextSpatial, type SpatialInputs, type SpatialMemory } from './spatial.js'
import { CABIN_GLIDE_TAU_S, CABIN_PRESETS, DISTANCE_GLIDE_TAU_S, FILTER_OPEN_HZ, MASTER_GAIN, chaseDistanceGain, type View } from './mix.js'

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
  readonly layers: Readonly<Record<string, { readonly gain: number; readonly rate: number; readonly cutoffHz: number | null }>>
  readonly cuesFired: number
  readonly spatialPlayed: number
  readonly view: View | null
}

/** Everything replay puts aside and brings back: the cue memory and the spatial one. */
export type AudioSystemMemory = { readonly cues: AudioMemory; readonly spatial: SpatialMemory }

/** Position and Doppler glide: fast enough to follow a fly-by, slow enough not to zipper. */
export const SPATIAL_GLIDE_TAU_S = 0.1

export type AudioSystem = {
  load(): Promise<void>
  resume(): Promise<void>
  /** `rate` defaults to 1. Instant replay (design §7) drives this with the
   *  replay speed, which scales the engine loop's playback rate and any
   *  one-shot fired this frame -- so a burst heard at 0.5x plays back a full
   *  octave down along with everything else in the scene, not at its live
   *  pitch. */
  update(inputs: AudioInputs, rate?: number): void
  /** Drives one named looping layer (`LAYERS`). Starts it on first use once its
   *  clip has decoded; a layer whose clip failed is a silent no-op. `rate` is
   *  the replay speed, multiplied into the layer's playback rate. */
  driveLayer(id: string, drive: LayerDrive, rate?: number): void
  /** Advances the cue memory past `inputs` without making a sound and
   *  without touching the engine loop. Instant replay uses this to jump the
   *  replayed cue memory to a scrub target silently: without it, scrubbing
   *  past a burst or an impact would fire every cue it skipped over. */
  prime(inputs: AudioInputs): void
  /** The live cue memory, so instant replay can put it aside before driving
   *  `update`/`prime` with the replayed world, and bring it back with
   *  `restore` on exit -- "exiting restores the live audio exactly as it
   *  was" (design §7). */
  memory(): AudioSystemMemory
  restore(m: AudioSystemMemory): void
  /** Positioned AI engines, delayed blasts and gunfire, and the deck rumble, relative to the camera. */
  updateSpatial(inputs: SpatialInputs, rate?: number): void
  /** Advances the spatial memory past `inputs` without a sound and drops queued sounds. */
  primeSpatial(inputs: SpatialInputs): void
  /** While held, the engine loop glides to gain 0 -- "paused means silent"
   *  (design §7), for a paused replay. The next `update` call resumes it: a
   *  hold has no inputs of its own to compute a gain from. */
  hold(held: boolean): void
  /** One-shot placed in the world. Same rules as any cue: silent while held,
   *  never a failed clip, never a non-finite position. */
  playAt(clip: ClipId, at: Position, rate?: number): void
  /** Listener pose for positioned sounds; a pose with a non-finite component is dropped. */
  setListener(pose: ListenerPose): void
  /** Called every frame; reaches the backend only when the view changes. */
  setView(view: View): void
  /** Chase-camera zoom, called every frame; reaches the backend only when the resulting gain changes. */
  setCameraZoom(zoom: number): void
  setMuted(muted: boolean): void
  muted(): boolean
  snapshot(): AudioSnapshot
}

export function createAudioSystem(backend: AudioBackend, layers: LayerTable = LAYERS): AudioSystem {
  let memory: AudioMemory = NO_AUDIO_MEMORY
  let spatialMemory: SpatialMemory = NO_SPATIAL_MEMORY
  const spatialHandles = new Map<string, SpatialLoopHandle>()
  let spatialListenerSet = false
  const handles = new Map<string, LoopHandle>()
  const layerState = new Map<string, { gain: number; rate: number; cutoffHz: number | null }>()
  let isMuted = false
  // Mirrored here rather than read back off the backend, because the real one
  // cannot be asked: an AudioParam's value after setTargetAtTime is a curve in
  // progress, not the target that was requested.
  let masterGain = 0
  let cuesFired = 0
  let spatialPlayed = 0
  let view: View | null = null
  let distanceGain = 1
  let activeEngineLayer = 'engine'
  const failed: ClipId[] = []
  // Instant replay's pause (design §7): forced to gain 0 by `hold(true)`
  // rather than by suppressing `update` calls, because the held frame is
  // still rendered while a replay is paused, and nothing else about it may
  // change.
  let held = false

  const finitePosition = (p: Position): boolean => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)

  function driveLayer(id: string, drive: LayerDrive, rate = 1): void {
    const def = layers[id]
    if (def === undefined) throw new Error(`no audio layer named ${id}`)
    if (!backend.loaded().includes(def.clip)) return
    let handle = handles.get(id)
    if (handle === undefined) {
      // Started lazily: the buffer has to have decoded first, and starting it
      // here means one call site handles "decoded late" and "never decoded".
      handle = backend.startLoop({ clip: def.clip, bus: def.bus, loopStartS: def.loopStartS, loopEndS: def.loopEndS })
      handles.set(id, handle)
    }
    // Glided, never assigned (see LayerDef.glideTauS). Held (a paused replay)
    // overrides the computed gain with 0, same as `hold(true)` itself.
    const gain = held ? 0 : finiteOr(drive.gain, 0)
    const playbackRate = finiteOr(drive.rate, 1) * rate
    handle.setGain(gain, def.glideTauS)
    handle.setPlaybackRate(playbackRate, def.glideTauS)
    let cutoffHz: number | null = null
    if (drive.cutoffHz !== undefined) {
      cutoffHz = finiteOr(drive.cutoffHz, FILTER_OPEN_HZ)
      handle.setFilterCutoff(cutoffHz, def.glideTauS)
    }
    layerState.set(id, { gain, rate: playbackRate, cutoffHz })
  }

  return {
    driveLayer,
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

      // Scaled by the replay speed (design §7): at 0.5x the engine sounds
      // half as fast as it does live, matching the replayed world.
      const engineLayer = ENGINE_LAYER_FOR[frame.engineFamily]
      activeEngineLayer = engineLayer
      driveLayer(engineLayer, { gain: frame.engine.gain, rate: frame.engine.playbackRate }, rate)
      // A different family's loop that was started earlier (restart with another aircraft) fades out.
      for (const id of Object.values(ENGINE_LAYER_FOR)) {
        if (id !== engineLayer && handles.has(id)) driveLayer(id, { gain: 0, rate: 1 }, rate)
      }
      // Ambience starts only when first audible, so a flight that never sees the sea never decodes into a source.
      if (frame.ambient.sea > 0 || handles.has('sea')) driveLayer('sea', { gain: frame.ambient.sea, rate: 1 }, rate)

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

    memory(): AudioSystemMemory {
      return { cues: memory, spatial: spatialMemory }
    },

    restore(m: AudioSystemMemory): void {
      memory = m.cues
      spatialMemory = m.spatial
    },

    updateSpatial(inputs: SpatialInputs, rate = 1): void {
      const out = nextSpatial(spatialMemory, inputs)
      spatialMemory = out.memory
      if (!spatialListenerSet) {
        spatialListenerSet = true
        backend.setListener({ position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } })
      }
      const ready = backend.loaded()
      const live = new Set<string>()
      for (const loop of out.loops) {
        const def = layers[loop.layer]
        if (def === undefined || !ready.includes(def.clip) || !finitePosition(loop.at)) continue
        live.add(loop.key)
        let handle = spatialHandles.get(loop.key)
        if (handle === undefined) {
          handle = backend.startSpatialLoop({ clip: def.clip, bus: def.bus, loopStartS: def.loopStartS, loopEndS: def.loopEndS })
          spatialHandles.set(loop.key, handle)
        }
        handle.setPosition(loop.at, SPATIAL_GLIDE_TAU_S)
        handle.setGain(held ? 0 : finiteOr(loop.gain, 0), def.glideTauS)
        handle.setPlaybackRate(finiteOr(loop.rate, 1) * rate, SPATIAL_GLIDE_TAU_S)
        handle.setFilterCutoff(finiteOr(loop.cutoffHz, FILTER_OPEN_HZ), SPATIAL_GLIDE_TAU_S)
      }
      // A source that left the nearest few, went out of earshot or was destroyed fades out.
      for (const [key, handle] of spatialHandles) {
        if (!live.has(key)) handle.setGain(0, SPATIAL_GLIDE_TAU_S)
      }
      if (held) return
      for (const shot of out.shots) {
        if (!ready.includes(shot.clip) || !finitePosition(shot.at)) continue
        spatialPlayed++
        const asset = assetFor(shot.clip)
        backend.playSpatial(shot.clip, asset.bus, asset.cueGain * finiteOr(shot.level, 0), rate, shot.at, finiteOr(shot.cutoffHz, FILTER_OPEN_HZ))
      }
    },

    primeSpatial(inputs: SpatialInputs): void {
      spatialMemory = { ...nextSpatial(spatialMemory, inputs).memory, pending: [] }
    },

    hold(isHeld: boolean): void {
      held = isHeld
      if (held) {
        for (const [id, handle] of handles) {
          handle.setGain(0, layers[id]!.glideTauS)
          const s = layerState.get(id)
          if (s !== undefined) layerState.set(id, { ...s, gain: 0 })
        }
        for (const handle of spatialHandles.values()) handle.setGain(0, SPATIAL_GLIDE_TAU_S)
      }
    },

    /** Bypasses the reducer: no replay-rate scaling or scrub silence here. The caller must
     *  supply its own edge memory, pass the replay rate, and skip frames where the replay jumped. */
    playAt(clip: ClipId, at: Position, rate = 1): void {
      // Same rules as any cue: silent while held, never a failed clip, never
      // a NaN position (a non-finite value on a PannerNode throws).
      if (held) return
      if (!backend.loaded().includes(clip)) return
      if (!finitePosition(at)) return
      const asset = assetFor(clip)
      spatialPlayed++
      backend.playOnce(clip, asset.bus, asset.cueGain, rate, at)
    },

    setListener(pose: ListenerPose): void {
      if (!finitePosition(pose.position) || !finitePosition(pose.forward) || !finitePosition(pose.up)) return
      backend.setListener(pose)
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

    setView(next: View): void {
      if (next === view) return
      view = next
      backend.setCabin(CABIN_PRESETS[next], CABIN_GLIDE_TAU_S)
    },

    setCameraZoom(zoom: number): void {
      const next = chaseDistanceGain(zoom)
      if (next === distanceGain) return
      distanceGain = next
      backend.setDistanceGain(next, DISTANCE_GLIDE_TAU_S)
    },

    snapshot(): AudioSnapshot {
      return {
        state: backend.state(),
        loaded: backend.loaded(),
        failed,
        muted: isMuted,
        masterGain,
        engineGain: layerState.get(activeEngineLayer)?.gain ?? 0,
        enginePlaybackRate: layerState.get(activeEngineLayer)?.rate ?? 0,
        layers: Object.fromEntries(layerState),
        cuesFired,
        spatialPlayed,
        view,
      }
    },
  }
}
