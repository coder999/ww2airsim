// tests/tools/models/skin/downloadDetail.test.ts
/** M1d: a download's detail rows expand into bake.py's details and layers.ts's markings, both sides alike. */
import { describe, expect, it } from 'vitest'
import { DownloadDetailSchema, downloadDetails, downloadMarkings } from '../../../../tools/models/skin/downloadDetail.js'

const d = DownloadDetailSchema.parse({
  sideZM: 10, strakesM: 1.5, grimeM: [-0.5, 0.6],
  planks: [{ role: 'deck', widthM: 0.15, lengthM: 6, contrast: 0.1, seam: 0.3, belowM: 8 }],
  portholes: [{ xM: [-10, 10], yM: 4, everyM: 5 }],
  hatches: [{ xM: [-6, 6], yM: 9, everyM: 6, zM: [-2, 2] }],
})

describe('download detail (M1d)', () => {
  it('lays each porthole row on both sides, centered, cast inboard from sideZM', () => {
    const ports = downloadDetails(d).filter((x) => x.kind === 'porthole')
    expect(ports.map((p) => p.origin)).toEqual([-10, -5, 0, 5, 10].flatMap((x) => [[x, 4, 10]]).concat([-10, -5, 0, 5, 10].map((x) => [x, 4, -10])))
    expect(ports.every((p) => p.axis[2] === Math.sign(p.origin[2]!) && p.reach === 10)).toBe(true)
  })

  it('lays hatches at each z, cast down', () => {
    const h = downloadDetails(d).filter((x) => x.kind === 'hatch')
    expect(h.map((x) => x.origin)).toEqual([[-6, 9, -2], [0, 9, -2], [6, 9, -2], [-6, 9, 2], [0, 9, 2], [6, 9, 2]])
    expect(h.every((x) => x.axis.join() === '0,1,0')).toBe(true)
  })

  it('paints strakes, grime, planks below their height, and rust under every third porthole a side', () => {
    const m = downloadMarkings(d)
    expect(m.filter((x) => x.kind === 'grid')).toHaveLength(1)
    expect(m.filter((x) => x.kind === 'slab')).toHaveLength(1)
    expect(m.find((x) => x.kind === 'planks')).toMatchObject({ tags: ['ship:deck'], belowM: 8 })
    expect(m.filter((x) => x.kind === 'polygon')).toHaveLength(4) // portholes 2 and 5 of five, each side
  })

  it('paints camouflage first, sides mirrored onto hull and island, deck patches seen from above (M1e)', () => {
    const m = downloadMarkings(DownloadDetailSchema.parse({ sideZM: 10, camo: [
      { on: 'sides', color: 'ijnCamoGreen', points: [[0, 1], [20, 1], [10, 8]] },
      { on: 'flightDeck', color: 'ijnCamoDark', points: [[0, -5], [10, -5], [10, 5]] },
    ], strakesM: 1.5 }))
    const camo = m.filter((x) => x.kind === 'polygon')
    expect(m.indexOf(camo.at(-1)!)).toBeLessThan(m.findIndex((x) => x.kind === 'grid'))
    const sides = camo.filter((x) => x.color === 'ijnCamoGreen')
    expect(sides.map((x) => [x.tags[0], x.kind === 'polygon' && x.origin[2]])).toEqual([['ship:hull', 10], ['ship:hull', -10], ['ship:superstructure', 10], ['ship:superstructure', -10]])
    // Port reads x mirrored, because its u axis points aft: the same patch lands at the same x on both sides.
    expect(sides.map((x) => x.kind === 'polygon' && x.points[1])).toEqual([[20, 1], [-20, 1], [20, 1], [-20, 1]])
    expect(camo.find((x) => x.color === 'ijnCamoDark')).toMatchObject({ tags: ['ship:flightDeck'], axis: [0, 1, 0], points: [[0, 5], [10, 5], [10, -5]] })
  })
})
