import { describe, it, expect, beforeEach } from 'vitest'
import {
  defaultQualitySettings, loadQualitySettings, saveQualitySettings,
  clearQualitySettings, uniformTier, type QualitySettings,
} from '../../src/render/quality.js'

function fakeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
}

describe('quality settings persistence', () => {
  beforeEach(() => {
    (globalThis as { window?: { localStorage: Storage } }).window = { localStorage: fakeLocalStorage() }
  })

  it('round-trips save/load', () => {
    const settings: QualitySettings = { ocean: 'high', scenery: 'low', clouds: 'medium', fx: 'low' }
    saveQualitySettings(settings)
    expect(loadQualitySettings()).toEqual(settings)
  })

  it('returns null with nothing saved', () => {
    expect(loadQualitySettings()).toBeNull()
  })

  it('tolerates corrupt stored JSON, does not throw', () => {
    window.localStorage.setItem('ww2airsim.quality.v1', '{not json')
    expect(() => loadQualitySettings()).not.toThrow()
    expect(loadQualitySettings()).toBeNull()
  })

  it('clearQualitySettings removes a saved value', () => {
    saveQualitySettings(defaultQualitySettings('high'))
    clearQualitySettings()
    expect(loadQualitySettings()).toBeNull()
  })

  it('defaultQualitySettings repeats one tier four times', () => {
    expect(defaultQualitySettings('medium')).toEqual({ ocean: 'medium', scenery: 'medium', clouds: 'medium', fx: 'medium' })
  })

  it('uniformTier: all-equal returns that tier, divergence returns null', () => {
    expect(uniformTier({ ocean: 'high', scenery: 'high', clouds: 'high', fx: 'high' })).toBe('high')
    expect(uniformTier({ ocean: 'high', scenery: 'low', clouds: 'high', fx: 'high' })).toBeNull()
    expect(uniformTier({ ocean: 'high', scenery: 'high', clouds: 'high', fx: 'low' })).toBeNull()
  })

  it('a saved object from before fx existed loads with fx = clouds, not discarded (Ruling R15, Review Focus 1)', () => {
    window.localStorage.setItem('ww2airsim.quality.v1', JSON.stringify({ ocean: 'high', scenery: 'medium', clouds: 'low' }))
    expect(loadQualitySettings()).toEqual({ ocean: 'high', scenery: 'medium', clouds: 'low', fx: 'low' })
  })

  it('a stored fx that is not a tier is still rejected', () => {
    window.localStorage.setItem('ww2airsim.quality.v1', JSON.stringify({ ocean: 'high', scenery: 'high', clouds: 'high', fx: 'ultra' }))
    expect(loadQualitySettings()).toBeNull()
  })
})
