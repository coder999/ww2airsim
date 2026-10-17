import { describe, it, expect } from 'vitest'
import { Group } from 'three'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { parseAirfield, airfieldAt, insideRunway, type Airfield } from '../../src/sim/world/airfields.js'
import { friendlyBaseAt, friendlySites, isFriendlyAirfield } from '../../src/sim/friendly.js'
import { checkScenarioSides } from '../../src/sim/sidesCheck.js'
import { createCoverField } from '../../src/sim/world/cover.js'
import { createRunway } from '../../src/render/scene/runway.js'
import { createAirfield, inAirfieldClearing } from '../../src/render/scene/airfield.js'
import { flatField } from './mission/fixture.js'

/**
 * F8C C1 (2026-10-17): a port, a beach or an anchorage is a site without a strip. It is an `Airfield` record with `noStrip: true`
 * so buildings, hit boxes, clutter, lights, vehicles and `serviceable` all keep working, but nothing lands on it: no recovery
 * field, no steering target, no landing objective, no AI home, no strip mesh, no huts, no tree clearing along a runway.
 */
const port = (extra: Record<string, unknown> = {}): Airfield => parseAirfield({
  id: 'port', name: 'Port', runway: { center: { x: -29666, z: -47605 }, headingDeg: 0, lengthM: 2, widthM: 2 },
  apron: null, clearing: null, side: 'allied', serviceable: true, noStrip: true,
  buildings: [{ id: 'port-pier', kind: 'pier-and-warehouses', x: 0, z: 40, widthM: 20, lengthM: 60, hp: 100, model: true }],
  reference: { source: 'test' }, ...extra,
})
const base = () => worldFromScenario(loadScenarioBundle('convoy-strike'), null)
const withPort = (a: Airfield) => { const w = base(); return { ...w, airfields: [...w.airfields, a] } }

describe('noStrip: the record', () => {
  it('parses, is optional, and no shipped base carries it', () => {
    expect(port().noStrip).toBe(true)
    for (const id of ['tacloban', 'dulag', 'bayug']) expect(loadScenarioBundle('convoy-strike').airfields[id]?.noStrip).toBeUndefined()
    expect(() => port({ noStrip: 'yes' })).toThrow(/noStrip/)
  })
  it('nothing lands on it: airfieldAt and insideRunway are blind to its frame', () => {
    const p = port()
    expect(insideRunway(p, p.runway.center.x, p.runway.center.z)).toBe(false)
    expect(airfieldAt([p], p.runway.center.x, p.runway.center.z)).toBeNull()
    const strip = { ...p, noStrip: undefined } as Airfield
    expect(airfieldAt([strip], p.runway.center.x, p.runway.center.z)).toBe(strip) // the same record with a strip is found: the flag is what blinds it
  })
})

describe('noStrip: never a recovery site', () => {
  it('allied, serviceable and held by the player: still not a friendly airfield, a friendly base or a steering target', () => {
    const w = withPort(port())
    const p = w.airfields.at(-1)!
    expect(w.player).toBeDefined()
    expect(isFriendlyAirfield(w, p)).toBe(false)
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'port' } as never, p.runway.center)).toBeNull()
    expect(friendlySites(w).map((s) => s.id)).not.toContain('port')
    expect(friendlySites(w).map((s) => s.id)).toContain('tacloban') // the real fields are unchanged
  })
  it('a land objective at it does not load, and a strip with no flag does', () => {
    const input = (noStrip: boolean) => ({
      scenarioId: 's', player: 'p', aircraft: [{ id: 'p', parkedOnShip: null, ingressShip: null }], ships: [],
      airfields: [{ id: 'port', side: 'allied' as const, serviceable: true, noStrip }], landAt: [{ objective: 'home', at: 'port' }],
    })
    expect(() => checkScenarioSides(input(true))).toThrow(/no strip/)
    expect(() => checkScenarioSides(input(false))).not.toThrow()
  })
})

describe('noStrip: the renderer draws no strip and no huts', () => {
  it('createRunway returns an empty group for it and a mesh for a strip', () => {
    const field = flatField(0)
    const none = createRunway(field, port())
    expect(none).toBeInstanceOf(Group)
    expect(none.children).toHaveLength(0)
    const strip = createRunway(field, { ...port(), noStrip: undefined, runway: { center: { x: 0, z: 0 }, headingDeg: 0, lengthM: 100, widthM: 20 } } as Airfield)
    expect((strip as { isMesh?: boolean }).isMesh).toBe(true)
  })
  it('createAirfield draws no decorative huts when it has no clutter and no strip', () => {
    const meshes = (a: Airfield): number => { let n = 0; createAirfield(flatField(0), a).object.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) n++ }); return n }
    const withStrip = { ...port(), noStrip: undefined } as Airfield
    expect(meshes(port())).toBeLessThan(meshes(withStrip))
  })
  it('the 130 m x runway-length tree clearing is not applied to a frame that is not a strip', () => {
    const p = port()
    expect(inAirfieldClearing([p], p.runway.center.x + 30, p.runway.center.z + 100)).toBe(false)
    expect(inAirfieldClearing([{ ...p, noStrip: undefined, runway: { ...p.runway, lengthM: 1500 } } as Airfield], p.runway.center.x + 30, p.runway.center.z + 100)).toBe(true)
  })
  it('the cover field keeps no firm rectangle for its frame, only for its apron', () => {
    const header = { centreLatDeg: 11, centreLonDeg: 125, halfExtentM: 100000, samples: 1025, channels: ['tree', 'crop', 'mangrove', 'open'] as ['tree', 'crop', 'mangrove', 'open'], encoding: 'rgba8-sixteenths' as const }
    const data = new Uint8Array(1025 * 1025 * 4)
    const apron = { x: 0, z: 100, widthM: 50, lengthM: 50 }
    expect(createCoverField(header, data, [port({ apron })]).firm).toHaveLength(1)
    expect(createCoverField(header, data, [{ ...port({ apron }), noStrip: undefined } as Airfield]).firm).toHaveLength(2)
  })
})
