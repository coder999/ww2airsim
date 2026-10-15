/**
 * The frozen campaign contract (plan F5A, C1-C3; reference in docs/campaign-data.md).
 * Types are hand-written to match the plan; the zod schema below validates the same shape,
 * and a compile-time assertion keeps the two from drifting. No consumer edits these in
 * place after the Task 3 freeze: a change is a `schemaVersion` bump plus a migration.
 */
import { z } from 'zod'

export type Faction = 'us' | 'ja' // NOT sim Side: a Japanese player flies axis-flagged aircraft
export type Tier = 1 | 2 | 3 | 4 | 5 | 6
export const PILOT_TIER_POINTS = [0, 2500, 7500, 15000, 25000, 40000] as const
export const COMMAND_TITLE_POINTS = [0, 20000, 50000, 90000, 140000] as const
export const LIVE_ROSTER_SIZE = 5
export const SCHEMA_VERSION = 1
export const SCORING_RULES_VERSION = 1
export const CAMPAIGN_FORMAT = 'ww2airsim-campaign'

export const LIVE_LOG_CAP = 200
export const CLOSED_LOG_CAP = 50
export const HUMAN_LOG_CAP = 500

export const SCORE_CLASSES = [
  'light-vehicle', 'building', 'landing-craft', 'aaa', 'tank', 'fighter', 'runway',
  'transport', 'bomber', 'destroyer', 'cruiser', 'battleship', 'carrier',
] as const
export type ScoreClass = (typeof SCORE_CLASSES)[number]
/** GAMEPLAY.md, "Campaign scoring and conduct": one table for all play (D14). */
export const SCORE_POINTS: Readonly<Record<ScoreClass, number>> = {
  'light-vehicle': 100, building: 150, 'landing-craft': 250, aaa: 250, tank: 300, fighter: 500, runway: 500,
  transport: 500, bomber: 750, destroyer: 1000, cruiser: 1500, battleship: 3000, carrier: 5000,
}
export type Counts = Readonly<Record<ScoreClass, number>>
export function zeroCounts(): Record<ScoreClass, number> {
  return Object.fromEntries(SCORE_CLASSES.map((k) => [k, 0])) as Record<ScoreClass, number>
}

export const NAME_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV'] as const
export type PilotName = { given: string; family: string; suffix?: (typeof NAME_SUFFIXES)[number]; kanji?: string }

export type PilotStatus = 'active' | 'kia' | 'pow' | 'discharged'
export type Closure = { sortieId: string; at: string; reason: Exclude<PilotStatus, 'active'>; missionId: string | null }

export type Career = {
  flightSeconds: number
  landings: { trap: number; field: number; ditched: number; water: number }
  rescues: number
  maxAltitudeM: number // SI internally (D9); imperial at display only
  maxTrueAirspeedMps: number
}

export type Difficulty = 'easy' | 'normal' | 'hard'
export type SortieEndKind = 'landed' | 'ditched' | 'killed' | 'rescued' | 'captured' | 'abandoned'
export type LogFlag = 'forfeit-abandoned' | 'forfeit-friendly-destroyed' | 'warned'

export type LogEntry = {
  sortieId: string; at: string; missionId: string; chapterId: string | null; aircraft: string; loadout: string
  difficulty: Difficulty; end: SortieEndKind; success: boolean
  counts: Counts; destruction: number; bonuses: { difficulty: number; completion: number; roster: number } // roster is human-only
  points: number // total this ledger received
  flightSeconds: number; flags: LogFlag[]
}

export type Ledger = { points: number; sorties: number; banked: number; counts: Counts; badges: string[] }

export type Pilot = {
  id: string; serial: number; name: PilotName; status: PilotStatus; closure: Closure | null
  points: number; sorties: number; banked: number; counts: Counts; badges: string[]
  career: Career; log: LogEntry[] // live cap 200, closed cap 50 (D10)
}

export type Human = {
  playerName: string
  ledger: Ledger // points = raw cumulative; sorties = adjusted-score denominator
  stats: { losses: { kia: number; pow: number; discharged: number }; rescues: number; abandoned: number; warnings: number }
  log: LogEntry[] // cap 500, chronological
}

export const CHAPTER_IDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const
export type ChapterId = (typeof CHAPTER_IDS)[number]
/** The six chapters of a faction, in sequence. */
export function chaptersOf(faction: Faction): readonly ChapterId[] {
  return CHAPTER_IDS.filter((c) => c[0] === (faction === 'us' ? 'A' : 'J'))
}
export type Progress = {
  completed: ChapterId[]; victory: boolean
  attempts: Partial<Record<ChapterId, { launched: number; failed: number; abandoned: number }>>
}

export type SortieFacts = Readonly<Record<string, string | number | boolean>>
export type PendingSortie = {
  sortieId: string; pilotId: string; missionId: string; chapterId: ChapterId | null
  difficulty: Difficulty; scoreEligible: boolean; launchedAt: string; facts: SortieFacts
}

export type Campaign = {
  format: 'ww2airsim-campaign'; schemaVersion: 1; scoringRulesVersion: 1
  id: string; revision: number; faction: Faction
  human: Human
  roster: { live: [string, string, string, string, string] }
  pilots: Record<string, Pilot>
  nameDraws: { seed: number; next: number }
  serials: { pilot: number; sortie: number }
  progress: Progress
  world: Record<string, string> // F8 owns keys and values; opaque to F5A
  scenesSeen: string[] // F9: set semantics
  pending: PendingSortie | null
}

// ---- zod ------------------------------------------------------------------------------------

const int = z.number().int().safe().nonnegative()
const str = z.string()
const countsZ = z.object(Object.fromEntries(SCORE_CLASSES.map((k) => [k, int])) as Record<ScoreClass, typeof int>).strict()
const difficultyZ = z.enum(['easy', 'normal', 'hard'])
const endZ = z.enum(['landed', 'ditched', 'killed', 'rescued', 'captured', 'abandoned'])
const chapterZ = z.enum(CHAPTER_IDS)
const nameZ = z.object({
  given: str.min(1), family: str.min(1), suffix: z.enum(NAME_SUFFIXES).optional(), kanji: str.min(1).optional(),
}).strict()
const careerZ = z.object({
  flightSeconds: int,
  landings: z.object({ trap: int, field: int, ditched: int, water: int }).strict(),
  rescues: int, maxAltitudeM: int, maxTrueAirspeedMps: int,
}).strict()
const logEntryZ = z.object({
  sortieId: str, at: str, missionId: str, chapterId: str.nullable(), aircraft: str, loadout: str,
  difficulty: difficultyZ, end: endZ, success: z.boolean(),
  counts: countsZ, destruction: int,
  bonuses: z.object({ difficulty: int, completion: int, roster: int }).strict(),
  points: int, flightSeconds: int,
  flags: z.array(z.enum(['forfeit-abandoned', 'forfeit-friendly-destroyed', 'warned'])),
}).strict()
const pilotZ = z.object({
  id: str.min(1), serial: int, name: nameZ, status: z.enum(['active', 'kia', 'pow', 'discharged']),
  closure: z.object({ sortieId: str, at: str, reason: z.enum(['kia', 'pow', 'discharged']), missionId: str.nullable() }).strict().nullable(),
  points: int, sorties: int, banked: int, counts: countsZ, badges: z.array(str),
  career: careerZ, log: z.array(logEntryZ),
}).strict()
const ledgerZ = z.object({ points: int, sorties: int, banked: int, counts: countsZ, badges: z.array(str) }).strict()
const humanZ = z.object({
  playerName: str.min(1),
  ledger: ledgerZ,
  stats: z.object({
    losses: z.object({ kia: int, pow: int, discharged: int }).strict(), rescues: int, abandoned: int, warnings: int,
  }).strict(),
  log: z.array(logEntryZ),
}).strict()
const attemptZ = z.object({ launched: int, failed: int, abandoned: int }).strict()
const progressZ = z.object({
  completed: z.array(chapterZ), victory: z.boolean(),
  attempts: z.object(Object.fromEntries(CHAPTER_IDS.map((c) => [c, attemptZ.optional()])) as Record<ChapterId, z.ZodOptional<typeof attemptZ>>).strict(),
}).strict()
const factsZ = z.record(z.union([str, z.number().finite(), z.boolean()]))
const pendingZ = z.object({
  sortieId: str, pilotId: str, missionId: str, chapterId: chapterZ.nullable(), difficulty: difficultyZ,
  scoreEligible: z.boolean(), launchedAt: str, facts: factsZ,
}).strict()

export const campaignZ = z.object({
  format: z.literal(CAMPAIGN_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  scoringRulesVersion: z.literal(SCORING_RULES_VERSION),
  id: str.min(1),
  revision: int,
  faction: z.enum(['us', 'ja']),
  human: humanZ,
  roster: z.object({ live: z.tuple([str, str, str, str, str]) }).strict(),
  pilots: z.record(pilotZ),
  nameDraws: z.object({ seed: int, next: int }).strict(),
  serials: z.object({ pilot: int, sortie: int }).strict(),
  progress: progressZ,
  world: z.record(str),
  scenesSeen: z.array(str),
  pending: pendingZ.nullable(),
}).strict()

// Compile-time drift guard: every hand-written Campaign must satisfy the validator's output type.
type SchemaOut = z.infer<typeof campaignZ>
const _assignable = (c: Campaign): SchemaOut => c
void _assignable

// ---- invariants (each one is named, and each has a negative test) ------------------------------

export type Issue = { name: string; message: string }
type Invariant = { name: string; check: (c: Campaign) => string[] }

const live = (c: Campaign) => c.roster.live
const isLive = (c: Campaign, id: string) => live(c).includes(id)

export const INVARIANTS: readonly Invariant[] = [
  { name: 'live-unique', check: (c) => (new Set(live(c)).size === live(c).length ? [] : ['a pilot id appears twice in roster.live']) },
  { name: 'live-exist', check: (c) => live(c).filter((id) => !c.pilots[id]).map((id) => `live pilot ${id} has no record`) },
  { name: 'live-active', check: (c) => live(c).filter((id) => c.pilots[id] && (c.pilots[id]!.status !== 'active' || c.pilots[id]!.closure !== null)).map((id) => `live pilot ${id} is closed`) },
  {
    name: 'archive-closed',
    check: (c) => Object.values(c.pilots).filter((p) => !isLive(c, p.id) && (p.status === 'active' || p.closure === null || p.closure.reason !== p.status)).map((p) => `archived pilot ${p.id} is not a consistent closed dossier`),
  },
  { name: 'pilot-key-matches-id', check: (c) => Object.entries(c.pilots).filter(([k, p]) => k !== p.id).map(([k]) => `pilots["${k}"] holds a different id`) },
  { name: 'pilot-owned', check: (c) => Object.values(c.pilots).filter((p) => !p.id.startsWith(`${c.id}:p`)).map((p) => `pilot ${p.id} does not belong to campaign ${c.id}`) },
  {
    name: 'pilot-serial',
    check: (c) => {
      const out: string[] = []
      const seen = new Set<number>()
      for (const p of Object.values(c.pilots)) {
        if (p.id !== `${c.id}:p${p.serial}`) out.push(`pilot ${p.id} id disagrees with serial ${p.serial}`)
        if (p.serial < 1 || p.serial > c.serials.pilot) out.push(`pilot ${p.id} serial ${p.serial} is outside 1..${c.serials.pilot}`)
        if (seen.has(p.serial)) out.push(`pilot serial ${p.serial} is used twice`)
        seen.add(p.serial)
      }
      return out
    },
  },
  { name: 'faction-names', check: (c) => (c.faction === 'ja' ? Object.values(c.pilots).filter((p) => p.name.suffix !== undefined).map((p) => `Japanese pilot ${p.id} carries a name suffix`) : []) },
  {
    name: 'log-caps',
    check: (c) => [
      ...Object.values(c.pilots).filter((p) => p.log.length > (isLive(c, p.id) ? LIVE_LOG_CAP : CLOSED_LOG_CAP)).map((p) => `pilot ${p.id} log is over its cap`),
      ...(c.human.log.length > HUMAN_LOG_CAP ? ['human log is over its cap'] : []),
    ],
  },
  {
    name: 'pending-valid',
    check: (c) => {
      if (!c.pending) return []
      const out: string[] = []
      if (!isLive(c, c.pending.pilotId)) out.push('pending sortie is assigned to a pilot who is not live')
      if (c.pending.sortieId !== `${c.id}:s${c.serials.sortie}`) out.push('pending sortie id is not the latest sortie serial')
      return out
    },
  },
  {
    name: 'progress-sequence',
    check: (c) => {
      const chapters = chaptersOf(c.faction)
      const done = c.progress.completed
      const out: string[] = []
      if (done.some((id, i) => id !== chapters[i])) out.push(`completed chapters are not the first ${done.length} of the ${c.faction} sequence`)
      if (c.progress.victory && done.length !== chapters.length) out.push('victory without the final chapter completed')
      if (!c.progress.victory && done.length === chapters.length && chapters.length > 0) out.push('final chapter completed without victory')
      for (const id of Object.keys(c.progress.attempts)) if (!chapters.includes(id as ChapterId)) out.push(`attempts recorded for foreign chapter ${id}`)
      return out
    },
  },
]

export type ValidateResult = { ok: true; campaign: Campaign } | { ok: false; issues: Issue[] }

/** Names of the invariants that fail on `c` (structure assumed valid). */
export function checkInvariants(c: Campaign): Issue[] {
  return INVARIANTS.flatMap((inv) => inv.check(c).map((message) => ({ name: inv.name, message })))
}

/** Parse + invariants. Never throws; a failing campaign is reported, never repaired (C5). */
export function validateCampaign(raw: unknown): ValidateResult {
  const parsed = campaignZ.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ name: 'shape', message: `${i.path.join('.') || '(root)'}: ${i.message}` })) }
  }
  const campaign = parsed.data as Campaign
  const issues = checkInvariants(campaign)
  return issues.length === 0 ? { ok: true, campaign } : { ok: false, issues }
}

// ---- reducer inputs (C3) -----------------------------------------------------------------------

export type SortieReport = {
  sortieId: string // must equal c.pending.sortieId
  end: SortieEndKind
  success: boolean // sim verdict: primary objective AND authored recovery (never computed here)
  counts: Counts // enemy objects tagged by the assigned pilot AND destroyed by sortie end
  friendlyDestroyed: boolean // player-caused friendly destruction (combat.friendlyKills > 0)
  warnings: number // nonfatal friendly damage events
  authoredBonus: number // mission-declared completion bonus (A4 = 2500), applies only if success
  flight: {
    flightSeconds: number; maxAltitudeM: number; maxTrueAirspeedMps: number
    landing: 'trap' | 'field' | 'ditched' | 'water' | null
  }
  badgeId: string | null // mission badge id if the mission awards one
}
