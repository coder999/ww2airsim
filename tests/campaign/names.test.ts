import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DEFAULT_POOLS, drawName, formatName, nameKey, type NamePool } from '../../src/campaign/names.js'
import { createCampaign, addEntryPilot } from '../../src/campaign/roster.js'
import { NAME_SUFFIXES } from '../../src/campaign/schema.js'

const FACTIONS = ['us', 'ja'] as const

describe('name lists', () => {
  it.each(FACTIONS)('%s: at least 60 given x 150 family names, no duplicates, sources cited (D16)', (f) => {
    const file = JSON.parse(readFileSync(new URL(`../../content/campaign/names-${f}.json`, import.meta.url), 'utf8')) as {
      sources: { name: string; terms: string; use: string }[]; note: string; given: unknown[]; family: unknown[]
    }
    expect(file.given.length).toBeGreaterThanOrEqual(60)
    expect(file.family.length).toBeGreaterThanOrEqual(150)
    expect(file.sources.length).toBeGreaterThanOrEqual(2)
    for (const s of file.sources) expect(s.name && s.terms && s.use).toBeTruthy()
    expect(file.note).toMatch(/Needs Mark's review/)
    const pool = DEFAULT_POOLS[f]
    expect(new Set(pool.given.map((e) => e.text)).size).toBe(pool.given.length)
    expect(new Set(pool.family.map((e) => e.text)).size).toBe(pool.family.length)
  })

  it('Japanese entries carry kanji; American entries do not', () => {
    expect(DEFAULT_POOLS.ja.given.every((e) => e.kanji)).toBe(true)
    expect(DEFAULT_POOLS.ja.family.every((e) => e.kanji)).toBe(true)
    expect(DEFAULT_POOLS.us.given.some((e) => e.kanji)).toBe(false)
  })
})

describe('drawName', () => {
  it.each(FACTIONS)('%s: the same seed yields the same sequence across 10,000 draws; the cursor advances by one', (f) => {
    const run = () => {
      let cur = { seed: 12345, next: 0 }
      const taken = new Set<string>()
      const out: string[] = []
      for (let i = 0; i < 10_000; i++) {
        const d = drawName(f, cur, taken)
        expect(d.nameDraws.next).toBe(cur.next + 1)
        expect(d.repeated).toBe(false)
        taken.add(nameKey(d.name))
        out.push(nameKey(d.name))
        cur = d.nameDraws
      }
      return out
    }
    const a = run()
    expect(a).toEqual(run())
    expect(new Set(a).size).toBe(a.length) // no duplicate while the pool allows
  })

  it('different seeds draw different first names', () => {
    const first = (seed: number) => nameKey(drawName('us', { seed, next: 0 }, new Set()).name)
    expect(new Set([1, 2, 3, 4, 5, 6].map(first)).size).toBeGreaterThan(3)
  })

  it('Japanese names never carry a suffix, over a large sample', () => {
    let cur = { seed: 9, next: 0 }
    for (let i = 0; i < 3000; i++) {
      const d = drawName('ja', cur, new Set())
      expect(d.name.suffix).toBeUndefined()
      cur = d.nameDraws
    }
  })

  it('American suffixes come only from the allowed set, and do occur', () => {
    let cur = { seed: 9, next: 0 }
    const seen = new Set<string>()
    for (let i = 0; i < 3000; i++) {
      const d = drawName('us', cur, new Set())
      if (d.name.suffix) seen.add(d.name.suffix)
      cur = d.nameDraws
    }
    expect(seen.size).toBeGreaterThan(0)
    for (const s of seen) expect(NAME_SUFFIXES as readonly string[]).toContain(s)
  })

  it('exhausted pool: a 2x2 injected pool survives 50 replacements, repeats names, never throws', () => {
    const pool: NamePool = { given: [{ text: 'A' }, { text: 'B' }], family: [{ text: 'X' }, { text: 'Y' }], suffixChance: 0 }
    const c = createCampaign({ id: 'c', faction: 'ja', playerName: 'm', seed: 3, now: 'x' })
    const ids = new Set(Object.keys(c.pilots))
    let repeats = 0
    for (let i = 0; i < 50; i++) {
      const before = new Set(Object.values(c.pilots).map((p) => nameKey(p.name)))
      const id = addEntryPilot(c, pool)
      if (before.has(nameKey(c.pilots[id]!.name))) repeats++
      expect(ids.has(id)).toBe(false) // distinct pilot id even for a repeated name
      ids.add(id)
    }
    expect(repeats).toBeGreaterThan(0)
    expect(ids.size).toBe(55)
  })

  it('the draw fills a 2x2 pool before repeating (no early repeat while the pool allows)', () => {
    const pool: NamePool = { given: [{ text: 'A' }, { text: 'B' }], family: [{ text: 'X' }, { text: 'Y' }], suffixChance: 0 }
    const taken = new Set<string>()
    let cur = { seed: 5, next: 0 }
    for (let i = 0; i < 4; i++) {
      const d = drawName('ja', cur, taken, pool)
      expect(d.repeated).toBe(false)
      taken.add(nameKey(d.name))
      cur = d.nameDraws
    }
    expect(drawName('ja', cur, taken, pool).repeated).toBe(true)
  })

  it('formats in each faction\'s display order', () => {
    expect(formatName({ given: 'Robert', family: 'Miller', suffix: 'Jr.' }, 'us')).toBe('Robert Miller Jr.')
    expect(formatName({ given: 'Hiroshi', family: 'Tanaka', kanji: '田中博' }, 'ja')).toBe('Tanaka Hiroshi')
  })

  it('a campaign\'s five opening names are all different', () => {
    for (const f of FACTIONS) {
      const c = createCampaign({ id: 'c', faction: f, playerName: 'm', seed: 99, now: 'x' })
      expect(new Set(Object.values(c.pilots).map((p) => nameKey(p.name))).size).toBe(5)
    }
  })
})
