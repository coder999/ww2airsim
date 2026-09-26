// tests/render/hangar/library.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { gameplayNumbersIn, parseLibraryEntry, rosterNameOf } from '../../../src/render/hangar/library.js'
import { libraryIds, loadLibraryEntry, nodeHangarContent, rosterColumn } from './content.js'

const content = nodeHangarContent()
const gameplay = readFileSync('GAMEPLAY.md', 'utf8')
const entries = content.library
const buildingKinds = [...new Set(content.airfields.flatMap((a) => a.buildings.map((b) => b.kind)))]

describe('content/library (Hangar spec §4.4)', () => {
  it('1. every file parses, and its id equals its basename', () => {
    for (const id of libraryIds()) expect(loadLibraryEntry(id).id, `${id}.json`).toBe(id)
  })

  it("2. every spec resolves, and a shipped aircraft's or ship's name equals its spec's", () => {
    for (const e of entries) {
      if (e.spec === undefined) continue
      if (e.kind === 'aircraft') expect(content.aircraft.find((a) => a.id === e.spec)?.name, e.id).toBe(e.name)
      if (e.kind === 'ship') expect(content.ships.find((s) => s.id === e.spec)?.name, e.id).toBe(e.name)
      if (e.kind === 'building') expect(buildingKinds, e.id).toContain(e.spec)
    }
  })

  it('3. every sim spec has exactly one library entry', () => {
    const count = (kind: string, spec: string) => entries.filter((e) => e.kind === kind && e.spec === spec).length
    for (const a of content.aircraft) expect(count('aircraft', a.id), `aircraft ${a.id}`).toBe(1)
    for (const s of content.ships) expect(count('ship', s.id), `ship ${s.id}`).toBe(1)
    for (const k of buildingKinds) expect(count('building', k), `building kind ${k}`).toBe(1)
  })

  it("4. every row of GAMEPLAY.md's aircraft, ship and building rosters has an entry", () => {
    const named = (kind: string) => new Set(entries.filter((e) => e.kind === kind).map(rosterNameOf))
    for (const row of rosterColumn(gameplay, 'Aircraft roster')) expect(named('aircraft'), row).toContain(row)
    for (const row of rosterColumn(gameplay, 'Ship roster')) expect(named('ship'), row).toContain(row)
    // The shipped-building table is placements of a kind: match its Kind column.
    const kinds = new Set(entries.filter((e) => e.kind === 'building').map((e) => e.spec))
    for (const kind of rosterColumn(gameplay, 'Building roster', 0, 1)) expect(kinds, kind).toContain(kind)
    for (const row of rosterColumn(gameplay, 'Building roster', 1)) expect(named('building'), row).toContain(row)
  })

  it('5. no blurb carries a gameplay number', () => {
    for (const e of entries) expect(gameplayNumbersIn(e.blurb), e.id).toEqual([])
  })
})

describe('LibraryEntrySchema', () => {
  const valid = {
    id: 'x', name: 'X', kind: 'ship', side: 'allied', blurb: 'A ship.', history: 'One.\n\nTwo.',
    sources: [{ title: 'T', url: 'https://en.wikipedia.org/wiki/X', read: '2026-09-25' }],
  }
  it.each([
    ['an unknown key', { ...valid, hp: 3 }, /hp/],
    ['a bad side', { ...valid, side: 'axis' }, /side/],
    ['four history paragraphs', { ...valid, history: 'a\n\nb\n\nc\n\nd' }, /1 to 3 paragraphs/],
    ['no sources', { ...valid, sources: [] }, /sources/],
    ['a read date that is not ISO', { ...valid, sources: [{ ...valid.sources[0], read: '25 Sep 2026' }] }, /read/],
  ])('rejects %s', (_l, raw, message) => {
    expect(() => parseLibraryEntry(raw)).toThrow(message)
  })

  it('gameplayNumbersIn catches a number with a unit, and only that', () => {
    expect(gameplayNumbersIn('It has 120 HP and makes 33 kn, or 17.0 m/s.')).toEqual(['120 HP', '33 kn', '17.0 m/s'])
    expect(gameplayNumbersIn('Commissioned in 1943, one of 175 ships; 18-inch guns.')).toEqual([])
  })
})
