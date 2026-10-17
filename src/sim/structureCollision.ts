import type { AircraftEntity } from './loop.js'
import type { CombatState } from './weapons/combat.js'
import { withStructure } from './damage/model.js'
import { segmentBox } from './weapons/geometry.js'
import { bounceState } from './godMode.js'
import { COLLISION_ATTACKER_PREFIX } from './shipCollision.js'
import { add, scale, sub, v3, type Vec3 } from './math/vec3.js'
import type { StructureEntity } from './weapons/structures.js'

/**
 * Air-to-structure collision (F8A Task 4, plan decision 6, 2026-10-16): an airplane whose body origin passes into a
 * structure's hit box is destroyed, exactly as a ship collision destroys it (`shipCollision.ts`, same attacker prefix, so
 * the debrief and the wreck draw the same way). The box is the one bombs and bullets already use (`structureHit` in
 * combat.ts): the footprint rotated by the structure's heading, from the ground to its `halfSize.y * 2`. The structure
 * itself takes no damage (the plan authors damage per window; there is no new live damage), and a destroyed structure is
 * rubble with no box.
 *
 * Every number is an ESTIMATE; this object is the one place to tune it.
 */
export const STRUCTURE_COLLISION = {
  /** Meters added to the box's horizontal half sizes: the fuselage and wing root around the origin (ships use 2 as well). */
  bodyRadiusM: 2,
} as const

type Box = Pick<StructureEntity, 'position' | 'halfSize' | 'headingRad'>

/** The swept origin `from` -> `to` against the box: the fraction of the step at which it first enters, or null. A step that begins inside the box is no entry. */
export function structureContact(s: Box, from: Vec3, to: Vec3): number | null {
  const r = STRUCTURE_COLLISION.bodyRadiusM
  const reach = Math.hypot(s.halfSize.x + r, s.halfSize.z + r)
  if (Math.hypot(from.x - s.position.x, from.z - s.position.z) > reach + Math.hypot(to.x - from.x, to.z - from.z)) return null
  const c = Math.cos(s.headingRad), sn = Math.sin(s.headingRad)
  const local = (p: Vec3): Vec3 => {
    const d = sub(p, s.position)
    return v3(d.x * c + d.z * sn, d.y, -d.x * sn + d.z * c)
  }
  const t = segmentBox(local(from), local(to), v3(0, 0, 0), v3(s.halfSize.x + r, s.halfSize.y, s.halfSize.z + r))
  return t === null || t <= 0 ? null : t
}

export type StructureCollisionArgs<M> = {
  readonly tick: number
  /** The aircraft as they stood at the start of the tick, same order as `aircraft`. */
  readonly start: readonly AircraftEntity<M>[]
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly structures: readonly StructureEntity[]
  readonly combat: CombatState
  readonly player: string
  /** God mode is on: the player bounces and nobody is hurt. */
  readonly god: boolean
}

/**
 * One tick of air-to-structure collisions, after the aircraft have moved. Returns the SAME objects when nothing
 * collided (the bit-identity gate), which includes every world with no structures.
 */
export function stepStructureCollisions<M>(a: StructureCollisionArgs<M>): { readonly aircraft: readonly AircraftEntity<M>[]; readonly combat: CombatState } {
  if (a.structures.length === 0) return { aircraft: a.aircraft, combat: a.combat }
  let aircraft: AircraftEntity<M>[] | null = null
  let records = a.combat.aircraft
  let tallestM = 0
  for (const s of a.structures) tallestM = Math.max(tallestM, s.position.y + s.halfSize.y)
  a.aircraft.forEach((e, i) => {
    const rec = records[e.id]
    // Already down (wreck or crash) before this tick: nothing left to collide.
    if (rec === undefined || rec.damage.destroyedAt !== null || e.impact !== null) return
    const s0 = a.start[i]?.id === e.id ? a.start[i]!.state : e.state
    const from = s0.position, to = e.state.position
    if (from.y > tallestM && to.y > tallestM) return
    let hit: { s: StructureEntity; t: number } | null = null
    for (const s of a.structures) {
      if ((a.combat.structures[s.id]?.destroyedTick ?? null) !== null) continue
      const t = structureContact(s, from, to)
      if (t !== null && (hit === null || t < hit.t)) hit = { s, t }
    }
    if (hit === null) return
    aircraft ??= a.aircraft.slice()
    if (a.god && e.id === a.player) {
      aircraft[i] = { ...e, state: bounceState(e.state, hit.s.position.y + hit.s.halfSize.y), previous: e.state }
      return
    }
    // Destroyed outright, like any kill: the wreck falls, the explosion and debris draw. It stops against the wall.
    const mine = { ...records[e.id]!, damage: withStructure(records[e.id]!.damage, 0, a.tick, COLLISION_ATTACKER_PREFIX + hit.s.id) }
    records = { ...records, [e.id]: mine }
    const entry = add(from, scale(sub(to, from), hit.t))
    aircraft[i] = { ...e, state: { ...e.state, position: entry, velocity: v3(0, 0, 0) } }
  })
  if (aircraft === null && records === a.combat.aircraft) return { aircraft: a.aircraft, combat: a.combat }
  return { aircraft: aircraft ?? a.aircraft, combat: { ...a.combat, aircraft: records } }
}
