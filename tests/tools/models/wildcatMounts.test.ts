// tests/tools/models/wildcatMounts.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { Group, Quaternion, Vector3 } from 'three'
import { modelIO, findNode } from '../../../tools/models/document.js'
import { fitStores, sectionAtFor, MIN_CLEARANCE_M, WILDCAT_GLB_PATH } from '../../../tools/models/mounts.js'
import { WILDCAT_DATUM_PITCH_RAD, WILDCAT_OFFSET_X_M, WILDCAT_OFFSET_Y_M, WILDCAT_SCALE, WILDCAT_TO_SIM_ROTATION_Y, wildcatToSimMatrix } from '../../../src/render/scene/wildcatFrame.js'
import { WILDCAT_MODEL_PATH } from '../../../src/render/content.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

// Every stores-carrying spec, measured on the wing of the model it DRAWS (sortie forms A4 gave
// the Hellcat its own R3 model, so it no longer shares the Wildcat's mounts).
const withStores = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))
  .filter((s) => s.stores !== undefined)
/** Racks not hung from a wing: nothing here to fit. The B-17, G4M and B-29 carry theirs inside the hull (B-17G onboarding, D7 to D9,
 *  2026-09-29; checked against the drawn hull by internalBay.test.ts); the D3A Val's one rack is on the belly centerline (D3A onboarding,
 *  checked against the drawn belly by bellyRack.test.ts). */
const INTERNAL = new Set(['b-17-flying-fortress', 'g4m-betty', 'b-29-superfortress', 'd3a-val'])
const wingMounted = withStores.filter((s) => !INTERNAL.has(s.id))
const sections = new Map(await Promise.all([...new Set(wingMounted.map((s) => s.view.model))].map(async (m) => [m, await sectionAtFor(m)] as const)))

describe('the Wildcat mounts (O1, spec §2.3 and §7)', () => {
  it('mounts.ts slices the same glb the game draws (its own path constant, because content.ts cannot load under tsx)', () => {
    expect(WILDCAT_GLB_PATH).toBe(WILDCAT_MODEL_PATH)
  })

  it('the datum pitch constant is the glb\'s own Avion rotation', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(WILDCAT_MODEL_PATH)))
    const [qx, , , qw] = findNode(doc, 'Avion').getRotation()
    expect(WILDCAT_DATUM_PITCH_RAD).toBeCloseTo(2 * Math.atan2(-qx!, qw!), 12)
  })

  it('the slicing transform is rotation Y, the datum leveled about +Z, uniform scale and the shift that centers the quarter-chord and drops the model, from the frame constants (the loaded airframe\'s own correction group is checked against it in tests/render/wildcat.test.ts)', () => {
    const g = new Group()
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), WILDCAT_TO_SIM_ROTATION_Y)
    g.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -WILDCAT_DATUM_PITCH_RAD).multiply(yaw))
    g.scale.setScalar(WILDCAT_SCALE)
    g.position.set(WILDCAT_OFFSET_X_M, WILDCAT_OFFSET_Y_M, 0)
    g.updateMatrix()
    wildcatToSimMatrix().forEach((v, i) => expect(v).toBeCloseTo(g.matrix.elements[i]!, 12))
  })

  it('covers every wing-mounted stores-carrying spec, each on the model it draws (A4: the Hellcat on its own; the Corsair and the Zero likewise; the P-38 has ten rails and two racks hanging on its own wing outboard of the booms)', () => {
    expect(wingMounted.map((s) => [s.id, s.view.model]).sort()).toEqual([['a6m2-zero', 'a6m2-zero'], ['f4f-wildcat', 'wildcat'], ['f4u-corsair', 'f4u-corsair'], ['f6f-hellcat', 'f6f-hellcat'], ['ki-43-oscar', 'ki-43-oscar'], ['ki-84-frank', 'ki-84-frank'], ['p-38-lightning', 'p-38-lightning']])
  })

  it('the only stores-carrying specs left out are the B-17, the B-29, the G4M (racks internal) and the Val (belly rack)', () => {
    expect(withStores.filter((s) => INTERNAL.has(s.id)).map((s) => s.id)).toEqual(['b-17-flying-fortress', 'b-29-superfortress', 'd3a-val', 'g4m-betty'])
  })

  it('rejects a model with no glb by name', async () => {
    await expect(sectionAtFor('no-such-model')).rejects.toThrow(/no-such-model/)
  })

  it.each(wingMounted.map((s) => [s.id, s] as const))('%s: every offset is where `npm run models:mounts` hangs it on its own model, inside the chord, clear of the skin', (_id, spec) => {
    const fits = fitStores(sections.get(spec.view.model)!, spec.stores!)
    const all = [...spec.stores!.racks.map((m, i) => [m, fits.racks[i]!] as const), ...spec.stores!.rails.map((m, i) => [m, fits.rails[i]!] as const)]
    for (const [m, f] of all) {
      m.offset.forEach((v, k) => expect(Math.abs(v - f.offset[k]!), `${m.id}[${k}]: content ${v}, measured ${f.offset[k]} (re-run npm run models:mounts)`).toBeLessThanOrEqual(0.002))
      expect(m.offset[0], `${m.id} lug point inside the chord`).toBeGreaterThan(f.trailingX)
      expect(m.offset[0], `${m.id} lug point inside the chord`).toBeLessThan(f.leadingX)
      expect(f.clearanceM, `${m.id} clearance`).toBeGreaterThanOrEqual(MIN_CLEARANCE_M - 0.001)
    }
  })
})

