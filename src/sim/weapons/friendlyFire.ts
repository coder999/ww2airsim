import type { Side } from '../sides.js'

/**
 * Friendly fire (spec 2026-09-26-friendly-fire-design.md §4). Data and pure
 * helpers only, so `combat.ts` needs just a few call-site lines. Imports
 * nothing but `sides.ts`.
 */

export type FriendlyFireKind = 'aircraft' | 'ship' | 'structure'

/** The FIRST damage an aircraft did to its own side: when, to what kind of
 *  entity, and which one. Set once, never overwritten, so its `tick` is the
 *  "first friendly hit" event the radio warning keys on (spec §7). */
export type FriendlyFire = {
  readonly tick: number
  readonly kind: FriendlyFireKind
  readonly target: string
}

/** Ship and structure sides by id, the non-aircraft half of the side table
 *  `advance` hands to `stepCombat` (aircraft sides are 7e's `sides`). */
export type TargetSides = {
  readonly ships: Readonly<Record<string, Side>>
  readonly structures: Readonly<Record<string, Side>>
}

/** Whether `owner`, an aircraft, shares a side with target `id` in `table`.
 *  False when either side is unknown, so a caller that passes no tables
 *  (every pre-friendly-fire caller) never sees a friendly target. */
export function ownSideTarget(
  sides: Readonly<Record<string, Side>> | null,
  table: Readonly<Record<string, Side>> | undefined,
  owner: string,
  id: string,
): boolean {
  const mine = sides?.[owner]
  return mine !== undefined && table !== undefined && mine === table[id]
}

/** `rec` with its first friendly fire recorded, or `rec` itself when one is
 *  already recorded (the first is kept, spec §4). */
export function withFriendlyFire<R extends { readonly friendlyFire: FriendlyFire | null }>(rec: R, ff: FriendlyFire): R {
  return rec.friendlyFire !== null ? rec : { ...rec, friendlyFire: ff }
}
