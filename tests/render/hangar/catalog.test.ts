// tests/render/hangar/catalog.test.ts
import { describe, expect, it } from 'vitest'
import { availability, buildCatalog, drawable, filterCatalog, listLabel, statusNote } from '../../../src/render/hangar/catalog.js'
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

  it('resolves an ordnance entry to its store type and every aircraft that carries it; ordnance sorts last', () => {
    const catalog = buildCatalog(nodeHangarContent())
    const bomb = catalog.find((e) => e.library.id === 'an-m65')!
    expect(bomb.subject).toMatchObject({ kind: 'ordnance', storeId: 'an-m65', store: { kind: 'bomb' } })
    const carriers = (bomb.subject as { carriers: readonly { id: string }[] }).carriers.map((a) => a.id).sort()
    expect(carriers).toEqual(['f4f-wildcat', 'f6f-hellcat'])
    expect(catalog.at(-1)!.library.kind).toBe('ordnance')
  })

  it('names a library ordnance entry whose store no aircraft carries', () => {
    const c = nodeHangarContent()
    const bad = { ...c, library: [...c.library, { ...c.library.find((e) => e.id === 'an-m65')!, id: 'x', spec: 'mk-13' }] }
    expect(() => buildCatalog(bad)).toThrow(/no aircraft carries store "mk-13"/)
  })

  it('filters by kind and side', () => {
    const jp = filterCatalog(catalog, { kind: 'ship', side: 'japanese' })
    expect(jp.length).toBeGreaterThan(0)
    expect(jp.every((e) => e.library.kind === 'ship' && e.library.side === 'japanese')).toBe(true)
    expect(filterCatalog(catalog, { kind: 'all', side: 'all' })).toHaveLength(catalog.length)
  })
})

describe('availability (R1, model-roster spec §4.3)', () => {
  const c = nodeHangarContent()
  const corsair = c.library.find((e) => e.id === 'f4u-corsair')!
  const withModel = { ...c, library: [...c.library.filter((e) => e.id !== 'f4u-corsair'), { ...corsair, model: { kind: 'aircraft' as const, id: 'wildcat' } }] }
  const cat = buildCatalog(withModel)
  const get = (id: string) => cat.find((e) => e.library.id === id)!

  it('a spec is in the game, a model alone is display-only, neither is not drawn', () => {
    expect(availability(get('f4f-wildcat'))).toBe('in-game')
    expect(availability(get('hangar'))).toBe('in-game') // a spec and a model: still in the game
    expect(availability(get('f4u-corsair'))).toBe('display-only')
    expect(availability(get('b-17-flying-fortress'))).toBe('not-drawn')
    expect([get('f4u-corsair'), get('b-17-flying-fortress')].map(drawable)).toEqual([true, false])
  })

  it('labels the list and the card by availability', () => {
    expect(listLabel(get('f4f-wildcat'))).toBe(get('f4f-wildcat').library.name)
    expect(listLabel(get('f4u-corsair'))).toBe(`${corsair.name} (not in the game yet)`)
    expect(listLabel(get('b-17-flying-fortress'))).toMatch(/ \(not yet in service\)$/)
    expect([statusNote(get('f4f-wildcat')), statusNote(get('f4u-corsair')), statusNote(get('b-17-flying-fortress'))])
      .toEqual([null, 'Not in the game yet', 'Not yet in service'])
  })

  it('sorts in the game, then display-only, then not drawn, within a kind', () => {
    const aircraft = cat.filter((e) => e.library.kind === 'aircraft').map(availability)
    const rank = { 'in-game': 0, 'display-only': 1, 'not-drawn': 2 }
    expect(aircraft.map((a) => rank[a])).toEqual([...aircraft.map((a) => rank[a])].sort((x, y) => x - y))
    expect(aircraft).toContain('display-only')
  })
})
