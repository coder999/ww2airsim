import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { worldChecksum } from '../../src/flightRecorder/checksum.js'
import { advance, createWorldOf, withControls, withNightFacts, withPlayerLights } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { cloudCoverOf, nightFactsFor, perceptionTuningFromQuery } from '../../src/sim/lights/perception.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { level } from './ai/maneuverWorlds.js'

/**
 * F6B Task 4: the world seam. A day world is byte-identical to before (nothing attached); the lights flag and the
 * night fact are state (checksummed), so a reproduction with another hour or another blackout fails closed.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const world = () => createWorldOf({ aircraft: [level('me', f6f, v3(0, 1500, 0), v3(100, 0, 0))], player: 'me' })
const DIR = new URL('../../content/scenarios/', import.meta.url)

describe('night facts and the lights flag are state', () => {
  it('no night facts: withNightFacts is the identity, withPlayerLights(true) on a lit aircraft is the identity', () => {
    const w = world()
    expect(withNightFacts(w, undefined)).toBe(w)
    expect(worldChecksum(withPlayerLights(w, true))).toBe(worldChecksum(w))
    expect('night' in w).toBe(false)
    expect('lightsOff' in w.aircraft[0]!).toBe(false)
  })
  it('a blacked-out aircraft and a night fact each change the checksum; lit again restores it exactly', () => {
    const w = world(), base = worldChecksum(w)
    const dark = withPlayerLights(w, false)
    expect(worldChecksum(dark)).not.toBe(base)
    expect(worldChecksum(withPlayerLights(dark, true))).toBe(base)
    const night = withNightFacts(w, { hour0: 21, latDeg: 11.24, cloudCover: 0, lights: [] })
    expect(worldChecksum(night)).not.toBe(base)
    expect(worldChecksum(withNightFacts(w, { hour0: 18.5, latDeg: 11.24, cloudCover: 0, lights: [] }))).not.toBe(worldChecksum(night))
  })
  it('stepping a day world never attaches either (the day path does no new work)', () => {
    let w = world()
    for (let i = 0; i < 60; i++) w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }), DT).world
    expect('night' in w).toBe(false)
  })
  it('enrolled: exactly these shipped scenarios get night facts (pinned 2026-10-15); every other is a day world', () => {
    const got: string[] = []
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json')).sort()) {
      const j = JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as { lights?: unknown[]; weather?: { timeOfDay?: number } }
      if (nightFactsFor({ lights: j.lights as never, hour0: j.weather?.timeOfDay ?? 12, cloudCover: 0 }) !== undefined) got.push(f)
    }
    expect(got).toEqual(['combat-air-patrol.json', 'deck-quals-mission.json', 'deck-quals.json', 'night-bay.json', 'night-field.json', 'night-range.json', 'recovery-range.json'])
  })
  it('a noon sortie and a morning sortie get none; a dusk takeoff and a night sortie get them', () => {
    expect(nightFactsFor({ lights: undefined, hour0: 12, cloudCover: 0 })).toBeUndefined()
    expect(nightFactsFor({ lights: undefined, hour0: 7.5, cloudCover: 0 })).toBeUndefined()
    expect(nightFactsFor({ lights: undefined, hour0: 16.75, cloudCover: 0 })).toBeDefined()
    expect(nightFactsFor({ lights: undefined, hour0: 21, cloudCover: 0 })).toBeDefined()
  })
  it('cloud cover combines layers; DEV tuning parses and a typo throws', () => {
    expect(cloudCoverOf([])).toBe(0)
    expect(cloudCoverOf([{ coverage: 0.5 }, { coverage: 0.5 }])).toBeCloseTo(0.75, 9)
    expect(perceptionTuningFromQuery('?perception=k:0.3,rNavM:5000')).toEqual({ k: 0.3, rNavM: 5000 })
    expect(perceptionTuningFromQuery('')).toEqual({})
    expect(() => perceptionTuningFromQuery('?perception=kk:1')).toThrow(/key:number/)
    expect(() => perceptionTuningFromQuery('?perception=k:abc')).toThrow(/key:number/)
  })
})
