/**
 * Sides (AI 7c spec §4.1, Plan 7e). A scenario aircraft may say
 * `"side": "allied" | "axis"`; `sideOf` is the one place the default is
 * applied. The mission engine reads `side` and never redefines it (spec §8).
 * Imports nothing, so `weapons/` and `ai/` can both read it.
 */
export type Side = 'allied' | 'axis'
export type Sided = { readonly id: string; readonly side?: Side | undefined }

/** Absent `side`, the player is allied and every other aircraft axis: the
 *  rule that reproduces every scenario shipped before 7e (the gunnery
 *  range's parked Hellcats still score, `pursuer-1` is still hostile). */
export function sideOf(world: { readonly player: string }, a: Sided): Side {
  return a.side ?? (a.id === world.player ? 'allied' : 'axis')
}

/** Every aircraft's side, by id. `advance` builds this once per tick and
 *  hands the same table to the pilots and to kill credit. */
export function sidesOf(world: { readonly player: string }, aircraft: readonly Sided[]): Readonly<Record<string, Side>> {
  const out: Record<string, Side> = {}
  for (const a of aircraft) out[a.id] = sideOf(world, a)
  return out
}

/** Whether two ids are on the same side; false when either is unknown. */
export function sameSide(sides: Readonly<Record<string, Side>>, a: string, b: string): boolean {
  const s = sides[a]
  return s !== undefined && s === sides[b]
}
