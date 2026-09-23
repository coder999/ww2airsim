import { describe, it, expect } from 'vitest'
import { createAudioSystem } from '../../src/audio/system.js'
import { createFakeBackend } from './fakeBackend.js'
import type { AudioInputs } from '../../src/audio/cues.js'
import { ENGINE_GAIN_MAX, MASTER_GAIN, loopEndSeconds, loopStartSeconds } from '../../src/audio/mix.js'

const flying: AudioInputs = {
  throttle: 1, engineRunning: true, impact: null, onGround: false, groundSurface: 'land', tick: 10, shots: 0,
  bombsDropped: 0, rocketsFired: 0,
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
