// tests/tools/models/vehicleModels.test.ts
/**
 * Every vehicle model (R5) measured against its cited size, its budget and its frame, from the
 * committed glb with no Blender. The two are Sketchfab downloads fitted by the model pipeline;
 * the sim has no vehicle, so the citation, not a spec, is authoritative (model-roster spec §7).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { getBounds } from '@gltf-transform/functions'
import type { Document } from '@gltf-transform/core'
import { loadModelEntries, type ModelEntry } from '../../../tools/models/manifest.js'
import { findNode, meshNodes, modelIO, onlyScene } from '../../../tools/models/document.js'
import { measureDocument } from '../../../tools/models/measure.js'
import { worldTriangles } from './buildingGeometry.js'

/** Spec §4.4, plus ruling V1's draw calls. Raised only with a measured reason, here and in the ledger. */
const VEHICLE_BUDGET = { maxBytes: 1_000_000, maxTriangles: 20_000, maxDrawCalls: 8 } as const

interface Cited { readonly lengthM: number; readonly lengthTol: number; readonly widthM: number; readonly widthTol: number; readonly heightM: number; readonly heightTol: number; readonly source: string }
/** Rulings V2, V4 and V6: tolerances are per cited row and preserve the authoritative fit axis. */
const CITED: Readonly<Record<string, Cited>> = {
  'type97-chi-ha': { lengthM: 5.5, lengthTol: 0.01, widthM: 2.33, widthTol: 0.06, heightM: 2.21, heightTol: 0.08, source: "English Wikipedia 'Type 97 Chi-Ha medium tank', infobox (Tomczyk 2007, p. 19): length 5.50 m, width 2.33 m, height 2.21 m, read 2026-09-27. The download measures +7.5% tall at the cited length, all of it in the turret node's top (R5 plan, V2)" },
  'willys-mb-jeep': { lengthM: 3.35, lengthTol: 0.04, widthM: 1.57, widthTol: 0.07, heightM: 1.32, heightTol: 0.08, source: "English Wikipedia 'Willys MB', infobox: length 132 in (3.35 m), width 62 in (1.57 m), height reducible to 52 in (1.32 m, top down); the article's 80 in (2.032 m) wheelbase is the fit (R5 plan, V4), read 2026-09-27. At that exact wheelbase fit the source model measures 1.670 m wide (+6.4%), so its measured row uses 7% (V6)" },
}

/** H3's turret names (Hangar spec §9); a vehicle's are numbered like a building's, +x to -x (R4 ruling). */
const TURRETS: Readonly<Record<string, readonly string[]>> = { 'type97-chi-ha': ['Turret1'] }

/** Each vehicle's own proof that its nose is at +x; a model turned 180° fails it. */
const FORWARD: Readonly<Record<string, (doc: Document) => { ok: boolean; detail: string }>> = {
  // The 57 mm gun (Gun1 since V1 split it from Turret1) reaches forward of the turret ring, near the bow.
  // A centroid-distance heuristic is invalid here: the offset turret makes its rear corner a few
  // centimeters farther from the vertex centroid than the muzzle even while the gun faces +x.
  'type97-chi-ha': (doc) => {
    const b = getBounds(findNode(doc, 'Gun1'))
    return { ok: b.min[0] > 0.5, detail: `Gun1 x ${b.min[0].toFixed(3)}..${b.max[0].toFixed(3)}` }
  },
  // The spare tire rides on the rear panel, higher than any road wheel: the highest Tires vertex is aft.
  'willys-mb-jeep': (doc) => {
    const tires = meshNodes(doc).filter((n) => n.getMesh()!.listPrimitives().some((p) => p.getMaterial()?.getName() === 'Tires'))
    const top = tires.flatMap((n) => worldTriangles(n).flat()).reduce((m, v) => (v[1] > m[1] ? v : m))
    return { ok: top[0] < 0, detail: `highest tire vertex at x ${top[0].toFixed(3)}, y ${top[1].toFixed(3)}` }
  },
}

const entries = loadModelEntries()
const vehicles = entries.filter((e) => e.output.startsWith('content/vehicles/'))
const read = async (e: ModelEntry): Promise<Document> => modelIO().readBinary(new Uint8Array(readFileSync(e.output)))

describe('the vehicle rows', () => {
  it('every vehicle entry has a cited row and a forward proof, and every row has an entry', () => {
    expect(vehicles.map((e) => e.id).sort()).toEqual(Object.keys(CITED).sort())
    expect(Object.keys(FORWARD).sort()).toEqual(Object.keys(CITED).sort())
  })
  it('every row cites a source with a read date', () => {
    for (const [id, c] of Object.entries(CITED)) expect(c.source, id).toMatch(/read \d{4}-\d{2}-\d{2}/)
  })
})

describe.each(vehicles.map((e) => [e.id, e] as const))('vehicle %s (R5)', (id, e) => {
  it('measures its cited length and height (its row) and width (6%), nose along x', async () => {
    const c = CITED[id]!
    const b = getBounds(onlyScene(await read(e)))
    const check = (got: number, want: number, tol: number, label: string): void => {
      expect(Math.abs(got - want) / want, `${id} ${label}: measured ${got.toFixed(3)} m, cited ${want}`).toBeLessThanOrEqual(tol)
    }
    check(b.max[0] - b.min[0], c.lengthM, c.lengthTol, 'length')
    check(b.max[2] - b.min[2], c.widthM, c.widthTol, 'width')
    check(b.max[1] - b.min[1], c.heightM, c.heightTol, 'height')
  })

  it('stands on y = 0, centered on its footprint (V3)', async () => {
    const b = getBounds(onlyScene(await read(e)))
    expect(b.min[1], `${id} ground`).toBeCloseTo(0, 2)
    expect(Math.abs(b.min[0] + b.max[0]) / 2, `${id} center x`).toBeLessThanOrEqual(0.05 * (b.max[0] - b.min[0]))
    expect(Math.abs(b.min[2] + b.max[2]) / 2, `${id} center z`).toBeLessThanOrEqual(0.05 * (b.max[2] - b.min[2]))
  })

  it('faces +x', async () => {
    const r = FORWARD[id]!(await read(e))
    expect(r.ok, `${id}: ${r.detail}`).toBe(true)
  })

  it('is inside the vehicle budget, measured, and its entry does not budget above it', async () => {
    const m = measureDocument(await read(e))
    expect(e.budget.maxBytes, id).toBeLessThanOrEqual(VEHICLE_BUDGET.maxBytes)
    expect(e.budget.maxTriangles, id).toBeLessThanOrEqual(VEHICLE_BUDGET.maxTriangles)
    expect(e.budget.maxDrawCalls, id).toBeLessThanOrEqual(VEHICLE_BUDGET.maxDrawCalls)
    expect(statSync(e.output).size).toBeLessThanOrEqual(e.budget.maxBytes)
    expect(m.triangles).toBeLessThanOrEqual(e.budget.maxTriangles)
    expect(m.drawCalls).toBeLessThanOrEqual(e.budget.maxDrawCalls)
  })

  it('names exactly its turrets', async () => {
    const names = meshNodes(await read(e)).map((n) => n.getName()).filter((n) => /^Turret\d+$/.test(n))
    expect(names.sort()).toEqual([...(TURRETS[id] ?? [])].sort())
  })
})
