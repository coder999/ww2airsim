/**
 * Pure models for every headquarters screen (plan F5B, Task 4): what the screens show, computed from a
 * `Campaign` through the F5A queries and never by re-deriving rank, score or eligibility here. No DOM,
 * so the Node suite pins all of it; the DOM files only draw these.
 */
import {
  COMMAND_TITLE_POINTS, LIVE_ROSTER_SIZE, PILOT_TIER_POINTS, SCORE_CLASSES, abilities, adjustedScore, chaptersOf, commandTitleOf,
  formatName, lifeline, offers, rankLabel, rosterBonusOf, tierOf, COMMAND_TITLES,
  type Campaign, type ChapterId, type Faction, type IneligibleReason, type LogEntry, type MissionDescriptor, type Pilot,
  type PilotStatus, type Tier,
} from '../../campaign/index.js'
import { CHAPTER_INFO, chapterInfo } from './chapters.js'
import { formatAdjusted, formatFeet, formatHours, formatKnots, formatPoints } from './format.js'

export const SERVICE_NAME: Readonly<Record<Faction, string>> = { us: 'U.S. Navy', ja: 'Imperial Japanese Navy' }

/** The rank as shown: the USN abbreviation or, for the Japanese ladder (no abbreviation), the full name. */
export const rankShort = (faction: Faction, tier: Tier): string => rankLabel(faction, tier).abbrev ?? rankLabel(faction, tier).name
export const rankName = (faction: Faction, tier: Tier): string => rankLabel(faction, tier).name

/** Points still needed for the next tier, or `null` at the top. */
export function pointsToNextTier(points: number): { readonly next: Tier; readonly need: number; readonly fraction: number } | null {
  const tier = tierOf(points)
  if (tier === 6) return null
  const lo = PILOT_TIER_POINTS[tier - 1]!
  const hi = PILOT_TIER_POINTS[tier]!
  return { next: (tier + 1) as Tier, need: hi - points, fraction: (points - lo) / (hi - lo) }
}

export const END_LABEL = { landed: 'Landed', ditched: 'Ditched', killed: 'Killed', rescued: 'Rescued', captured: 'Captured', abandoned: 'Abandoned' } as const
export const FATE_LABEL: Readonly<Record<Exclude<PilotStatus, 'active'>, string>> = { kia: 'K.I.A.', pow: 'P.O.W.', discharged: 'DISCHARGED' }
const killsOf = (counts: Readonly<Record<string, number>>): number => Object.values(counts).reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------- headquarters first view

export type AbilityChip = { readonly label: 'DAY' | 'NIGHT' | 'ADV.' | 'SIGHTS' | 'COORD.' | 'FINALE'; readonly on: boolean }
/** Day is always on; the others come from `abilities(tier)` (GAMEPLAY.md ladder table). Higher chips appear only once reached. */
export function clearedFor(tier: Tier): readonly AbilityChip[] {
  const a = abilities(tier)
  const chips: AbilityChip[] = [{ label: 'DAY', on: true }, { label: 'NIGHT', on: a.night }, { label: 'ADV.', on: a.advanced }]
  if (a.sights) chips.push({ label: 'SIGHTS', on: true })
  if (a.coordinated) chips.push({ label: 'COORD.', on: true })
  if (a.finale) chips.push({ label: 'FINALE', on: true })
  return chips
}

export type PilotRow = {
  readonly id: string
  readonly name: string
  readonly kanji: string | null
  readonly tier: Tier
  readonly rankShort: string
  readonly rankName: string
  readonly points: number
  readonly pointsText: string
  readonly toNextText: string
  readonly sorties: number
  readonly cleared: readonly AbilityChip[]
  /** Always ACTIVE for the five (invariant `live-active`); the column exists for the archive's fates. */
  readonly status: 'ACTIVE'
}

export function pilotRow(c: Campaign, p: Pilot): PilotRow {
  const tier = tierOf(p.points)
  const next = pointsToNextTier(p.points)
  return {
    id: p.id, name: formatName(p.name, c.faction), kanji: p.name.kanji ?? null, tier,
    rankShort: rankShort(c.faction, tier), rankName: rankName(c.faction, tier),
    points: p.points, pointsText: formatPoints(p.points),
    toNextText: next === null ? 'Highest rank' : `${formatPoints(next.need)} to next`,
    sorties: p.sorties, cleared: clearedFor(tier), status: 'ACTIVE',
  }
}

export type CommanderModel = {
  readonly playerName: string
  readonly service: string
  readonly title: string
  readonly titleIndex: number
  readonly nextTitle: { readonly name: string; readonly need: number } | null
  readonly fraction: number
  readonly nextTitleText: string
  readonly points: number
  readonly pointsText: string
  readonly adjustedText: string
  readonly sorties: number
  readonly badgesText: string
  readonly lossesText: string
  readonly abandoned: number
  readonly warnings: number
  readonly rescues: number
  readonly chaptersText: string
  readonly victory: boolean
  /** What the five living pilots would add after a successful sortie (GAMEPLAY.md roster bonus). */
  readonly rosterBonus: number
}

/** Every badge the shipped catalog can award this faction; the denominator of "badges earned". */
const badgeTotal = (catalog: readonly MissionDescriptor[], faction: Faction): number =>
  new Set(catalog.filter((m) => m.faction === faction && m.badgeId !== null).map((m) => m.badgeId)).size

export function commanderModel(c: Campaign, catalog: readonly MissionDescriptor[]): CommanderModel {
  const h = c.human
  const idx = commandTitleOf(h.ledger.points)
  const nextPoints = COMMAND_TITLE_POINTS[idx + 1]
  const lo = COMMAND_TITLE_POINTS[idx]!
  const total = chaptersOf(c.faction).length
  const l = h.stats.losses
  return {
    playerName: h.playerName, service: SERVICE_NAME[c.faction], title: COMMAND_TITLES[idx], titleIndex: idx,
    nextTitle: nextPoints === undefined ? null : { name: COMMAND_TITLES[idx + 1]!, need: nextPoints - h.ledger.points },
    fraction: nextPoints === undefined ? 1 : (h.ledger.points - lo) / (nextPoints - lo),
    nextTitleText: nextPoints === undefined ? 'Highest command rating' : `${formatPoints(h.ledger.points)} of ${formatPoints(nextPoints)} for ${COMMAND_TITLES[idx + 1]}`,
    points: h.ledger.points, pointsText: formatPoints(h.ledger.points), adjustedText: formatAdjusted(adjustedScore(h)),
    sorties: h.ledger.sorties, badgesText: `${h.ledger.badges.length} of ${Math.max(h.ledger.badges.length, badgeTotal(catalog, c.faction))}`,
    lossesText: `${l.kia} K.I.A. · ${l.pow} P.O.W. · ${l.discharged} disch.`,
    abandoned: h.stats.abandoned, warnings: h.stats.warnings, rescues: h.stats.rescues,
    chaptersText: `${c.progress.completed.length} of ${total} complete`, victory: c.progress.victory,
    rosterBonus: rosterBonusOf(c.roster.live.map((id) => tierOf(c.pilots[id]!.points))),
  }
}

export type DepartmentId = 'choose' | 'chapter' | 'noncampaign' | 'archive' | 'exchange' | 'training' | 'switch'
export type Department = { readonly id: DepartmentId; readonly label: string; readonly sub: string; readonly primary: boolean }

/** The department list is DATA so F8 can add a "World" button and F9 an "Opening scene" without touching a layout. */
export const HQ_DEPARTMENTS: readonly { readonly id: DepartmentId; readonly label: string; readonly primary: boolean }[] = [
  { id: 'choose', label: 'Choose a mission', primary: true },
  { id: 'chapter', label: 'Chapter & briefing', primary: false },
  { id: 'noncampaign', label: 'Non-campaign missions', primary: false },
  { id: 'archive', label: 'Pilot archive', primary: false },
  { id: 'exchange', label: 'Save · export · import', primary: false },
  { id: 'training', label: 'Training grounds & single missions', primary: false },
  { id: 'switch', label: 'Switch campaign', primary: false },
]

export const archivedPilots = (c: Campaign): Pilot[] => {
  const live = new Set(c.roster.live)
  return Object.values(c.pilots).filter((p) => !live.has(p.id))
}

/** The campaign's current chapter, or `null` once the campaign is won. */
export const currentChapter = (c: Campaign): ChapterId | null => chaptersOf(c.faction)[c.progress.completed.length] ?? null

export type HqModel = {
  readonly service: string
  readonly commander: string
  readonly chapterText: string
  readonly revisionText: string
  readonly pilots: readonly PilotRow[]
  readonly dossier: CommanderModel
  readonly departments: readonly Department[]
  /** The no-deadlock query is non-null: some live pilot can fly some open non-campaign mission. */
  readonly lifeline: boolean
}

export function hqModel(c: Campaign, catalog: readonly MissionDescriptor[]): HqModel {
  const chapter = currentChapter(c)
  const open = offers(c, catalog)
  const flyable = open.filter((o) => o.mission.kind === 'noncampaign' && o.pilots.some((p) => p.eligible)).length
  const lost = archivedPilots(c).length
  const subs: Record<DepartmentId, string> = {
    choose: 'Mission first, then assign a pilot',
    chapter: chapter === null ? 'Campaign complete' : `${chapter} ${chapterInfo(chapter).title}, ${chapterInfo(chapter).date}`,
    noncampaign: `${flyable} open to this squadron`,
    archive: lost === 0 ? 'No pilots lost' : `${lost} lost`,
    exchange: 'Autosaved after every sortie',
    training: 'Unscored; no pilot record changes',
    switch: 'Personnel files',
  }
  return {
    service: SERVICE_NAME[c.faction], commander: c.human.playerName,
    chapterText: chapter === null ? 'Campaign complete' : `${chapter} · ${chapterInfo(chapter).title}`,
    revisionText: `Revision ${c.revision}`,
    pilots: c.roster.live.slice(0, LIVE_ROSTER_SIZE).map((id) => pilotRow(c, c.pilots[id]!)),
    dossier: commanderModel(c, catalog),
    departments: HQ_DEPARTMENTS.map((d) => ({ ...d, sub: subs[d.id] })),
    lifeline: lifeline(c, catalog) !== null,
  }
}

// ---------------------------------------------------------------- the pilot archive

export type ArchiveFilter = 'all' | 'kia' | 'pow' | 'discharged'
export type ArchiveRow = {
  readonly id: string; readonly name: string; readonly tier: Tier; readonly rankShort: string; readonly rankName: string
  readonly points: number; readonly pointsText: string; readonly sorties: number
  readonly fate: 'kia' | 'pow' | 'discharged'; readonly fateText: string; readonly mission: string; readonly date: string
}
export type ArchiveModel = {
  readonly rows: readonly ArchiveRow[]
  readonly counts: Readonly<Record<ArchiveFilter, number>>
  readonly empty: string | null
}

export function archiveModel(c: Campaign, filter: ArchiveFilter, missionLabel: (id: string) => string): ArchiveModel {
  const closed = archivedPilots(c).filter((p): p is Pilot & { status: 'kia' | 'pow' | 'discharged'; closure: NonNullable<Pilot['closure']> } => p.status !== 'active' && p.closure !== null)
  // Newest first by closure time, then by serial (later replacement first) so equal times are stable.
  closed.sort((a, b) => (a.closure.at < b.closure.at ? 1 : a.closure.at > b.closure.at ? -1 : b.serial - a.serial))
  const counts = { all: closed.length, kia: 0, pow: 0, discharged: 0 }
  for (const p of closed) counts[p.status]++
  const rows = closed.filter((p) => filter === 'all' || p.status === filter).map((p): ArchiveRow => {
    const tier = tierOf(p.points)
    return {
      id: p.id, name: formatName(p.name, c.faction), tier, rankShort: rankShort(c.faction, tier), rankName: rankName(c.faction, tier),
      points: p.points, pointsText: formatPoints(p.points), sorties: p.sorties, fate: p.status, fateText: FATE_LABEL[p.status],
      mission: p.closure.missionId === null ? '—' : missionLabel(p.closure.missionId), date: p.closure.at.slice(0, 10),
    }
  })
  return { rows, counts, empty: closed.length === 0 ? 'No pilots have left the squadron.' : rows.length === 0 ? 'No files under this heading.' : null }
}

// ---------------------------------------------------------------- the mission-first picker

export type PickerSection = 'campaign' | 'noncampaign' | 'training' | 'single'
export type PickerRow = {
  readonly id: string
  readonly label: string
  readonly section: PickerSection
  readonly scored: boolean
  readonly dev: boolean
  readonly badgeId: string | null
  /** For a mission: the lowest rank any of its aircraft needs, as shown ("LTJG+"), or null for none. */
  readonly needText: string | null
  readonly sub: string
  /** How many of the five can fly it. Unscored rows: all five (eligibility is not enforced). */
  readonly pilotsAble: number
  readonly nobody: boolean
}

/** What the picker needs of a scenario row (`ScenarioOption`'s fields, structurally, so this file stays render-free). */
export type PickerOption = {
  readonly value: string; readonly label: string; readonly kind: 'mission' | 'range'; readonly pool: 'noncampaign' | 'training' | 'single'
  readonly dev: boolean; readonly badge?: { readonly id: string; readonly name: string } | undefined
  readonly aircraft: string; readonly description?: string | undefined
}

const needTextFor = (faction: Faction, tier: Tier): string | null => (tier <= 1 ? null : `${rankShort(faction, tier)}+`)

export function pickerRows(c: Campaign, catalog: readonly MissionDescriptor[], options: readonly PickerOption[], dev: boolean, aircraftName: (id: string) => string = (id) => id): PickerRow[] {
  const open = offers(c, catalog)
  const byId = new Map(open.map((o) => [o.mission.id, o]))
  const rows: PickerRow[] = []
  // Campaign chapter(s) first (none exist until F10 supplies descriptors).
  for (const o of open.filter((x) => x.mission.kind === 'campaign')) {
    const info = o.mission.chapterId === null ? null : chapterInfo(o.mission.chapterId)
    const able = o.pilots.filter((p) => p.eligible).length
    rows.push({ id: o.mission.id, label: info === null ? o.mission.id : `${o.mission.chapterId} · ${info.title}`, section: 'campaign', scored: true, dev: false, badgeId: o.mission.badgeId, needText: needTextFor(c.faction, o.mission.minTier), sub: info === null ? '' : `${info.date} · ${info.label} · ${info.aircraft} · ${info.minRank} or better`, pilotsAble: able, nobody: able === 0 })
  }
  for (const opt of options) {
    if (opt.dev && !dev) continue
    if (opt.pool === 'noncampaign' && !opt.dev) {
      const o = byId.get(opt.value)
      if (o === undefined) continue // another faction's mission, or a locked one
      const able = o.pilots.filter((p) => p.eligible).length
      const lowestGap = Math.min(...o.pilots.map((p) => p.needTier ?? o.mission.minTier)) as Tier
      rows.push({ id: opt.value, label: opt.label, section: 'noncampaign', scored: true, dev: false, badgeId: opt.badge?.id ?? null, needText: needTextFor(c.faction, able === 0 ? lowestGap : o.mission.minTier), sub: `${aircraftName(opt.aircraft)}${o.mission.night ? ' · night' : ''}${o.mission.coordinated ? ' · coordinated operation' : ''}`, pilotsAble: able, nobody: able === 0 })
    }
  }
  // Unscored sections. The pooled missions are repeated under Single Missions (no rank gates); ranges and the three
  // qualifications are the Training Grounds; Dev adds the test beds and fixtures to each.
  for (const opt of options) {
    if (opt.dev && !dev) continue
    const mine = opt.pool === 'noncampaign' ? (opt.dev ? null : 'single') : opt.pool === 'training' ? 'training' : 'single'
    if (mine === null) continue
    // A pooled mission belongs to the player's own faction only; a Japanese campaign flies Field Patrol, not the American rows.
    if (opt.pool === 'noncampaign' && !catalog.some((m) => m.id === opt.value && m.faction === c.faction)) continue
    rows.push({ id: opt.value, label: opt.label, section: mine, scored: false, dev: opt.dev, badgeId: opt.badge?.id ?? null, needText: null, sub: opt.description ?? aircraftName(opt.aircraft), pilotsAble: LIVE_ROSTER_SIZE, nobody: false })
  }
  return rows
}

/**
 * F5C D1 (Mark, 2026-10-16): an unscored mission (Training, Single) has no pilot to assign, so the picker goes straight
 * to Flight Conditions at a fixed entry rank (`PRACTICE_TIER`, the Ensign the tutorial is flown at). Dev keeps the pilot
 * step on every row. A scored row always has it.
 */
export const skipsPilotStep = (row: Pick<PickerRow, 'scored'>, dev: boolean): boolean => !row.scored && !dev
export const PRACTICE_TIER: Tier = 1

export type PilotChoice = {
  readonly id: string; readonly name: string; readonly rankShort: string; readonly tier: Tier; readonly points: number; readonly pointsText: string
  readonly sorties: number; readonly eligible: boolean; readonly reason: IneligibleReason | null; readonly needText: string | null
}

const needLabel = (faction: Faction, needTier: Tier, points: number): string => {
  const more = PILOT_TIER_POINTS[needTier - 1]! - points
  return `NEEDS ${rankShort(faction, needTier).toUpperCase()}${more > 0 ? ` (${formatPoints(more)} MORE POINTS)` : ''}`
}

/** Step 2: the five living pilots for one mission. `scored` false shows eligibility without enforcing it (assumption A2). */
export function pilotChoices(c: Campaign, catalog: readonly MissionDescriptor[], missionId: string): PilotChoice[] {
  const o = offers(c, catalog).find((x) => x.mission.id === missionId)
  return c.roster.live.map((id, i) => {
    const p = c.pilots[id]!
    const tier = tierOf(p.points)
    const pe = o?.pilots[i]
    const eligible = pe?.eligible ?? true
    return {
      id, name: formatName(p.name, c.faction), rankShort: rankShort(c.faction, tier), tier, points: p.points, pointsText: formatPoints(p.points), sorties: p.sorties,
      eligible, reason: pe?.reason ?? null, needText: pe && !pe.eligible && pe.needTier !== undefined ? needLabel(c.faction, pe.needTier, p.points) : null,
    }
  })
}

// ---------------------------------------------------------------- chapter table

export type ChapterRow = {
  readonly id: ChapterId; readonly title: string; readonly date: string; readonly label: string; readonly aircraft: string; readonly minRank: string
  readonly state: 'complete' | 'current' | 'locked'; readonly attempts: string
}
export function chaptersModel(c: Campaign): readonly ChapterRow[] {
  const ids = chaptersOf(c.faction)
  const done = c.progress.completed.length
  return CHAPTER_INFO.filter((i) => i.faction === c.faction).map((i) => {
    const at = c.progress.attempts[i.id]
    const index = ids.indexOf(i.id)
    return {
      id: i.id, title: i.title, date: i.date, label: i.label, aircraft: i.aircraft, minRank: i.minRank,
      state: index < done ? 'complete' : index === done ? 'current' : 'locked',
      attempts: at === undefined ? '' : `${at.launched} launched · ${at.failed} failed · ${at.abandoned} abandoned`,
    }
  })
}

// ---------------------------------------------------------------- dossiers

/** `legs` (F5C D10): the landings the sortie banked at, "Tacloban +500 · Essex +300"; empty for a sortie that banked only at its end. */
export type LogRow = { readonly date: string; readonly mission: string; readonly aircraft: string; readonly outcome: string; readonly points: number; readonly kills: number; readonly time: string; readonly flags: string; readonly legs: string }
const logRow = (e: LogEntry, missionLabel: (id: string) => string, aircraftName: (id: string) => string): LogRow => ({
  date: e.at.slice(0, 10), mission: missionLabel(e.missionId), aircraft: aircraftName(e.aircraft), outcome: END_LABEL[e.end] + (e.success ? ' · success' : ''),
  points: e.points, kills: killsOf(e.counts), time: formatHours(e.flightSeconds),
  flags: e.flags.map((f) => (f === 'forfeit-abandoned' ? 'forfeit' : f === 'forfeit-friendly-destroyed' ? 'discharged' : 'warned')).join(', '),
  legs: e.legs.map((l) => `${l.place} +${formatPoints(l.points)}`).join(' · '),
})

const killRows = (counts: Readonly<Record<string, number>>): readonly (readonly [string, number])[] =>
  SCORE_CLASSES.map((k) => [k === 'aaa' ? 'AAA' : k.replace('-', ' ').replace(/^./, (s) => s.toUpperCase()), counts[k] ?? 0] as const)

export type PilotDossierModel = {
  readonly header: { readonly name: string; readonly kanji: string | null; readonly tier: Tier; readonly rankLine: string; readonly status: string; readonly points: number; readonly nextRank: string; readonly fraction: number }
  readonly closure: string | null
  readonly record: readonly (readonly [string, string])[]
  readonly kills: readonly (readonly [string, number])[]
  readonly badges: readonly string[]
  readonly badgesEmpty: string
  readonly log: readonly LogRow[]
  readonly logEmpty: string
}

export function pilotDossierModel(c: Campaign, p: Pilot, missionLabel: (id: string) => string, badgeName: (id: string) => string, aircraftName: (id: string) => string = (id) => id): PilotDossierModel {
  const tier = tierOf(p.points)
  const next = pointsToNextTier(p.points)
  const cr = p.career
  return {
    header: {
      name: formatName(p.name, c.faction), kanji: p.name.kanji ?? null, tier, rankLine: `${rankShort(c.faction, tier)}, ${rankName(c.faction, tier)}`,
      status: p.status === 'active' ? 'Active' : FATE_LABEL[p.status], points: p.points,
      nextRank: next === null ? 'Highest rank' : `Next: ${rankName(c.faction, next.next)} at ${formatPoints(PILOT_TIER_POINTS[next.next - 1]!)}`,
      fraction: next === null ? 1 : next.fraction,
    },
    closure: p.closure === null ? null : `${FATE_LABEL[p.closure.reason]} on ${p.closure.missionId === null ? 'an unknown mission' : missionLabel(p.closure.missionId)}, ${p.closure.at.slice(0, 10)}`,
    record: [
      ['Flight hours', formatHours(cr.flightSeconds)], ['Sorties launched', String(p.sorties)], ['Debriefs banked', String(p.banked)],
      ['Landings', `${cr.landings.trap} trap · ${cr.landings.field} field · ${cr.landings.ditched} ditched · ${cr.landings.water} water`],
      ['Rescues', String(cr.rescues)], ['Highest altitude', formatFeet(cr.maxAltitudeM)], ['Fastest speed', `${formatKnots(cr.maxTrueAirspeedMps)} TAS`],
    ],
    kills: killRows(p.counts), badges: p.badges.map(badgeName), badgesEmpty: 'No badges yet — awarded for completing mission objectives.',
    log: [...p.log].reverse().map((e) => logRow(e, missionLabel, aircraftName)), logEmpty: 'No sorties logged yet.',
  }
}

export type CommanderDossierModel = {
  readonly header: { readonly name: string; readonly service: string; readonly title: string; readonly points: number; readonly nextTitle: string; readonly fraction: number }
  readonly record: readonly (readonly [string, string])[]
  readonly kills: readonly (readonly [string, number])[]
  readonly badges: readonly string[]
  readonly badgesEmpty: string
  readonly log: readonly LogRow[]
  readonly logEmpty: string
}

export function commanderDossierModel(c: Campaign, catalog: readonly MissionDescriptor[], missionLabel: (id: string) => string, badgeName: (id: string) => string, aircraftName: (id: string) => string = (id) => id): CommanderDossierModel {
  const m = commanderModel(c, catalog)
  const s = c.human.stats
  return {
    header: { name: m.playerName, service: m.service, title: m.title, points: m.points, nextTitle: m.nextTitleText, fraction: m.fraction },
    record: [
      ['Cumulative score', m.pointsText], ['Adjusted score', `${m.adjustedText} per sortie`], ['Sorties launched', String(m.sorties)], ['Debriefs banked', String(c.human.ledger.banked)],
      ['Campaign badges', m.badgesText], ['Pilots lost', m.lossesText], ['Pilots rescued', String(s.rescues)], ['Sorties abandoned', String(s.abandoned)], ['Friendly-fire warnings', String(s.warnings)],
      ['Chapters', m.chaptersText + (m.victory ? ' · campaign won' : '')], ['Roster bonus on a successful sortie', `+${formatPoints(m.rosterBonus)}`],
    ],
    kills: killRows(c.human.ledger.counts), badges: c.human.ledger.badges.map(badgeName), badgesEmpty: 'No badges yet.',
    log: [...c.human.log].reverse().map((e) => logRow(e, missionLabel, aircraftName)), logEmpty: 'No sorties logged yet.',
  }
}

// ---------------------------------------------------------------- import conflict

export type ImportConflictModel = {
  readonly title: string
  readonly existing: string
  readonly incoming: string
  readonly warning: string
}
export function importConflictModel(existing: { revision: number; points: number }, incoming: Campaign): ImportConflictModel {
  return {
    title: `A campaign with this id is already saved (${incoming.human.playerName}, ${SERVICE_NAME[incoming.faction]}).`,
    existing: `Saved in this browser: revision ${existing.revision}, ${formatPoints(existing.points)} points`,
    incoming: `In the file: revision ${incoming.revision}, ${formatPoints(incoming.human.ledger.points)} points`,
    warning: incoming.revision < existing.revision
      ? 'The file is OLDER than the saved campaign. Replacing it loses the newer progress.'
      : incoming.revision === existing.revision ? 'The file is the same revision as the saved campaign.' : 'The file is newer than the saved campaign.',
  }
}
