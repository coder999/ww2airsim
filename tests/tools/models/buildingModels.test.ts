// tests/tools/models/buildingModels.test.ts
/**
 * R4's buildings, measured from their committed glbs against their own scripts' literal figures
 * (model-roster spec §7), with no Blender: this runs on ryzen too. The byte-identical rebuild is
 * blenderEntries.test.ts's, run on nexus by name.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { getBounds } from '@gltf-transform/functions'
import type { Document } from '@gltf-transform/core'
import { loadModelEntries, type ModelEntry } from '../../../tools/models/manifest.js'
import { findNode, meshNodes, modelIO, onlyScene } from '../../../tools/models/document.js'
import { measureDocument } from '../../../tools/models/measure.js'
import { coplanarOverlaps, scriptConstant, worldTriangles } from './buildingGeometry.js'
import { AIRFIELD_HUTS } from '../../../src/render/scene/airfield.js'
import { STATIC_MODELS } from '../../../src/render/scene/staticModels.js'
import { nodeHangarContent } from '../../render/hangar/content.js'

/** Spec §4.4. An entry may budget above it only with a measured reason, here and in the ledger. */
const BUILDING_BUDGET = { maxBytes: 500_000, maxTriangles: 5000, maxDrawCalls: 4 } as const
// DP3: ids already skinned (three atlas textures); Task 7 deletes this when all nine are.
const SKINNED = new Set<string>(['revetment', 'ammunition-bunker', 'aaa', 'coastal-gun-battery'])
const RAISED: Readonly<Record<string, string>> = {}

/** Every building R4 authored. Each task appends its own. */
const R4_BUILDINGS: readonly string[] = ['tower', 'aaa', 'coastal-gun-battery', 'fuel-tank-farm', 'ammunition-bunker', 'revetment', 'barracks-and-huts', 'pier-and-warehouses', 'radio-radar-station']

/** H3's turret names (Hangar spec §9). A building's are numbered +x to -x, then -z to +z (R4 ruling). */
const TURRETS: Readonly<Record<string, readonly string[]>> = {
  aaa: ['Turret1'],
  'coastal-gun-battery': ['Turret1', 'Turret2'],
}

/** Footprints the sim owns: the script's figure must be content/bases/tacloban.json's plus its pad. */
const SIM_FOOTPRINTS: Readonly<Record<string, { readonly building: string; readonly padM: number }>> = {
  tower: { building: 'tacloban-tower', padM: 1 },
  aaa: { building: 'tacloban-aaa-1', padM: 0 },
}

const entries = loadModelEntries()
const entryOf = (id: string): ModelEntry => {
  const e = entries.find((x) => x.id === id)
  if (e === undefined) throw new Error(`no tools/models/entries/${id}.json`)
  return e
}
const scriptOf = (id: string): string => {
  const s = entryOf(id).source
  if (s.kind !== 'blender') throw new Error(`${id} is not a blender entry`)
  return readFileSync(s.script, 'utf8')
}
const read = async (id: string): Promise<Document> => modelIO().readBinary(new Uint8Array(readFileSync(entryOf(id).output)))
const tacloban = JSON.parse(readFileSync('content/bases/tacloban.json', 'utf8')) as { buildings: { id: string; widthM: number; lengthM: number }[] }

describe.each(R4_BUILDINGS.map((id) => [id]))('building %s (R4)', (id) => {
  it("its committed output measures its script's footprint (1%), base, and height (2%)", async () => {
    const src = scriptOf(id)
    const bb = getBounds(onlyScene(await read(id)))
    const within = (got: number, want: number, tol: number, label: string): void => {
      expect(Math.abs(got - want) / want, `${id} ${label}: measured ${got.toFixed(3)}, script ${want}`).toBeLessThanOrEqual(tol)
    }
    within(bb.max[0] - bb.min[0], scriptConstant(src, 'FOOTPRINT_X_M'), 0.01, 'footprint x')
    within(bb.max[2] - bb.min[2], scriptConstant(src, 'FOOTPRINT_Z_M'), 0.01, 'footprint z')
    within(bb.max[1], scriptConstant(src, 'HEIGHT_M'), 0.02, 'height')
    expect(bb.min[1], `${id} base`).toBeCloseTo(scriptConstant(src, 'BASE_Y_M'), 3)
  })

  it('is inside the building budget, measured (spec §4.4), and its entry does not budget above it', async () => {
    const doc = await read(id)
    const m = measureDocument(doc)
    const e = entryOf(id)
    if (RAISED[id] === undefined) {
      expect(e.budget.maxBytes, id).toBeLessThanOrEqual(BUILDING_BUDGET.maxBytes)
      expect(e.budget.maxTriangles, id).toBeLessThanOrEqual(BUILDING_BUDGET.maxTriangles)
      expect(e.budget.maxDrawCalls, id).toBeLessThanOrEqual(BUILDING_BUDGET.maxDrawCalls)
    }
    expect(statSync(e.output).size).toBeLessThanOrEqual(e.budget.maxBytes)
    expect(m.triangles).toBeLessThanOrEqual(e.budget.maxTriangles)
    expect(m.drawCalls).toBeLessThanOrEqual(e.budget.maxDrawCalls)
    expect(m.textures, `${id} textures`).toBe(SKINNED.has(id) ? 3 : 0)
  })

  it("names exactly its turrets, H3's way, numbered +x to -x then -z to +z", async () => {
    const doc = await read(id)
    const want = TURRETS[id] ?? []
    expect(meshNodes(doc).map((n) => n.getName()).filter((n) => /^Turret\d+$/.test(n)).sort()).toEqual([...want].sort())
    const at = want.map((n) => { const bb = getBounds(findNode(doc, n)); return { n, x: (bb.min[0] + bb.max[0]) / 2, z: (bb.min[2] + bb.max[2]) / 2 } })
    const ordered = [...at].sort((a, b) => (Math.abs(a.x - b.x) > 1e-3 ? b.x - a.x : a.z - b.z)).map((t) => t.n)
    expect(ordered).toEqual(want)
  })

  it('no two differently painted faces z-fight', async () => {
    const doc = await read(id)
    const tris = meshNodes(doc).flatMap((n) => {
      const label = n.getMesh()!.listPrimitives()[0]!.getMaterial()?.getName() ?? n.getName()
      return worldTriangles(n).map((tri) => ({ label, where: n.getName(), tri }))
    })
    expect(coplanarOverlaps(tris)).toEqual([])
  })

  it("uses none of R2's inward-wound parts (cylinder, tapered_box, turret)", () => {
    expect(scriptOf(id)).not.toMatch(/\.(cylinder|tapered_box|turret)\(/)
  })
})

describe("footprints the sim owns (content/bases, the sim is authoritative)", () => {
  it.each(Object.entries(SIM_FOOTPRINTS))("%s: the script's footprint is the placement's plus its pad", (id, { building, padM }) => {
    const b = tacloban.buildings.find((x) => x.id === building)
    expect(b, building).toBeDefined()
    const src = scriptOf(id)
    expect(scriptConstant(src, 'FOOTPRINT_X_M')).toBe(b!.widthM + padM)
    expect(scriptConstant(src, 'FOOTPRINT_Z_M')).toBe(b!.lengthM + padM)
  })

  it("barracks-and-huts: the barracks is the game's own decorative hut, AIRFIELD_HUTS (the scenery is authoritative)", () => {
    const [hut] = AIRFIELD_HUTS
    expect(AIRFIELD_HUTS.every((h) => h.width === hut.width && h.length === hut.length)).toBe(true)
    const src = scriptOf('barracks-and-huts')
    expect(scriptConstant(src, 'BARRACKS_WIDTH_M')).toBe(hut.width)
    expect(scriptConstant(src, 'BARRACKS_LENGTH_M')).toBe(hut.length)
  })
})

describe('the building roster is complete (R4)', () => {
  const library = nodeHangarContent().library.filter((e) => e.kind === 'building')
  it('every Library building names its own building model, and every registered building model is one', () => {
    for (const e of library) expect(e.model, e.id).toEqual({ kind: 'building', id: e.id })
    expect(Object.keys(STATIC_MODELS.building).sort()).toEqual(library.map((e) => e.id).sort())
  })
  it('R4 measured all of them but the hangar, which R1 measures', () => {
    expect([...R4_BUILDINGS].sort()).toEqual(library.map((e) => e.id).filter((id) => id !== 'hangar').sort())
  })
})
