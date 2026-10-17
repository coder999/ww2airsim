import { describe, it, expect } from 'vitest'
import { Group } from 'three'
import { parseAirfield, type Airfield } from '../../src/sim/world/airfields.js'
import { buildStructures } from '../../src/sim/weapons/structures.js'
import { createAirfield } from '../../src/render/scene/airfield.js'
import { parseSite } from '../../src/sim/world/sites.js'
import { flatField } from './mission/fixture.js'

/**
 * F8C C2b (2026-10-17): a waterfront building (pier, seaplane ramp, pontoon pier, mooring buoy) is seated at the sea surface, not at
 * the highest corner of its footprint: the shipped terrain is coarse, so the landward corner of a pier stands 3 to 5 m above the water
 * and the whole pier would float. `seatM` is the height of the model's origin above sea level, absolute; absent keeps the old rule.
 */
const field = (seatM?: number): Airfield => parseAirfield({
  id: 'port', name: 'Port', runway: { center: { x: 0, z: 0 }, headingDeg: 0, lengthM: 2, widthM: 2 }, apron: null, clearing: null, noStrip: true,
  buildings: [{ id: 'b1', kind: 'pier-and-warehouses', x: 0, z: 0, widthM: 100, lengthM: 40, hp: 100, model: true, heightM: 11, ...(seatM === undefined ? {} : { seatM }) }],
  reference: { source: 'test' },
})

describe('seatM', () => {
  it('moves the hit box to the seat: on ground at 10 m a seated pier is centered at seat + half height, an unseated one at ground + half height', () => {
    const ground = flatField(10)
    expect(buildStructures([field()], ground)[0]!.position.y).toBeCloseTo(10 + 5.5, 6)
    expect(buildStructures([field(0)], ground)[0]!.position.y).toBeCloseTo(5.5, 6)
    expect(buildStructures([field(-0.3)], ground)[0]!.position.y).toBeCloseTo(5.2, 6)
  })

  it('moves the drawn model with it', async () => {
    const draw = async (a: Airfield): Promise<number> => {
      const h = createAirfield(flatField(10), a)
      await h.loadModels(async () => ({ root: new Group(), release() {} }))
      return h.object.getObjectByName('model:b1')!.position.y
    }
    expect(await draw(field())).toBeCloseTo(10, 6)
    expect(await draw(field(0))).toBeCloseTo(0, 6)
  })

  it('is a site-placement field and survives into the airfield record', () => {
    expect(field(0).buildings[0]!.seatM).toBe(0)
    expect(field().buildings[0]!.seatM).toBeUndefined()
    const raw = JSON.parse(JSON.stringify({ id: 's', name: 's', airfield: 's', noStrip: true,
      base: { runway: { center: { x: 0, z: 0 }, headingDeg: 0, lengthM: 2, widthM: 2 }, apron: null, clearing: null, clutterAreas: [],
        buildings: [{ id: 'b1', kind: 'jinamoc-seaplane-ramp', x: 0, z: 0, widthM: 67, lengthM: 16, hp: 50, seatM: -0.3, basis: 'invented', cite: 'test fixture' }] },
      sources: {}, reference: { source: 'x' }, windows: {} }))
    const win = { built: true, side: 'allied', serviceable: true, note: 'n' }
    raw.windows = Object.fromEntries(['pre-invasion', 'assault', 'buildup', 'endgame', 'j6-alternate'].map((w) => [w, win]))
    expect(parseSite(raw).base.buildings[0]!.seatM).toBe(-0.3)
  })
})
