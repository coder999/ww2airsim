import { describe, it, expect } from 'vitest'
import type { Mesh } from 'three'
import { CLOUD_TIERS, cloudDriftM, cloudTierFromQuery, createClouds } from '../../src/render/scene/clouds.js'
import { FOG_DISTANCE_M } from '../../src/render/horizon.js'
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
  it('drifts with the wind, the velocity of the air, and stands still in calm', () => {
    expect(cloudDriftM(null, 100)).toEqual({ x: 0, z: 0 })
    expect(cloudDriftM(v3(3, 0, -4), 10)).toEqual({ x: 30, z: -40 })
  })
  it('constructs for every shipped deck, drawn last with depth off, and is absent for a clear sky', () => {
    for (const id of ['free-flight', 'deck-quals']) {
      const clouds = createClouds(loadScenario(id).weather.clouds ?? [], noise)
      const mesh = clouds.object as Mesh
      expect(mesh.renderOrder).toBeGreaterThan(0)
      expect(mesh.visible).toBe(true)
      const material = mesh.material as { transparent: boolean; depthTest: boolean; depthWrite: boolean }
      expect(material.transparent).toBe(true)
      expect(material.depthTest).toBe(false)
      expect(material.depthWrite).toBe(false)
      clouds.setTier('low')
      clouds.update(v3(0, 1000, 0), 12, v3(5, 0, 0))
      clouds.dispose()
    }
    expect(createClouds([], noise).object.visible).toBe(false)
  })
  it('shares the terrain fog distance, so a cloud at the draw distance is exactly haze', () => {
    expect(LOD.drawDistanceM).toBe(FOG_DISTANCE_M)
  })
})
