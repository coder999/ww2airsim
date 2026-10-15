/**
 * Seeded pilot-name generator (plan F5A Task 4). Pure: the same `(seed, cursor)` always draws
 * the same name. Data is curated and source-reviewed in content/campaign/names-{us,ja}.json;
 * no ethnicity is stored or inferred (the name is the only thing that reaches the record).
 */
import { createRng } from '../sim/rng.js'
import usData from '../../content/campaign/names-us.json'
import jaData from '../../content/campaign/names-ja.json'
import { NAME_SUFFIXES, type Faction, type PilotName } from './schema.js'

export type NameEntry = { text: string; kanji?: string }
export type NamePool = {
  given: readonly NameEntry[]
  family: readonly NameEntry[]
  /** Chance a draw carries a suffix. Always 0 for `ja`. */
  suffixChance: number
}

/** Weighted: Jr. is by far the most common period suffix. */
const SUFFIX_WEIGHTED = ['Jr.', 'Jr.', 'Jr.', 'II', 'III', 'Sr.', 'IV'] as const
const US_SUFFIX_CHANCE = 0.1

const entries = (list: readonly (string | { romaji: string; kanji: string })[]): NameEntry[] =>
  list.map((e) => (typeof e === 'string' ? { text: e } : { text: e.romaji, kanji: e.kanji }))

export const DEFAULT_POOLS: Readonly<Record<Faction, NamePool>> = {
  us: { given: entries(usData.given), family: entries(usData.family), suffixChance: US_SUFFIX_CHANCE },
  ja: { given: entries(jaData.given), family: entries(jaData.family), suffixChance: 0 },
}

export const nameKey = (n: PilotName): string => `${n.given}|${n.family}|${n.suffix ?? ''}`

/** Display order by faction: American "Given Family Jr."; Japanese "Family Given". */
export function formatName(n: PilotName, faction: Faction): string {
  return faction === 'ja' ? `${n.family} ${n.given}` : `${n.given} ${n.family}${n.suffix ? ` ${n.suffix}` : ''}`
}

const build = (g: NameEntry, f: NameEntry, suffix: PilotName['suffix'] | undefined, faction: Faction): PilotName => {
  const name: PilotName = { given: g.text, family: f.text }
  if (suffix) name.suffix = suffix
  if (g.kanji && f.kanji) name.kanji = faction === 'ja' ? f.kanji + g.kanji : g.kanji + f.kanji
  return name
}

export type Draw = { name: PilotName; nameDraws: { seed: number; next: number }; repeated: boolean }

/**
 * Draw number `nameDraws.next`. Retries random picks while the full name is already `taken`,
 * then scans the whole (given x family x suffix) grid from a random start; only when every
 * combination is taken does it repeat one (`repeated: true`). It never throws and never
 * blocks a replacement: the pilot id, not the name, is what is unique.
 */
export function drawName(
  faction: Faction,
  nameDraws: { seed: number; next: number },
  taken: ReadonlySet<string>,
  pool: NamePool = DEFAULT_POOLS[faction],
): Draw {
  const rng = createRng((nameDraws.seed + Math.imul(nameDraws.next + 1, 0x9e3779b1)) >>> 0)
  const pick = <T,>(l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(rng() * l.length))]!
  const suffixesOn = faction === 'us' && pool.suffixChance > 0
  const next = { seed: nameDraws.seed, next: nameDraws.next + 1 }

  let first: PilotName | undefined
  for (let attempt = 0; attempt < 32; attempt++) {
    const g = pick(pool.given)
    const f = pick(pool.family)
    const suffix = suffixesOn && rng() < pool.suffixChance ? pick(SUFFIX_WEIGHTED) : undefined
    const name = build(g, f, suffix, faction)
    first ??= name
    if (!taken.has(nameKey(name))) return { name, nameDraws: next, repeated: false }
  }

  const variants: (PilotName['suffix'] | undefined)[] = suffixesOn ? [undefined, ...NAME_SUFFIXES] : [undefined]
  const total = pool.given.length * pool.family.length * variants.length
  const start = Math.floor(rng() * total)
  for (let k = 0; k < total; k++) {
    const idx = (start + k) % total
    const v = variants[idx % variants.length]
    const rest = Math.floor(idx / variants.length)
    const name = build(pool.given[rest % pool.given.length]!, pool.family[Math.floor(rest / pool.given.length)]!, v, faction)
    if (!taken.has(nameKey(name))) return { name, nameDraws: next, repeated: false }
  }
  return { name: first!, nameDraws: next, repeated: true }
}
