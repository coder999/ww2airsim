// tests/tools/models/blenderDuplicates.test.ts
// A Blender duplicate of a downloaded airframe (docs/blender-aircraft.md) is shown in the Hangar beside the
// download and may replace it. It earns the swap by fitting the spec the download flies on, unchanged: the
// same stance, the guns inside the hull, the eye under the canopy, and a wing the stores hang on. Each row
// pairs a spec with its duplicate (`station`: the semi-span fraction centerPoint.test.ts cuts that spec's wing at, where not 0.3); "Promoting a duplicate" in that document is what follows a pass.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { modelIO } from '../../../tools/models/document.js'
import { worldPositions } from '../../../tools/models/rig.js'
import { fitStores, sectionAtFor, MIN_CLEARANCE_M } from '../../../tools/models/mounts.js'
import { MODEL_STANCE } from '../../../src/render/scene/stance.js'
import { drawnPoints } from './_drawnPoints.js'

/** `eye`: where the pilot's eye sits in the real cockpit, read off the three-view drawing on Wikimedia Commons (docs/blender-aircraft.md, "Measure the real airplane"). The specs' eye points were fitted to the downloads, whose canopies sit 0.1 to 1.0 m aft of and 0.2 to 0.6 m lower than the real ones; promoting a duplicate moves the spec's `view.eyePointM` here (Mark, 2026-10-11).
 *  `skin`: the duplicate's whole-airframe node (the build merges the glass into it, as the Ki-84's and the TBM's are; kit.py names it <NAME>_dark). */
const DUPLICATES: readonly {
  spec: string
  model: string
  skin: string
  station?: number
  eye: readonly [number, number]
  /** A transverse likeness check where the source front view makes a narrow bubble visibly wrong. */
  canopyRoof?: { x: number; minY: number; halfWidth: readonly [number, number] }
}[] = [
  { spec: 'a6m2-zero', model: 'a6m2-zero-blender', skin: 'a6m2b_dark', eye: [-0.88, 0.70] },
  { spec: 'd3a-val', model: 'd3a-val-blender', skin: 'd3a2_dark', eye: [-1.75, 1.03] },
  { spec: 'ki-43-oscar', model: 'ki-43-oscar-blender', skin: 'ki43b_dark', eye: [-0.75, 0.65] },
  {
    spec: 'f6f-hellcat', model: 'f6f-hellcat-blender', skin: 'f6f_dark', eye: [-0.87, 1.17],
    // ESTIMATE checked against the Commons drawing's front view and NACA EL-2000-00243, 2026-10-11.
    canopyRoof: { x: -0.88, minY: 1.45, halfWidth: [0.30, 0.37] },
  },
  { spec: 'f4u-corsair', model: 'f4u-corsair-blender', skin: 'f4u_dark', station: 0.4, eye: [-1.63, 1.02] },
  { spec: 'f4f-wildcat', model: 'f4f-wildcat-blender', skin: 'f4f_blueGray', eye: [-0.82, 0.95] },
  { spec: 'b-17-flying-fortress', model: 'b-17-flying-fortress-blender', skin: 'b17b_dark', eye: [4.65, 1.66] },
]
const TOLERANCE_M = 0.05

it('the A6M2 outer aft fuselage keeps the drawing-measured depth and width six meters aft of the spinner', async () => {
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/a6m2-zero-blender.glb')))
  const skin = doc.getRoot().listNodes().find((n) => n.getName() === 'a6m2b_dark')
  expect(skin, 'no A6M2 whole-skin node').toBeDefined()
  const x = 2.22 - 6.0 // drawing-measured wing quarter-chord origin is 2.22 m aft of the spinner
  const section = worldPositions(skin!).filter(([px]) => Math.abs(px - x) <= 0.03)
  expect(section.length, 'no vertices at the authored 6.0 m aft station').toBeGreaterThan(20)
  // Wikimedia Commons "Mitsubishi A6M Zero drawing.svg", re-read 2026-10-11: the visible outer belly is
  // -0.49 m from the thrust line and the half-width is 0.35 m here. The former table accidentally followed
  // internal lines at +0.25 m / 0.18 m. Tolerances cover pixel rounding and the loft's finite ring sampling.
  expect(Math.min(...section.map((p) => p[1])), 'aft belly relative to the thrust line').toBeLessThanOrEqual(-0.40)
  expect(Math.max(...section.map((p) => Math.abs(p[2]))), 'aft half-width').toBeGreaterThanOrEqual(0.32)
})

describe.each(DUPLICATES)('$model fits the spec of $spec', ({ spec: specId, model, skin, station = 0.3, eye, canopyRoof }) => {
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

  it('the wing quarter-chord sits at the origin (the sim body frame stands on it)', async () => {
    const sec = (await sectionAtFor(model))(station * spec.geometry.wingSpanM / 2)
    const qc = sec.leadingX - 0.25 * (sec.leadingX - sec.trailingX)
    expect(Math.abs(qc), `quarter-chord at x ${qc.toFixed(3)} m`).toBeLessThanOrEqual(0.15)
  })

  it('every gun position is inside the airframe, propeller excluded', async () => {
    const pts = await drawnPoints(model, /Prop/)
    const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]!))), max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]!)))
    for (const g of spec.combat!.guns) g.position.forEach((v, i) => {
      expect(v, `gun ${JSON.stringify(g.position)} axis ${i}`).toBeGreaterThanOrEqual(min[i]!)
      expect(v, `gun ${JSON.stringify(g.position)} axis ${i}`).toBeLessThanOrEqual(max[i]!)
    })
  })

  it('the proposed eye is 0.15 to 0.45 m below the crown over it', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(`content/aircraft/${model}.glb`)))
    const pts = doc.getRoot().listNodes().filter((n) => n.getName() === skin).flatMap((n) => worldPositions(n))
    expect(pts.length, `no node ${skin}`).toBeGreaterThan(0)
    const [ex, ey] = eye
    expect(ex).toBeGreaterThanOrEqual(Math.min(...pts.map((p) => p[0]!)))
    expect(ex).toBeLessThanOrEqual(Math.max(...pts.map((p) => p[0]!)))
    const top = Math.max(...pts.filter((p) => Math.abs(p[0]! - ex) <= 0.2).map((p) => p[1]!))
    expect(top - ey, `eye ${(top - ey).toFixed(2)} m below the crown ${top.toFixed(2)}`).toBeGreaterThanOrEqual(0.15)
    expect(top - ey, `eye ${(top - ey).toFixed(2)} m below the crown ${top.toFixed(2)}`).toBeLessThanOrEqual(0.45)
  })

  it('keeps a source-checked canopy roof broad instead of pinching into a bubble', async () => {
    if (canopyRoof === undefined) return
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(`content/aircraft/${model}.glb`)))
    const pts = doc.getRoot().listNodes().filter((n) => n.getName() === skin).flatMap((n) => worldPositions(n))
      .filter((p) => Math.abs(p[0]! - canopyRoof.x) <= 0.04 && p[1]! >= canopyRoof.minY)
    expect(pts.length, `${model}: no canopy roof points at x ${canopyRoof.x}`).toBeGreaterThan(0)
    const halfWidth = Math.max(...pts.map((p) => Math.abs(p[2]!)))
    expect(halfWidth, `${model}: canopy roof half-width`).toBeGreaterThanOrEqual(canopyRoof.halfWidth[0])
    expect(halfWidth, `${model}: canopy roof half-width`).toBeLessThanOrEqual(canopyRoof.halfWidth[1])
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
