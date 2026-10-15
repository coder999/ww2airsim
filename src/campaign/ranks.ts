import {
  COMMAND_TITLE_POINTS,
  PILOT_TIER_POINTS,
  type Faction,
  type Human,
  type Tier,
} from './schema.js'

/** Pilot rank tier from banked pilot points. Derived, never stored (C1). */
export function tierOf(points: number): Tier {
  let tier = 1
  for (let i = 1; i < PILOT_TIER_POINTS.length; i++) if (points >= PILOT_TIER_POINTS[i]!) tier = i + 1
  return tier as Tier
}

/** Human-player command title index (0 = Squadron Commander .. 4 = Fleet Air Commander). */
export function commandTitleOf(points: number): 0 | 1 | 2 | 3 | 4 {
  let title = 0
  for (let i = 1; i < COMMAND_TITLE_POINTS.length; i++) if (points >= COMMAND_TITLE_POINTS[i]!) title = i
  return title as 0 | 1 | 2 | 3 | 4
}

/** Competitive standing only; unlocks nothing (GAMEPLAY.md, "Campaign and player identity"). */
export const COMMAND_TITLES = [
  'Squadron Commander',
  'Air Group Commander',
  'Wing Commander',
  'Task Force Air Commander',
  'Fleet Air Commander',
] as const

const RANKS: Record<Faction, readonly { abbrev?: string; name: string }[]> = {
  us: [
    { abbrev: 'ENS', name: 'Ensign' },
    { abbrev: 'LTJG', name: 'Lieutenant (junior grade)' },
    { abbrev: 'LT', name: 'Lieutenant' },
    { abbrev: 'LCDR', name: 'Lieutenant Commander' },
    { abbrev: 'CDR', name: 'Commander' },
    { abbrev: 'CAPT', name: 'Captain' },
  ],
  ja: [
    { name: 'Kaigun Shōi' },
    { name: 'Kaigun Chūi' },
    { name: 'Kaigun Taii' },
    { name: 'Kaigun Shōsa' },
    { name: 'Kaigun Chūsa' },
    { name: 'Kaigun Taisa' },
  ],
}

export function rankLabel(faction: Faction, tier: Tier): { abbrev?: string; name: string } {
  return RANKS[faction][tier - 1]!
}

/** What a tier unlocks (GAMEPLAY.md ladder table). `abilities(tier)` is how F6B gates the sights. */
export function abilities(tier: Tier): { night: boolean; advanced: boolean; sights: boolean; coordinated: boolean; finale: boolean } {
  return { night: tier >= 2, advanced: tier >= 3, sights: tier >= 4, coordinated: tier >= 5, finale: tier >= 6 }
}

/** Raw points divided by score-eligible sorties launched; derived, displayed to one decimal, never stored (C1). */
export function adjustedScore(h: Human): number {
  return h.ledger.sorties === 0 ? 0 : h.ledger.points / h.ledger.sorties
}
