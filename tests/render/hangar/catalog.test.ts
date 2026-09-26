// tests/render/hangar/catalog.test.ts
import { describe, expect, it } from 'vitest'
import { buildCatalog, filterCatalog } from '../../../src/render/hangar/catalog.js'
import { nodeHangarContent } from './content.js'

const content = nodeHangarContent()
const catalog = buildCatalog(content)

describe('buildCatalog', () => {
  it('covers every library entry, aircraft then ships then buildings, in-service first within a kind', () => {
    expect(catalog.map((e) => e.library.id).sort()).toEqual(content.library.map((e) => e.id).sort())
    const kinds = catalog.map((e) => e.library.kind)
    expect(kinds.indexOf('ship')).toBeGreaterThan(kinds.lastIndexOf('aircraft'))
    expect(kinds.indexOf('building')).toBeGreaterThan(kinds.lastIndexOf('ship'))
    const aircraft = catalog.filter((e) => e.library.kind === 'aircraft')
    const firstOut = aircraft.findIndex((e) => e.subject === null)
    expect(aircraft.slice(firstOut).every((e) => e.subject === null)).toBe(true)
  })

  it('resolves a building kind to every placement across content/bases', () => {
    const hangar = catalog.find((e) => e.library.spec === 'hangar')!.subject
    expect(hangar?.kind).toBe('building')
    if (hangar?.kind !== 'building') return
    const expected = content.airfields.flatMap((a) => a.buildings.filter((b) => b.kind === 'hangar')).length
    expect(hangar.placements).toHaveLength(expected)
  })

  it('an entry naming a spec that does not exist throws, naming both', () => {
    const bad = { ...content, library: [{ ...content.library[0]!, id: 'ghost', kind: 'ship' as const, spec: 'no-such-ship' }] }
    expect(() => buildCatalog(bad)).toThrow(/ghost.*no-such-ship/)
  })

  it('filters by kind and side', () => {
    const jp = filterCatalog(catalog, { kind: 'ship', side: 'japanese' })
    expect(jp.length).toBeGreaterThan(0)
    expect(jp.every((e) => e.library.kind === 'ship' && e.library.side === 'japanese')).toBe(true)
    expect(filterCatalog(catalog, { kind: 'all', side: 'all' })).toHaveLength(catalog.length)
  })
})
