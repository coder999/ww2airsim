export type Faction = 'us' | 'ja'
export type Tier = 1 | 2 | 3 | 4 | 5 | 6
export const PILOT_TIER_POINTS = [0, 2500, 7500, 15000, 25000, 40000] as const
export const COMMAND_TITLE_POINTS = [0, 20000, 50000, 90000, 140000] as const
export const LIVE_ROSTER_SIZE = 5
export type Human = { ledger: { points: number; sorties: number } }
