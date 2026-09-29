import { describe, it, expect } from 'vitest'
import { assetFor } from '../../src/audio/assets.js'
import { createAudioSystem } from '../../src/audio/system.js'
import { createFakeBackend } from './fakeBackend.js'

const at = { x: 100, y: 20, z: -300 }
const pose = { position: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } }

describe('playAt (spec §4: one-shots take an optional position)', () => {
  it('plays the clip on its bus, at its cue gain, with the position', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.playAt('explosion', at, 0.5)
    expect(fake.played).toEqual([{ id: 'explosion', bus: 'sfx', gain: assetFor('explosion').cueGain, rate: 0.5, at }])
    expect(audio.snapshot().spatialPlayed).toBe(1)
  })

  it('does not play a clip that failed to decode', async () => {
    const fake = createFakeBackend({ failToLoad: ['explosion'] })
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.playAt('explosion', at)
    expect(fake.played).toEqual([])
  })

  it('drops a non-finite position instead of passing NaN on (Review Focus 2)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.playAt('explosion', { x: Number.NaN, y: 0, z: 0 })
    audio.playAt('explosion', { x: 0, y: Number.POSITIVE_INFINITY, z: 0 })
    expect(fake.played).toEqual([])
  })

  it('is silent while a replay is held (Review Focus 4)', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    await audio.load()
    audio.hold(true)
    audio.playAt('explosion', at)
    expect(fake.played).toEqual([])
    audio.hold(false)
    audio.playAt('explosion', at)
    expect(fake.played).toHaveLength(1)
  })
})

describe('setListener', () => {
  it('passes the pose to the backend, dropping any pose with a non-finite component', async () => {
    const fake = createFakeBackend()
    const audio = createAudioSystem(fake)
    audio.setListener(pose)
    audio.setListener({ ...pose, forward: { x: Number.NaN, y: 0, z: -1 } })
    expect(fake.listeners).toEqual([pose])
  })
})
