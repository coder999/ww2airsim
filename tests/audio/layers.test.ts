import { describe, it, expect } from 'vitest'
import { createAudioSystem } from '../../src/audio/system.js'
import { LAYERS, finiteOr, type LayerTable } from '../../src/audio/layers.js'
import { FILTER_OPEN_HZ } from '../../src/audio/mix.js'
import type { AudioInputs } from '../../src/audio/cues.js'
import { createFakeBackend } from './fakeBackend.js'

const flying: AudioInputs = {
  throttle: 1, engineRunning: true, impact: null, onGround: false, groundSurface: 'land', heightM: 50, sinkMps: 0, tick: 10, shots: 0,
  bombsDropped: 0, rocketsFired: 0,
}

// A second layer on a clip that is already committed, so the test needs no new asset.
const twoLayers: LayerTable = {
  ...LAYERS,
  wind: { clip: 'machinegun', bus: 'ambient', loopStartS: null, loopEndS: null, glideTauS: 0.1 },
}

describe('finiteOr', () => {
  it('passes finite numbers through and replaces NaN and infinities', () => {
    expect(finiteOr(0.5, 9)).toBe(0.5)
    expect(finiteOr(Number.NaN, 9)).toBe(9)
    expect(finiteOr(Number.POSITIVE_INFINITY, 9)).toBe(9)
  })
})

describe('driveLayer (spec §4: named layered loops)', () => {
  it('starts each layer once, on its own bus, with its own loop points', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    audio.driveLayer('wind', { gain: 0.4, rate: 1 })
    audio.update(flying)
    expect(fake.loopsStarted.map((l) => [l.id, l.bus, l.startS, l.endS])).toEqual([
      ['machinegun', 'ambient', null, null],
      ['propeller', 'engine', expect.any(Number), expect.any(Number)],
    ])
  })

  it('writes gain, rate and cutoff, and multiplies rate by the replay rate', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.driveLayer('wind', { gain: 0.3, rate: 1.2, cutoffHz: 800 }, 0.5)
    const wind = fake.layers[0]!
    expect(wind.gains.at(-1)).toBe(0.3)
    expect(wind.rates.at(-1)).toBeCloseTo(0.6, 12)
    expect(wind.cutoffs.at(-1)).toBe(800)
    expect(wind.glides.every((tau) => tau === 0.1)).toBe(true)
  })

  it('does not touch the cutoff when the drive has none', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    expect(fake.layers[0]!.cutoffs).toEqual([])
    expect(audio.snapshot().layers['wind']!.cutoffHz).toBeNull()
  })

  it('is a silent no-op when the layer\'s clip never decoded (Review Focus 1)', async () => {
    const fake = createFakeBackend({ failToLoad: ['machinegun'] })
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    expect(() => audio.driveLayer('wind', { gain: 0.3, rate: 1 })).not.toThrow()
    expect(fake.loopsStarted).toEqual([])
  })

  it('never lets NaN or Infinity reach the backend (Review Focus 2)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.driveLayer('wind', { gain: Number.NaN, rate: Number.POSITIVE_INFINITY, cutoffHz: Number.NaN })
    const wind = fake.layers[0]!
    expect([...wind.gains, ...wind.rates, ...wind.cutoffs].every(Number.isFinite)).toBe(true)
    expect(wind.gains.at(-1)).toBe(0)
    expect(wind.rates.at(-1)).toBe(1)
    expect(wind.cutoffs.at(-1)).toBe(FILTER_OPEN_HZ)
  })

  it('throws loudly on an unknown layer id (Review Focus 5)', async () => {
    const audio = createAudioSystem(createFakeBackend(), twoLayers)
    await audio.load()
    expect(() => audio.driveLayer('nope', { gain: 1, rate: 1 })).toThrow(/no audio layer named nope/)
  })

  it('holds every layer at zero, then restores on the next drive (Review Focus 4)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.update(flying)
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    audio.hold(true)
    expect(fake.layers.every((l) => l.gains.at(-1) === 0)).toBe(true)
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    expect(fake.layers[1]!.gains.at(-1)).toBe(0)
    audio.hold(false)
    audio.driveLayer('wind', { gain: 0.3, rate: 1 })
    expect(fake.layers[1]!.gains.at(-1)).toBe(0.3)
  })

  it('exposes every layer in the snapshot, and keeps the engine fields Tier 2 reads', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake, twoLayers)
    await audio.load()
    audio.update(flying)
    const snap = audio.snapshot()
    expect(snap.engineGain).toBe(snap.layers['engine']!.gain)
    expect(snap.enginePlaybackRate).toBe(snap.layers['engine']!.rate)
    expect(snap.engineGain).toBeGreaterThan(0)
  })
})
