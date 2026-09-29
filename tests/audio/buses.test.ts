import { describe, it, expect } from 'vitest'
import { AUDIO_ASSETS, assetFor } from '../../src/audio/assets.js'
import { BUS_GAIN } from '../../src/audio/mix.js'
import { createAudioSystem } from '../../src/audio/system.js'
import type { AudioInputs } from '../../src/audio/cues.js'
import { createFakeBackend } from './fakeBackend.js'

const flying: AudioInputs = {
  throttle: 1, engineRunning: true, impact: null, onGround: false, groundSurface: 'land', heightM: 50, sinkMps: 0, tick: 10, shots: 0,
  bombsDropped: 0, rocketsFired: 0,
}

describe('buses (spec §4)', () => {
  it('names a real bus for every clip, and the propeller is the engine bus', () => {
    const buses = Object.keys(BUS_GAIN)
    for (const clip of AUDIO_ASSETS) expect(buses, clip.id).toContain(clip.bus)
    expect(assetFor('engine_radial_small').bus).toBe('engine')
    expect(assetFor('water_crash').bus).toBe('sfx')
  })

  it('gives every bus a gain in (0, 1]', () => {
    for (const [bus, gain] of Object.entries(BUS_GAIN)) {
      expect(gain, bus).toBeGreaterThan(0)
      expect(gain, bus).toBeLessThanOrEqual(1)
    }
  })

  it('starts the propeller loop on the engine bus', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update(flying)
    expect(fake.loopsStarted[0]!.bus).toBe('engine')
  })

  it('plays a one-shot on its clip\'s bus', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.update({ ...flying, throttle: 0, engineRunning: false, impact: { tick: 900, kind: 'ditched', surface: 'water' } })
    expect(fake.played.map((p) => [p.id, p.bus])).toEqual([['water_crash', 'sfx']])
  })
})
