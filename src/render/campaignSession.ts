/**
 * The shell's half of the campaign (plan F5B, Tasks 2 and 3): everything between the pure F5A core
 * (`src/campaign/`) and the screens. No DOM, no `localStorage`, no clock: the shell injects a
 * `StoragePort`, `now()`, ids and seeds, so the Node suite drives all of it.
 *
 * - `unscoredReason` decides whether a sortie is banked at all (Training, Single Missions, a Dev
 *   override): one function for the picker, the launch and the debrief.
 * - `buildReport` turns a world's outcome into the `SortieReport` F5A banks.
 * - `createSession` owns the open campaign: write-through saves, two latches (one bank per landing, one close per
 *   sortie; F5C), interrupted-sortie
 *   resolution that is actually persisted, a stale-revision guard, and the legacy-key purge.
 * Decisions this file carries out are recorded in docs/superpowers/plans/2026-10-15-f5b-headquarters.md.
 */
import {
  CHAPTER_IDS, CHAPTER_MISSIONS, LEGACY_ROSTER_KEY, SCORE_CLASSES, bankLeg, bankSortie, markSceneSeen, buildCatalog, campaignKey, createCampaign, describeChapter, isAuthored, deleteCampaign, exportCampaign, importCampaign, launchSortie,
  listCampaigns, loadCampaign, loadProfile, saveCampaign, saveProfile, zeroCounts,
  type Campaign, type ChapterRegistry, type Counts, type LaunchArgs, type Faction, type ImportResult, type IndexEntry, type LegReport, type LoadResult, type MissionDescriptor,
  type Result, type ScenarioFacts, type ScenarioRow, type SortieEndKind, type SortieFacts, type SortieReport, type StoragePort,
} from '../campaign/index.js'
import type { RecoveryOutcome } from './debrief.js'
import { launchWindows } from '../campaign/worldStates.js'
import { withMissionAircraft } from './hq/missionAircraft.js'
import type { TargetType } from '../sim/weapons/targetType.js'

// ---------------------------------------------------------------- the Dev rule (Task 2)

/** The picker's sections (D4). Only the first two are ever scored. */
export type PickerSection = 'campaign' | 'noncampaign' | 'training' | 'single'

export type UnscoredReason =
  | 'training' | 'single' | 'dev-scenario' | 'dev-rules' | 'ineligible-pilot' | 'dev-takeoff' | 'god-mode'

export type UnscoredInput = {
  readonly section: PickerSection
  /** The scenario row is a Dev-only test bed or fixture. */
  readonly devScenario: boolean
  /** `sortieIsDev(...)`: the aircraft or loadout needed Dev (enemy airplane, no stations, not carrier capable ...). */
  readonly devRules: boolean
  /** `eligibility(pilot, mission, aircraft)` was not ok. */
  readonly pilotIneligible: boolean
  /** A Dev-only takeoff time (late dusk, night) was chosen. */
  readonly devTakeoff: boolean
  readonly god: boolean
}

/** Why a sortie is NOT recorded, or `null` if it is scored (calls `launchSortie`, banks once). */
export function unscoredReason(i: UnscoredInput): UnscoredReason | null {
  if (i.section === 'training') return 'training'
  if (i.section === 'single') return 'single'
  if (i.devScenario) return 'dev-scenario'
  if (i.devRules) return 'dev-rules'
  if (i.pilotIneligible) return 'ineligible-pilot'
  if (i.devTakeoff) return 'dev-takeoff'
  if (i.god) return 'god-mode'
  return null
}

export const UNSCORED_LABEL: Readonly<Record<UnscoredReason, string>> = {
  training: 'Training: not scored',
  single: 'Single mission: not scored',
  'dev-scenario': 'Dev test bed: not recorded',
  'dev-rules': 'Dev rules used: not recorded',
  'ineligible-pilot': 'Pilot below the required rank (Dev): not recorded',
  'dev-takeoff': 'Dev takeoff time: not recorded',
  'god-mode': 'God mode: not recorded',
}

/** A campaign for testing, through the normal reducer: the same record a player would have. */
export function createDevCampaign(faction: Faction, ids: { id: string; seed: number }, now: string): Campaign {
  return createCampaign({ id: ids.id, faction, playerName: 'Dev', seed: ids.seed, now })
}

// ---------------------------------------------------------------- the catalog (Task 3a)

/** Just what `factsFromScenario` reads of a parsed scenario file (structural, so a test needs no full scenario). */
export type ScenarioLike = {
  readonly player: string
  readonly weather?: { readonly timeOfDay?: number | undefined } | undefined
  readonly aircraft: readonly {
    readonly id: string
    readonly spec: string
    readonly side?: 'allied' | 'axis' | undefined
    readonly pilot?: { readonly leader?: unknown } | undefined
  }[]
}

/**
 * The facts `buildCatalog` needs about one pooled scenario. THE one implementation: the shell and
 * `tests/fixtures/catalog.ts` both call it (enroll, don't clone). `nationOf` maps an aircraft spec id to
 * 'allied' | 'japanese' (the spec's `side`).
 */
export function factsFromScenario(s: ScenarioLike, nationOf: (specId: string) => 'allied' | 'japanese'): ScenarioFacts {
  const sideOf = (a: ScenarioLike['aircraft'][number]): 'allied' | 'axis' => a.side ?? (a.id === s.player ? 'allied' : 'axis')
  const player = s.aircraft.find((a) => a.id === s.player)
  if (player === undefined) throw new Error(`scenario has no player aircraft "${s.player}"`)
  const mine = sideOf(player)
  return {
    timeOfDay: s.weather?.timeOfDay ?? 12,
    nation: nationOf(player.spec),
    friendlies: s.aircraft
      .filter((a) => a.id !== s.player && sideOf(a) === mine)
      .map((a) => ({ spec: a.spec, follows: a.pilot?.leader !== undefined })),
  }
}

/** The shell's catalog: pooled picker rows plus each one's scenario file (fetched once, in parallel). */
export async function buildShellCatalog(
  rows: readonly ScenarioRow[],
  loadScenario: (id: string) => Promise<ScenarioLike>,
  nationOf: (specId: string) => 'allied' | 'japanese',
  chapters: ChapterRegistry = CHAPTER_MISSIONS,
): Promise<MissionDescriptor[]> {
  const pooled = rows.filter((r) => r.pool === 'noncampaign' && !r.dev)
  const facts = new Map<string, ScenarioFacts>()
  await Promise.all(pooled.map(async (r) => { facts.set(r.value, factsFromScenario(await loadScenario(r.value), nationOf)) }))
  // F10-0: an authored chapter whose scenario loads becomes a campaign descriptor; one whose file is missing or unreadable is not offered at all.
  const chapterMissions = (await Promise.all(CHAPTER_IDS.map(async (chapter) => {
    const entry = chapters[chapter]
    if (!isAuthored(entry)) return []
    try {
      const d = describeChapter(chapter, entry, factsFromScenario(await loadScenario(entry.scenario), nationOf))
      return d === null ? [] : [d]
    } catch {
      return []
    }
  }))).flat()
  return [...withMissionAircraft(buildCatalog(rows, (id) => facts.get(id)!)), ...chapterMissions]
}

// ---------------------------------------------------------------- the report (Task 3b)

/** Exhaustive on purpose: a new `RecoveryOutcome` fails to compile until it is mapped. */
export const SORTIE_END_OF: Readonly<Record<RecoveryOutcome, SortieEndKind>> = {
  landed: 'landed',
  ditched: 'ditched',
  killed: 'killed',
  rescued: 'rescued',
  captured: 'captured',
}

export type ReportInput = {
  readonly sortieId: string
  readonly end: SortieEndKind
  /** The mission verdict (`missionOutcome(...).result === 'success'` and not forfeit), never `badgeId !== null`. */
  readonly success: boolean
  /** The player's `AircraftCombat.tagCredits`. */
  readonly tagCredits: Readonly<Record<TargetType, number>>
  readonly friendlyKills: number
  readonly friendlyFire: boolean
  readonly authoredBonus: number
  readonly flight: SortieReport['flight']
  readonly badgeId: string | null
}

export function buildReport(i: ReportInput): SortieReport {
  const counts = Object.fromEntries(SCORE_CLASSES.map((k) => [k, Math.max(0, Math.round(i.tagCredits[k] ?? 0))])) as Counts
  return {
    sortieId: i.sortieId, end: i.end, success: i.success, counts,
    friendlyDestroyed: i.friendlyKills > 0, warnings: i.friendlyFire && i.friendlyKills === 0 ? 1 : 0,
    authoredBonus: i.authoredBonus, flight: i.flight, badgeId: i.badgeId,
  }
}

/** What an abandoned sortie reports: nothing earned. */
export const abandonReport = (sortieId: string): SortieReport => ({
  sortieId, end: 'abandoned', success: false, counts: zeroCounts(), friendlyDestroyed: false, warnings: 0, authoredBonus: 0,
  flight: { flightSeconds: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: null }, badgeId: null,
})

// ---------------------------------------------------------------- the launch seam (F6B / F7)

/**
 * F8C (Mark's ruling, 2026-10-16): the window each site is drawn in for the sortie that just launched. A scored chapter launch reads the stored
 * `Campaign.world` (the chapter's own window only for a key the world does not hold yet). `undefined` for everything else -- no campaign open,
 * no pending sortie, or a sortie with no chapter (Dev flights, Single Missions and Training never call `launchSortie` for a chapter) -- so
 * those keep today's behavior: sites draw `pre-invasion`, or the DEV `?siteState=`.
 */
export function launchWindowsOf(c: Campaign | null): Readonly<Record<string, string>> | undefined {
  const chapter = c?.pending?.chapterId ?? null
  return c === null || chapter === null ? undefined : launchWindows(c.world, chapter)
}

/** What `onNewGame` receives for a scored sortie instead of a bare pilot id. F6B adds `sights` to `facts`; F7 its seed. */
export type CampaignLaunch = { readonly pilotId: string; readonly tier: number; readonly facts: SortieFacts }

// ---------------------------------------------------------------- the session (Task 3c)

export type SessionDeps = {
  readonly port: StoragePort
  readonly now: () => string
  readonly newId: () => string
  readonly newSeed: () => number
}

export type SaveStatus = { readonly ok: true } | { readonly ok: false; readonly error: string }

export type BankOutcome = { readonly campaign: Campaign; readonly victory: boolean }

/** A landing report is cumulative for the sortie and also says which landing it is and where (F5C D4). */
export type LegBankInput = LegReport

export type Session = {
  list(): { ok: true; entries: IndexEntry[] } | { ok: false; issues: string[] }
  current(): Campaign | null
  open(id: string): LoadResult
  close(): void
  create(a: { faction: Faction; playerName: string }): { ok: true; campaign: Campaign } | { ok: false; error: string }
  createDev(faction: Faction): { ok: true; campaign: Campaign } | { ok: false; error: string }
  launch(a: Omit<LaunchArgs, 'now'> & { unscored: UnscoredReason | null }): Result<Campaign>
  /** Close the pending sortie (the one `bankSortie` call): banks what no landing banked, applies the end. */
  bank(report: SortieReport): Result<BankOutcome>
  /** Bank a landing at a friendly base (F5C D4): permanent, and the sortie stays open. A repeat of the same landing banks nothing. */
  bankLeg(report: LegBankInput): Result<BankOutcome>
  /** Abandon the pending sortie (Quit/Abandon): zero points, pilot survives. */
  abandon(): Result<BankOutcome>
  /** F9: record that a scene was played or skipped. Idempotent; the only thing a scene writes. No-op with no campaign open. */
  markSceneSeen(sceneId: string): void
  importText(text: string): ImportResult
  /** Store an imported campaign (a new one, or Replace after the shell asked). */
  commitImport(c: Campaign): SaveStatus
  remove(id: string): SaveStatus
  exportText(id?: string): string | null
  /** The stored text exactly as saved, even if it fails validation (the damaged-file row's "Export raw"). */
  raw(id: string): string | null
  /** The result of the most recent save, for the banner; `null` before any save. */
  lastSave(): SaveStatus | null
  rememberPlayerName(name: string): void
  lastPlayerName(): string | undefined
}

/** The pre-campaign roster is deleted, not migrated (ruling D1): removed once at boot, never read. */
export function purgeLegacyRoster(port: StoragePort): void {
  try { port.removeItem(LEGACY_ROSTER_KEY) } catch { /* storage blocked: nothing to purge */ }
}

export function createSession(deps: SessionDeps): Session {
  const { port } = deps
  let campaign: Campaign | null = null
  /** The revision this tab last loaded or saved, per campaign id: the stale-writer guard's baseline. */
  const base = new Map<string, number>()
  let last: SaveStatus | null = null
  const banked = new Set<string>()
  const bankedLegs = new Set<string>()

  const stored = (id: string): number | null => {
    const listed = listCampaigns(port)
    return listed.ok ? listed.entries.find((e) => e.id === id)?.revision ?? null : null
  }

  /** Write-through save with the stale guard. In-memory state is kept either way, so play can go on; the banner reports. */
  const persist = (c: Campaign): SaveStatus => {
    const have = stored(c.id)
    const mine = base.get(c.id)
    if (have !== null && mine !== undefined && have > mine) {
      last = { ok: false, error: `This campaign was changed in another tab or window (saved revision ${have}, this one is at ${mine}). Nothing was saved. Export it to keep this tab's progress, then reload.` }
      return last
    }
    const r = saveCampaign(port, c)
    if (r.ok) base.set(c.id, c.revision)
    last = r
    return r
  }

  const rejectedBank = (c: Campaign, message: string): Result<BankOutcome> =>
    ({ ok: false, campaign: c, error: { code: 'no-pending', message } })

  const doBank = (report: SortieReport): Result<BankOutcome> => {
    const c = campaign
    if (c === null) throw new Error('bank: no campaign is open')
    if (banked.has(report.sortieId)) return rejectedBank(c, 'This sortie was already banked.')
    const r = bankSortie(c, report, deps.now())
    if (!r.ok) return r
    banked.add(report.sortieId)
    campaign = r.value
    persist(r.value)
    return { ok: true, value: { campaign: r.value, victory: !c.progress.victory && r.value.progress.victory } }
  }

  const doBankLeg = (report: LegReport): Result<BankOutcome> => {
    const c = campaign
    if (c === null) throw new Error('bankLeg: no campaign is open')
    const key = `${report.sortieId}#${report.leg}`
    if (bankedLegs.has(key)) return rejectedBank(c, 'This landing was already banked.')
    const r = bankLeg(c, report, deps.now())
    if (!r.ok) return r
    bankedLegs.add(key)
    campaign = r.value
    persist(r.value)
    return { ok: true, value: { campaign: r.value, victory: !c.progress.victory && r.value.progress.victory } }
  }

  const adopt = (c: Campaign): { ok: true; campaign: Campaign } | { ok: false; error: string } => {
    const s = persist(c)
    if (!s.ok) return { ok: false, error: s.error }
    campaign = c
    return { ok: true, campaign: c }
  }

  return {
    markSceneSeen(sceneId) {
      const c = campaign
      if (c === null) return
      const next = markSceneSeen(c, sceneId)
      if (next === c) return
      campaign = next
      persist(next)
    },
    list: () => listCampaigns(port),
    current: () => campaign,
    open(id) {
      const r = loadCampaign(port, id, deps.now())
      if (!r.ok) return r
      // loadCampaign resolves a sortie left pending in memory only; persist that, or it is re-applied every load.
      const raw = port.getItem(campaignKey(id))
      const hadPending = raw !== null && (JSON.parse(raw) as { pending?: unknown }).pending != null
      base.set(id, stored(id) ?? r.campaign.revision)
      campaign = r.campaign
      if (hadPending && r.campaign.pending === null) persist(r.campaign)
      return r
    },
    close() { campaign = null },
    create({ faction, playerName }) {
      let c: Campaign
      try { c = createCampaign({ id: deps.newId(), faction, playerName, seed: deps.newSeed(), now: deps.now() }) } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
      const out = adopt(c)
      if (out.ok) this.rememberPlayerName(c.human.playerName)
      return out
    },
    createDev(faction) {
      return adopt(createDevCampaign(faction, { id: deps.newId(), seed: deps.newSeed() }, deps.now()))
    },
    launch(a) {
      const c = campaign
      if (c === null) throw new Error('launch: no campaign is open')
      if (a.unscored !== null) return { ok: false, campaign: c, error: { code: 'ineligible', message: `This sortie is not recorded (${UNSCORED_LABEL[a.unscored]}) and cannot be launched as a campaign sortie.` } }
      const r = launchSortie(c, { pilotId: a.pilotId, mission: a.mission, aircraft: a.aircraft, difficulty: a.difficulty, loadout: a.loadout, ...(a.facts === undefined ? {} : { facts: a.facts }), now: deps.now() })
      if (!r.ok) return r
      campaign = r.value
      persist(r.value)
      return r
    },
    bank: doBank,
    bankLeg: doBankLeg,
    abandon() {
      if (campaign === null) throw new Error('abandon: no campaign is open')
      const p = campaign.pending
      if (!p) return rejectedBank(campaign, 'No sortie is pending.')
      return doBank(abandonReport(p.sortieId))
    },
    importText(text) {
      const revisions: Record<string, number> = {}
      const listed = listCampaigns(port)
      if (listed.ok) for (const e of listed.entries) revisions[e.id] = e.revision
      return importCampaign(text, revisions)
    },
    commitImport(c) {
      // An import is a deliberate overwrite of whatever is stored under this id: the stale guard does not apply.
      base.delete(c.id)
      const r = persist(c)
      if (r.ok && campaign?.id === c.id) campaign = c
      return r
    },
    remove(id) {
      const r = deleteCampaign(port, id)
      if (r.ok && campaign?.id === id) campaign = null
      base.delete(id)
      last = r
      return r
    },
    exportText(id) {
      const target = id ?? campaign?.id
      if (target === undefined) return null
      if (campaign !== null && campaign.id === target) return exportCampaign(campaign)
      const r = loadCampaign(port, target, deps.now())
      if (!r.ok) return null
      return exportCampaign(r.campaign)
    },
    raw: (id) => { try { return port.getItem(campaignKey(id)) } catch { return null } },
    lastSave: () => last,
    rememberPlayerName(name) { saveProfile(port, { schemaVersion: 1, lastPlayerName: name }) },
    lastPlayerName: () => loadProfile(port).lastPlayerName,
  }
}
