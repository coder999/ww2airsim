import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DIFFICULTY_BONUS, destructionPoints, rosterBonusOf, scoreSortie } from '../../src/campaign/scoring.js'
import { SCORE_CLASSES, SCORE_POINTS, zeroCounts, type Counts, type Difficulty, type SortieReport, type Tier } from '../../src/campaign/schema.js'
import { createRng } from '../../src/sim/rng.js'

const report = (over: Partial<SortieReport> = {}): SortieReport => ({
  sortieId: 's', end: 'landed', success: true, counts: zeroCounts(), friendlyDestroyed: false, warnings: 0, authoredBonus: 0,
  flight: { flightSeconds: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: null }, badgeId: null, ...over,
})
const one = (k: (typeof SCORE_CLASSES)[number], n: number): Counts => ({ ...zeroCounts(), [k]: n })

describe('the point table', () => {
  it('matches GAMEPLAY.md\'s destroyed-object table (parsed, not copied)', () => {
    const text = readFileSync(new URL('../../GAMEPLAY.md', import.meta.url), 'utf8')
    const start = text.indexOf('| Destroyed object | Points |')
    const rows = text.slice(start).split('\n').slice(2, 9)
    const cells = rows.flatMap((r) => {
      const c = r.split('|').slice(1, -1).map((x) => x.trim())
      return [[c[0], c[1]], [c[2], c[3]]] as const
    }).filter(([n, p]) => n && p).map(([, p]) => Number(p!.replace(/,/g, '')))
    expect([...cells].sort((a, b) => a - b)).toEqual(Object.values(SCORE_POINTS).sort((a, b) => a - b))
    expect(cells).toHaveLength(13)
  })
})

describe('scoreSortie: one case per path', () => {
  it.each(SCORE_CLASSES.flatMap((k) => [1, 2, 7].map((n) => [k, n] as const)))('%s x %i = count times the table value', (k, n) => {
    expect(scoreSortie(report({ counts: one(k, n) }), { difficulty: 'easy' }).destruction).toBe(SCORE_POINTS[k] * n)
  })

  it.each(['easy', 'normal', 'hard'] as Difficulty[])('difficulty %s bonus only on success', (d) => {
    expect(scoreSortie(report({ success: true }), { difficulty: d }).difficulty).toBe(DIFFICULTY_BONUS[d])
    expect(scoreSortie(report({ success: false }), { difficulty: d }).difficulty).toBe(0)
  })
  it('the bonus values are 0 / 500 / 1,000 (Recruit / Veteran / Ace)', () => {
    expect([DIFFICULTY_BONUS.easy, DIFFICULTY_BONUS.normal, DIFFICULTY_BONUS.hard]).toEqual([0, 500, 1000])
  })

  it('authored bonus only on success; destruction still banks on a failed sortie', () => {
    const counts = one('fighter', 2)
    expect(scoreSortie(report({ success: true, authoredBonus: 2500, counts }), { difficulty: 'easy' })).toEqual({ destruction: 1000, difficulty: 0, completion: 2500, forfeited: false })
    expect(scoreSortie(report({ success: false, authoredBonus: 2500, counts }), { difficulty: 'hard' })).toEqual({ destruction: 1000, difficulty: 0, completion: 0, forfeited: false })
  })

  it.each([
    ['abandon', { end: 'abandoned' as const }],
    ['friendly destroyed', { friendlyDestroyed: true }],
    ['both', { end: 'abandoned' as const, friendlyDestroyed: true }],
  ])('%s forfeits everything, including destruction already earned', (_n, over) => {
    expect(scoreSortie(report({ ...over, success: true, authoredBonus: 2500, counts: one('carrier', 1) }), { difficulty: 'hard' }))
      .toEqual({ destruction: 0, difficulty: 0, completion: 0, forfeited: true })
  })

  // Mark 2026-10-16: only Abandon (above) forfeits the unbanked part; a death or a capture still banks what it earned.
  it.each(['killed', 'captured', 'rescued', 'ditched'] as const)('%s keeps legitimate destruction (GAMEPLAY.md)', (end) => {
    expect(scoreSortie(report({ end, success: false, counts: one('tank', 3) }), { difficulty: 'normal' }).destruction).toBe(900)
  })
})

describe('roster bonus', () => {
  const tiers: Tier[] = [1, 2, 3, 4, 5, 6]
  const multisets: Tier[][] = []
  for (const a of tiers) for (const b of tiers) for (const c of tiers) for (const d of tiers) for (const e of tiers) {
    if (a <= b && b <= c && c <= d && d <= e) multisets.push([a, b, c, d, e])
  }
  it('there are 252 multisets of five tiers, each worth the sum of 0/100/200/300/400/500, max 2,500', () => {
    expect(multisets).toHaveLength(252)
    for (const m of multisets) expect(rosterBonusOf(m)).toBe(m.reduce((s, t) => s + (t - 1) * 100, 0))
    expect(rosterBonusOf([1, 1, 1, 1, 1])).toBe(0)
    expect(Math.max(...multisets.map(rosterBonusOf))).toBe(2500)
    expect(new Set(multisets.map(rosterBonusOf)).size).toBe(26) // every multiple of 100 from 0 to 2,500
  })
})

describe('properties over a seeded walk', () => {
  it('score is never negative and destruction equals the table dot counts', () => {
    const rng = createRng(2026)
    for (let i = 0; i < 2000; i++) {
      const counts = Object.fromEntries(SCORE_CLASSES.map((k) => [k, Math.floor(rng() * 4)])) as Counts
      const ds: Difficulty[] = ['easy', 'normal', 'hard']
      const s = scoreSortie(report({ counts, success: rng() < 0.5, authoredBonus: Math.floor(rng() * 3) * 1000, friendlyDestroyed: rng() < 0.1, end: rng() < 0.1 ? 'abandoned' : 'landed' }), { difficulty: ds[Math.floor(rng() * 3)]! })
      expect(Math.min(s.destruction, s.difficulty, s.completion)).toBeGreaterThanOrEqual(0)
      if (!s.forfeited) expect(s.destruction).toBe(destructionPoints(counts))
    }
  })
})
