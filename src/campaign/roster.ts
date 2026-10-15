import { drawName, nameKey } from './names.js'
import {
  CAMPAIGN_FORMAT, LIVE_ROSTER_SIZE, SCHEMA_VERSION, SCORING_RULES_VERSION, zeroCounts,
  type Campaign, type Faction, type Pilot,
} from './schema.js'

export const PLAYER_NAME_MAX = 40
export const isValidPlayerName = (s: string): boolean => s.trim().length > 0 && s.trim().length <= PLAYER_NAME_MAX

const newPilotRecord = (campaignId: string, serial: number, name: Pilot['name']): Pilot => ({
  id: `${campaignId}:p${serial}`, serial, name, status: 'active', closure: null,
  points: 0, sorties: 0, banked: 0, counts: zeroCounts(), badges: [],
  career: { flightSeconds: 0, landings: { trap: 0, field: 0, ditched: 0, water: 0 }, rescues: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0 },
  log: [],
})

/** Every full name already held by a live or archived pilot. */
export const takenNames = (c: Pick<Campaign, 'pilots'>): Set<string> => new Set(Object.values(c.pilots).map((p) => nameKey(p.name)))

/**
 * Draw one new Tier-1 pilot into `c.pilots` (mutates the working copy `c`, which reducers own).
 * Returns the new id. The name pool may be injected for exhaustion tests.
 */
export function addEntryPilot(c: Campaign, pool?: Parameters<typeof drawName>[3]): string {
  const draw = drawName(c.faction, c.nameDraws, takenNames(c), pool)
  const serial = c.serials.pilot + 1
  const pilot = newPilotRecord(c.id, serial, draw.name)
  c.serials = { ...c.serials, pilot: serial }
  c.nameDraws = draw.nameDraws
  c.pilots = { ...c.pilots, [pilot.id]: pilot }
  return pilot.id
}

/**
 * A new campaign: five Tier-1 pilots, a human with nothing, no progress. Deterministic for equal
 * inputs. `now` is accepted for the shell's call shape; the record carries no creation time
 * (no wall clock inside saved state, C6). Throws on a programmer error (empty id or name).
 */
export function createCampaign(args: { id: string; faction: Faction; playerName: string; seed: number; now: string }): Campaign {
  if (!args.id || args.id.includes(':')) throw new Error('campaign id must be non-empty and contain no ":"')
  if (!isValidPlayerName(args.playerName)) throw new Error(`player name must be 1..${PLAYER_NAME_MAX} characters`)
  const c: Campaign = {
    format: CAMPAIGN_FORMAT, schemaVersion: SCHEMA_VERSION, scoringRulesVersion: SCORING_RULES_VERSION,
    id: args.id, revision: 0, faction: args.faction,
    human: {
      playerName: args.playerName.trim(),
      ledger: { points: 0, sorties: 0, banked: 0, counts: zeroCounts(), badges: [] },
      stats: { losses: { kia: 0, pow: 0, discharged: 0 }, rescues: 0, abandoned: 0, warnings: 0 },
      log: [],
    },
    roster: { live: ['', '', '', '', ''] },
    pilots: {},
    nameDraws: { seed: args.seed >>> 0, next: 0 },
    serials: { pilot: 0, sortie: 0 },
    progress: { completed: [], victory: false, attempts: {} },
    world: {}, scenesSeen: [], pending: null,
  }
  const ids: string[] = []
  for (let i = 0; i < LIVE_ROSTER_SIZE; i++) ids.push(addEntryPilot(c))
  c.roster = { live: ids as Campaign['roster']['live'] }
  return c
}
