import { BufferAttribute, BufferGeometry, BoxGeometry, Group, type Material } from 'three'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import type { Airfield } from '../../sim/world/airfields.js'
import { createRng } from '../../sim/rng.js'
import { inAirfieldClearing } from './airfield.js'
import { batched, makeCollector, weathered } from './buildings.js'
import type { HutFootprint } from './towns.js'

/**
 * Invented villages (L3 Phase 2, docs/superpowers/plans/2026-10-09-l3-land-quality.md).
 *
 * `content/scenery/villages.json` holds only seeds (centre, radius, density),
 * written by `tools/drape/gen.py` with `GEN_V2=1` next to the ground texture
 * that tints the bare-earth yard under each one. The layout is derived here,
 * deterministically, so the committed data stays 56 rows rather than 8,000
 * houses (Plan 13d moved a road filter to build time for the same reason:
 * Vite inlines JSON imports into the bundle).
 *
 * Plausible, not accurate: nothing here claims a real house stood there. The
 * huts are gabled nipa-style dwellings (woven walls, thatch, the odd tin roof)
 * rather than `towns.ts`'s barrel-roof Quonset huts, which are military.
 */
export type Village = { readonly x: number; readonly z: number; readonly radius: number; readonly density: number }

/** A placed hut. `angle` rotates it about +y; the footprint handed to tree
 *  exclusion is the square that bounds it at any angle. */
export type VillageHut = {
  readonly x: number; readonly z: number; readonly angle: number
  readonly width: number; readonly length: number; readonly tin: boolean
}

const SEED_BASE = 1945
const STREET_SPACING_M = [55, 80] as const
const HUT_STEP_M = [15, 26] as const
const STREET_OFFSET_M = 10.5
const MAX_SLOPE = 0.23 // rise over run, about 13 degrees
const CELL_M = 2000
const TIN_FRACTION = 0.15

const range = (rng: () => number, [lo, hi]: readonly [number, number]): number => lo + rng() * (hi - lo)

function slopeAt(field: TerrainField, x: number, z: number): number {
  const d = 5
  const dx = heightAt(field, x + d, z) - heightAt(field, x - d, z)
  const dz = heightAt(field, x, z + d) - heightAt(field, x, z - d)
  return Math.hypot(dx, dz) / (2 * d)
}

/** Pure placement, no Three.js: every hut every village would draw, on
 *  gentle land and outside every airfield clearing. */
export function villageHuts(
  field: TerrainField,
  villages: readonly Village[],
  airfields: readonly Airfield[],
): readonly VillageHut[] {
  const huts: VillageHut[] = []
  villages.forEach((v, index) => {
    const rng = createRng(SEED_BASE + index)
    const ang = rng() * Math.PI
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const nMain = 2 + Math.floor(3 * v.density)
    const spacing = range(rng, STREET_SPACING_M)
    // Streets in the village frame: parallel mains plus a few cross streets.
    const streets: [number, number, number, number][] = []
    for (let k = 0; k < nMain; k++) {
      const off = k - (nMain - 1) / 2
      const len = v.radius * 1.5 * (1 - 0.18 * Math.abs(off))
      streets.push([-len, off * spacing, len, off * spacing])
    }
    for (let k = 0; k < 1 + Math.floor(2 * v.density); k++) {
      const u = (k - 0.5) * v.radius * 0.7
      const len = spacing * (nMain - 1) / 2 + 40
      streets.push([u, -len, u, len])
    }
    for (const [u0, v0, u1, v1] of streets) {
      const length = Math.hypot(u1 - u0, v1 - v0)
      const tu = (u1 - u0) / length, tv = (v1 - v0) / length
      for (let t = range(rng, HUT_STEP_M); t < length; t += range(rng, HUT_STEP_M)) {
        for (const side of [-1, 1]) {
          const pu = u0 + tu * t - tv * side * STREET_OFFSET_M
          const pv = v0 + tv * t + tu * side * STREET_OFFSET_M
          const r = Math.hypot(pu, pv)
          // Always draw the same number of values per candidate so one
          // rejected hut does not reshuffle every hut after it.
          const keep = rng() <= v.density * Math.exp(-1.4 * (r / v.radius) ** 2)
          const jitter = (rng() - 0.5) * 0.12
          const width = 4 + rng() * 2
          const length2 = 5 + rng() * 3
          const tin = rng() < TIN_FRACTION
          if (!keep) continue
          const x = v.x + ca * pu - sa * pv
          const z = v.z + sa * pu + ca * pv
          if (heightAt(field, x, z) <= 1.5) continue
          if (slopeAt(field, x, z) > MAX_SLOPE) continue
          if (inAirfieldClearing(airfields, x, z)) continue
          huts.push({ x, z, angle: ang + Math.atan2(tv, tu) + jitter, width, length: length2, tin })
        }
      }
    }
  })
  return huts
}

/** Tree-exclusion footprints: the axis-aligned square bounding each hut at any
 *  rotation (`nearTownHut` does not rotate rectangles). Slightly generous. */
export function villageFootprints(huts: readonly VillageHut[]): readonly HutFootprint[] {
  return huts.map(h => {
    const side = Math.hypot(h.width, h.length) + 1
    return { x: h.x, z: h.z, width: side, length: side }
  })
}

/** A gabled roof: ridge along local z, eaves overhanging the walls. Flat
 *  shaded and non-indexed, one batch per material. */
function gableRoof(width: number, length: number, wallH: number, ridgeH: number): BufferGeometry {
  const ov = 0.5
  const w = width / 2 + ov, l = length / 2 + ov
  const e = wallH - 0.25, r = wallH + ridgeH
  const P = (x: number, y: number, z: number): number[] => [x, y, z]
  const tris = [
    // left slope
    P(-w, e, -l), P(-w, e, l), P(0, r, l), P(-w, e, -l), P(0, r, l), P(0, r, -l),
    // right slope
    P(w, e, l), P(w, e, -l), P(0, r, -l), P(w, e, l), P(0, r, -l), P(0, r, l),
    // gables
    P(-w + ov, e, -l + ov), P(0, r, -l + ov), P(w - ov, e, -l + ov),
    P(w - ov, e, l - ov), P(0, r, l - ov), P(-w + ov, e, l - ov),
  ]
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(tris.flat()), 3))
  g.computeVertexNormals()
  return g
}

export type VillagesHandle = { readonly object: Group; readonly footprints: readonly HutFootprint[]; readonly count: number }

export function createVillages(
  field: TerrainField,
  villages: readonly Village[],
  airfields: readonly Airfield[],
): VillagesHandle {
  const wall = weathered(0x8c7a52, 0xa8966a) // woven bamboo
  const thatch = weathered(0x6e5e34, 0x8f7e50)
  const tin = weathered(0x6a6e6a, 0x8f8d85)
  const huts = villageHuts(field, villages, airfields)
  // One collector per 2 km cell, so frustum culling can drop whole cells
  // (a single merged mesh over 14 km would never be culled).
  const cells = new Map<string, ReturnType<typeof makeCollector>>()
  for (const h of huts) {
    const key = `${Math.floor(h.x / CELL_M)},${Math.floor(h.z / CELL_M)}`
    let c = cells.get(key)
    if (!c) cells.set(key, c = makeCollector())
    const y = Math.max(...[-1, 1].flatMap(sx => [-1, 1].map(sz => {
      const lx = sx * h.width / 2, lz = sz * h.length / 2
      return heightAt(field, h.x + lx * Math.cos(h.angle) + lz * Math.sin(h.angle), h.z - lx * Math.sin(h.angle) + lz * Math.cos(h.angle))
    })))
    const wallH = 2.2
    const body = new BoxGeometry(h.width, wallH + 0.8, h.length).translate(0, (wallH + 0.8) / 2 - 0.8, 0)
    const roof = gableRoof(h.width, h.length, wallH, 1.4 + h.width * 0.15)
    for (const g of [body, roof]) g.rotateY(-h.angle).translate(h.x, y, h.z)
    c.add(body, wall as Material)
    c.add(roof, (h.tin ? tin : thatch) as Material)
  }
  const object = new Group()
  object.name = 'invented villages'
  for (const c of cells.values()) object.add(batched(new Group(), c.batches))
  return { object, footprints: villageFootprints(huts), count: huts.length }
}
