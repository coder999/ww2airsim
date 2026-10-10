import type { AircraftEntity, ShipEntity } from './loop.js'
import { massKg } from './flight/model.js'
import { bounceState } from './godMode.js'
import { ownSideTarget, withFriendlyFire } from './weapons/friendlyFire.js'
import { damageShip, type CombatState } from './weapons/combat.js'
import { withStructure } from './damage/model.js'
import { segmentBox } from './weapons/geometry.js'
import { supportedContact } from './ground.js'
import { groundUnder } from './world/ground.js'
import { shipVelocity, type ShipSpec } from './world/ships.js'
import type { Deck } from './world/deck.js'
import type { TerrainField } from './world/terrain.js'
import { add, length, scale, sub, v3, type Vec3 } from './math/vec3.js'
import type { Side } from './sides.js'
import type { TargetSides } from './weapons/friendlyFire.js'

/**
 * Air-to-ship collision (Mark, 2026-10-10): an airplane that collides with a ship is destroyed,
 * and the ship takes damage. Docs: docs/handoff/2026-10-10-ship-collision.md.
 *
 * A collision is the airplane's body origin inside a ship's volume while NOT supported on that
 * ship's flight deck. The volume is the hull box (length by beam, sea to `deckHeightM`, the same
 * box a bullet meets in combat.ts) plus one coarse superstructure box by role. Every number below
 * is an ESTIMATE; this object is the one place to tune them.
 */
export const COLLISION = {
  /** Metres added to a volume's horizontal half sizes: the fuselage and wing root around the
   *  origin. Nothing is added vertically, so a pass above a volume's top is a pass. */
  bodyRadiusM: 2,
  /** Hull points lost = refHullDamage * (mass / refMassKg) * (relative speed / refSpeedMps)^2,
   *  kinetic-energy scaling, clamped to floorFraction..capFraction of refHullDamage. */
  /** A 500 lb AN-M65 bomb hit on a hull (content/aircraft/f6f-hellcat.json `damage`); a test pins it. */
  refHullDamage: 120,
  /** A Hellcat with about half a tank (empty 4,190 kg plus fuel). */
  refMassKg: 4500,
  /** Attack speed, m/s (about 224 mph). */
  refSpeedMps: 100,
  floorFraction: 0.25,
  capFraction: 2.5,
} as const

/**
 * Coarse superstructure, one box per role, in the ship frame (+x bow, +z starboard). Fractions of
 * `lengthM` and `beamM` for the center and half sizes; `topAboveDeckM` is the top above the deck.
 * Its bottom is the hull's top. Purely a small allowance so a low pass through a bridge counts.
 */
export type SuperstructureBox = {
  readonly x: number; readonly z: number; readonly halfLen: number; readonly halfBeam: number; readonly topAboveDeckM: number
}
export const SUPERSTRUCTURE: Readonly<Record<ShipSpec['role'], SuperstructureBox>> = {
  // The island stands on the starboard edge, so a landing on the centerline clears it.
  carrier: { x: 0.08, z: 0.34, halfLen: 0.04, halfBeam: 0.14, topAboveDeckM: 15 },
  battleship: { x: 0, z: 0, halfLen: 0.12, halfBeam: 0.3, topAboveDeckM: 24 },
  cruiser: { x: 0, z: 0, halfLen: 0.12, halfBeam: 0.3, topAboveDeckM: 18 },
  escort: { x: 0, z: 0, halfLen: 0.15, halfBeam: 0.35, topAboveDeckM: 7 },
  merchant: { x: -0.1, z: 0, halfLen: 0.1, halfBeam: 0.3, topAboveDeckM: 10 },
}

/** Name of the debrief's cause: `damage.attacker` for an airplane that hit a ship. */
export const COLLISION_ATTACKER_PREFIX = 'collision:'

type Volume = { readonly cx: number; readonly cz: number; readonly hx: number; readonly hz: number; readonly topM: number }

/** A ship's volumes in its own frame, heights above the sea. Hull first. */
export function shipVolumes(spec: Pick<ShipSpec, 'role' | 'lengthM' | 'beamM' | 'deckHeightM'>): readonly Volume[] {
  const r = COLLISION.bodyRadiusM
  const s = SUPERSTRUCTURE[spec.role]
  return [
    { cx: 0, cz: 0, hx: spec.lengthM / 2 + r, hz: spec.beamM / 2 + r, topM: spec.deckHeightM },
    { cx: s.x * spec.lengthM, cz: s.z * spec.beamM, hx: s.halfLen * spec.lengthM + r, hz: s.halfBeam * spec.beamM + r, topM: spec.deckHeightM + s.topAboveDeckM },
  ]
}

type Pose = { readonly position: Vec3; readonly headingRad: number }
const local = (p: Vec3, pose: Pose): Vec3 => {
  const d = sub(p, pose.position), h = pose.headingRad
  return v3(d.x * Math.sin(h) - d.z * Math.cos(h), d.y, d.x * Math.cos(h) + d.z * Math.sin(h))
}

export type ShipContact = { readonly t: number; readonly topM: number }

/** The earliest contact of the swept origin `from` -> `to` with the ship's volumes, or null. `from`
 *  is read against the ship's pose at the start of the tick, `to` against its pose now. */
export function shipContact(ship: ShipEntity, from: Vec3, to: Vec3): ShipContact | null {
  const a = local(from, ship.previous), b = local(to, ship.state)
  let best: ShipContact | null = null
  for (const v of shipVolumes(ship.spec)) {
    const t = segmentBox(a, b, v3(v.cx, v.topM / 2, v.cz), v3(v.hx, v.topM / 2, v.hz))
    if (t !== null && (best === null || t < best.t)) best = { t, topM: v.topM }
  }
  return best
}

/** Hull points a collision costs: see `COLLISION`. */
export function collisionDamage(massKgNow: number, relativeSpeedMps: number): number {
  const c = COLLISION
  const raw = c.refHullDamage * (massKgNow / c.refMassKg) * (relativeSpeedMps / c.refSpeedMps) ** 2
  return Math.min(c.capFraction * c.refHullDamage, Math.max(c.floorFraction * c.refHullDamage, raw))
}

/** Each ship's bounding circle (squared) and tallest top, for the cheap early-out. */
const reach2 = (s: ShipSpec): number => (Math.hypot(s.lengthM / 2, s.beamM / 2) + 8 + COLLISION.bodyRadiusM) ** 2
const tallest = (s: ShipSpec): number => s.deckHeightM + SUPERSTRUCTURE[s.role].topAboveDeckM

export type CollisionArgs<M> = {
  readonly tick: number
  /** The aircraft as they stood at the start of the tick, same order as `aircraft`. */
  readonly start: readonly AircraftEntity<M>[]
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly ships: readonly ShipEntity[]
  readonly combat: CombatState
  readonly terrain: TerrainField | null
  readonly decks: readonly Deck[]
  readonly sides: Readonly<Record<string, Side>> | null
  readonly targetSides: TargetSides | null
  readonly player: string
  /** God mode is on: the player bounces and nobody is hurt. */
  readonly god: boolean
}

/**
 * One tick of air-to-ship collisions, after the aircraft have moved and combat has run. Returns
 * the SAME arrays/objects when nothing collided (the bit-identity gate).
 */
export function stepShipCollisions<M>(a: CollisionArgs<M>): { readonly aircraft: readonly AircraftEntity<M>[]; readonly combat: CombatState } {
  const afloat = a.ships.filter((s) => (a.combat.ships[s.id]?.sinkingFraction ?? 0) < 1)
  if (afloat.length === 0) return { aircraft: a.aircraft, combat: a.combat }
  let aircraft: AircraftEntity<M>[] | null = null
  let ships = a.combat.ships
  let records = a.combat.aircraft
  const tallestM = Math.max(...afloat.map((s) => tallest(s.spec)))

  a.aircraft.forEach((e, i) => {
    const rec = records[e.id]
    // Already down (wreck or crash) before this tick: nothing left to collide. A deck impact made THIS tick still costs the ship.
    if (rec === undefined || rec.damage.destroyedAt !== null) return
    const arrived = e.impact !== null && e.impact.tick === a.tick && e.impact.surface === 'deck'
    if (e.impact !== null && !arrived) return
    const s0 = a.start[i]?.id === e.id ? a.start[i]!.state : e.state
    const from = s0.position
    const to = e.state.position
    if (from.y > tallestM && to.y > tallestM) return
    const player = a.god && e.id === a.player
    let hit: { ship: ShipEntity; contact: ShipContact } | null = null
    for (const ship of afloat) {
      const p = ship.state.position
      if ((to.x - p.x) ** 2 + (to.z - p.z) ** 2 > reach2(ship.spec) && (from.x - ship.previous.position.x) ** 2 + (from.z - ship.previous.position.z) ** 2 > reach2(ship.spec)) continue
      const contact = shipContact(ship, from, to)
      if (contact !== null && (hit === null || contact.t < hit.contact.t)) hit = { ship, contact }
    }
    if (hit === null) return
    // On a flight deck on purpose (a trap, a take-off roll, parked) is not a collision.
    const ground = groundUnder(a.terrain, a.decks, to.x, to.z)
    if (!arrived && ground !== null && ground.surface === 'deck'
      && supportedContact(e.spec, e.state, ground.heightM, 'deck', ground.velocity)) return

    aircraft ??= a.aircraft.slice()
    if (player) {
      // God mode: a bounce, like the ground. Nobody is hurt.
      aircraft[i] = { ...e, state: bounceState(e.state, hit.contact.topM), previous: e.state }
      return
    }
    const { ship } = hit
    const was = ships[ship.id]
    const relative = length(sub(s0.velocity, shipVelocity(ship.state.headingRad, ship.state.speedMps)))
    if (was !== undefined) {
      const next = damageShip(was, ship.spec.hullHp, collisionDamage(massKg(e.spec, e.state), relative), a.tick, e.id)
      if (next !== was) ships = { ...ships, [ship.id]: next }
    }
    let mine = records[e.id]!
    // Own side: physical all the same, and the first such damage is on the record (friendly-fire spec §4).
    if (was !== undefined && was.destroyedTick === null && ownSideTarget(a.sides, a.targetSides?.ships, e.id, ship.id)) {
      mine = withFriendlyFire(mine, { tick: a.tick, kind: 'ship', target: ship.id })
    }
    if (!arrived) {
      // Destroyed outright, like any kill: the wreck falls, the explosion and debris draw. It stops against the hull.
      mine = { ...mine, damage: withStructure(mine.damage, 0, a.tick, COLLISION_ATTACKER_PREFIX + ship.id) }
      const entry = add(from, scale(sub(to, from), hit.contact.t))
      aircraft[i] = { ...e, state: { ...e.state, position: entry, velocity: shipVelocity(ship.state.headingRad, ship.state.speedMps) } }
    }
    records = { ...records, [e.id]: mine }
  })

  if (aircraft === null && ships === a.combat.ships && records === a.combat.aircraft) return { aircraft: a.aircraft, combat: a.combat }
  return { aircraft: aircraft ?? a.aircraft, combat: { ...a.combat, aircraft: records, ships } }
}
