/**
 * Canonical export / import of one campaign (plan F5A, C6). Deterministic: no wall clock inside the
 * body, keys sorted, so `export(import(export(c)))` is byte-for-byte `export(c)`. The digest is a
 * corruption check, not security.
 */
import { canonicalStringify, fnv1a64 } from '../flightRecorder/canonical.js'
import {
  CAMPAIGN_FORMAT, SCHEMA_VERSION, SCORING_RULES_VERSION, validateCampaign,
  type Campaign,
} from './schema.js'

export type ExportBody = {
  format: typeof CAMPAIGN_FORMAT; schemaVersion: number; scoringRulesVersion: number; campaign: Campaign; digest: string
}

export const digestOf = (c: Campaign): string => fnv1a64(canonicalStringify(c))

export function exportCampaign(c: Campaign): string {
  const body: ExportBody = {
    format: CAMPAIGN_FORMAT, schemaVersion: SCHEMA_VERSION, scoringRulesVersion: SCORING_RULES_VERSION, campaign: c, digest: digestOf(c),
  }
  return canonicalStringify(body)
}

/** The suggested file name; the date lives here and never inside the body. */
export const exportFileName = (c: Campaign, date: string): string => `ww2airsim-${c.faction === 'us' ? 'american' : 'japanese'}-${c.id}-r${c.revision}-${date}.json`

export type Loaded = { ok: true; campaign: Campaign } | { ok: false; issues: string[] }

/**
 * Parsed JSON to a campaign of THIS build: refuses a newer schema outright (never downgrades), refuses
 * an older one (F5C: no migration), then validates every shape and invariant.
 * Shared by import and by storage's load, so a saved campaign and an imported one pass the same gate.
 */
export function campaignFromJson(raw: unknown): Loaded {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, issues: ['not a campaign record'] }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, issues: ['campaign has no valid schemaVersion'] }
  if (version > SCHEMA_VERSION) {
    return { ok: false, issues: [`This campaign was saved by a newer version of the game (schema ${version}); this build reads up to schema ${SCHEMA_VERSION}. Update the game, or keep the file.`] }
  }
  // Older versions are not upgraded (F5C D12, 2026-10-16): version 1 predates multi-leg sorties and is refused.
  if (version < SCHEMA_VERSION) {
    return { ok: false, issues: [`This campaign was saved by an older version of the game (schema ${version}); this build reads schema ${SCHEMA_VERSION} only and does not convert older campaigns. Keep the file or delete it.`] }
  }
  const v = validateCampaign(raw)
  return v.ok ? { ok: true, campaign: v.campaign } : { ok: false, issues: v.issues.map((i) => `${i.name}: ${i.message}`) }
}

export type ImportResult =
  | { ok: true; campaign: Campaign; conflict: { existingRevision: number; incomingRevision: number } | null }
  | { ok: false; issues: string[] }

/**
 * Import always ADDS a career (ruling D4). If a campaign with the same id already exists the core does not
 * decide: it returns the two revisions as `conflict`, and the shell asks replace or keep-both.
 * `existingRevisions` maps campaign id to the stored revision.
 */
export function importCampaign(text: string, existingRevisions: Readonly<Record<string, number>> = {}): ImportResult {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, issues: ['This file is not valid JSON, so it cannot be a campaign export.'] } }
  if (Array.isArray(raw)) {
    return { ok: false, issues: ['This looks like a pre-campaign pilot roster (ww2airsim.roster.v1), not a campaign. Those pilots cannot be imported; start a new campaign.'] }
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, issues: ['This file is not a campaign export.'] }
  const body = raw as Partial<ExportBody>
  if (body.format !== CAMPAIGN_FORMAT) return { ok: false, issues: [`This file is not a ww2airsim campaign export (format "${String(body.format)}").`] }
  if (typeof body.schemaVersion !== 'number') return { ok: false, issues: ['The export has no schemaVersion.'] }
  if (body.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, issues: [`This export was made by a newer version of the game (schema ${body.schemaVersion}); this build reads up to schema ${SCHEMA_VERSION}.`] }
  }
  if (body.schemaVersion < SCHEMA_VERSION) {
    return { ok: false, issues: [`This export was made by an older version of the game (schema ${body.schemaVersion}); this build reads schema ${SCHEMA_VERSION} only and does not convert older campaigns.`] }
  }
  const loaded = campaignFromJson(body.campaign)
  if (!loaded.ok) return loaded
  const issues: string[] = []
  if (body.digest !== digestOf(loaded.campaign)) issues.push('The export is damaged: its digest does not match its contents.')
  if (body.scoringRulesVersion !== SCORING_RULES_VERSION) issues.push(`The export uses scoring rules version ${String(body.scoringRulesVersion)}; this build uses ${SCORING_RULES_VERSION}.`)
  if (issues.length > 0) return { ok: false, issues }
  const existing = existingRevisions[loaded.campaign.id]
  return {
    ok: true, campaign: loaded.campaign,
    conflict: existing === undefined ? null : { existingRevision: existing, incomingRevision: loaded.campaign.revision },
  }
}
