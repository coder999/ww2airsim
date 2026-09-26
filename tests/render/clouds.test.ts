import { describe, it, expect } from 'vitest'
import { CLOUD_TIERS, cloudDriftM, cloudTierFromQuery, createClouds } from '../../src/render/scene/clouds.js'
import { FOG_DISTANCE_M } from '../../src/render/horizon.js'
import { FAR_FADE_START_M } from '../../src/render/scene/atmosphereShading.js'
import { AP_MAX_DISTANCE_M } from '../../src/render/sky/atmosphereLuts.js'
import { LOD } from '../../src/render/terrain/lod.js'
import { loadScenario } from '../../tools/content/load.js'
import { loadCumulus, loadCurl, loadWeather, loadDetail, loadShape } from '../../tools/sky/load.js'
import { v3 } from '../../src/sim/math/vec3.js'

const noise = { shape: loadShape(), detail: loadDetail(), curl: loadCurl(), weather: loadWeather(), cumulus: loadCumulus() }

describe('clouds (Plan 16a)', () => {
  it('has three tiers that march fewer steps as they descend', () => {
    expect(CLOUD_TIERS.high.cumulusSteps).toBeGreaterThan(CLOUD_TIERS.medium.cumulusSteps)
    expect(CLOUD_TIERS.medium.cumulusSteps).toBeGreaterThan(CLOUD_TIERS.low.cumulusSteps)
    expect(cloudTierFromQuery('?cloudTier=off')).toBe('off')
    expect(cloudTierFromQuery('?cloudTier=low')).toBe('low')
    expect(cloudTierFromQuery('?x=1')).toBeUndefined()
    expect(() => cloudTierFromQuery('?cloudTier=ultra')).toThrow(/cloudTier/)
  })
  it('has exactly high/medium/low, each with a resolution scale and the Task 11 step counts (photoreal spec 4.4)', () => {
    expect(Object.keys(CLOUD_TIERS)).toEqual(['high', 'medium', 'low'])
    for (const tier of Object.values(CLOUD_TIERS)) {
      expect(tier.resolutionScale).toBeGreaterThan(0)
      expect(tier.resolutionScale).toBeLessThanOrEqual(1)
    }
    // Photoreal Task 11 (2026-09-25): spec 4.4 floors high's view steps at
    // 96. Since Mark's 60 Hz decision for high (same day), high has the
    // plan's 6 light samples again, 2 of them on the detailed density, and
    // no distance light LOD.
    // Cloud Fidelity II §3.2: the 1-in-16 update buys high >= 128 steps.
    // Medium 64 -> 56 on 2026-09-26 (cloud VDB coverage plan): a pilot
    // inside a dense-deck cloud measured 8.42 ms at 4K against 8.33.
    expect(CLOUD_TIERS.high.cumulusSteps).toBeGreaterThanOrEqual(128)
    expect([CLOUD_TIERS.high.cumulusSteps, CLOUD_TIERS.medium.cumulusSteps, CLOUD_TIERS.low.cumulusSteps]).toEqual([128, 56, 32])
    // The view march's work goes as resolutionScale^2 x cumulusSteps; a
    // lower tier must never be heavier (Task 11 fix 1: medium at 0.5 was
    // 1.36x high). Light samples never grow down the ladder either.
    const work = (['high', 'medium', 'low'] as const).map((t) => CLOUD_TIERS[t].resolutionScale ** 2 * CLOUD_TIERS[t].cumulusSteps)
    expect(work[0]!).toBeGreaterThan(work[1]!)
    expect(work[1]!).toBeGreaterThan(work[2]!)
    expect(CLOUD_TIERS.high.lightSteps).toBeGreaterThanOrEqual(CLOUD_TIERS.medium.lightSteps)
    expect(CLOUD_TIERS.medium.lightSteps).toBeGreaterThanOrEqual(CLOUD_TIERS.low.lightSteps)
    expect([CLOUD_TIERS.high.lightSteps, CLOUD_TIERS.medium.lightSteps, CLOUD_TIERS.low.lightSteps]).toEqual([6, 4, 2])
    expect([CLOUD_TIERS.high.cirrusSteps, CLOUD_TIERS.medium.cirrusSteps, CLOUD_TIERS.low.cirrusSteps]).toEqual([8, 6, 4])
    // high 0.5 -> 0.45 on 2026-09-25 (photoreal Task 9, the plan ledger's
    // allowed budget lever): the atmosphere's consumers took in-deck-1900's
    // 4K p95 to 8.46 ms; 0.45 measured 7.80/7.82. 0.45 -> 0.35 on 2026-09-25
    // (photoreal Task 11, same lever, at its 0.35 floor): the 96-step march.
    // 0.35 -> 0.5 the same day: high targets 60 Hz (budget4k.spec.ts);
    // in-deck-1900 at 4K measured 16.66 ms at 0.6 and 14.9-17.0 at 0.55.
    expect(CLOUD_TIERS.high.resolutionScale).toBeGreaterThanOrEqual(0.35)
    expect(CLOUD_TIERS.high.lightLodBandM).toBeNull()
    expect(CLOUD_TIERS.high.fineLightSteps).toBeGreaterThan(0)
    expect([CLOUD_TIERS.high.resolutionScale, CLOUD_TIERS.medium.resolutionScale, CLOUD_TIERS.low.resolutionScale]).toEqual([0.5, 0.3, 0.25])
    expect([CLOUD_TIERS.high.updatePeriod, CLOUD_TIERS.medium.updatePeriod, CLOUD_TIERS.low.updatePeriod]).toEqual([8, 1, 1])
  })
  it('drifts with the wind, the velocity of the air, and stands still in calm', () => {
    expect(cloudDriftM(null, 100)).toEqual({ x: 0, z: 0 })
    expect(cloudDriftM(v3(3, 0, -4), 10)).toEqual({ x: 30, z: -40 })
  })
  it('constructs for every shipped deck as a march with no scene object, and is disabled for a clear sky', () => {
    for (const id of ['free-flight', 'deck-quals']) {
      const clouds = createClouds(loadScenario(id).weather.clouds ?? [], noise)
      // Photoreal Task 3: the dome left the scene; the march is a node
      // builder the reduced-resolution cloud pass calls.
      expect('object' in clouds).toBe(false)
      expect(clouds.enabled).toBe(true)
      expect(typeof clouds.marchNode).toBe('function')
      clouds.setTier('low')
      clouds.update(v3(0, 1000, 0), 12, v3(5, 0, 0))
      clouds.dispose()
    }
    expect(createClouds([], noise).enabled).toBe(false)
  })
  it('the terrain draw distance is the fog distance (clouds, AP and the far fade all key on it)', () => {
    expect(LOD.drawDistanceM).toBe(FOG_DISTANCE_M)
  })
  it('the terrain far fade ends exactly at the draw distance, over its last 10% (photoreal Task 9)', () => {
    // atmosphereShading.ts farFadeWeight: smoothstep(FAR_FADE_START_M,
    // FOG_DISTANCE_M, d) is exactly 1 at the distance, which is what lets the
    // terrain's edge sit on the draw distance invisibly.
    expect(FAR_FADE_START_M).toBeCloseTo(0.9 * FOG_DISTANCE_M, 6)
    expect(FAR_FADE_START_M).toBeLessThan(LOD.drawDistanceM)
  })
  it('aerial perspective reaches exactly the fog distance (photoreal Task 8)', () => {
    expect(AP_MAX_DISTANCE_M).toBe(FOG_DISTANCE_M)
  })
})
