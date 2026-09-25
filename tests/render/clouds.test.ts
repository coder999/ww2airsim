import { describe, it, expect } from 'vitest'
import { CLOUD_TIERS, cloudDriftM, cloudTierFromQuery, createClouds } from '../../src/render/scene/clouds.js'
import { FOG_DISTANCE_M } from '../../src/render/horizon.js'
import { AP_MAX_DISTANCE_M } from '../../src/render/sky/atmosphereLuts.js'
import { LOD } from '../../src/render/terrain/lod.js'
import { loadScenario } from '../../tools/content/load.js'
import { loadDetail, loadShape } from '../../tools/sky/load.js'
import { v3 } from '../../src/sim/math/vec3.js'

const noise = { shape: loadShape(), detail: loadDetail() }

describe('clouds (Plan 16a)', () => {
  it('has three tiers that march fewer steps as they descend', () => {
    expect(CLOUD_TIERS.high.cumulusSteps).toBeGreaterThan(CLOUD_TIERS.medium.cumulusSteps)
    expect(CLOUD_TIERS.medium.cumulusSteps).toBeGreaterThan(CLOUD_TIERS.low.cumulusSteps)
    expect(cloudTierFromQuery('?cloudTier=off')).toBe('off')
    expect(cloudTierFromQuery('?cloudTier=low')).toBe('low')
    expect(cloudTierFromQuery('?x=1')).toBeUndefined()
    expect(() => cloudTierFromQuery('?cloudTier=ultra')).toThrow(/cloudTier/)
  })
  it('has exactly high/medium/low, each with a resolution scale and the pre-16d step counts (photoreal spec 4.1)', () => {
    expect(Object.keys(CLOUD_TIERS)).toEqual(['high', 'medium', 'low'])
    for (const tier of Object.values(CLOUD_TIERS)) {
      expect(tier.resolutionScale).toBeGreaterThan(0)
      expect(tier.resolutionScale).toBeLessThanOrEqual(1)
    }
    expect([CLOUD_TIERS.high.cumulusSteps, CLOUD_TIERS.medium.cumulusSteps, CLOUD_TIERS.low.cumulusSteps]).toEqual([48, 32, 20])
    expect([CLOUD_TIERS.high.lightSteps, CLOUD_TIERS.medium.lightSteps, CLOUD_TIERS.low.lightSteps]).toEqual([2, 1, 1])
    expect([CLOUD_TIERS.high.cirrusSteps, CLOUD_TIERS.medium.cirrusSteps, CLOUD_TIERS.low.cirrusSteps]).toEqual([8, 6, 4])
    expect([CLOUD_TIERS.high.resolutionScale, CLOUD_TIERS.medium.resolutionScale, CLOUD_TIERS.low.resolutionScale]).toEqual([0.5, 0.5, 0.25])
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
  it('shares the terrain fog distance, so a cloud at the draw distance is exactly haze', () => {
    expect(LOD.drawDistanceM).toBe(FOG_DISTANCE_M)
  })
  it('aerial perspective reaches exactly the fog distance (photoreal Task 8)', () => {
    expect(AP_MAX_DISTANCE_M).toBe(FOG_DISTANCE_M)
  })
})
