import { z } from 'zod'
import chapters from '../../content/campaign/chapters.json'
import registry from '../../content/campaign/chapter-missions.json'
import type { MissionDescriptor } from './eligibility.js'
import { rankLabel } from './ranks.js'
import { CHAPTER_IDS, chaptersOf, type ChapterId, type Faction, type Tier } from './schema.js'
import { isNightHour } from './catalog.js'

/**
 * The twelve chapter missions (F10-0, 2026-10-17). `content/campaign/chapter-missions.json` is the one place a chapter says which scenario it
 * flies, which airplanes it offers, and the facts a descriptor needs that the scenario file does not carry (`coordinated`, `authoredBonus`).
 * A chapter whose entry is empty, or whose scenario file does not load, is simply not enrolled: nothing in the catalog, the picker or the
 * title offers it, so a half-built chapter can never reach a player or crash the shell.
 */
const id = z.string().min(1)
const loadout = z.enum(['clean', 'bombs', 'torpedoes', 'rockets', 'both'])
const ChapterMissionObject = z.object({
  scenario: id.nullable(),
  badge: z.object({ id, name: id }).strict().nullable(),
  start: z.enum(['carrier', 'airfield', 'water', 'airborne']).nullable(),
  /** The chapter's own list, the authored airplane first. */
  aircraft: z.array(id),
  recommendedLoadout: loadout.nullable(),
  coordinated: z.boolean(),
  authoredBonus: z.number().int().nonnegative(),
}).strict()
export type ChapterMission = z.infer<typeof ChapterMissionObject>

const RegistryObject = z.object({ note: z.string(), chapters: z.object(Object.fromEntries(CHAPTER_IDS.map((c) => [c, ChapterMissionObject])) as Record<ChapterId, typeof ChapterMissionObject>).strict() }).strict()
export type ChapterRegistry = Readonly<Record<ChapterId, ChapterMission>>

export const CHAPTER_MISSIONS: ChapterRegistry = RegistryObject.parse(registry).chapters

/** A chapter with a scenario named, an authored airplane and a badge: enough to be offered (the scenario file itself is checked at load). */
export const isAuthored = (m: ChapterMission): m is ChapterMission & { scenario: string; badge: { id: string; name: string }; start: NonNullable<ChapterMission['start']> } =>
  m.scenario !== null && m.badge !== null && m.start !== null && m.aircraft.length > 0

export const chapterFaction = (chapter: ChapterId): Faction => (chapter.startsWith('A') ? 'us' : 'ja')

/** The tier of `chapters.json`'s `minRank` for this chapter, read through the rank table so the two cannot drift. */
export function chapterMinTier(chapter: ChapterId): Tier {
  const info = chapters.chapters.find((c) => c.id === chapter)
  if (info === undefined) throw new Error(`chapters.json has no chapter ${chapter}`)
  const faction = chapterFaction(chapter)
  const tier = ([1, 2, 3, 4, 5, 6] as const).find((t) => rankLabel(faction, t).name === info.minRank)
  if (tier === undefined) throw new Error(`chapter ${chapter}: minRank "${info.minRank}" is not a ${faction} rank`)
  return tier
}

/** The chapter that flies this scenario, among the authored ones, or `null` (a pooled mission, a range, an unauthored chapter). */
export function chapterOfScenario(scenarioId: string, reg: ChapterRegistry = CHAPTER_MISSIONS): ChapterId | null {
  return CHAPTER_IDS.find((c) => reg[c].scenario === scenarioId) ?? null
}

/** The airplanes a chapter's scenario offers (authored first), for Form 5 and the sortie rules; `null` for any other scenario. */
export function chapterAircraftOf(scenarioId: string, reg: ChapterRegistry = CHAPTER_MISSIONS): readonly string[] | null {
  const c = chapterOfScenario(scenarioId, reg)
  return c === null ? null : reg[c].aircraft
}

export type ChapterFacts = { readonly timeOfDay: number }

/** The campaign descriptor of an authored chapter. `facts` come from its scenario file; `night` follows the scenario's hour (GAMEPLAY.md). */
export function describeChapter(chapter: ChapterId, entry: ChapterMission, facts: ChapterFacts): MissionDescriptor | null {
  if (!isAuthored(entry)) return null
  return {
    id: entry.scenario, faction: chapterFaction(chapter), kind: 'campaign', chapterId: chapter,
    minTier: chapterMinTier(chapter), night: isNightHour(facts.timeOfDay), coordinated: entry.coordinated,
    aircraftIds: entry.aircraft, scoreEligible: true, authoredBonus: entry.authoredBonus, badgeId: entry.badge.id,
  }
}

/** Every authored chapter of a faction, in campaign order. */
export const authoredChapters = (faction: Faction, reg: ChapterRegistry = CHAPTER_MISSIONS): ChapterId[] =>
  chaptersOf(faction).filter((c) => isAuthored(reg[c]))
