import { describe, it, expect } from 'vitest'
import { QUIET_DAMAGE } from './inputs.js'
import { assetFor } from '../../src/audio/assets.js'
import { VOICE_GAIN, createAudioSystem } from '../../src/audio/system.js'
import { SQUELCH_LEAD_S, VOICE_STEMS, voiceId } from '../../src/audio/radio.js'
import { createFakeBackend } from './fakeBackend.js'
import type { AudioInputs } from '../../src/audio/cues.js'
import { ENGINE_GAIN_MAX, MASTER_GAIN, SYNTH_GAIN_MAX, loopEndSeconds, loopStartSeconds, windFor } from '../../src/audio/mix.js'

const flying: AudioInputs = {
  throttle: 1, engineRunning: true, impact: null, onGround: false, groundSurface: 'land', heightM: 50, sinkMps: 0, tick: 10, shots: 0,
  bombsDropped: 0, rocketsFired: 0, ...QUIET_DAMAGE,
}

describe('the audio system, driven through a fake backend (design §7.1)', () => {
  it('starts the propeller loop at the committed loop points, once', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    audio.update(flying)
    expect(fake.loopsStarted.length).toBe(1)
    expect(fake.loopsStarted[0]!.id).toBe('propeller')
    // The loop points reach the backend, rather than the backend being left
    // to default to the whole file -- which is the audible click the loop
    // constants exist to avoid.
    expect(fake.loopsStarted[0]!.startS).toBeCloseTo(loopStartSeconds(), 12)
    expect(fake.loopsStarted[0]!.endS).toBeCloseTo(loopEndSeconds(), 12)
  })

  it('drives the engine gain from the throttle, to exactly zero at the stop', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    expect(fake.engineGains.at(-1)).toBeCloseTo(ENGINE_GAIN_MAX, 12)
    // The throttle cut (`M`) takes the lever 1 -> 0 in ONE frame, which is
    // why every parameter write goes through a glide rather than a step.
    audio.update({ ...flying, throttle: 0 })
    expect(fake.engineGains.at(-1)).toBe(0)
    expect(fake.engineGlides.every((tau) => tau > 0)).toBe(true)
  })

  it('fires exactly one water_crash for a ditching, over a hundred frames', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    const hit: AudioInputs = { ...flying, throttle: 0, engineRunning: false, impact: { tick: 900, kind: 'ditched', surface: 'water' } }
    for (let i = 0; i < 100; i++) audio.update(hit)
    expect(fake.played.map((p) => p.id)).toEqual(['water_crash'])
  })

  it('never plays a clip that failed to load', async () => {
    // A failed fetch must degrade to silence, not to a black failure screen
    // (design §10.2): a flight sim with no sound is playable.
    const fake = createFakeBackend({ failToLoad: ['water_crash'] })
    const audio = createAudioSystem(fake)
    await expect(audio.load()).resolves.toBeUndefined()
    audio.update({ ...flying, throttle: 0, engineRunning: false, impact: { tick: 1, kind: 'ditched', surface: 'water' } })
    expect(fake.played).toEqual([])
  })

  it('still starts the engine when a ONE-SHOT failed to load', async () => {
    // The failure must be per clip. An early version that gave up on the
    // whole set would have left the sim silent because one cue 404'd.
    const fake = createFakeBackend({ failToLoad: ['water_crash'] })
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    expect(fake.loopsStarted.map((l) => l.id)).toEqual(['propeller'])
  })

  it('stays silent, and does not throw, when the ENGINE itself failed to load', async () => {
    const fake = createFakeBackend({ failToLoad: ['propeller'] })
    const audio = createAudioSystem(fake)
    await audio.load()
    expect(() => audio.update(flying)).not.toThrow()
    expect(fake.loopsStarted).toEqual([])
  })

  it('mutes by taking the master gain to zero, and restores it', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.setMuted(true)
    expect(fake.masterGains.at(-1)).toBe(0)
    expect(audio.muted()).toBe(true)
    audio.setMuted(false)
    expect(fake.masterGains.at(-1)).toBeCloseTo(MASTER_GAIN, 12)
    expect(audio.muted()).toBe(false)
  })

  it('still advances its cue bookkeeping while muted', async () => {
    // Muted is master gain 0, not a teardown -- so unmuting mid-explosion
    // cannot resurrect a stale sound, and the reducer's edges do not depend
    // on whether anyone is listening.
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.setMuted(true)
    const hit: AudioInputs = { ...flying, throttle: 0, engineRunning: false, impact: { tick: 3, kind: 'destroyed', surface: 'land' } }
    audio.update(hit); audio.update(hit)
    expect(fake.played.map((p) => p.id)).toEqual(['explosion'])
  })

  it('resumes the context, which the autoplay policy requires a gesture for', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    expect(fake.state()).toBe('suspended')
    await audio.resume()
    expect(fake.state()).toBe('running')
  })
})

describe('replay support (instant replay R-4)', () => {
  it('rate scales the engine and the one-shot rate', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    const full = fake.engineRates.at(-1)!
    audio.update({ ...flying, tick: 11, shots: 5 }, 0.5)
    expect(fake.engineRates.at(-1)).toBeCloseTo(full * 0.5, 9)
    expect(fake.played.at(-1)!.rate).toBe(0.5)
  })

  it('prime advances the memory without a sound', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    const before = fake.played.length
    audio.prime({ ...flying, tick: 20, shots: 50 })
    audio.update({ ...flying, tick: 21, shots: 50 })
    expect(fake.played.length).toBe(before)
  })

  it('restore after a replay fires no live cue (Review Focus 4)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update({ ...flying, tick: 100, shots: 10 })
    const live = audio.memory()
    audio.update({ ...flying, tick: 40, shots: 0 })     // replay: an older tick (restart)
    audio.update({ ...flying, tick: 41, shots: 3 }, 1)  // a replayed burst
    const afterReplay = fake.played.length
    audio.restore(live)
    audio.update({ ...flying, tick: 101, shots: 10 })   // live again, nothing new
    expect(fake.played.length).toBe(afterReplay)
  })

  it('hold silences the engine; the next update brings it back', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    audio.hold(true)
    expect(fake.engineGains.at(-1)).toBe(0)
    expect(audio.snapshot().engineGain).toBe(0)
    audio.hold(false)
    audio.update({ ...flying, tick: 11 })
    expect(fake.engineGains.at(-1)).toBeGreaterThan(0)
  })

  it('suppresses a cue that would otherwise fire while held ("paused means silent", design §7)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    audio.hold(true)
    const before = fake.played.length
    // A rising shot count would fire `machinegun` if not held -- see the
    // "rate scales..." test above, which fires it from the same inputs.
    audio.update({ ...flying, tick: 11, shots: 5 })
    expect(fake.played.length).toBe(before)
    // Memory still advanced during the hold (only the SOUND was suppressed),
    // so unholding does not fire the skipped cue late: `shots` has already
    // been seen at 5, so it is not a further rise.
    audio.hold(false)
    audio.update({ ...flying, tick: 12, shots: 5 })
    expect(fake.played.length).toBe(before)
  })

  it('drives the engine family layer the aircraft uses, and fades the old one on a change', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update({ ...flying, engineFamily: 'multi_heavy' })
    expect(fake.loopsStarted.map((l) => l.id)).toEqual(['engine_multi_heavy'])
    audio.update({ ...flying, engineFamily: 'allison', tick: 11 })
    expect(fake.loopsStarted.map((l) => l.id)).toEqual(['engine_multi_heavy', 'engine_allison_v12'])
    expect(fake.layers[0]!.gains.at(-1)).toBe(0)
    expect(audio.snapshot().engineGain).toBeGreaterThan(0)
  })

  it('starts the sea ambience only when first audible', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    expect(fake.loopsStarted.map((l) => l.id)).toEqual(['propeller'])
    audio.update({ ...flying, groundSurface: 'water', heightM: 20, tick: 11 })
    expect(fake.loopsStarted.map((l) => l.id)).toEqual(['propeller', 'sea_waves'])
    expect(Object.keys(audio.snapshot().layers)).toEqual(['engine', 'sea'])
  })

  it('plays the damage cues through the real path', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    audio.update({ ...flying, tick: 11, structure: 0.9, damage: { round: { tick: 11 } }, hookDown: true })
    expect(fake.played.map((p) => p.id)).toEqual(['hit_taken', 'hook_clunk'])
  })

  describe('spatial', () => {
    const listener = { position: { x: 0, y: 1000, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }
    const ai = (id: string, x: number, shots = 0) =>
      ({ id, family: 'radial' as const, position: { x, y: 1000, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, shots, engineHealth: 1 })
    const sp = (tick: number, extra: Partial<Parameters<ReturnType<typeof createAudioSystem>['updateSpatial']>[0]> = {}) =>
      ({ tick, listener, aircraft: [], decks: [], blasts: [], ...extra })

    it('starts one positioned loop per AI aircraft, once, on the family clip', async () => {
      const fake = createFakeBackend()
      const audio = createAudioSystem(fake)
      await audio.load()
      audio.updateSpatial(sp(1, { aircraft: [ai('a', 300)] }))
      audio.updateSpatial(sp(2, { aircraft: [ai('a', 310)] }))
      expect(fake.spatialLoops.map((l) => l.clip)).toEqual(['propeller'])
      expect(fake.spatialLoops[0]!.positions.at(-1)!.x).toBeCloseTo(310, 6)
      expect(fake.spatialLoops[0]!.gains.at(-1)!).toBeGreaterThan(0)
      expect(fake.spatialLoops[0]!.glides.every((t) => t > 0)).toBe(true)
      expect(fake.listeners.length).toBe(1)
    })

    it('fades a source that leaves the nearest set, and silences everything while held', async () => {
      const fake = createFakeBackend()
      const audio = createAudioSystem(fake)
      await audio.load()
      audio.updateSpatial(sp(1, { aircraft: [ai('a', 300)] }))
      audio.updateSpatial(sp(2))
      expect(fake.spatialLoops[0]!.gains.at(-1)).toBe(0)
      audio.updateSpatial(sp(3, { aircraft: [ai('a', 300)] }))
      audio.hold(true)
      expect(fake.spatialLoops[0]!.gains.at(-1)).toBe(0)
      audio.updateSpatial(sp(4, { aircraft: [ai('a', 300)] }))
      expect(fake.spatialLoops[0]!.gains.at(-1)).toBe(0)
    })

    it('plays a detonation after its travel time, lowpassed and quieter than the cue', async () => {
      const fake = createFakeBackend()
      const audio = createAudioSystem(fake)
      await audio.load()
      audio.updateSpatial(sp(100, { blasts: [{ tick: 100, surface: 'land', position: { x: 1715, y: 0, z: 0 } }] }))
      expect(fake.spatialShots).toEqual([])
      for (let t = 101; t < 600; t++) audio.updateSpatial(sp(t))
      expect(fake.spatialShots.length).toBe(1)
      const shot = fake.spatialShots[0]!
      expect(shot.id).toBe('explosion')
      expect(shot.lowpassHz).toBeLessThan(10_000)
      expect(shot.gain).toBeLessThan(assetFor('explosion').cueGain)
      expect(audio.snapshot().spatialPlayed).toBe(1)
    })

    it('makes no sound for a queued blast when held, and prime drops the queue', async () => {
      const fake = createFakeBackend()
      const audio = createAudioSystem(fake)
      await audio.load()
      audio.updateSpatial(sp(100, { blasts: [{ tick: 100, surface: 'land', position: { x: 1715, y: 0, z: 0 } }] }))
      audio.primeSpatial(sp(101))
      for (let t = 102; t < 600; t++) audio.updateSpatial(sp(t))
      expect(fake.spatialShots).toEqual([])
      audio.updateSpatial(sp(500, { blasts: [{ tick: 500, surface: 'land', position: { x: 300, y: 0, z: 0 } }] }))
      audio.hold(true)
      for (let t = 501; t < 600; t++) audio.updateSpatial(sp(t))
      expect(fake.spatialShots).toEqual([])
    })

    it('restores the spatial memory with the cue memory after a replay', async () => {
      const fake = createFakeBackend()
      const audio = createAudioSystem(fake)
      await audio.load()
      audio.updateSpatial(sp(100, { blasts: [{ tick: 100, surface: 'land', position: { x: 1715, y: 0, z: 0 } }] }))
      const live = audio.memory()
      audio.primeSpatial(sp(5))
      audio.restore(live)
      for (let t = 101; t < 600; t++) audio.updateSpatial(sp(t))
      expect(fake.spatialShots.length).toBe(1)
    })

    it('starts the deck rumble at the ship only when it is in earshot', async () => {
      const fake = createFakeBackend()
      const audio = createAudioSystem(fake)
      await audio.load()
      audio.updateSpatial(sp(1, { decks: [{ id: 'd', center: { x: 9000, y: 0, z: 0 }, lengthM: 250 }] }))
      expect(fake.spatialLoops).toEqual([])
      audio.updateSpatial(sp(2, { decks: [{ id: 'd', center: { x: 300, y: 0, z: 0 }, lengthM: 250 }] }))
      expect(fake.spatialLoops.map((l) => l.clip)).toEqual(['carrier_deck'])
    })
  })
})

describe('the radio (I2)', () => {
  const CAP = 'Essex CIC: Hold CAP over the task group, angels ten. Raid expected from the northwest.'
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  it('loads only the player language, then sends squelch, voice, squelch on the radio bus', async () => {
    const fake = createFakeBackend({ voiceSeconds: Object.fromEntries(VOICE_STEMS.map((s) => [voiceId(s, 'ja'), 2])) })
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.updateRadio({ message: null, paddles: null, language: 'ja' })
    await settle()
    expect(fake.voicesRequested).toHaveLength(VOICE_STEMS.length)
    expect(fake.voicesRequested.every((id) => id.endsWith('_ja'))).toBe(true)
    fake.clockS = 10
    audio.updateRadio({ message: CAP, paddles: null, language: 'ja' })
    const squelch = assetFor('radio_squelch').cueGain
    expect(fake.radio).toEqual([{ atS: 10, parts: [
      { id: 'radio_squelch', gain: squelch, atS: 0 },
      { id: 'radio_tower_cap_station_ja', gain: VOICE_GAIN, atS: SQUELCH_LEAD_S },
      { id: 'radio_squelch', gain: squelch, atS: SQUELCH_LEAD_S + 2 },
    ] }])
    expect(audio.snapshot().radioPlayed).toEqual(['radio_tower_cap_station_ja'])
    // A second language is its own load, on first use.
    audio.updateRadio({ message: null, paddles: null, language: 'us' })
    expect(fake.voicesRequested.filter((id) => id.endsWith('_us'))).toHaveLength(VOICE_STEMS.length)
  })

  it('stops the transmission on the air before a cut-in', async () => {
    const fake = createFakeBackend({ voiceSeconds: Object.fromEntries(VOICE_STEMS.map((s) => [voiceId(s, 'us'), 2])) })
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.updateRadio({ message: null, paddles: null, language: 'us' })
    await settle()
    audio.updateRadio({ message: CAP, paddles: null, language: 'us' })
    expect(fake.radioStops).toEqual([])
    fake.clockS = 0.5
    audio.updateRadio({ message: CAP, paddles: 'wave-off', language: 'us' })
    expect(fake.radioStops).toEqual([0.5])
    expect(fake.radio.map((r) => r.parts[1]!.id)).toEqual(['radio_tower_cap_station_us', 'radio_paddles_waveoff_1_us'])
  })
})

describe('the synthesized layers (I1)', () => {
  it('starts wind and buffet from the frame, on their buses, with the wind lowpass', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    expect(fake.layers.filter((l) => l.clip === 'noise' || l.clip === 'buffet')).toEqual([])
    audio.update({ ...flying, airspeedMps: 41, stallSpeedMps: 40, diveSpeedMps: 200 })
    const wind = fake.layers.find((l) => l.clip === 'noise' && l.bus === 'ambient')!
    expect(wind.gains.at(-1)).toBeCloseTo(windFor(41).gain, 12)
    expect(wind.cutoffs.at(-1)).toBeCloseTo(windFor(41).cutoffHz, 12)
    expect(fake.layers.find((l) => l.clip === 'buffet')!.gains.at(-1)).toBeGreaterThan(0)
  })

  it('lays radio static under a transmission and takes it away after', async () => {
    const fake = createFakeBackend({ voiceSeconds: Object.fromEntries(VOICE_STEMS.map((s) => [voiceId(s, 'us'), 2])) })
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.updateRadio({ message: null, paddles: null, language: 'us' })
    await new Promise((r) => setTimeout(r, 0))
    audio.updateRadio({ message: 'Essex CIC: All raiders splashed. Bring it aboard.', paddles: null, language: 'us' })
    audio.update(flying)
    const radioStatic = fake.layers.find((l) => l.clip === 'noise' && l.bus === 'radio')!
    expect(radioStatic.gains.at(-1)).toBe(SYNTH_GAIN_MAX.static)
    fake.clockS = 5
    audio.update(flying)
    expect(radioStatic.gains.at(-1)).toBe(0)
  })
})
