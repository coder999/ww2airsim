/**
 * Test fixture for campaign consumers (F5A Task 13): builds a campaign THROUGH THE REAL REDUCERS,
 * never by hand-building JSON, so a fixture can only be a state the game can reach.
 *
 *   const c = makeCampaign({ faction: 'ja', tiers: [1, 1, 3, 5, 6], chapter: 2 })
 *
 * `tiers` are the five live pilots' rank tiers in slot order; `chapter` is how many chapters are
 * already completed (0..6); `points` sets the human's raw points to at least this much by one more
 * grind. Chapters are completed by a pilot who is then lost, so a high chapter with an all-Ensign
 * roster (a veteran roster that died) is buildable too.
 */
import {
  PILOT_TIER_POINTS, bankSortie, chaptersOf, createCampaign, launchSortie, validateCampaign, zeroCounts,
  type Campaign, type Faction, type MissionDescriptor, type SortieReport, type Tier,
} from '../../src/campaign/index.js'

export const FIXTURE_NOW = '2026-10-14T12:00:00Z'

const reportFor = (c: Campaign, over: Partial<SortieReport>): SortieReport => ({
  sortieId: c.pending!.sortieId, end: 'landed', success: false, counts: zeroCounts(), friendlyDestroyed: false, warnings: 0, authoredBonus: 0,
  flight: { flightSeconds: 0, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: null }, badgeId: null, ...over,
})

const unwrap = (r: ReturnType<typeof launchSortie>): Campaign => {
  if (!r.ok) throw new Error(`fixture: ${r.error.code}: ${r.error.message}`)
  return r.value
}

/** One launch + bank through the reducers; throws if either is rejected. */
export function flyThrough(c: Campaign, slot: number, m: MissionDescriptor, over: Partial<SortieReport> = {}, aircraft = m.aircraftIds[0]!): Campaign {
  const launched = unwrap(launchSortie(c, { pilotId: c.roster.live[slot]!, mission: m, aircraft: { id: aircraft, advanced: false }, difficulty: 'easy', loadout: 'clean', now: FIXTURE_NOW }))
  return unwrap(bankSortie(launched, reportFor(launched, over), FIXTURE_NOW))
}

const grindMission = (faction: Faction, authoredBonus: number): MissionDescriptor => ({
  id: 'fixture-grind', faction, kind: 'noncampaign', chapterId: null, minTier: 1, night: false, coordinated: false,
  aircraftIds: [faction === 'us' ? 'f6f-hellcat' : 'a6m2-zero'], scoreEligible: true, authoredBonus, badgeId: null,
})

/** Bank exactly `points` to the pilot in `slot` in one sortie. */
export function raisePilotTo(c: Campaign, slot: number, points: number): Campaign {
  const have = c.pilots[c.roster.live[slot]!]!.points
  if (points <= have) return c
  const m = grindMission(c.faction, points - have)
  return flyThrough(c, slot, m, { success: true, authoredBonus: m.authoredBonus })
}

export function makeCampaign(args: {
  faction: Faction
  tiers?: readonly [Tier, Tier, Tier, Tier, Tier]
  /** Chapters already completed, 0..6. */
  chapter?: number
  /** Raise the human's raw points to at least this. */
  points?: number
  id?: string
  seed?: number
}): Campaign {
  const { faction, tiers = [1, 1, 1, 1, 1], chapter = 0 } = args
  let c = createCampaign({ id: args.id ?? `fx-${faction}`, faction, playerName: 'Fixture', seed: args.seed ?? 7, now: FIXTURE_NOW })
  const chapters = chaptersOf(faction)
  if (chapter > 0) {
    c = raisePilotTo(c, 0, PILOT_TIER_POINTS[5])
    for (let i = 0; i < chapter; i++) {
      const id = chapters[i]!
      const m: MissionDescriptor = {
        id: `fixture-${id}`, faction, kind: 'campaign', chapterId: id, minTier: 1, night: false, coordinated: false,
        aircraftIds: [faction === 'us' ? 'f6f-hellcat' : 'a6m2-zero'], scoreEligible: true, authoredBonus: 0, badgeId: null,
      }
      c = flyThrough(c, 0, m, { success: true })
    }
    // the chapter-clearing veteran is lost, leaving whatever roster `tiers` asks for
    c = flyThrough(c, 0, grindMission(faction, 0), { end: 'killed' })
  }
  tiers.forEach((tier, slot) => { c = raisePilotTo(c, slot, PILOT_TIER_POINTS[tier - 1]!) })
  if (args.points !== undefined && c.human.ledger.points < args.points) c = raisePilotTo(c, 0, c.pilots[c.roster.live[0]!]!.points + (args.points - c.human.ledger.points))
  const v = validateCampaign(c)
  if (!v.ok) throw new Error(`fixture produced an invalid campaign: ${JSON.stringify(v.issues)}`)
  return c
}
