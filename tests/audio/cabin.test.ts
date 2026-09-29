import { describe, it, expect } from 'vitest'
import { CABIN_GLIDE_TAU_S, CABIN_PRESETS, RADIO_BAND_HIGH_HZ, RADIO_BAND_LOW_HZ } from '../../src/audio/mix.js'
import { createAudioSystem } from '../../src/audio/system.js'
import { createFakeBackend } from './fakeBackend.js'

describe('cabin presets (spec §2: cockpit and chase are different mixes)', () => {
  it('makes the chase view brighter for the world and quieter and farther for the radio', () => {
    expect(CABIN_PRESETS.chase.worldLowpassHz).toBeGreaterThan(CABIN_PRESETS.cockpit.worldLowpassHz)
    expect(CABIN_PRESETS.chase.radioLowpassHz).toBeLessThan(CABIN_PRESETS.cockpit.radioLowpassHz)
    expect(CABIN_PRESETS.chase.radioGain).toBeLessThan(CABIN_PRESETS.cockpit.radioGain)
  })

  it('never puts a preset gain above 1 or a cutoff at or below zero', () => {
    for (const p of Object.values(CABIN_PRESETS)) {
      expect(p.worldGain).toBeGreaterThan(0)
      expect(p.worldGain).toBeLessThanOrEqual(1)
      expect(p.radioGain).toBeGreaterThan(0)
      expect(p.radioGain).toBeLessThanOrEqual(1)
      expect(p.worldLowpassHz).toBeGreaterThan(0)
      expect(p.radioLowpassHz).toBeGreaterThan(0)
    }
  })

  it('keeps the radio pass band ordered and glides with a positive tau', () => {
    expect(RADIO_BAND_LOW_HZ).toBeGreaterThan(0)
    expect(RADIO_BAND_HIGH_HZ).toBeGreaterThan(RADIO_BAND_LOW_HZ)
    expect(CABIN_GLIDE_TAU_S).toBeGreaterThan(0)
  })
})

describe('setView', () => {
  it('sends the matching preset with the glide, once per change (Review Focus 3)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    for (let i = 0; i < 100; i++) audio.setView('cockpit')
    expect(fake.cabins).toEqual([{ preset: CABIN_PRESETS.cockpit, tauS: CABIN_GLIDE_TAU_S }])
    for (let i = 0; i < 100; i++) audio.setView('chase')
    expect(fake.cabins.map((c) => c.preset)).toEqual([CABIN_PRESETS.cockpit, CABIN_PRESETS.chase])
    audio.setView('cockpit')
    expect(fake.cabins).toHaveLength(3)
  })

  it('reports the view in the snapshot, null before the first call', async () => {
    const audio = createAudioSystem(createFakeBackend())
    expect(audio.snapshot().view).toBeNull()
    audio.setView('cockpit')
    expect(audio.snapshot().view).toBe('cockpit')
  })
})
