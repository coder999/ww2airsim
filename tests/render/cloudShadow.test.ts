import { describe, it, expect } from 'vitest'
import { Mesh } from 'three'
import {
  MAP_TEXELS, MAP_SIDE_M, MAP_TEXEL_M, SHADOW_TIERS, cloudShadowFromQuery, createCloudShadow, snapToTexel, sunParallaxXZ,
} from '../../src/render/scene/cloudShadow.js'
import { createCloudField } from '../../src/render/scene/cloudField.js'
import { SUN_DIRECTION } from '../../src/render/scene/lighting.js'
import { loadScenario } from '../../tools/content/load.js'
import { loadDetail, loadShape } from '../../tools/sky/load.js'
import { v3 } from '../../src/sim/math/vec3.js'

const noise = { shape: loadShape(), detail: loadDetail() }
const deck = () => createCloudField(loadScenario('free-flight').weather.clouds ?? [], noise)

describe('cloud shadow map (Plan 16b)', () => {
  it('is 1024 texels over 80 km, 78.125 m each, with taps that descend by tier', () => {
    expect(MAP_TEXELS).toBe(1024)
    expect(MAP_SIDE_M).toBe(80_000)
    expect(MAP_TEXEL_M).toBe(78.125)
    expect(SHADOW_TIERS.high.taps).toBeGreaterThan(SHADOW_TIERS.medium.taps)
    expect(SHADOW_TIERS.medium.taps).toBeGreaterThan(SHADOW_TIERS.low.taps)
  })
  it('snaps the center to whole texels, idempotently', () => {
    const a = snapToTexel(1000, -1000)
    expect(Math.abs(a.x % MAP_TEXEL_M)).toBe(0)
    expect(Math.abs(a.z % MAP_TEXEL_M)).toBe(0)
    expect(Math.abs(a.x - 1000)).toBeLessThanOrEqual(MAP_TEXEL_M / 2)
    expect(snapToTexel(a.x, a.z)).toEqual(a)
    expect(snapToTexel(0, 0)).toEqual({ x: 0, z: 0 })
  })
  it('projects a raised point down the sun ray to sea level: (-0.4 y, -0.3 y) for the shipped sun, zero at sea level', () => {
    expect(sunParallaxXZ(SUN_DIRECTION, 0)).toEqual({ x: 0, z: 0 })
    const p = sunParallaxXZ(SUN_DIRECTION, 1000)
    expect(p.x).toBeCloseTo(-400, 6)
    expect(p.z).toBeCloseTo(-300, 6)
  })
  it('parses the DEV query: off and show, nothing else', () => {
    expect(cloudShadowFromQuery('?cloudShadow=off')).toBe('off')
    expect(cloudShadowFromQuery('?cloudShadow=show')).toBe('show')
    expect(cloudShadowFromQuery('?x=1')).toBeUndefined()
    expect(() => cloudShadowFromQuery('?cloudShadow=on')).toThrow(/cloudShadow/)
  })
  it('constructs for the shipped decks, recenters on the eye in whole texels, and is inert for a clear sky or under off', () => {
    for (const id of ['free-flight', 'deck-quals']) {
      const field = createCloudField(loadScenario(id).weather.clouds ?? [], noise)
      const shadow = createCloudShadow(field)
      expect(shadow.enabled).toBe(true)
      expect(shadow.showing).toBe(false)
      expect(shadow.target.width).toBe(MAP_TEXELS)
      expect(shadow.target.height).toBe(MAP_TEXELS)
      expect(shadow.scene.children.some((c) => c instanceof Mesh)).toBe(true)
      shadow.setTier('low')
      expect(shadow.taps).toBe(SHADOW_TIERS.low.taps)
      shadow.update(v3(1234.5, 800, -9876.5))
      const c = shadow.centerXZ()
      expect(Math.abs(c.x % MAP_TEXEL_M)).toBe(0)
      expect(Math.abs(c.z % MAP_TEXEL_M)).toBe(0)
      expect(Math.abs(c.x - 1234.5)).toBeLessThanOrEqual(MAP_TEXEL_M / 2)
      shadow.dispose()
      field.dispose()
    }
    const clear = createCloudShadow(createCloudField([], noise))
    expect(clear.enabled).toBe(false)
    const off = createCloudShadow(deck(), 'off')
    expect(off.enabled).toBe(false)
    const show = createCloudShadow(deck(), 'show')
    expect(show.enabled).toBe(true)
    expect(show.showing).toBe(true)
  })
})
