// tests/tools/models/wildcatMounts.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { Group } from 'three'
import { modelIO, findNode } from '../../../tools/models/document.js'
import { fitStores, wildcatSectionAt, MIN_CLEARANCE_M, WILDCAT_GLB_PATH } from '../../../tools/models/mounts.js'
import { WILDCAT_DATUM_PITCH_RAD, WILDCAT_SCALE, WILDCAT_TO_SIM_ROTATION_Y, wildcatToSimMatrix } from '../../../src/render/scene/wildcat.js'
import { WILDCAT_MODEL_PATH } from '../../../src/render/content.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const drawnAsWildcat = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))
  .filter((s) => s.view.model === 'wildcat' && s.stores !== undefined)
const sectionAt = await wildcatSectionAt()

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

  it('covers both stores-carrying specs drawn as the Wildcat, and they agree', () => {
    expect(drawnAsWildcat.map((s) => s.id).sort()).toEqual(['f4f-wildcat', 'f6f-hellcat'])
    const [a, b] = drawnAsWildcat
    expect(a!.stores!.racks.map((m) => m.offset)).toEqual(b!.stores!.racks.map((m) => m.offset))
    expect(a!.stores!.rails.map((m) => m.offset)).toEqual(b!.stores!.rails.map((m) => m.offset))
  })

  it.each(drawnAsWildcat.map((s) => [s.id, s] as const))('%s: every offset is where `npm run models:mounts` hangs it, inside the chord, clear of the skin', (_id, spec) => {
    const fits = fitStores(sectionAt, spec.stores!)
    const all = [...spec.stores!.racks.map((m, i) => [m, fits.racks[i]!] as const), ...spec.stores!.rails.map((m, i) => [m, fits.rails[i]!] as const)]
    for (const [m, f] of all) {
      m.offset.forEach((v, k) => expect(Math.abs(v - f.offset[k]!), `${m.id}[${k}]: content ${v}, measured ${f.offset[k]} (re-run npm run models:mounts)`).toBeLessThanOrEqual(0.002))
      expect(m.offset[0], `${m.id} lug point inside the chord`).toBeGreaterThan(f.trailingX)
      expect(m.offset[0], `${m.id} lug point inside the chord`).toBeLessThan(f.leadingX)
      expect(f.clearanceM, `${m.id} clearance`).toBeGreaterThanOrEqual(MIN_CLEARANCE_M - 0.001)
    }
  })
})

