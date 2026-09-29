import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { parseLibraryEntry } from '../../../src/render/hangar/library.js'
import { aircraftRowLabel, flyableAircraft, ordnanceNames, storesLine } from '../../../src/render/sortie/flyable.js'

const library = readdirSync('content/library').map((f) => parseLibraryEntry(JSON.parse(readFileSync(`content/library/${f}`, 'utf8'))))
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.slice(0, -5)))
const flyable = flyableAircraft(specs, library)
const byId = (id: string) => flyable.find((f) => f.spec.id === id)!
const names = ordnanceNames(library)

describe('the flyable catalog (sortie spec, Form 3)', () => {
  it('lists the allied aircraft by name, then the Zero', () => {
    expect(flyable.map((f) => f.spec.id)).toEqual(['b-17-flying-fortress', 'f4f-wildcat', 'f6f-hellcat', 'f4u-corsair', 'a6m2-zero'])
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
    expect(storesLine(byId('a6m2-zero').spec, 'bombs', names)).toBe('Guns only: no bombs or rockets')
  })
  it('falls back to the store id for a store with no Library entry', () => {
    expect(storesLine(byId('f6f-hellcat').spec, 'bombs', {})).toBe('2 × an-m65')
  })
})
