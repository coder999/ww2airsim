import { describe, it, expect } from 'vitest'
import { InstancedMesh, Mesh } from 'three'
import { AIRFIELD_BUILDINGS, createAirfield, inAirfieldClearing } from '../../src/render/scene/airfield.js'
import { createVegetation, treeSites } from '../../src/render/scene/vegetation.js'
import { RUNWAY_CENTRE, RUNWAY_WIDTH_M } from '../../src/render/scene/runway.js'
import { RIVER_PATHS, nearRiver, riverMask } from '../../src/render/terrain/rivers.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { FIRST_COMMITTED_LEVEL, loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'

const header = loadTerrainHeader()
const field = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))

describe('scenery placement on the real Leyte field', () => {
  it('keeps all building footprints on land and outside the runway', () => {
    for (const b of AIRFIELD_BUILDINGS) {
      expect(b.x + b.width / 2).toBeLessThan(-RUNWAY_WIDTH_M / 2 - 10)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = RUNWAY_CENTRE.x + b.x + sx * b.width / 2
        const z = RUNWAY_CENTRE.z + b.z + sz * b.length / 2
        expect(heightAt(field, x, z)).toBeGreaterThan(0)
        expect(inAirfieldClearing(x, z)).toBe(true)
      }
    }
    const object = createAirfield(field)
    expect(object.children.length).toBeLessThanOrEqual(10)
    for (const child of object.children) {
      expect(child).toBeInstanceOf(Mesh)
      const mesh = child as Mesh
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      mesh.geometry.dispose()
    }
  })

  it('has stable trees while leaving shore, runway, service apron and river banks clear', () => {
    const sites = []
    for (let x = -78; x <= -73; x++) for (let z = -121; z <= -118; z++) {
      sites.push(...treeSites(field, x, z))
    }
    expect(sites.length).toBeGreaterThan(100)
    for (const t of sites) {
      expect(t.y).toBeGreaterThanOrEqual(3)
      expect(inAirfieldClearing(t.x, t.z)).toBe(false)
      expect(nearRiver(t.x, t.z)).toBe(false)
    }
    expect(treeSites(field, -78, -119)).toEqual(treeSites(field, -78, -119))
  })

  it('removes stale tree instances when flying over open ocean and restores the same forest', () => {
    const vegetation = createVegetation(field)
    const crowns = vegetation.object.children[0] as InstancedMesh
    vegetation.update(-31000, -47000)
    const count = crowns.count
    const matrices = crowns.instanceMatrix.array.slice(0, count * 16)
    expect(count).toBeGreaterThan(100)
    vegetation.update(80000, 80000)
    expect(crowns.count).toBe(0)
    vegetation.update(-31000, -47000)
    expect(crowns.count).toBe(count)
    expect(crowns.instanceMatrix.array.slice(0, count * 16)).toEqual(matrices)
  })

  it('places rivers north and west of the gulf origin without transposing the texture axes', () => {
    const m = riverMask()
    for (const river of RIVER_PATHS) for (const p of river.points) {
      expect(p.x).toBeLessThan(0)
      expect(p.z).toBeLessThan(0)
      const col = Math.floor((p.x - m.minX) / m.stepX)
      const row = Math.floor((p.z - m.minZ) / m.stepZ)
      expect(m.data[row * m.size + col]).toBeGreaterThan(200)
      expect(nearRiver(p.x, p.z)).toBe(true)
      expect(nearRiver(p.x, -p.z)).toBe(false)
    }
    expect(nearRiver(RUNWAY_CENTRE.x, RUNWAY_CENTRE.z)).toBe(false)
  })
})
