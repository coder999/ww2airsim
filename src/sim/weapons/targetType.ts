/**
 * Master spec §8's point-table rows, and the vocabulary
 * `AircraftCombat.killsByType`/`roster.ts`'s `PilotRecord.killsByType` share
 * with it. Not every value is reachable yet -- see this plan's own "Ruling"
 * section in docs/superpowers/plans/2026-09-23-plan9-meta-game.md for which
 * and why ('runway' has no producing code path today).
 */
export type TargetType =
  | 'fighter' | 'bomber' | 'cruiser' | 'battleship'
  | 'aaa' | 'runway' | 'building' | 'carrier'

export const TARGET_TYPES: readonly TargetType[] = [
  'fighter', 'bomber', 'cruiser', 'battleship', 'aaa', 'runway', 'building', 'carrier',
]

export function zeroKillsByType(): Readonly<Record<TargetType, number>> {
  return Object.fromEntries(TARGET_TYPES.map((t) => [t, 0])) as Readonly<Record<TargetType, number>>
}
