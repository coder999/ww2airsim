/**
 * Persistence over an injected, `Storage`-shaped port (plan F5A, C5). The shell passes
 * `window.localStorage`; tests pass a Map. One key per career, so one corrupt career cannot take
 * another down. Loading never repairs: a record that fails validation is left untouched in storage and
 * reported, never reset to empty (the old `loadRoster` returned `[]` on any error).
 */
import { z } from 'zod'
import { canonicalStringify } from '../flightRecorder/canonical.js'
import { campaignFromJson } from './exchange.js'
import { resolveInterrupted } from './bank.js'
import { SCHEMA_VERSION, type Campaign, type Faction } from './schema.js'

export type StoragePort = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const INDEX_KEY = 'ww2airsim.campaigns.v1'
export const PROFILE_KEY = 'ww2airsim.profile.v1'
/** The discarded pre-campaign roster (ruling D1). Nothing here reads or writes it. */
export const LEGACY_ROSTER_KEY = 'ww2airsim.roster.v1'
export const campaignKey = (id: string): string => `ww2airsim.campaign.${id}.v1`

export type IndexEntry = { id: string; faction: Faction; playerName: string; revision: number; points: number }
const entryZ = z.object({
  id: z.string().min(1), faction: z.enum(['us', 'ja']), playerName: z.string(),
  revision: z.number().int().nonnegative(), points: z.number().int().nonnegative(),
}).strict()
const indexZ = z.object({ schemaVersion: z.literal(SCHEMA_VERSION), campaigns: z.array(entryZ) }).strict()

export type SaveResult = { ok: true } | { ok: false; error: string }
export type ListResult = { ok: true; entries: IndexEntry[] } | { ok: false; issues: string[] }
export type LoadResult = { ok: true; campaign: Campaign } | { ok: false; id: string; issues: string[] }

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const entryOf = (c: Campaign): IndexEntry => ({ id: c.id, faction: c.faction, playerName: c.human.playerName, revision: c.revision, points: c.human.ledger.points })

export function listCampaigns(port: StoragePort): ListResult {
  let text: string | null
  try { text = port.getItem(INDEX_KEY) } catch (e) { return { ok: false, issues: [`storage is unavailable: ${message(e)}`] } }
  if (text === null) return { ok: true, entries: [] }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, issues: ['the campaign index is not valid JSON'] } }
  const parsed = indexZ.safeParse(raw)
  if (!parsed.success) {
    const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion
    if (typeof version === 'number' && version > SCHEMA_VERSION) return { ok: false, issues: [`the campaign index was saved by a newer version of the game (schema ${version})`] }
    return { ok: false, issues: parsed.error.issues.map((i) => `index ${i.path.join('.') || '(root)'}: ${i.message}`) }
  }
  return { ok: true, entries: parsed.data.campaigns }
}

/**
 * Writes the campaign, then its index entry. A failure of either is returned, never swallowed: the shell
 * shows a visible warning (silent loss is not allowed for a career save). An index that cannot be read is
 * left alone rather than overwritten, so a damaged index is never replaced by a one-entry list.
 */
export function saveCampaign(port: StoragePort, c: Campaign): SaveResult {
  const listed = listCampaigns(port)
  if (!listed.ok) return { ok: false, error: `Could not read the campaign list: ${listed.issues.join('; ')}` }
  try {
    port.setItem(campaignKey(c.id), canonicalStringify(c))
  } catch (e) {
    return { ok: false, error: `Could not save the campaign (storage full or blocked): ${message(e)}` }
  }
  const entries = [...listed.entries.filter((x) => x.id !== c.id), entryOf(c)]
  try {
    port.setItem(INDEX_KEY, canonicalStringify({ schemaVersion: SCHEMA_VERSION, campaigns: entries }))
  } catch (e) {
    return { ok: false, error: `The campaign was saved but the list could not be updated: ${message(e)}` }
  }
  return { ok: true }
}

/** parse -> validate -> migrate -> resolve a sortie left pending (D7). The stored record is never modified here. */
export function loadCampaign(port: StoragePort, id: string, now: string): LoadResult {
  let text: string | null
  try { text = port.getItem(campaignKey(id)) } catch (e) { return { ok: false, id, issues: [`storage is unavailable: ${message(e)}`] } }
  if (text === null) return { ok: false, id, issues: ['no such saved campaign'] }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, id, issues: ['the saved campaign is not valid JSON'] } }
  const loaded = campaignFromJson(raw)
  if (!loaded.ok) return { ok: false, id, issues: loaded.issues }
  if (loaded.campaign.id !== id) return { ok: false, id, issues: [`the record stored under "${id}" belongs to campaign "${loaded.campaign.id}"`] }
  return { ok: true, campaign: resolveInterrupted(loaded.campaign, now) }
}

export function deleteCampaign(port: StoragePort, id: string): SaveResult {
  const listed = listCampaigns(port)
  if (!listed.ok) return { ok: false, error: listed.issues.join('; ') }
  try {
    port.removeItem(campaignKey(id))
    port.setItem(INDEX_KEY, canonicalStringify({ schemaVersion: SCHEMA_VERSION, campaigns: listed.entries.filter((x) => x.id !== id) }))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: message(e) }
  }
}

/** The only cross-campaign state: a remembered name. No progression ever lives here. */
export type Profile = { schemaVersion: 1; lastPlayerName?: string }
const profileZ = z.object({ schemaVersion: z.literal(1), lastPlayerName: z.string().max(40).optional() }).strict()
export function loadProfile(port: StoragePort): Profile {
  try {
    const text = port.getItem(PROFILE_KEY)
    const parsed = text === null ? null : profileZ.safeParse(JSON.parse(text))
    return parsed?.success ? (parsed.data as Profile) : { schemaVersion: 1 }
  } catch { return { schemaVersion: 1 } }
}
export function saveProfile(port: StoragePort, p: Profile): SaveResult {
  try { port.setItem(PROFILE_KEY, canonicalStringify(p)); return { ok: true } } catch (e) { return { ok: false, error: message(e) } }
}
