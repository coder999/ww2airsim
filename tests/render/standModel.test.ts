import { describe, expect, it } from 'vitest'
import { EDGE_BAND_M, EMERGENT_ONE_IN, isEmergent, standRole } from '../../src/render/scene/standModel.js'
import { createVegetation, standEdgeSites, treeSites, type CoverLookup } from '../../src/render/scene/vegetation.js'
import { forestCanopyMode } from '../../src/render/scene/forestCanopy.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor, GROUND_TRUTH_TIER } from '../../src/render/content.js'
import { loadAirfield } from '../../tools/content/load.js'
import { vi } from 'vitest'

// Forest canopy rework, Task 2 (2026-10-16): edge band, interior and emergents.

describe('stand roles (pure)', () => {
  const halfPlane = (x0: number) => (x: number) => x < x0
  const role = (x: number, z: number, x0 = 0, index = 0) => standRole(x, z, halfPlane(x0), 3, 4, index)

  it('makes the edge band exactly the width of the band from a straight boundary', () => {
    for (let d = 1; d < 80; d += 0.5) {
      const r = role(-d, 123.4, 0, 7)
      if (d < EDGE_BAND_M - 1e-6) expect(r, `${d} m inside`).toBe('edge')
      else if (d > EDGE_BAND_M) expect(r, `${d} m inside`).not.toBe('edge')
    }
  })

  it('treats a clearing as an edge on every side', () => {
    const clearing = (x: number, z: number) => Math.hypot(x, z) > 40
    for (const [x, z] of [[60, 0], [-60, 0], [0, 60], [0, -60], [45, 45], [-45, 45]] as const) {
      expect(standRole(x, z, clearing, 1, 1, 0), `${x},${z}`).toBe('edge')
    }
    expect(standRole(200, 0, clearing, 1, 1, 0)).not.toBe('edge')
  })

  it('picks about 1 in 20 emergents, the same ones every time', () => {
    const N = 40000
    let hits = 0
    for (let i = 0; i < N; i++) if (isEmergent(i % 211, (i * 7) % 197, i % 220)) hits++
    expect(hits / N).toBeGreaterThan(0.8 / EMERGENT_ONE_IN)
    expect(hits / N).toBeLessThan(1.2 / EMERGENT_ONE_IN)
    const first = Array.from({ length: 500 }, (_, i) => isEmergent(-103, -77, i))
    expect(Array.from({ length: 500 }, (_, i) => isEmergent(-103, -77, i))).toEqual(first)
    expect(first.some(Boolean)).toBe(true)
  })
})

describe('forestCanopy switch', () => {
  it('defaults to current, honors relief only in DEV, and needs the long forest', () => {
    try {
      vi.stubEnv('DEV', true)
      expect(forestCanopyMode('')).toBe('current')
      expect(forestCanopyMode('?forestCanopy=current')).toBe('current')
      expect(forestCanopyMode('?forestCanopy=relief')).toBe('relief')
      expect(forestCanopyMode('?forestCanopy=relief&forestDistance=off')).toBe('current')
      vi.stubEnv('DEV', false)
      expect(forestCanopyMode('?forestCanopy=relief')).toBe('current')
    } finally { vi.unstubAllEnvs() }
  })
})

describe('stand roles on the real Leyte field', () => {
  const tacloban = loadAirfield('tacloban'), dulag = loadAirfield('dulag')
  const level = finestFetchedLevelFor(GROUND_TRUTH_TIER), header = loadTerrainHeader()
  const field = createTerrainField(header, level, loadTerrainLevel(level, header))
  // Forest west of x0, open land east of it, across the middle of an inland cell.
  const X0 = -41000
  const cover: CoverLookup = { fractionsAt: x => ({ tree: x < X0 ? 1 : 0, crop: x < X0 ? 0 : 1, mangrove: 0, open: 0 }) }
  const cells: [number, number][] = [[-103, -77], [-103, -76], [-103, -78], [-104, -77]]

  it('only adds a role: same trees, same places, nothing dropped (D5, exclusions unchanged)', () => {
    for (const [cx, cz] of cells) {
      const plain = treeSites(field, cx, cz, [tacloban, dulag], cover)
      const roles = treeSites(field, cx, cz, [tacloban, dulag], cover, [], undefined, true)
      expect(roles.map(({ role: _role, ...t }) => t)).toEqual(plain)
      expect(roles.every(t => t.role !== undefined)).toBe(true)
    }
  })

  it('puts the interior at least a band from the open land and marks the band edge', () => {
    let edge = 0, interior = 0, emergent = 0
    for (const [cx, cz] of cells) for (const t of treeSites(field, cx, cz, [tacloban, dulag], cover, [], undefined, true)) {
      if (t.role === 'edge') { edge++; continue }
      expect(t.x, `${t.role} at ${t.x}`).toBeLessThan(X0 - EDGE_BAND_M * Math.SQRT1_2 + 1e-6)
      if (t.role === 'emergent') emergent++; else interior++
    }
    expect(edge).toBeGreaterThan(0)
    expect(interior).toBeGreaterThan(50)
    expect(emergent / (interior + emergent)).toBeGreaterThan(0.02)
    expect(emergent / (interior + emergent)).toBeLessThan(0.09)
    // Every tree within the band of the boundary is an edge tree.
    for (const [cx, cz] of cells) for (const t of treeSites(field, cx, cz, [tacloban, dulag], cover, [], undefined, true)) {
      if (t.x > X0 - EDGE_BAND_M) expect(t.role).toBe('edge')
    }
  })

  it('keeps emergents taller and drops the interior from the distant layers only', () => {
    const [cx, cz] = cells[0]!
    const all = treeSites(field, cx, cz, [tacloban, dulag], cover, [], undefined, true)
    const kept = standEdgeSites(field, cx, cz, [tacloban, dulag], cover, [])
    expect(kept.length).toBe(all.filter(t => t.role !== 'interior').length)
    expect(kept.length).toBeLessThan(all.length)
    const emergent = all.find(t => t.role === 'emergent')!
    expect(kept.find(t => t.x === emergent.x && t.z === emergent.z)!.height).toBeGreaterThan(emergent.height)
  })

  it('leaves the near trees untouched and thins the far layers', () => {
    const fill = (mode: 'current' | 'relief') => {
      const forest = createVegetation(field, [tacloban, dulag], [], 'soft', true, true, mode)
      forest.setCover(cover)
      for (let i = 0; i < 4000; i++) {
        forest.update(-41300, -30666, 100)
        const s = forest.stats()
        if (s.distant.pending === 0 && s.coarse.pending === 0) break
      }
      return forest.stats()
    }
    const current = fill('current'), relief = fill('relief')
    expect(relief.canopyMode).toBe('relief')
    expect(current.canopyMode).toBe('current')
    expect(relief.instances).toBe(current.instances)
    expect(current.instances).toBeGreaterThan(0)
    expect(relief.distant.instances).toBeGreaterThan(0)
    expect(relief.distant.instances).toBeLessThan(current.distant.instances * 0.6)
    expect(relief.coarse.instances).toBeLessThan(current.coarse.instances * 0.6)
  })
})
