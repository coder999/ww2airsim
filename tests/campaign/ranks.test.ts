import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { COMMAND_TITLE_POINTS, PILOT_TIER_POINTS, type Faction, type Tier } from '../../src/campaign/schema.js'
import { COMMAND_TITLES, abilities, commandTitleOf, rankLabel, tierOf } from '../../src/campaign/ranks.js'

const FACTIONS: Faction[] = ['us', 'ja']

/** The planned-campaign tables, parsed out of GAMEPLAY.md itself so a retuned doc fails the test. */
function gameplayTable(heading: RegExp): string[][] {
  const text = readFileSync(new URL('../../GAMEPLAY.md', import.meta.url), 'utf8')
  const lines = text.split('\n')
  const start = lines.findIndex((l) => heading.test(l))
  expect(start, `${heading} row in GAMEPLAY.md`).toBeGreaterThan(-1)
  let i = start
  while (i > 0 && lines[i - 1]!.startsWith('|')) i--
  const rows: string[][] = []
  for (; i < lines.length && lines[i]!.startsWith('|'); i++) {
    const cells = lines[i]!.split('|').slice(1, -1).map((c) => c.trim())
    if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells)
  }
  return rows
}
const num = (s: string) => Number(s.replace(/,/g, ''))

describe('pilot ladder', () => {
  it('has exactly six tiers and five command titles', () => {
    expect(PILOT_TIER_POINTS).toHaveLength(6)
    expect(COMMAND_TITLE_POINTS).toHaveLength(5)
    expect(COMMAND_TITLES).toHaveLength(5)
  })

  it.each(PILOT_TIER_POINTS.map((t, i) => [i + 1, t] as const))('tier %i begins exactly at %i points', (tier, threshold) => {
    expect(tierOf(threshold)).toBe(tier)
    if (threshold > 0) expect(tierOf(threshold - 1)).toBe(tier - 1)
    expect(tierOf(threshold + 1)).toBe(tier)
  })

  it.each(COMMAND_TITLE_POINTS.map((t, i) => [i, t] as const))('command title %i begins exactly at %i points', (title, threshold) => {
    expect(commandTitleOf(threshold)).toBe(title)
    if (threshold > 0) expect(commandTitleOf(threshold - 1)).toBe(title - 1)
    expect(commandTitleOf(threshold + 1)).toBe(title)
  })

  it('tiers are monotone and identical for both factions at every score 0..45,000 (enrolled, exhaustive)', () => {
    let last = 1
    for (let p = 0; p <= 45_000; p++) {
      const tier = tierOf(p)
      expect(tier >= last).toBe(true)
      last = tier
      for (const f of FACTIONS) expect(rankLabel(f, tier).name.length).toBeGreaterThan(0)
    }
    expect(tierOf(45_000)).toBe(6)
  })

  it('thresholds and labels match GAMEPLAY.md\'s ladder table (parsed, not copied)', () => {
    const rows = gameplayTable(/^\| 1 \| Ensign \|/).filter((r) => /^\d$/.test(r[0]!))
    expect(rows).toHaveLength(6)
    for (const [tierCell, us, ja, pts] of rows) {
      const tier = Number(tierCell) as Tier
      expect(rankLabel('us', tier).name).toBe(us)
      expect(rankLabel('ja', tier).name).toBe(ja)
      expect(PILOT_TIER_POINTS[tier - 1]).toBe(num(pts!))
    }
  })

  it('command titles and thresholds match GAMEPLAY.md\'s title table', () => {
    const rows = gameplayTable(/^\| Squadron Commander \|/).filter((r) => r[0] !== 'Human-player command title')
    expect(rows.map((r) => r[0])).toEqual([...COMMAND_TITLES])
    expect(rows.map((r) => num(r[1]!))).toEqual([...COMMAND_TITLE_POINTS])
  })

  it('only the American ladder has abbreviations; the Japanese ladder uses no American-style suffix', () => {
    for (let t = 1 as Tier; t <= 6; t = (t + 1) as Tier) {
      expect(rankLabel('us', t).abbrev).toBeTruthy()
      expect(rankLabel('ja', t).abbrev).toBeUndefined()
    }
  })

  it('unlocks follow the ladder table: night 2, advanced 3, sights 4, coordinated 5, finale 6', () => {
    const first = (k: 'night' | 'advanced' | 'sights' | 'coordinated' | 'finale') =>
      ([1, 2, 3, 4, 5, 6] as Tier[]).find((t) => abilities(t)[k])
    expect([first('night'), first('advanced'), first('sights'), first('coordinated'), first('finale')]).toEqual([2, 3, 4, 5, 6])
    expect(Object.values(abilities(1)).some(Boolean)).toBe(false)
  })
})
