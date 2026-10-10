import { describe, it, expect } from 'vitest'
import { Mesh } from 'three'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../src/render/content.js'
import { loadAirfield } from '../../tools/content/load.js'
import { inAirfieldClearing } from '../../src/render/scene/airfield.js'
import { nearTownHut } from '../../src/render/scene/vegetation.js'
import { createVillages, villageFootprints, villageHuts, type Village } from '../../src/render/scene/villages.js'
import villagesData from '../../content/scenery/villages.json'

const header = loadTerrainHeader()
const level = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)
const field = createTerrainField(header, level, loadTerrainLevel(level, header))
const airfields = [loadAirfield('tacloban'), loadAirfield('dulag')]
const villages = villagesData as readonly Village[]

describe('invented villages (L3 Phase 2)', () => {
  it('places the same huts every time', () => {
    expect(villageHuts(field, villages, airfields)).toEqual(villageHuts(field, villages, airfields))
  })

  it('has villages, and a plausible number of huts', () => {
    expect(villages.length).toBeGreaterThan(10)
    const huts = villageHuts(field, villages, airfields)
    expect(huts.length).toBeGreaterThan(200)
    expect(huts.length).toBeLessThan(20000)
  })

  it('keeps every hut on land and out of airfield clearings', () => {
    for (const h of villageHuts(field, villages, airfields)) {
      expect(heightAt(field, h.x, h.z)).toBeGreaterThan(1.5)
      expect(inAirfieldClearing(airfields, h.x, h.z)).toBe(false)
    }
  })

  it('keeps trees off every hut corner, at any rotation', () => {
    const huts = villageHuts(field, villages, airfields)
    const foot = villageFootprints(huts)
    for (const h of huts) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = sx * h.width / 2, lz = sz * h.length / 2
      const x = h.x + lx * Math.cos(h.angle) + lz * Math.sin(h.angle)
      const z = h.z - lx * Math.sin(h.angle) + lz * Math.cos(h.angle)
      expect(nearTownHut(foot, x, z)).toBe(true)
    }
  })

  it('builds one mesh group per occupied 2 km cell, so culling can work', () => {
    const handle = createVillages(field, villages, airfields)
    expect(handle.count).toBeGreaterThan(200)
    expect(handle.object.children.length).toBeGreaterThan(1)
    let meshes = 0
    handle.object.traverse(o => { if (o instanceof Mesh) meshes++ })
    expect(meshes).toBeGreaterThanOrEqual(handle.object.children.length * 2)
  })
})
