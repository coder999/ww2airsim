import { describe, it, expect } from 'vitest'
import { InstancedMesh, Mesh, type Object3D } from 'three'
import {
  MAP_TEXELS, MAP_SIDE_M, MAP_TEXEL_M, SHADOW_MIN_SUN_Y, SHADOW_TIERS, cloudShadowFromQuery, createCloudShadow, snapToTexel, sunParallaxXZ,
} from '../../src/render/scene/cloudShadow.js'
import { createCloudField } from '../../src/render/scene/cloudField.js'
import { SUN_DIRECTION } from '../../src/render/scene/lighting.js'
import { loadScenario } from '../../tools/content/load.js'
import { loadCumulus, loadCurl, loadWeather, loadDetail, loadShape } from '../../tools/sky/load.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createHellcat } from '../../src/render/scene/hellcat.js'
import { createShipMesh } from '../../src/render/scene/ship.js'
import { createMarkers } from '../../src/render/scene/markers.js'
import { createRunway } from '../../src/render/scene/runway.js'
import { createAirfield } from '../../src/render/scene/airfield.js'
import { createVegetation } from '../../src/render/scene/vegetation.js'
import { createTerrainMesh } from '../../src/render/terrain/mesh.js'
import { TERRAIN_HEADER } from '../../src/render/terrain/load.js'
import { createOcean } from '../../src/render/ocean/mesh.js'
import { createDepthField } from '../../src/render/ocean/depth.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../src/render/content.js'
import { loadAirfield, loadShipSpec } from '../../tools/content/load.js'

/** The level a real page load actually flies over today -- see
 *  `content.ts`'s `INTERIM_ASSET_QUALITY_TIER` for what it is and why.
 *  Before Task 2 (2026-09-24) this used `FIRST_COMMITTED_LEVEL`,
 *  numerically the same thing (2) at the time; the two concepts have since
 *  diverged ("what's committed on disk", now 0, vs "what a page load
 *  fetches", tier-dependent). */
const GROUND_TRUTH_LEVEL = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)

const noise = { shape: loadShape(), detail: loadDetail(), curl: loadCurl(), weather: loadWeather(), cumulus: loadCumulus() }
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
  it('clamps the projection at 5 degrees of elevation, so a sun on the horizon casts long shadows, not infinite ones (Plan 16c)', () => {
    const grazing = sunParallaxXZ({ x: 1, y: 0.001, z: 0 }, 1000)
    const fiveDeg = sunParallaxXZ({ x: 1, y: SHADOW_MIN_SUN_Y, z: 0 }, 1000)
    expect(grazing).toEqual(fiveDeg)
    expect(Math.abs(grazing.x)).toBeCloseTo(1000 / SHADOW_MIN_SUN_Y, 6)
    expect(sunParallaxXZ({ x: 1, y: -0.5, z: 0 }, 1000)).toEqual(fiveDeg)
    expect(sunParallaxXZ(SUN_DIRECTION, 1000).x).toBeCloseTo(-400, 6)
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

describe('cloud shadow readers (Plan 16b)', () => {
  const meshesUnder = (root: Object3D): (Mesh | InstancedMesh)[] => {
    const out: (Mesh | InstancedMesh)[] = []
    root.traverse((o) => { if (o instanceof Mesh || o instanceof InstancedMesh) out.push(o) })
    return out
  }
  it("every lit mesh receives shadow, so the sun's custom shadow node reaches it", () => {
    // three multiplies the sun's direct term by `light.shadow.shadowNode` ONLY
    // on objects with `receiveShadow` (AnalyticLightNode.setup, r186). A mesh
    // added without the flag is lit as if the sky were clear.
    const header = loadTerrainHeader()
    const terrainField = createTerrainField(header, GROUND_TRUTH_LEVEL, loadTerrainLevel(GROUND_TRUTH_LEVEL, header))
    const tacloban = loadAirfield('tacloban')
    const roots: Object3D[] = [
      createHellcat().root, createShipMesh(loadShipSpec('essex-cv')).root, createMarkers(),
      createRunway(terrainField, tacloban), createAirfield(terrainField, tacloban).object, createVegetation(terrainField, [tacloban]).object,
    ]
    for (const root of roots) {
      const meshes = meshesUnder(root)
      expect(meshes.length).toBeGreaterThan(0)
      for (const m of meshes) expect(m.receiveShadow, `${root.name || root.type} has an unshadowed mesh`).toBe(true)
    }
  })
  it('the terrain and the ocean construct with a shadow handle, and without one', () => {
    const field = deck()
    const shadow = createCloudShadow(field)
    const terrain = createTerrainMesh(TERRAIN_HEADER, GROUND_TRUTH_LEVEL, shadow)
    expect(terrain.object.children.length).toBeGreaterThan(0)
    const depth = createDepthField({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, samples: 3, encoding: 'int16-metres' }, new Int16Array(9).fill(-125))
    const ocean = createOcean(depth, 4, [], undefined, shadow)
    ocean.userData.disposeOcean()
    createOcean(depth, 4).userData.disposeOcean()
    shadow.dispose()
    field.dispose()
  })
})
