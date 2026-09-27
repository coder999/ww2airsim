import type { World } from '../sim/loop.js'
import type { FriendlyFire } from '../sim/weapons/friendlyFire.js'
import type { DebriefModel } from './debrief.js'

/**
 * Dishonorable discharge (spec 2026-09-26-friendly-fire-design.md §5, §7).
 * The pure half of the feature on the render side. `main.ts` wraps each of
 * its three debrief builders in `withDischarge`, and the radio text is
 * exposed here for M2's radio line.
 */

export const DISCHARGE_HEADLINE = 'DISHONORABLE DISCHARGE'

/** What the radio says on the first friendly hit (spec §7). */
export const FRIENDLY_FIRE_RADIO = "Cease fire! Cease fire! You're hitting friendlies!"

/** The player's first friendly fire, or `null`. */
export function friendlyFireOf<M>(world: World<M>): FriendlyFire | null {
  return world.combat.aircraft[world.player]?.friendlyFire ?? null
}

const STRUCTURE_WORDS = { hangar: 'Hangar', tower: 'Control tower', aaa: 'AAA battery' } as const

/** A name for what was hit, in the debrief's own style: class name then id
 *  for a ship or airplane ("Essex-class fleet carrier cv-1"), and kind then
 *  base for a building ("Control tower, Tacloban"). The bare id is the
 *  fallback when the entity is gone from the world. */
export function friendlyTargetLabel<M>(world: World<M>, ff: FriendlyFire): string {
  if (ff.kind === 'ship') {
    const ship = world.ships.find((s) => s.id === ff.target)
    return ship === undefined ? ff.target : `${ship.spec.name} ${ship.id}`
  }
  if (ff.kind === 'aircraft') {
    const a = world.aircraft.find((x) => x.id === ff.target)
    return a === undefined ? ff.target : `${a.spec.name} ${a.id}`
  }
  const s = world.structures.find((x) => x.id === ff.target)
  if (s === undefined) return ff.target
  const base = world.airfields.find((a) => a.id === s.airfield)?.name ?? s.airfield
  return `${STRUCTURE_WORDS[s.kind]}, ${base}`
}

/**
 * The debrief for a flight in which the player damaged his own side, or
 * `model` itself if he did not. It works the same way whichever builder
 * made `model`: a landing, an impact (killed or ditched), or a destruction.
 *
 * `outcome` stays the physical recovery. The mission engine reads the same
 * one (`recoveryAgreement.test.ts`), and the discharge is an overlay on top
 * of it (ruling FF-5).
 *
 * - The flight scores zero (ruling FF-6, "forfeit the whole flight").
 * - The rows keep what was destroyed, at 0 points, so the form still shows
 *   what the pilot threw away.
 * - There is no Continue: the flight is over.
 */
export function withDischarge<M>(model: DebriefModel, world: World<M>): DebriefModel {
  const ff = friendlyFireOf(world)
  if (ff === null) return model
  const target = friendlyTargetLabel(world, ff)
  // `exactOptionalPropertyTypes`: the flight cannot go on, so the key is
  // dropped rather than set to undefined.
  const { continueLabel: _dropped, ...rest } = model
  return {
    ...rest,
    headline: DISCHARGE_HEADLINE,
    detail: `You fired on your own side (${target}). The flight is forfeit, and you are discharged from the service. ${model.detail}`,
    figures: [{ label: 'Friendly fire', value: target }, ...model.figures],
    score: { rows: model.score.rows.map((r) => ({ ...r, score: 0 })), total: 0, multiplier: 0 },
    discharge: { target },
  }
}

/** The radio line's message for the first friendly hit, keyed by the tick it
 *  happened on, or `null`. M2's radio feed merges this by tick (see
 *  docs/superpowers/notes/2026-09-26-friendly-fire-for-m2.md). */
export function friendlyFireRadio<M>(world: World<M>): { readonly tick: number; readonly text: string } | null {
  const ff = friendlyFireOf(world)
  return ff === null ? null : { tick: ff.tick, text: FRIENDLY_FIRE_RADIO }
}
