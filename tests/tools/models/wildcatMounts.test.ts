// tests/tools/models/wildcatMounts.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { Group } from 'three'
import { modelIO, findNode } from '../../../tools/models/document.js'
import { datumPitchFor, fitStores, sectionAtFor, MIN_CLEARANCE_M, WILDCAT_GLB_PATH } from '../../../tools/models/mounts.js'
import { WILDCAT_DATUM_PITCH_RAD, WILDCAT_SCALE, WILDCAT_TO_SIM_ROTATION_Y, wildcatToSimMatrix } from '../../../src/render/scene/wildcat.js'
import { WILDCAT_MODEL_PATH } from '../../../src/render/content.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

// Every stores-carrying spec, measured on the wing of the model it DRAWS (sortie forms A4 gave
// the Hellcat its own R3 model, so it no longer shares the Wildcat's mounts).
const withStores = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))
  .filter((s) => s.stores !== undefined)
const sections = new Map(await Promise.all([...new Set(withStores.map((s) => s.view.model))].map(async (m) => [m, await sectionAtFor(m)] as const)))

describe('the Wildcat mounts (O1, spec §2.3 and §7)', () => {
  it('mounts.ts slices the same glb the game draws (its own path constant, because content.ts cannot load under tsx)', () => {
    expect(WILDCAT_GLB_PATH).toBe(WILDCAT_MODEL_PATH)
  })

  it('the datum pitch constant is the glb\'s own Avion rotation', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(WILDCAT_MODEL_PATH)))
    const [qx, , , qw] = findNode(doc, 'Avion').getRotation()
    expect(WILDCAT_DATUM_PITCH_RAD).toBeCloseTo(2 * Math.atan2(-qx!, qw!), 12)
  })

  it('the slicing transform is rotation Y and uniform scale from the frame constants, with no translation (the loaded airframe\'s own correction group is checked against it in tests/render/wildcat.test.ts)', () => {
    const g = new Group()
    g.rotation.y = WILDCAT_TO_SIM_ROTATION_Y
    g.scale.setScalar(WILDCAT_SCALE)
    g.updateMatrix()
    wildcatToSimMatrix().forEach((v, i) => expect(v).toBeCloseTo(g.matrix.elements[i]!, 12))
  })

  it('covers both stores-carrying specs, each on the model it draws (A4: the Hellcat on its own)', () => {
    expect(withStores.map((s) => [s.id, s.view.model]).sort()).toEqual([['f4f-wildcat', 'wildcat'], ['f6f-hellcat', 'f6f-hellcat']])
  })

  it('an R3 model is sliced in its own frame, level: pitch 0; the Wildcat keeps its datum pitch', async () => {
    expect(datumPitchFor('f6f-hellcat')).toBe(0)
    expect(datumPitchFor('wildcat')).toBe(WILDCAT_DATUM_PITCH_RAD)
    await expect(sectionAtFor('no-such-model')).rejects.toThrow(/no-such-model/)
  })

  it.each(withStores.map((s) => [s.id, s] as const))('%s: every offset is where `npm run models:mounts` hangs it on its own model, inside the chord, clear of the skin', (_id, spec) => {
    const fits = fitStores(sections.get(spec.view.model)!, spec.stores!, datumPitchFor(spec.view.model))
    const all = [...spec.stores!.racks.map((m, i) => [m, fits.racks[i]!] as const), ...spec.stores!.rails.map((m, i) => [m, fits.rails[i]!] as const)]
    for (const [m, f] of all) {
      m.offset.forEach((v, k) => expect(Math.abs(v - f.offset[k]!), `${m.id}[${k}]: content ${v}, measured ${f.offset[k]} (re-run npm run models:mounts)`).toBeLessThanOrEqual(0.002))
      expect(m.offset[0], `${m.id} lug point inside the chord`).toBeGreaterThan(f.trailingX)
      expect(m.offset[0], `${m.id} lug point inside the chord`).toBeLessThan(f.leadingX)
      expect(f.clearanceM, `${m.id} clearance`).toBeGreaterThanOrEqual(MIN_CLEARANCE_M - 0.001)
    }
  })
})

