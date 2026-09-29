import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { parseLibraryEntry } from '../../../src/render/hangar/library.js'
import { eligibleLoadouts, needsDevStores } from '../../../src/sim/sortie.js'
import { aircraftRowLabel, flyableAircraft, ordnanceNames, storesLine } from '../../../src/render/sortie/flyable.js'

const library = readdirSync('content/library').map((f) => parseLibraryEntry(JSON.parse(readFileSync(`content/library/${f}`, 'utf8'))))
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.slice(0, -5)))
const flyable = flyableAircraft(specs, library)
const byId = (id: string) => flyable.find((f) => f.spec.id === id)!
const names = ordnanceNames(library)

describe('the flyable catalog (sortie spec, Form 3)', () => {
  it('lists the allied aircraft by name, then the Japanese (the Val, the Zero, the G4M, the Ki-21, the Ki-43, the Ki-84)', () => {
    expect(flyable.map((f) => f.spec.id)).toEqual(['b-17-flying-fortress', 'b-29-superfortress', 'f4f-wildcat', 'f6f-hellcat', 'p-38-lightning', 'f4u-corsair', 'd3a-val', 'a6m2-zero', 'g4m-betty', 'ki-21-sally', 'ki-43-oscar', 'ki-84-frank'])
  })
  it.each(specs.map((s) => s.id))('%s: its Library card has the blurb, history and sources Forms 3 and 4 and the Hangar show', (id) => {
    const card = library.find((e) => e.spec === id)!
    expect(card.blurb.length).toBeGreaterThan(40)
    expect(card.history?.length ?? 0).toBeGreaterThan(200)
    expect(card.sources?.length ?? 0).toBeGreaterThan(0)
    const f = byId(id)
    expect(f.figures.length).toBeGreaterThan(3)
    const loadouts = eligibleLoadouts(f.spec, true)
    for (const l of loadouts) expect(storesLine(f.spec, l, names)).not.toMatch(/undefined|\[object/)
    if (f.spec.stores !== undefined) expect(loadouts.every((l) => l === 'clean' || needsDevStores(f.spec, l) === false)).toBe(true)
  })
  it('refuses a spec with no Library entry, by name', () => {
    expect(() => flyableAircraft(specs, library.filter((e) => e.spec !== 'a6m2-zero'))).toThrow('flyable a6m2-zero: no Library entry has spec "a6m2-zero"')
  })
  it('carries the Library blurb and the Hangar figures', () => {
    expect(byId('f6f-hellcat').blurb).toMatch(/\S/)
    expect(byId('f6f-hellcat').figures.map((f) => f.label)).toContain('Top speed')
  })
  it('labels an enemy aircraft with its side only when Dev shows it', () => {
    expect(aircraftRowLabel(byId('a6m2-zero'), true)).toMatch(/ \(Japanese\)$/)
    expect(aircraftRowLabel(byId('a6m2-zero'), false)).not.toMatch(/\(/)
    expect(aircraftRowLabel(byId('f6f-hellcat'), true)).toBe(byId('f6f-hellcat').label)
  })
  it('says exactly what hangs, naming each store by its Library entry', () => {
    const hellcat = byId('f6f-hellcat').spec
    expect(storesLine(hellcat, 'clean', names)).toBe('Guns only: no bombs or rockets')
    expect(storesLine(hellcat, 'both', names)).toBe('2 × AN-M65 1,000 lb general-purpose bomb, 6 × 5-inch High Velocity Aircraft Rocket (HVAR)')
    expect(storesLine(hellcat, 'rockets', names)).toBe('6 × 5-inch High Velocity Aircraft Rocket (HVAR)')
    expect(storesLine({ ...byId('a6m2-zero').spec, stores: undefined }, 'bombs', names)).toBe('Guns only: no bombs or rockets')
  })
  it('falls back to the store id for a store with no Library entry', () => {
    expect(storesLine(byId('f6f-hellcat').spec, 'bombs', {})).toBe('2 × an-m65')
  })
})
