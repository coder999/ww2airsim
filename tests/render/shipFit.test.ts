// tests/render/shipFit.test.ts
import { describe, expect, it } from 'vitest'
import {
  applyFit, bounds, deckExtent, deckFit, deckGrid, dominantUpPlane, fitProblems, hullFit, islandOf, narrowEndRatio,
  percentile, residualProblems, sectionBeam, skirtOutline, skirtWall, SKIRT_BOTTOM_M, surfaceBelow, trapLaneHalfWidth,
  triangleNormal, waterlineBeam, type FitOptions, type ShipFit, type TriangleSoup,
} from '../../src/render/scene/shipFit.js'
import { boxSoup, CARRIER, carrierBoxes, ESCORT, escortPrism } from './shipFixtures.js'

/** `m` with `fit` applied, as a new soup. */
function fitted(m: TriangleSoup, fit: ShipFit): TriangleSoup {
  const positions = new Float32Array(m.positions)
  applyFit(positions, null, fit)
  return { positions, indices: m.indices }
}

const CARRIER_OPTS: FitOptions = { fit: 'deck', kind: 'full-hull', bow: 'island-starboard', keelM: 0 }
const ESCORT_OPTS: FitOptions = { fit: 'hull', kind: 'full-hull', bow: 'narrow-end', keelM: -4 }

describe('measures', () => {
  it('percentile is nearest-rank and refuses nothing', () => {
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1)
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
    expect(percentile([5, 1, 3, 2, 4], 100)).toBe(5)
    expect(() => percentile([], 50)).toThrow(/nothing/)
  })

  it('the escort prism is wound outward, so its caps and walls face away from its center', () => {
    const m = escortPrism()
    for (let t = 0; t < m.indices.length / 3; t++) {
      const n = triangleNormal(m, t)
      expect(n.nx * n.cx + n.ny * (n.cy - 1) + n.nz * n.cz, `triangle ${t}`).toBeGreaterThan(0)
    }
  })

  it('sectionBeam reads the exact width where a plane cuts the hull, however sparse its vertices', () => {
    const m = escortPrism()
    expect(sectionBeam(m, 0.1).width).toBeCloseTo(11, 6)
    // In the bow taper (x 30..57.4 narrows 11 -> 2): at x 57.4 the section is 2 m wide.
    expect(sectionBeam(m, 0.1, 57, 57.4).width).toBeCloseTo(2 + (9 * 0.4) / 27.4, 3)
    expect(waterlineBeam(m)).toBeCloseTo(11, 6)
    expect(() => waterlineBeam(boxSoup([[[0, 1, 0], [1, 2, 1]]]))).toThrow(/waterline origin is wrong/)
  })

  it('dominantUpPlane finds the flight deck, and deckExtent its visible length, center and width', () => {
    const m = carrierBoxes()
    expect(dominantUpPlane(m, 3, 40, 0.1)).toBeCloseTo(16, 6)
    const d = deckExtent(m, 16)
    expect(d.length).toBeCloseTo(256, 6)
    expect(d.centerX).toBeCloseTo(0, 6)
    expect(d.medianWidth).toBeCloseTo(30, 2)
  })

  it('narrowEndRatio reads a fine bow as < 0.9 and the same hull reversed as > 1', () => {
    expect(narrowEndRatio(escortPrism())).toBeLessThan(0.9)
    expect(narrowEndRatio(escortPrism({ bowAt: -1 }))).toBeGreaterThan(1)
  })

  it('islandOf is to starboard for the fixture and to port when mirrored', () => {
    expect(islandOf(carrierBoxes(), 16).meanZ).toBeGreaterThan(0)
    expect(islandOf(carrierBoxes({ islandZ: [-15, -12] }), 16).meanZ).toBeLessThan(0)
  })

  it('surfaceBelow finds the first surface at or under a height, not the topmost', () => {
    const m = boxSoup([[[-1, 0, -1], [1, 1, 1]], [[-1, 10, -1], [1, 11, 1]]])
    expect(surfaceBelow(m, 0, 0, 5)).toBeCloseTo(1, 6)
    expect(surfaceBelow(m, 0, 0, 20)).toBeCloseTo(11, 6)
    expect(surfaceBelow(m, 5, 5, 20)).toBeNull()
  })
})

describe('deckFit and hullFit', () => {
  it('deckFit maps the fixture onto the Essex rectangle: deck length, height, beams and center', () => {
    const fit = deckFit(carrierBoxes(), CARRIER)
    expect(fit.rx).toBeCloseTo(262.7 / 256, 6)
    expect(fit.ry).toBeCloseTo(17 / 16, 6)
    expect(fit.kWaterline).toBeCloseTo(28.3 / (26 * fit.rx), 6)
    expect(fit.kDeck).toBeCloseTo(32.9 / (30 * fit.rx), 3)
    expect(fit.shiftX).toBeCloseTo(0, 6)
    expect(residualProblems(fit, CARRIER_OPTS)).toEqual([])
  })

  it('hullFit keeps length and height and scales the beam to beamM at the waterline', () => {
    const fit = hullFit(escortPrism(), ESCORT)
    expect(fit).toMatchObject({ shiftX: 0, rx: 1, ry: 1 })
    expect(fit.kWaterline).toBeCloseTo(12 / 11, 6)
    expect(fit.kDeck).toBe(fit.kWaterline)
  })

  it('applyFit keeps every normal perpendicular to its warped triangle, through the lateral ramp', () => {
    const fit: ShipFit = { shiftX: 2, rx: 1.02, ry: 0.95, kWaterline: 1.05, kDeck: 1.22, deckY: 17 }
    // A tilted triangle inside the ramp (0 < y' < 17), well off the centerline.
    const p = new Float32Array([10, 4, 6, 12, 9, 9, 11, 6, 13])
    const ux = p[3]! - p[0]!, uy = p[4]! - p[1]!, uz = p[5]! - p[2]!, vx = p[6]! - p[0]!, vy = p[7]! - p[1]!, vz = p[8]! - p[2]!
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    const len = Math.hypot(n[0]!, n[1]!, n[2]!)
    n = n.map((v) => v / len)
    const normals = new Float32Array([...n, ...n, ...n])
    applyFit(p, normals, fit)
    // Each vertex's normal against the warped surface's local tangents: finite differences of the map.
    for (let v = 0; v < 3; v++) {
      const at = (dx: number, dy: number, dz: number): number[] => {
        const q = new Float32Array([
          [10, 12, 11][v]! + dx, [4, 9, 6][v]! + dy, [6, 9, 13][v]! + dz,
        ])
        applyFit(q, null, fit)
        return Array.from(q)
      }
      const base = at(0, 0, 0), e = 1e-2
      for (const [dx, dy, dz] of [[ux, uy, uz], [vx, vy, vz]]) {
        const moved = at(dx! * e, dy! * e, dz! * e)
        const t = moved.map((c, k) => c - base[k]!)
        const dot = t[0]! * normals[3 * v]! + t[1]! * normals[3 * v + 1]! + t[2]! * normals[3 * v + 2]!
        expect(Math.abs(dot) / Math.hypot(t[0]!, t[1]!, t[2]!)).toBeLessThan(1e-3)
      }
      expect(Math.hypot(normals[3 * v]!, normals[3 * v + 1]!, normals[3 * v + 2]!)).toBeCloseTo(1, 5)
    }
  })
})

describe('fitProblems: a pass, and a failure for every tolerance (spec §4.4)', () => {
  const carrierFit = (m: TriangleSoup): TriangleSoup => fitted(m, deckFit(m, CARRIER))

  it('the fitted carrier fixture passes, and reports its grid', () => {
    const { problems, measures } = fitProblems(carrierFit(carrierBoxes()), CARRIER, CARRIER_OPTS)
    expect(problems).toEqual([])
    expect(measures.grid!.cells).toBe(131 * 16)
    expect(measures.grid!.innerOnDeck).toBe(1)
    expect(measures.deckPlaneM).toBeCloseTo(17, 4)
    expect(measures.trapLaneHalfWidthM).toBeCloseTo(0.45 * 32.9, 6)
  })

  it('the fitted escort fixture passes', () => {
    const m = escortPrism()
    expect(fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, ESCORT_OPTS).problems).toEqual([])
  })

  const cases: [string, () => string[], RegExp][] = [
    ['a mirrored carrier', () => fitProblems(carrierFit(carrierBoxes({ islandZ: [-15, -12] })), CARRIER, CARRIER_OPTS).problems, /island mean z .* not to starboard/],
    ['a kDeck over the cap', () => residualProblems({ ...deckFit(carrierBoxes(), CARRIER), kDeck: 1.3 }, CARRIER_OPTS), /kDeck 1\.3000 outside 0\.85\.\.1\.25/],
    ['a deck too low for sy/sx', () => residualProblems(deckFit(carrierBoxes({ deckTop: 12 }), CARRIER), CARRIER_OPTS), /sy\/sx 1\.3\d+ outside/],
    ['a hull far longer than its deck', () => fitProblems(carrierFit(carrierBoxes({ hullX: 140 })), CARRIER, CARRIER_OPTS).problems, /overall length .* limit ±3%/],
    ['a fitting on the deck outside the island', () => fitProblems(carrierFit(carrierBoxes({ extra: [[[60, 16, -2], [62, 17, 2]]] })), CARRIER, CARRIER_OPTS).problems, /fitting stands 1\.\d+ m above/],
    ['an obstruction on the centerline in the trap zone', () => fitProblems(carrierFit(carrierBoxes({ extra: [[[-60, 16, -1], [-58, 20, 1]]] })), CARRIER, CARRIER_OPTS).problems, /centerline or trap-lane cells are not on the deck/],
    ['a hole in the deck edge amidships', () => fitProblems(carrierFit(boxSoup([[[-130, 0, -13], [130, 15, 13]], [[-128, 15, -15], [20, 16, 15]], [[40, 15, -15], [128, 16, 15]], [[20, 15, -11], [40, 16, 11]], [[0, 16, 12], [15, 40, 15]]])), CARRIER, CARRIER_OPTS).problems, /below-deck cells outside the tapered corners/],
    ['a moved deck (Plan 8 raises it to 18 m)', () => fitProblems(carrierFit(carrierBoxes()), { ...CARRIER, deckHeightM: 18, flightDeck: { ...CARRIER.flightDeck!, heightM: 18 } }, CARRIER_OPTS).problems, /deck plane at 17\.000 m vs flightDeck\.heightM 18/],
    ['a reversed escort', () => { const m = escortPrism({ bowAt: -1 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, ESCORT_OPTS).problems }, /narrow-end ratio .* bow is not at \+x/],
    ['a pinned ratio that no longer matches', () => { const m = escortPrism({ bowAt: -1 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, { ...ESCORT_OPTS, bow: { pinnedNarrowEnd: 0.2, evidence: 'test' } }).problems }, /pinned at 0\.2 ± 0\.03 \(test\): the model was reversed/],
    ['a main deck 4 m off', () => { const m = escortPrism({ deck: 10 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, ESCORT_OPTS).problems }, /main deck at 10\.00 m vs deckHeightM 6/],
    ['a moved waterline (keel 1 m deeper)', () => { const m = escortPrism({ keel: -5 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, ESCORT_OPTS).problems }, /keel at y -5\.000, pinned at -4/],
    ['a hull the wrong length', () => { const m = escortPrism(); return fitProblems(m, { ...ESCORT, lengthM: 120 }, ESCORT_OPTS).problems }, /hull length 114\.80 m vs lengthM 120/],
    ['a lateral k out of range', () => residualProblems(hullFit(escortPrism(), { ...ESCORT, beamM: 16 }), ESCORT_OPTS), /kWaterline 1\.45\d+ outside/],
    ['a waterline model with no skirt', () => { const m = escortPrism({ keel: 0 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, { ...ESCORT_OPTS, kind: 'waterline' }).problems }, /skirt bottom at y 0\.000, expected -3/],
  ]
  for (const [name, run, pattern] of cases) {
    it(`fails ${name}, naming the quantity`, () => {
      expect(run().join('; ')).toMatch(pattern)
    })
  }
})

describe('deckGrid, trapLaneHalfWidth', () => {
  it('narrows the trap lane to 1 m inboard of anything in the trap span, and counts centerline cells', () => {
    const fit = deckFit(carrierBoxes(), CARRIER)
    const obstructed = fitted(carrierBoxes({ extra: [[[-60, 16, 9], [-58, 20, 12]]] }), fit)
    expect(trapLaneHalfWidth(obstructed, CARRIER)).toBeLessThan(9 * fit.rx * fit.kDeck - 1 + 0.5)
    const island = islandOf(obstructed, 17)
    const g = deckGrid(obstructed, CARRIER, trapLaneHalfWidth(obstructed, CARRIER), island)
    expect(g.laneMisses).toBe(0)
  })
})

describe('the skirt (spec §4.5)', () => {
  it('outlines the base as a convex hull and walls it from 0 to -3, every face outward', () => {
    const m = boxSoup([[[-10, 0, -2], [10, 5, 2]], [[-4, 5, -1], [4, 8, 1]]])
    const outline = skirtOutline(m)
    expect(outline).toHaveLength(4)
    const wall = skirtWall(outline, 0, SKIRT_BOTTOM_M)
    const soup = { positions: wall.positions, indices: wall.indices }
    expect(wall.indices.length / 3).toBe(8)
    expect(bounds(soup).min[1]).toBe(-3)
    for (let t = 0; t < 8; t++) {
      const n = triangleNormal(soup, t)
      expect(n.nx * n.cx + n.nz * n.cz, `face ${t} faces outward`).toBeGreaterThan(0)
      const v = wall.indices[3 * t]!
      expect(n.nx * wall.normals[3 * v]! + n.nz * wall.normals[3 * v + 2]!, `face ${t} normal agrees with its winding`).toBeGreaterThan(0.99)
    }
  })
})
