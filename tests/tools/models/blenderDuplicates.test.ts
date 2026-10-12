// tests/tools/models/blenderDuplicates.test.ts
// Drawing-fit locks for the seven Blender airframes promoted on 2026-10-11. The retired downloads remain
// DEV-only Hangar entries, while each row below holds the active spec to its replacement's stance, guns,
// eye and store-bearing wing (`station` is the semi-span fraction used for the quarter-chord check).
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
const PROMOTED: readonly {
  spec: string
  model: string
  skin: string
  station?: number
  eye: readonly [number, number]
  /** A transverse likeness check where the source front view makes a narrow bubble visibly wrong. */
  canopyRoof?: { x: number; minY: number; halfWidth: readonly [number, number] }
}[] = [
  { spec: 'a6m2-zero', model: 'a6m2-zero-blender', skin: 'a6m2b_dark', eye: [-0.74, 0.72] },
  { spec: 'd3a-val', model: 'd3a-val-blender', skin: 'd3a2_dark', eye: [-0.60, 0.82] },
  { spec: 'ki-43-oscar', model: 'ki-43-oscar-blender', skin: 'ki43b_dark', eye: [-0.77, 0.72] },
  {
    spec: 'f6f-hellcat', model: 'f6f-hellcat-blender', skin: 'f6f_dark', eye: [-0.87, 1.17],
    // Re-measured 2026-10-11 (f6f-hellcat-blender.py header): the Commons drawing's front view puts the hood's
    // roof edge 0.16 m out, 0.04 m under the 1.467 m crown, and its top view draws the roof panel's frame at
    // 0.19-0.22 m. The photo-guided repair's 0.32 m roof edge (minY 1.45, 0.30-0.37) was twice the drawing's.
    canopyRoof: { x: -0.88, minY: 1.40, halfWidth: [0.14, 0.23] },
  },
  { spec: 'f4u-corsair', model: 'f4u-corsair-blender', skin: 'f4u_dark', station: 0.4, eye: [-1.80, 1.05] },
  { spec: 'f4f-wildcat', model: 'f4f-wildcat-blender', skin: 'f4f_blueGray', eye: [-0.85, 0.95] },
  { spec: 'b-17-flying-fortress', model: 'b-17-flying-fortress-blender', skin: 'b17b_dark', eye: [2.40, 1.44] },
]
const TOLERANCE_M = 0.05

describe.each(PROMOTED)('$model fits the spec of $spec', ({ spec: specId, model, skin, station = 0.3, eye, canopyRoof }) => {
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

it('B-17G follows the Commons three-view: fillet-and-fin tail, rudder, body width and the top turret seat', async () => {
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/b-17-flying-fortress-blender.glb')))
  const one = (name: string) => {
    const nodes = doc.getRoot().listNodes().filter((node) => node.getName() === name)
    expect(nodes, name).toHaveLength(1)
    return nodes[0]!
  }
  const extent = (points: readonly (readonly number[])[], axis: number) =>
    Math.max(...points.map((point) => point[axis]!)) - Math.min(...points.map((point) => point[axis]!))
  const skin = worldPositions(one('b17b_dark'))
  // Kaboldy's B-17G three-view, re-read 2026-10-11 (b-17-flying-fortress-blender.py): the nose is 6.40 m
  // ahead of the wing quarter-chord origin and drawing heights sit 0.60 m below model heights.
  const X = (station: number) => 6.40 - station
  const near = (station: number, dx = 0.06) => skin.filter((p) => Math.abs(p[0]! - X(station)) <= dx)

  // The fin crown is 4.31 m (drawing) at station 19.27 m. The former trapezoid fin's crown stood 0.4 m
  // forward of that, and the triangle before it had no crown at all, its top at the trailing edge.
  const crown = skin.reduce((a, p) => (p[1]! > a[1]! ? p : a))
  expect(crown[1]!).toBeCloseTo(4.31 + 0.60, 1)
  expect(Math.abs(crown[0]! - X(19.27))).toBeLessThanOrEqual(0.30)
  // A curved leading edge, not a straight sweep: half-way up the fin (2.15 m) it is at station 17.43 m,
  // 1.3 m aft of the straight line from the fillet start (11.18 m, 0.62 m) to the crown.
  const at = (y: number) => skin.filter((p) => Math.abs(p[1]! - (y + 0.60)) <= 0.03 && p[0]! < X(11))
  expect(Math.abs(Math.max(...at(2.15).map((p) => p[0]!)) - X(17.43))).toBeLessThanOrEqual(0.12)
  // The rudder runs from the tail-gunner housing (0.52 m) to 3.90 m on a straight raked hinge.
  expect(extent(worldPositions(one('Rudder')), 1)).toBeCloseTo(3.90 - 0.52, 1)
  // The tail shell is blunt: 0.56 m tall at station 22.5 m (the former loft pinched to 0.10 m there).
  expect(extent(near(22.5), 1)).toBeGreaterThanOrEqual(0.55)
  // The body is 2.16 m wide just aft of the wing root (top view, station 11.6 m), not the former 2.9 m.
  expect(extent(near(11.6, 0.2), 2)).toBeCloseTo(2 * 1.08, 1)

  // The lowest fuselage crown beneath the 0.50 m-radius top-turret footprint, 0.04 m sunk.
  const turret = worldPositions(one('Turret4'))
  const base = Math.min(...turret.map((point) => point[1]!))
  expect(base).toBeGreaterThanOrEqual(1.55)
  expect(base).toBeLessThanOrEqual(1.62)
  expect(extent(turret, 1)).toBeCloseTo(0.52, 2)
})

it('F6F-5 follows the Commons three-view: body, hood and turtledeck, dihedral, deep tail, rudder and tailplane', async () => {
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/f6f-hellcat-blender.glb')))
  const nodes = (re: RegExp) => doc.getRoot().listNodes().filter((n) => re.test(n.getName())).flatMap((n) => worldPositions(n))
  const skin = nodes(/^f6f_dark$/)
  // Kaboldy's F6F three-view, re-read 2026-10-11 (f6f-hellcat-blender.py header): the origin is 3.04 m aft of the
  // spinner tip, heights are meters above the propeller axis.
  const X = (aft: number) => 3.04 - aft
  const centerline = (aft: number) => skin.filter((p) => Math.abs(p[0]! - X(aft)) <= 0.004 && Math.abs(p[2]!) < 0.01)
  // Drawn top and bottom lines (aft of the hood the top is the turtledeck's crown). The first pass's tail cone
  // pinched to 0.58 m deep at 10.0 m where the drawn tail is 0.95 m deep down to the rudder post.
  for (const [aft, top, bottom] of [[0.8, 0.728, -0.833], [1.5, 0.841, -0.978], [2.5, 0.966, -1.034], [5.0, 1.251, -0.986],
    [7.0, 0.777, -0.833], [8.0, 0.556, -0.728], [10.0, 0.45, -0.50]] as const) {
    const ring = centerline(aft)
    expect(ring.length, `centerline vertices ${aft} m aft of the spinner`).toBeGreaterThanOrEqual(2)
    expect(Math.max(...ring.map((p) => p[1]!)), `top ${aft} m aft`).toBeCloseTo(top, 2)
    expect(Math.min(...ring.map((p) => p[1]!)), `bottom ${aft} m aft`).toBeCloseTo(bottom, 2)
  }
  const top = (from: number, to: number) => Math.max(...skin.filter((p) => p[0]! <= X(from) && p[0]! >= X(to) && Math.abs(p[2]!) < 0.05).map((p) => p[1]!))
  // Hood roof 1.467 m over the pilot (frame bars 0.02 m proud); the first pass stood 0.07 m higher. The steep
  // windscreen has already risen to 1.35 m by 3.6 m, where the first pass was still at the 1.07 m deck.
  expect(top(3.85, 4.1)).toBeGreaterThanOrEqual(1.46)
  expect(top(3.85, 4.1)).toBeLessThanOrEqual(1.50)
  expect(top(3.5, 3.6)).toBeGreaterThanOrEqual(1.30)
  // Outer panels at 7.5 deg from a flat center section: the tip rows' chord line stands about 0.16 m above the
  // axis (front view). The first pass's 2.5 deg from a root 0.51 m down put it 0.24 m below.
  const tip = skin.filter((p) => Math.abs(p[2]!) >= 6.3)
  expect(tip.length).toBeGreaterThan(50)
  expect(tip.reduce((a, p) => a + p[1]!, 0) / tip.length).toBeGreaterThan(0.08)
  // The rudder hangs on a straight hinge at 9.655 m from its foot under the tail cone's end (-0.05 m) to +1.79 m.
  const rudder = nodes(/^Rudder$/)
  expect(Math.max(...rudder.map((p) => p[0]!))).toBeCloseTo(X(9.655), 2)
  expect(Math.min(...rudder.map((p) => p[1]!))).toBeLessThanOrEqual(0.0)
  // Fin crown 1.89 m at 9.46 m; the tailplane's rounded tips 2.89 m out (span scale).
  const fin = skin.filter((p) => p[0]! < X(8.5)).reduce((a, p) => (p[1]! > a[1]! ? p : a))
  expect(fin[1]!).toBeCloseTo(1.89, 1)
  expect(Math.abs(fin[0]! - X(9.46))).toBeLessThanOrEqual(0.10)
  const tailplane = skin.filter((p) => p[0]! < X(8.2) && Math.abs(p[1]! - 0.19) < 0.15)
  expect(Math.max(...tailplane.map((p) => Math.abs(p[2]!)))).toBeCloseTo(2.89, 1)
  expect(Math.max(...tailplane.map((p) => Math.abs(p[2]!)))).toBeLessThanOrEqual(2.92)
})

it('Ki-43-IIb follows the Commons Ki-43-I three-view: nose, square wing, tailplane, fin and rudder, canopy, mast', async () => {
  const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/ki-43-oscar-blender.glb')))
  const nodes = (re: RegExp) => doc.getRoot().listNodes().filter((n) => re.test(n.getName())).flatMap((n) => worldPositions(n))
  const skin = nodes(/^ki43b_dark$/)
  expect(skin.length, 'no ki43b_dark skin').toBeGreaterThan(1000)
  // Kaboldy-style "Nakajima Ki 43-I.svg", re-read 2026-10-11 at 300.3 px/m (ki-43-oscar-blender.py): drawing
  // stations aft of the cowl move 0.088 m aft for the IIb's longer cowl, and the wing quarter chord at 30%
  // semispan, the origin, is 2.22 m aft of the spinner tip. The first pass had 2.32 m.
  const X = (drawingStation: number) => 2.222 - (drawingStation + 0.088)
  const top = (pts: readonly (readonly number[])[]) => Math.max(...pts.map((p) => p[1]!))
  expect(Math.max(...nodes(/^Prop$/).map((p) => p[0]!)), 'spinner tip ahead of the origin').toBeCloseTo(2.222, 1)

  // A square, unswept leading edge (the taper is all in the trailing edge): 1.56 m and 1.55 m aft of the
  // spinner at 1.2 m and 3.6 m out. The first pass's trapezoid swept it 0.2 m between those stations.
  const wing = [...skin, ...nodes(/^(AileronR|Flap1R)$/)]
  const leadingAt = (z: number) => Math.max(...wing.filter((p) => Math.abs(p[2]! - z) <= 0.1 && p[1]! < 0.3).map((p) => p[0]!))
  expect(Math.abs(leadingAt(1.2) - X(1.564)), `leading edge at 1.2 m out: x ${leadingAt(1.2).toFixed(3)}`).toBeLessThanOrEqual(0.03)
  expect(Math.abs(leadingAt(3.6) - X(1.548)), `leading edge at 3.6 m out: x ${leadingAt(3.6).toFixed(3)}`).toBeLessThanOrEqual(0.03)

  // Tailplane 4.36 m across with rounded tips (the first pass: 3.45 m).
  const tail = skin.filter((p) => p[0]! < X(7.0) && Math.abs(p[1]! - 0.04) < 0.1)
  expect(Math.max(...tail.map((p) => Math.abs(p[2]!))), 'tailplane half-span').toBeCloseTo(2.18, 1)
  // Fin crown 1.38 m above the thrust line at 8.17 m; the rudder hinge is vertical at 8.20 m and the rudder
  // runs from the crown to its foot under the tail cone, 0.33 m below the thrust line.
  const crown = skin.reduce((a, p) => (p[1]! > a[1]! ? p : a))
  expect(crown[1]!, 'fin crown').toBeCloseTo(1.38, 1)
  expect(Math.abs(crown[0]! - X(8.17)), `fin crown at x ${crown[0]!.toFixed(3)}`).toBeLessThanOrEqual(0.10)
  const rudder = nodes(/^Rudder$/)
  expect(Math.min(...rudder.map((p) => p[1]!)), 'rudder foot').toBeLessThanOrEqual(-0.30)
  expect(top(rudder), 'rudder top').toBeGreaterThanOrEqual(1.33)

  // Canopy: windscreen base on the deck at 2.24 m, roof +0.90 m drawn, +0.98 m with the II's 0.08 m raise.
  const near = (station: number, dx = 0.03) => skin.filter((p) => Math.abs(p[0]! - X(station)) <= dx && Math.abs(p[2]!) <= 0.1)
  expect(Math.abs(top(near(2.80)) - 0.98), 'canopy roof').toBeLessThanOrEqual(0.025)
  expect(top(near(2.20)), 'deck ahead of the windscreen').toBeLessThanOrEqual(0.70)
  // The aft fuselage at 6.0 m: top 0.37 m, bottom -0.52 m, half-width 0.24 m.
  const section = skin.filter((p) => Math.abs(p[0]! - X(6.0)) <= 0.03)
  expect(Math.abs(top(section) - 0.369), 'aft top').toBeLessThanOrEqual(0.02)
  expect(Math.abs(Math.min(...section.map((p) => p[1]!)) + 0.519), 'aft bottom').toBeLessThanOrEqual(0.02)
  expect(Math.abs(Math.max(...section.map((p) => Math.abs(p[2]!))) - 0.236), 'aft half-width').toBeLessThanOrEqual(0.02)
  // The antenna mast stands ahead of the windscreen at 1.475 m (the first pass put it behind the canopy).
  const mast = skin.filter((p) => p[1]! > 1.1 && p[0]! > X(4.0))
  expect(mast.length, 'no mast ahead of the windscreen').toBeGreaterThan(0)
  for (const p of mast) expect(Math.abs(p[0]! - X(1.475)), 'mast station').toBeLessThanOrEqual(0.05)
})
