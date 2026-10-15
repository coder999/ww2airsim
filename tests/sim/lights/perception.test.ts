import { describe, expect, it } from 'vitest'
import {
  PERCEPTION_DEFAULTS, PERCEPTION_KEYS, detectionRangeM, navLightCd, needsNightFacts, perceptionAt, type NightFacts, type PerceptionWorld,
} from '../../../src/sim/lights/perception.js'
import { ambientNightLevel, type LightSpec } from '../../../src/sim/lights/lights.js'
import { v3 } from '../../../src/sim/math/vec3.js'

/**
 * F6B Task 3. The numbers in the table are the formula's OUTPUT (plan section 3.5, calculated 2026-10-15), not
 * history: they pin the model's shape, and move only when a tunable does. The behavior tests below are the
 * contract (lit far above dark, a flare or beam closes the gap, day is untouched).
 */
const SRC = { source: 'gameplay', sourceNote: 'test' } as const
const nav = (id: string, over: Partial<LightSpec> = {}): LightSpec =>
  ({ id: `nav-${id}`, kind: 'nav', at: { aircraft: id, point: 'all' }, color: 'white', state: 'on', ...SRC, ...over }) as LightSpec
const LAMP = 120 // three position lights at 40 cd
const dark = (el: number, cover = 0.1, local = 0) => detectionRangeM({ sunElevationDeg: el, ambientLux: ambientNightLevel(el, cover), localLux: local, selfCd: 0 })
const lit = (el: number, cover = 0.1) => detectionRangeM({ sunElevationDeg: el, ambientLux: ambientNightLevel(el, cover), localLux: 0, selfCd: LAMP })
const within = (v: number, want: number, pct = 1) => expect(Math.abs(v - want) / want * 100).toBeLessThan(pct)

describe('detection range: the formula', () => {
  it('sun above the horizon is exactly today\'s rule', () => {
    expect(dark(0)).toBe(8000); expect(dark(40, 0.58)).toBe(8000); expect(lit(12)).toBe(8000)
  })
  it('matches the calculated situations of plan 3.5 (clear sky 0.1 cover unless noted)', () => {
    within(dark(-6), 2394); within(lit(-6), 6000)
    within(dark(-9), 1197); within(dark(-46), 834); within(dark(-46, 0.58), 761); within(lit(-46), 6000)
    within(dark(-46, 0.1, 800e3 / 300 ** 2), 3093)       // 300 m from a parachute flare
    within(dark(-46, 0.1, 800e3 / 1000 ** 2), 1716)      // 1,000 m
    within(dark(-46, 0.1, 800e6 / 3000 ** 2), 5493, 2)   // 3 km inside a searchlight beam
    expect(dark(-46, 0.1, 50 / 50 ** 2)).toBeLessThan(950) // a pot barely helps
  })
  it('blackout matters: lit is at least 5x dark at deep night; a flare or a beam closes most of the gap', () => {
    expect(lit(-46)).toBeGreaterThanOrEqual(5 * dark(-46))
    const flared = dark(-46, 0.1, 800e3 / 300 ** 2)
    expect(flared).toBeGreaterThan(3 * dark(-46))
    expect(dark(-46, 0.1, 800e6 / 3000 ** 2)).toBeGreaterThan(0.8 * lit(-46))
  })
  it('is monotonic in light, never below the floor, never above the day cap', () => {
    let prev = 0
    for (const lux of [0, 0.01, 0.1, 1, 10, 100, 1e4]) { const r = dark(-46, 0.1, lux); expect(r).toBeGreaterThanOrEqual(prev); prev = r }
    expect(dark(-46, 1, 0)).toBeGreaterThanOrEqual(PERCEPTION_DEFAULTS.rFloorM)
    expect(dark(-46, 0, 1e9)).toBeLessThanOrEqual(PERCEPTION_DEFAULTS.rDayM)
  })
  it('is continuous across the horizon (clear sky, within 2 percent) and lamps lose to a bright sky', () => {
    within(dark(-0.01, 0), 8000, 2); within(lit(-0.01, 0), 8000, 2)
    expect(detectionRangeM({ sunElevationDeg: -3, ambientLux: 34, localLux: 0, selfCd: LAMP })).toBeLessThan(5000)
  })
  it('a tuning override moves the range (the DEV knob is live)', () => {
    const base = { sunElevationDeg: -46, ambientLux: 0.047, localLux: 0, selfCd: LAMP }
    expect(detectionRangeM(base, { rNavM: 3000 })).toBeCloseTo(3000, 0)
  })
  it('every tunable has a key (the DEV override and the docs table enumerate this list, pinned)', () => {
    expect(PERCEPTION_KEYS).toEqual(['rDayM', 'sRefLux', 'k', 'rFloorM', 'rNavM', 'iNavCd', 'sGlareLux', 'holdFactor'])
  })
})

describe('navLightCd', () => {
  it('an aircraft with no authored nav light is dark; lights switch off in blackout unless exempt; a schedule is honored', () => {
    expect(navLightCd([], 'a', 0, false)).toBe(0)
    expect(navLightCd([nav('a')], 'a', 0, false)).toBe(LAMP)
    expect(navLightCd([nav('a')], 'a', 0, true)).toBe(0)
    expect(navLightCd([nav('a', { blackoutExempt: true })], 'a', 0, true)).toBe(LAMP)
    expect(navLightCd([nav('a')], 'b', 0, false)).toBe(0)
    expect(navLightCd([nav('a', { state: 'off' })], 'a', 0, false)).toBe(0)
    expect(navLightCd([nav('a', { schedule: { onAtS: 10 } })], 'a', 5, false)).toBe(0)
  })
})

describe('perceptionAt', () => {
  const night = (extra: Partial<NightFacts> = {}): NightFacts => ({ hour0: 21, latDeg: 11.24, cloudCover: 0.1, lights: [nav('p'), nav('z')], ...extra })
  const world = (n: NightFacts | undefined, off: string[] = []): PerceptionWorld => ({
    tick: 0, night: n, terrain: null, wind: null, ships: [],
    aircraft: ['p', 'z'].map((id) => ({ id, ...(off.includes(id) ? { lightsOff: true as const } : {}), state: { position: v3(id === 'p' ? 0 : 5000, 1000, 0) } })),
  })
  it('no night facts: no table at all (the day path does no work)', () => { expect(perceptionAt(world(undefined), 1 / 60)).toBeNull() })
  it('lit and blacked-out aircraft get different ranges from the same world', () => {
    const p = perceptionAt(world(night(), ['p']), 1 / 60)!
    expect(p.rangeM.z).toBeGreaterThanOrEqual(5 * p.rangeM.p!)
  })
  it('a flare lights a blacked-out aircraft up', () => {
    const flare = { id: 'f', kind: 'flare', at: { x: 0, z: 0, altitudeM: 1300 }, color: 'warm', state: 'on', schedule: { onAtS: 0, burnS: 180 }, fixed: true, ...SRC } as LightSpec
    const plain = perceptionAt(world(night(), ['p', 'z']), 1 / 60)!
    const flared = perceptionAt(world(night({ lights: [nav('p'), nav('z'), flare] }), ['p', 'z']), 1 / 60)!
    expect(flared.rangeM.p!).toBeGreaterThan(3 * plain.rangeM.p!)
  })
  it('daylight facts (dusk takeoff, sun still up) give the day range to everyone', () => {
    const p = perceptionAt(world(night({ hour0: 17 })), 1 / 60)!
    expect(p.rangeM.p).toBe(8000)
  })
  it('the night-facts horizon: a noon sortie has none, a 1645 dusk takeoff and a 2100 night sortie do', () => {
    expect(needsNightFacts(12)).toBe(false); expect(needsNightFacts(9)).toBe(false)
    expect(needsNightFacts(16.75)).toBe(true); expect(needsNightFacts(21)).toBe(true); expect(needsNightFacts(4)).toBe(true)
  })
})
