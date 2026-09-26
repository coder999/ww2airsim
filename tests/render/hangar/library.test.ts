// tests/render/hangar/library.test.ts
import { describe, expect, it } from 'vitest'
import { gameplayNumbersIn, parseLibraryEntry } from '../../../src/render/hangar/library.js'

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
