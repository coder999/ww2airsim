// tests/tools/models/blenderDuplicates.test.ts
// A Blender duplicate of a downloaded airframe (docs/blender-aircraft.md) is shown in the Hangar beside the
// download and may replace it. It earns the swap by fitting the spec the download flies on, unchanged: the
// same stance, the guns inside the hull, the eye under the canopy, and a wing the stores hang on. Each row
// pairs a spec with its duplicate; "Promoting a duplicate" in that document is what follows a pass.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions } from '../../../tools/models/rig.js'
import { fitStores, sectionAtFor, MIN_CLEARANCE_M } from '../../../tools/models/mounts.js'
import { MODEL_STANCE } from '../../../src/render/scene/stance.js'
import { drawnPoints } from './_drawnPoints.js'

/** `skin`: the duplicate's whole-airframe node (the build merges the glass into it, as the Ki-84's and the TBM's are; kit.py names it <NAME>_dark). */
const DUPLICATES: readonly { spec: string; model: string; skin: string }[] = [
  { spec: 'f6f-hellcat', model: 'f6f-hellcat-blender', skin: 'f6f_dark' },
]
const TOLERANCE_M = 0.05

describe.each(DUPLICATES)('$model fits the spec of $spec', ({ spec: specId, model, skin }) => {
  const spec = loadAircraftSpec(specId)

  it('mains on gear.heightM at the stance x, tail on the ground at the stance pitch', async () => {
    const stance = MODEL_STANCE[spec.view.model]!
    const pts = await drawnPoints(model)
    const xs = pts.map((p) => p[0])
    const [lo, hi] = [Math.min(...xs), Math.max(...xs)]
    const main = pts.filter((p) => p[0] > lo + 0.25 * (hi - lo)).reduce((a, p) => (p[1] < a[1] ? p : a))
    expect(Math.abs(main[1] + spec.gear.heightM), `mains ${(-main[1]).toFixed(3)} m below the origin, gear.heightM ${spec.gear.heightM}`).toBeLessThanOrEqual(TOLERANCE_M)
    expect(Math.abs(main[0] - stance.mainWheelXM), `mains at x ${main[0].toFixed(3)}`).toBeLessThanOrEqual(TOLERANCE_M)
    const [c, s] = [Math.cos(stance.tailDownPitchRad), Math.sin(stance.tailDownPitchRad)]
    const lowestAft = pts.filter((p) => p[0] < main[0] - 1).map(([x, y]) => main[1] + (x - main[0]) * s + (y - main[1]) * c).reduce((a, b) => Math.min(a, b))
    expect(Math.abs(lowestAft - main[1]), `tail ${(lowestAft - main[1]).toFixed(3)} m off the ground`).toBeLessThanOrEqual(TOLERANCE_M)
  })

  it('every gun position is inside the airframe, propeller excluded', async () => {
    const pts = await drawnPoints(model, /Prop/)
    const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]!))), max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]!)))
    for (const g of spec.combat!.guns) g.position.forEach((v, i) => {
      expect(v, `gun ${JSON.stringify(g.position)} axis ${i}`).toBeGreaterThanOrEqual(min[i]!)
      expect(v, `gun ${JSON.stringify(g.position)} axis ${i}`).toBeLessThanOrEqual(max[i]!)
    })
  })

  it('the eye is 0.15 to 0.45 m below the crown over it', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(`content/aircraft/${model}.glb`)))
    const pts = doc.getRoot().listNodes().filter((n) => n.getName() === skin).flatMap((n) => worldPositions(n))
    expect(pts.length, `no node ${skin}`).toBeGreaterThan(0)
    const [ex, ey] = spec.view.eyePointM
    expect(ex).toBeGreaterThanOrEqual(Math.min(...pts.map((p) => p[0]!)))
    expect(ex).toBeLessThanOrEqual(Math.max(...pts.map((p) => p[0]!)))
        const top = Math.max(...pts.filter((p) => Math.abs(p[0]! - ex) <= 0.2).map((p) => p[1]!))
    expect(top - ey, `eye ${(top - ey).toFixed(2)} m below the crown ${top.toFixed(2)}`).toBeGreaterThanOrEqual(0.15)
    expect(top - ey, `eye ${(top - ey).toFixed(2)} m below the crown ${top.toFixed(2)}`).toBeLessThanOrEqual(0.45)
  })

  it('every rack and rail hangs on the wing inside the chord, clear of the skin (offsets are re-measured on promotion)', async () => {
    if (spec.stores === undefined) return
    const fits = fitStores(await sectionAtFor(model), spec.stores)
    for (const [m, f] of [...spec.stores.racks.map((m, i) => [m, fits.racks[i]!] as const), ...spec.stores.rails.map((m, i) => [m, fits.rails[i]!] as const)]) {
      expect(m.offset[2], `${m.id} lateral station is a wing station`).toBeDefined()
      expect(f.clearanceM, `${m.id} clearance`).toBeGreaterThanOrEqual(MIN_CLEARANCE_M - 0.001)
      expect(f.offset[0], `${m.id} lug point inside the chord`).toBeGreaterThan(f.trailingX)
      expect(f.offset[0], `${m.id} lug point inside the chord`).toBeLessThan(f.leadingX)
    }
  })
})
