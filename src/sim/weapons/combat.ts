import type { AircraftSpec, StoreType } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import { createRng } from '../rng.js'
import { qFromAxisAngle, qRotate } from '../math/quat.js'
import { add, sub, scale, length, normalize, v3, ZERO, type Vec3 } from '../math/vec3.js'
import { SEA_LEVEL_M, type TerrainField } from '../world/terrain.js'
import { groundUnder } from '../world/ground.js'
import { insideDeck, type Deck } from '../world/deck.js'
import { onGround } from '../ground.js'
import { engineCountOf, healthyDamage, damageFromHit, withStructure, type Damage } from '../damage/model.js'
import {
  damageFromStructuralOverload,
  initialStructuralStress,
  measureStructuralStress,
  type StructuralStress,
} from '../damage/overload.js'
import { inBody, segmentBox, tupleVector } from './geometry.js'
import type { CombatSpec, DamageSystem } from './schema.js'
import { gunBallistics } from './gunTypes.js'
import { emptyStores, type StoresState } from './stores.js'
import { healthyStructureDamage, type StructureDamage, type StructureEntity } from './structures.js'
import { shipTargetType, zeroKillsByType, type TargetType } from './targetType.js'
import { appendImpacts, type CombatImpact, type ImpactSurface } from './impacts.js'
import { sameSide, type Side } from '../sides.js'
import { ownSideTarget, withFriendlyFire, type FriendlyFire, type FriendlyFireKind, type TargetSides } from './friendlyFire.js'
import { bayDoorsShut } from '../bayDoors.js'
import { floodFrom, hitSide, type FloodState } from './flooding.js'

export const MAX_PROJECTILES = 4096
export type GunState = { readonly ammo: number; readonly cooldownS: number; readonly shots: number }
export type CombatAircraft = {
  readonly id: string; readonly spec: AircraftSpec; readonly state: AircraftState
  readonly previous: AircraftState; readonly controls: Controls; readonly impact: unknown | null
}
export type CombatShip = {
  readonly id: string
  readonly spec: {
    readonly lengthM: number; readonly beamM: number; readonly deckHeightM: number
    readonly hullHp: number; readonly role: 'carrier' | 'cruiser' | 'battleship' | 'escort' | 'merchant'
  }
  readonly state: { readonly position: Vec3; readonly headingRad: number }
  readonly previous: { readonly position: Vec3; readonly headingRad: number }
}
export type AircraftCombat = {
  readonly guns: readonly GunState[]
  readonly damage: Damage
  readonly stress: StructuralStress
  readonly shots: number; readonly hits: number; readonly kills: number
  readonly killsByType: Readonly<Record<TargetType, number>>
  readonly lastHit: { readonly tick: number; readonly position: Vec3 } | null
  /** The aircraft whose round, rocket or blast last damaged this one, or
   *  `null` if nothing has. What `creditDownedAircraft` credits when this
   *  aircraft goes down WITHOUT a killing hit -- a crash, a ditching, or an
   *  overload break-up -- after being hit (Mark, 2026-09-25). Separate from
   *  `damage.attacker`, which stays "the hit that destroyed it" because the
   *  player's debrief reads it that way. */
  readonly lastHitBy: string | null
  /** Plan 7e (spec §4.3): rounds and kills this aircraft landed on its OWN
   *  side, the player and its own blast included. Counted here and never in
   *  `hits`, `kills` or `killsByType` (ruling W1), so Plan 9's score cannot
   *  reward a teamkill. Only counted when `stepCombat` is given sides. */
  readonly friendlyHits: number
  /** Since the friendly-fire plan (2026-09-26, ruling FF-4) this also counts
   *  own-side ships sunk and structures destroyed, never `shipsSunk`,
   *  `structuresDestroyed` or `killsByType`. */
  readonly friendlyKills: number
  /** The first damage this aircraft did to its own side, by round, bomb,
   *  rocket or blast: an aircraft, ship or structure that was not already
   *  destroyed, never itself. Set once, never overwritten. It is what
   *  discharges the player (friendly-fire spec §4-§5). Only recorded when
   *  `stepCombat` is given sides. */
  readonly friendlyFire: FriendlyFire | null
  readonly stores: StoresState
  readonly shipsSunk: number
  readonly structuresDestroyed: number
  /** Cumulative, never falling -- what the release audio cue follows
   *  (Plan 6b Task 10). `stores` cannot serve that purpose: it FALLS as
   *  ordnance leaves the racks/rails, so a rise on it is a refill, not a
   *  release. `rocketsFired` counts individual rockets, matching the
   *  `stores.rockets` decrement exactly -- a release can be a pair. */
  readonly bombsDropped: number
  readonly rocketsFired: number
  /** Cumulative: this aircraft's torpedoes that met the water outside their drop envelope, or met
   *  anything else first, and broke up. What the HUD's "TORPEDO BROKE UP" notice follows. */
  readonly torpedoesBrokeUp: number
}
export type Projectile = {
  readonly owner: string; readonly id: number; readonly position: Vec3; readonly previous: Vec3
  readonly velocity: Vec3; readonly lifeS: number; readonly tracer: boolean
  readonly kind: 'round' | 'bomb' | 'rocket' | 'torpedo'
  readonly ageS: number
  /** A torpedo released outside its drop envelope: it breaks up when it meets the water. */
  readonly dud?: true
  /** A torpedo in the water: meters run since entry. Absent while it falls. */
  readonly runM?: number
  /** The firing mount's `guns[].type`, for a typed mount only. Absent on
   *  every round an untyped mount fires, so those rounds are unchanged. */
  readonly gunType?: string
}
export type ShipDamage = {
  readonly hp: number; readonly fire: number
  readonly destroyedTick: number | null; readonly attacker: string | null
  readonly sinkingFraction: number
} & FloodState
export const healthyShipDamage = (hp: number): ShipDamage =>
  ({ hp, fire: 0, destroyedTick: null, attacker: null, sinkingFraction: 0 })
export type CombatState = {
  readonly aircraft: Readonly<Record<string, AircraftCombat>>
  readonly projectiles: readonly Projectile[]
  readonly nextId: number
  /** Serialized PRNG cursor. Each emitted shot advances it exactly twice. */
  readonly rngState: number
  readonly poolSaturated: number
  readonly ships: Readonly<Record<string, ShipDamage>>
  readonly structures: Readonly<Record<string, StructureDamage>>
  /** Every detonation, and every bomb/rocket `lifeS` expiry, oldest first,
   *  bounded (`IMPACT_RING_CAPACITY`). Written here, read only by the
   *  renderer's effects (ordnance-and-effects design §3.1). */
  readonly impacts: readonly CombatImpact[]
}
export function createCombat(
  aircraft: readonly CombatAircraft[],
  stores: Readonly<Record<string, StoresState>> = {},
  ships: readonly { readonly id: string; readonly hullHp: number }[] = [],
  structures: readonly { readonly id: string; readonly hp: number }[] = [],
  seed = 1944,
): CombatState {
  return {
    aircraft: Object.fromEntries(aircraft.map(a => [a.id, {
      guns: a.spec.combat?.guns.map(g => ({ ammo: g.rounds, cooldownS: 0, shots: 0 })) ?? [],
      damage: healthyDamage(engineCountOf(a.spec)), stress: initialStructuralStress(a.state, a.spec.limits),
      shots: 0, hits: 0, kills: 0, lastHit: null, lastHitBy: null, killsByType: zeroKillsByType(), friendlyHits: 0, friendlyKills: 0, friendlyFire: null,
      stores: stores[a.id] ?? emptyStores, shipsSunk: 0, structuresDestroyed: 0,
      bombsDropped: 0, rocketsFired: 0, torpedoesBrokeUp: 0,
    }])),
    projectiles: [], nextId: 1, rngState: seed >>> 0, poolSaturated: 0,
    ships: Object.fromEntries(ships.map(s => [s.id, healthyShipDamage(s.hullHp)])),
    structures: Object.fromEntries(structures.map(s => [s.id, healthyStructureDamage(s.hp)])),
    impacts: [],
  }
}

// mulberry32's existing closure advances by this integer before each sample.
// Recreating it at the serialized cursor gives exactly its next sample.
const randomFrom = (cursor: number): { value: number; state: number } =>
  ({ value: createRng(cursor)(), state: (cursor + 0x6d2b79f5) >>> 0 })

/** Exact constant-gravity position; stable quadratic drag relative to air. */
export function flyProjectile(p: Projectile, dt: number, wind: Vec3 | null, dragPerM: number): Projectile {
  const air = sub(p.velocity, wind ?? ZERO)
  const slowed = scale(air, 1 / (1 + dragPerM * length(air) * dt))
  const velocity = add(add(slowed, wind ?? ZERO), v3(0, -9.80665 * dt, 0))
  const position = add(p.position, scale(add(p.velocity, velocity), dt / 2))
  return { ...p, previous: p.position, position, velocity, lifeS: p.lifeS - dt }
}

/**
 * A rocket motor's contribution over one tick, exactly (spec §3.3: "exact
 * closed form per tick, not Euler").
 *
 * The motor is a constant `burnDeltaVMps / burnS` along the rocket's own
 * axis, which this treats as its CURRENT velocity direction: the rocket
 * leaves the rail pointing down the gunsight line (`releaseRockets` below
 * launches it along that line, not along the flight path), and nothing here
 * models a rocket that yaws afterwards, so the direction the motor pushes is
 * the direction the rocket is already going. A tick straddling burnout gets
 * only the slice before it, so burnout is exact at any `dt`.
 *
 * A rocket with no speed at all has no direction either; the burn is skipped
 * rather than normalizing a zero vector into NaNs (master spec §9).
 */
export function burnedVelocity(v: Vec3, burnDeltaVMps: number, burnS: number, ageS: number, dt: number): Vec3 {
  const remaining = Math.min(dt, burnS - ageS)
  if (remaining <= 0 || length(v) < 1e-9) return v
  return add(v, scale(normalize(v), (burnDeltaVMps / burnS) * remaining))
}

/** Seconds from the killing blow to the bottom (spec §3.6). */
export const SINK_SECONDS = 90

/** Bounded terrain samples at <= 2 m, then bisection of the first crossing.
 * Aircraft and hulls use swept boxes below; they never use endpoint samples.
 *
 * Terrain only. Flight decks are `deckHit`'s: queried through `groundUnder`
 * with its decks, a deck read as solid all the way down to the sea, and
 * because the deck (32.9 m on an Essex) overhangs the hull (28.3 m beam) a
 * round from abeam below the deck edge died on that column and never reached
 * the hull (measured 2026-09-26; Mark: the Essex "should be able to be
 * damaged by rounds that hit below flight deck"). */
function groundHit(from: Vec3, to: Vec3, terrain: TerrainField | null): number | null {
  if (terrain === null) return null
  const delta = sub(to, from)
  const steps = Math.max(1, Math.ceil(length(delta) / 2))
  const below = (t: number): boolean => {
    const p = add(from, scale(delta, t))
    const g = groundUnder(terrain, [], p.x, p.z)
    return g !== null && p.y <= g.heightM
  }
  if (below(0)) return 0
  for (let i = 1; i <= steps; i++) {
    if (!below(i / steps)) continue
    let lo = (i - 1) / steps, hi = i / steps
    for (let j = 0; j < 8; j++) {
      const mid = (lo + hi) / 2
      if (below(mid)) hi = mid
      else lo = mid
    }
    return hi
  }
  return null
}

/**
 * The water surface, which is NOT in the heightfield: `heightAt` returns the
 * seabed, so `groundHit` alone lets a bomb fall through the sea to the bottom
 * wherever the bathymetry is negative, and never fires at all where there is
 * no terrain field yet. Spec §3.4 lists "sea level" as its own candidate for
 * exactly that reason. Closed form, not sampled: the surface is a plane.
 */
function seaHit(from: Vec3, to: Vec3, terrain: TerrainField | null): number | null {
  if (from.y <= SEA_LEVEL_M || to.y > SEA_LEVEL_M) return null
  const t = (from.y - SEA_LEVEL_M) / (from.y - to.y)
  const point = add(from, scale(sub(to, from), t))
  const under = groundUnder(terrain, [], point.x, point.z)
  // Land above the waterline here: `groundHit` owns that contact. Under a
  // deck's overhang the water is still water: the hull box, which starts at
  // the waterline, is what a round meets before it (Mark: "not below water
  // line").
  return under === null || under.heightM <= SEA_LEVEL_M ? t : null
}

/** Where the segment crosses a flight deck's surface from above, closed form
 *  like `seaHit`: the first such crossing inside a deck rectangle, with the
 *  deck's ship id. Only the top surface stops a round; below it, the hull box
 *  (`hullHit`) is what the round meets. */
function deckHit(from: Vec3, to: Vec3, decks: readonly Deck[]): { readonly t: number; readonly shipId: string } | null {
  let best: { t: number; shipId: string } | null = null
  for (const deck of decks) {
    const top = deck.center.y
    if (from.y <= top || to.y > top) continue
    const t = (from.y - top) / (from.y - to.y)
    const point = add(from, scale(sub(to, from), t))
    if (insideDeck(deck, point.x, point.z) && (best === null || t < best.t)) best = { t, shipId: deck.shipId }
  }
  return best
}

/** A structure's box is axis-aligned in its airfield's frame, so a contact
 *  test rotates the segment into that frame -- `worldToLocal`'s convention in
 *  `world/airfields.ts`, which is what `buildStructures` measured `halfSize`
 *  in (`x` across the building, `z` along it). */
function structureHit(from: Vec3, to: Vec3, s: StructureEntity): number | null {
  const c = Math.cos(s.headingRad), sn = Math.sin(s.headingRad)
  const local = (p: Vec3): Vec3 => {
    const d = sub(p, s.position)
    return v3(d.x * c + d.z * sn, d.y, -d.x * sn + d.z * c)
  }
  return segmentBox(local(from), local(to), ZERO, v3(s.halfSize.x, s.halfSize.y, s.halfSize.z))
}

/** A hull's box, in the ship frame the round loop has always used. */
function hullHit(from: Vec3, to: Vec3, ship: CombatShip, start: number): number | null {
  const h = ship.state.headingRad
  const local = (p: Vec3, center: Vec3): Vec3 => {
    const d = sub(p, center)
    return v3(d.x * Math.sin(h) - d.z * Math.cos(h), d.y, d.x * Math.cos(h) + d.z * Math.sin(h))
  }
  const began = add(ship.previous.position, scale(sub(ship.state.position, ship.previous.position), start))
  return segmentBox(local(from, began), local(to, ship.state.position),
    v3(0, ship.spec.deckHeightM / 2, 0), v3(ship.spec.lengthM / 2, ship.spec.deckHeightM / 2, ship.spec.beamM / 2))
}

/** A hull box's center in world metres -- what blast measures its distance to. */
const hullCenter = (ship: CombatShip): Vec3 => add(ship.state.position, v3(0, ship.spec.deckHeightM / 2, 0))

/** Where a projectile stops, and on what. `t` is the fraction along the
 *  projectile's own swept segment for EVERY kind, which is what lets the
 *  nearest one be chosen by comparing distances rather than by trying the
 *  kinds in a fixed order (spec §3.4). */
type Contact =
  | { readonly t: number; readonly kind: 'ground'; readonly sea: boolean }
  | { readonly t: number; readonly kind: 'aircraft'; readonly aircraft: CombatAircraft; readonly system: DamageSystem; readonly engine?: number }
  | { readonly t: number; readonly kind: 'ship'; readonly ship: CombatShip }
  | { readonly t: number; readonly kind: 'structure'; readonly structure: StructureEntity }

function nearestContact(
  p: Projectile, start: number, aircraft: readonly CombatAircraft[], ships: readonly CombatShip[],
  structures: readonly StructureEntity[], terrain: TerrainField | null, decks: readonly Deck[],
): Contact | null {
  const candidates: Contact[] = []
  const ground = groundHit(p.previous, p.position, terrain)
  if (ground !== null) candidates.push({ t: ground, kind: 'ground', sea: false })
  const sea = seaHit(p.previous, p.position, terrain)
  if (sea !== null) candidates.push({ t: sea, kind: 'ground', sea: true })
  // A flight deck is part of its ship: a round on the deck, overhang
  // included, hits the ship. A deck whose ship is no longer afloat is ground.
  const onDeck = deckHit(p.previous, p.position, decks)
  if (onDeck !== null) {
    const ship = ships.find((s) => s.id === onDeck.shipId)
    candidates.push(ship === undefined ? { t: onDeck.t, kind: 'ground', sea: false } : { t: onDeck.t, kind: 'ship', ship })
  }
  for (const a of aircraft) {
    if (a.id === p.owner || a.spec.combat === undefined) continue
    const began = add(a.previous.position, scale(sub(a.state.position, a.previous.position), start))
    // Endpoints are relative to the corresponding target pose; the chord
    // approximates rotation within one 60 Hz tick, not translation.
    const from = inBody(a.previous.attitude, sub(p.previous, began))
    const to = inBody(a.state.attitude, sub(p.position, a.state.position))
    for (const z of a.spec.combat.zones) {
      const t = segmentBox(from, to, tupleVector(z.center), tupleVector(z.halfSize))
      if (t !== null) candidates.push({ t, kind: 'aircraft', aircraft: a, system: z.system, ...(z.engine === undefined ? {} : { engine: z.engine }) })
    }
  }
  for (const ship of ships) {
    const t = hullHit(p.previous, p.position, ship, start)
    if (t !== null) candidates.push({ t, kind: 'ship', ship })
  }
  for (const structure of structures) {
    const t = structureHit(p.previous, p.position, structure)
    if (t !== null) candidates.push({ t, kind: 'structure', structure })
  }
  let nearest: Contact | null = null
  for (const c of candidates) if (nearest === null || c.t < nearest.t) nearest = c
  return nearest
}

/** What a contact was ON, for the impacts ring only -- no damage rule reads
 *  this. The sea plane is always water; the heightfield/deck contact asks
 *  `groundUnder` at the contact point, whose `surface` already tells a deck
 *  from land from seabed ('water'). */
function contactSurface(c: Contact, point: Vec3, terrain: TerrainField | null, decks: readonly Deck[]): ImpactSurface {
  switch (c.kind) {
    case 'aircraft': return 'aircraft'
    case 'ship': return 'ship'
    case 'structure': return 'structure'
    case 'ground': return c.sea ? 'water' : groundUnder(terrain, decks, point.x, point.z)?.surface ?? 'land'
  }
}

/** Reduces a building, floors it at zero, and freezes the first tick it
 *  reached zero and who put it there (spec §3.5: "once"). Rubble keeps its
 *  slot and its box; only the numbers stop moving. */
export function damageStructure(before: StructureDamage, amount: number, tick: number, attacker: string): StructureDamage {
  if (before.destroyedTick !== null) return before
  const hp = Math.max(0, before.hp - amount)
  return hp <= 0 ? { hp: 0, destroyedTick: tick, attacker } : { ...before, hp }
}

/** The hull's twin of `damageStructure`, plus the fire fraction spec §3.6
 *  states: `max(0, 1 - hp / (hullHp / 2))`, so a ship burns below half HP and
 *  harder as it takes more. `sinkingFraction` is advanced by the sinking pass
 *  in `stepCombat`, never here. */
export function damageShip(before: ShipDamage, hullHp: number, amount: number, tick: number, attacker: string): ShipDamage {
  if (before.destroyedTick !== null) return before
  const hp = Math.max(0, before.hp - amount)
  const fire = Math.min(1, Math.max(0, 1 - hp / (hullHp / 2)))
  return {
    ...before, hp, fire,
    destroyedTick: hp <= 0 ? tick : null,
    attacker: hp <= 0 ? attacker : before.attacker,
  }
}

/** Blast against an airplane: structure HP and no subsystem (spec §3.4).
 *  `damageFromHit`'s structure line alone, in HP rather than in hits. */
function blastDamageAircraft(spec: AircraftSpec, before: Damage, amount: number, tick: number, attacker: string): Damage {
  const c = spec.combat
  if (c === undefined || before.destroyedAt !== null || before.burningSince !== null) return before
  return withStructure(before, Math.max(0, before.structure - amount / c.structureHp), tick, attacker)
}

/** The one store type a rack (or a rail) carries, under the same
 *  one-type-per-mount assumption `storesSpec` already records and the shipped
 *  content satisfies. */
function storeTypeOf(spec: AircraftSpec, kind: 'bomb' | 'rocket' | 'torpedo'): StoreType | null {
  const s = spec.stores
  if (s === undefined) return null
  const mount = kind === 'rocket' ? s.rails[0] : s.racks[0]
  return mount === undefined ? null : s.types[mount.store] ?? null
}

/** The guns' cone draw, lifted out of the firing loop so a rocket release can
 *  make exactly the same one (spec §3.3: "Rockets get the guns' dispersion
 *  draw"), off the aircraft-wide `dispersionDeg` -- content names no
 *  rocket-specific figure. */
const coneAim = (direction: Vec3, dispersionDeg: number, r1: number, r2: number): Vec3 => {
  const radius = Math.tan(dispersionDeg * Math.PI / 180) * Math.sqrt(r1)
  const phi = 2 * Math.PI * r2
  return normalize(add(direction, v3(0, radius * Math.cos(phi), radius * Math.sin(phi))))
}

/** World point of a body-frame mount at sub-tick fraction `t`. A gun muzzle
 *  and a rack are the same transform; a release is simply the `t = 0` one. */
const mountWorld = (a: CombatAircraft, origin: Vec3, t: number): Vec3 =>
  add(add(a.previous.position, scale(sub(a.state.position, a.previous.position), t)), qRotate(a.previous.attitude, origin))

/**
 * One release's PRNG cost, spent whether or not its numbers are used: the
 * rocket's dispersion draw, and the bomb's null draw, so "the cursor count
 * per release is constant" (spec §3.2) holds across both kinds. A draw is
 * the guns' two-sample cone draw -- the same unit the schema comment's "each
 * emitted shot advances it exactly twice" counts in.
 */
function releaseDraw(cursor: number): { readonly r1: number; readonly r2: number; readonly state: number } {
  const first = randomFrom(cursor)
  const second = randomFrom(first.state)
  return { r1: first.value, r2: second.value, state: second.state }
}

/** What a release emits, minus the ids `stepCombat` hands out. */
type Release = {
  readonly projectiles: readonly Omit<Projectile, 'id'>[]
  readonly rngState: number
  readonly stores: StoresState
}

/**
 * Refused silently when the airplane is destroyed, crashed, or parked below
 * 2 m/s (spec §3.2). "Parked" is the real ground test -- `onGround` against
 * the height `groundUnder` reports beneath the airplane -- not an altitude
 * threshold, so it is true on a deck and on a hill and false over the sea.
 * Paused needs no test here: a paused world runs no ticks.
 */
function canRelease(
  a: CombatAircraft, rec: AircraftCombat, terrain: TerrainField | null, decks: readonly Deck[],
): boolean {
  if (rec.damage.destroyedAt !== null || a.impact !== null) return false
  const under = groundUnder(terrain, decks, a.state.position.x, a.state.position.z)
  if (under === null || !onGround(a.spec, a.state, under.heightM)) return true
  return Math.hypot(a.state.velocity.x, a.state.velocity.z) >= 2
}

/** Racks are ordered [left, right] in content, so counting down from a full
 *  load alternates sides by construction (spec §3.2). */
function releaseBomb(a: CombatAircraft, stores: StoresState, cursor: number): Release | null {
  const s = a.spec.stores
  if (s === undefined || stores.bombs <= 0) return null
  // C2: a bay load leaves only through open doors. The pulse is spent; the HUD says why.
  if (bayDoorsShut(a.spec, a.state.bayDoorFraction)) return null
  const draw = releaseDraw(cursor) // null draw: a bomb has no dispersion
  const bombs = stores.bombs - 1
  const rack = s.racks[(s.racks.length - 1 - bombs) % s.racks.length]!
  const type = s.types[rack.store]
  if (type === undefined) return null
  const position = mountWorld(a, tupleVector(rack.offset), 0)
  // A torpedo leaves a rack like a bomb; the drop envelope is judged here, at release, on the
  // airplane's speed and its height above the sea (Track D step 2).
  const torpedo = type.kind === 'torpedo'
  const dud = torpedo && (length(a.previous.velocity) > type.maxDropSpeedMps! || position.y - SEA_LEVEL_M > type.maxDropHeightM!)
  return {
    projectiles: [{
      owner: a.id, position, previous: position, velocity: a.previous.velocity,
      lifeS: type.lifetimeS, tracer: false, kind: torpedo ? 'torpedo' : 'bomb', ageS: 0,
      ...(dud ? { dud: true as const } : {}),
    }],
    rngState: draw.state, stores: { ...stores, bombs },
  }
}

/** Rails outermost first, by how far out the rail is rather than by its order
 *  in content, so "the outermost remaining pair" (spec §3.2) survives a
 *  content file that lists its rails in another order. */
export const railOrder = (rails: readonly { readonly offset: readonly [number, number, number] }[]): readonly number[] =>
  rails.map((_, i) => i).sort((x, y) => Math.abs(rails[y]!.offset[2]) - Math.abs(rails[x]!.offset[2]) || x - y)

/**
 * A pair off the rails, launched down the gunsight line rather than along the
 * flight path: spec §3.3 accelerates a rocket "along the gunsight line", and
 * the dispersion draw has to tilt something to be a dispersion at all. The
 * airplane's SPEED is carried over unchanged, which is what "starts with the
 * airplane's velocity" buys -- a rocket fired at 120 m/s starts at 120 m/s.
 */
function releaseRockets(a: CombatAircraft, combat: CombatSpec, stores: StoresState, cursor: number): Release | null {
  const s = a.spec.stores
  if (s === undefined || stores.rockets <= 0) return null
  const draw = releaseDraw(cursor)
  const order = railOrder(s.rails)
  const fired = s.rails.length - stores.rockets
  const count = Math.min(2, stores.rockets)
  const speed = length(a.previous.velocity)
  const projectiles: Omit<Projectile, 'id'>[] = []
  for (let k = 0; k < count; k++) {
    const rail = s.rails[order[fired + k] ?? -1]
    const type = rail === undefined ? undefined : s.types[rail.store]
    if (rail === undefined || type === undefined) continue
    const origin = tupleVector(rail.offset)
    const sightLine = normalize(sub(v3(combat.convergenceM, 0, 0), origin))
    const raised = type.railElevationDeg === undefined
      ? sightLine
      : qRotate(qFromAxisAngle(v3(0, 0, 1), (type.railElevationDeg * Math.PI) / 180), sightLine)
    const aim = coneAim(raised, combat.dispersionDeg, draw.r1, draw.r2)
    const position = mountWorld(a, origin, 0)
    projectiles.push({
      owner: a.id, position, previous: position,
      velocity: speed < 1e-9 ? a.previous.velocity : scale(qRotate(a.previous.attitude, aim), speed),
      lifeS: type.lifetimeS, tracer: false, kind: 'rocket', ageS: 0,
    })
  }
  return { projectiles, rngState: draw.state, stores: { ...stores, rockets: stores.rockets - projectiles.length } }
}

export function stepCombat(
  before: CombatState, aircraft: readonly CombatAircraft[], ships: readonly CombatShip[],
  structures: readonly StructureEntity[],
  terrain: TerrainField | null, wind: Vec3 | null, decks: readonly Deck[], tick: number, dt: number,
  /**
   * Which structures count toward `RAZED` (spec §3.5: "only structures at an
   * `enemyAirfields` base"). `stepCombat` has no notion of "enemy" of its
   * own, so the caller narrows: `null` means it has not said, and every
   * structure it destroys is counted. Task 7 computes the real set from the
   * scenario's `enemyAirfields`.
   */
  enemyStructureIds: ReadonlySet<string> | null = null,
  /**
   * Settings toggle (Plan "UI realism" Task 3/5/6): "arcade" disables
   * structural-overload damage entirely, while leaving its MEASUREMENT
   * (`measureStructuralStress`, below) completely unconditional -- the HUD
   * readout (`src/render/combatReadout.ts`) reads `stress`, never `damage`,
   * and must not depend on this flag. Defaults to `false` (realistic: the
   * damage this function has always applied) so every existing caller is
   * unaffected until Task 6 threads a real persisted value in.
   */
  arcadeDamage = false,
  /**
   * Plan 7e: every aircraft's side, by id (`sidesOf`, src/sim/sides.ts),
   * which decides whether a hit or kill is a friendly one. `null` (every
   * caller that predates 7e) credits every hit as before.
   */
  sides: Readonly<Record<string, Side>> | null = null,
  /**
   * Friendly fire (spec 2026-09-26 §4): ship and structure sides by id, read
   * against `sides[owner]`. `null` (every caller that predates it) records
   * no friendly fire against either and credits them as before.
   */
  targetSides: TargetSides | null = null,
): CombatState {
  const records: Record<string, AircraftCombat> = { ...before.aircraft }
  const shipDamage: Record<string, ShipDamage> = { ...before.ships }
  const structureDamage: Record<string, StructureDamage> = { ...before.structures }
  // For the shipsSunk credit loop below, which only has `ShipDamage` (no
  // role) per id -- the sunk hull's own role at credit time.
  const shipRoleById = new Map(ships.map((s) => [s.id, s.spec.role]))
  const flying: { p: Projectile; dt: number; start: number }[] =
    before.projectiles.map(p => ({ p, dt: Math.min(dt, p.lifeS), start: 0 }))
  let nextId = before.nextId, rngState = before.rngState, poolSaturated = before.poolSaturated

  // Structural failure resolves before releases and gunfire. A plane whose
  // airframe reaches zero this tick cannot emit a weapon on the same tick.
  // Ground-contact correction can be violent, so a crashed aircraft records
  // telemetry but takes no further overload damage from it.
  for (const a of aircraft) {
    const rec = records[a.id]
    if (rec === undefined) continue
    const stress = measureStructuralStress(a.previous, a.state, wind, a.spec.limits, dt, rec.stress)
    const damage = a.impact === null && !arcadeDamage
      ? damageFromStructuralOverload(rec.damage, stress, a.spec.limits, tick, dt)
      : rec.damage
    records[a.id] = { ...rec, stress, damage }
  }

  // Releases follow structural damage, so a surviving tick's ordnance and its rounds leave together and
  // the PRNG cursor is spent in one stated order (spec §3.7).
  for (const a of aircraft) {
    // A bomb needs only a rack: a bomber with no `combat` block (no guns, no hit zones) still drops
    // its load. Rockets fly down the gunsight line, so they need the block.
    const combat = a.spec.combat, rec = records[a.id]
    if (rec === undefined) continue
    const wantsBomb = a.controls.dropBomb === true, wantsRockets = a.controls.fireRockets === true && combat !== undefined
    if (!wantsBomb && !wantsRockets) continue
    if (!canRelease(a, rec, terrain, decks)) continue
    let stores = rec.stores
    // Sequential, not batched: each release reads the cursor and the counts
    // the one before it left, so V and E in the same tick cost two draws.
    // `emit` returns the number of projectiles actually queued (0 on a
    // no-op or a pool-saturated refusal), which is exactly what `stores`
    // is decremented by -- so the two cumulative counters below rise in
    // lockstep with it, never independently of it (Plan 6b Task 10).
    const emit = (release: Release | null): number => {
      if (release === null || release.projectiles.length === 0) return 0
      if (flying.length + release.projectiles.length > MAX_PROJECTILES) { poolSaturated++; return 0 }
      rngState = release.rngState
      stores = release.stores
      for (const p of release.projectiles) flying.push({ p: { ...p, id: nextId++ }, dt, start: 0 })
      return release.projectiles.length
    }
    const bombsThisTick = wantsBomb ? emit(releaseBomb(a, stores, rngState)) : 0
    const rocketsThisTick = wantsRockets ? emit(releaseRockets(a, combat!, stores, rngState)) : 0
    records[a.id] = {
      ...rec, stores,
      bombsDropped: rec.bombsDropped + bombsThisTick,
      rocketsFired: rec.rocketsFired + rocketsThisTick,
    }
  }

  for (const a of aircraft) {
    const spec = a.spec.combat, rec = records[a.id]
    if (spec === undefined || rec === undefined) continue
    let shots = rec.shots
    const guns = rec.guns.map((g, index): GunState => {
      const mount = spec.guns[index]!
      const ballistic = gunBallistics(spec, mount.type)
      let cooldown = g.cooldownS, ammo = g.ammo, fired = g.shots
      if (a.controls.fire === true && a.impact === null && rec.damage.destroyedAt === null && rec.damage[mount.group] > 0) {
        while (cooldown < dt - 1e-12 && ammo > 0) {
          if (flying.length < MAX_PROJECTILES) {
            const origin = tupleVector(mount.position)
            const direction = normalize(sub(v3(spec.convergenceM, 0, 0), origin))
            const draw = releaseDraw(rngState); rngState = draw.state
            const aim = coneAim(direction, spec.dispersionDeg, draw.r1, draw.r2)
            const t = cooldown / dt
            const carrierVelocity = add(a.previous.velocity, scale(sub(a.state.velocity, a.previous.velocity), t))
            const position = mountWorld(a, origin, t)
            fired++; shots++; ammo--
            flying.push({
              p: { owner: a.id, id: nextId++, position, previous: position,
                velocity: add(carrierVelocity, scale(qRotate(a.previous.attitude, aim), ballistic.muzzleVelocityMps)),
                lifeS: spec.lifetimeS, tracer: fired % 5 === 0, kind: 'round', ageS: 0,
                ...(mount.type === undefined ? {} : { gunType: mount.type }) },
              dt: dt - cooldown, start: t,
            })
          } else poolSaturated++
          cooldown += 60 / ballistic.roundsPerMinute
        }
      }
      return { ammo, shots: fired, cooldownS: Math.max(0, cooldown - dt) }
    })
    records[a.id] = { ...rec, guns, shots }
  }

  const alive: Projectile[] = []
  const impacts: CombatImpact[] = []
  const specs = new Map(aircraft.map(a => [a.id, a.spec]))
  // A hull on the bottom "no longer blocks or takes anything" (spec §3.6), so
  // it leaves the candidate list entirely rather than being special-cased in
  // every test and reducer below. A hull still sinking blocks as it always did.
  const afloat = ships.filter(s => (shipDamage[s.id]?.sinkingFraction ?? 0) < 1)

  /** Records `owner`'s first friendly fire (spec §4). */
  const noteFriendlyFire = (owner: string, kind: FriendlyFireKind, target: string): void => {
    const rec = records[owner]
    if (rec !== undefined) records[owner] = withFriendlyFire(rec, { tick, kind, target })
  }

  /** A kill by anything -- a round, a direct bomb, or blast -- lands on the
   *  owner's record; `hits` stays the gunnery statistic it has always been. */
  const creditAircraftDamage = (
    before_: Damage, after: Damage, owner: string, round: boolean, targetType: TargetType, targetId: string,
  ): void => {
    const shooter = records[owner]
    if (shooter === undefined) return
    // Only a direct kill of an unburnt airframe: a burning one's is the fire's,
    // and `creditDownedAircraft` gives it to whoever set it alight.
    const killed = before_.destroyedAt === null && after.destroyedAt !== null && before_.burningSince === null
    if (!round && !killed) return
    if (sides !== null && sameSide(sides, owner, targetId)) {
      records[owner] = {
        ...shooter,
        friendlyHits: shooter.friendlyHits + (round ? 1 : 0),
        friendlyKills: shooter.friendlyKills + (killed ? 1 : 0),
      }
      return
    }
    records[owner] = {
      ...shooter,
      hits: shooter.hits + (round ? 1 : 0),
      kills: shooter.kills + (killed ? 1 : 0),
      killsByType: killed
        ? { ...shooter.killsByType, [targetType]: shooter.killsByType[targetType] + 1 }
        : shooter.killsByType,
    }
  }

  const damageAircraftAt = (target: CombatAircraft, amount: number, system: DamageSystem | null, owner: string, point: Vec3 | null, hitScale = 1, engine?: number): void => {
    const rec = records[target.id]
    if (rec === undefined || rec.damage.destroyedAt !== null || target.impact !== null) return
    const damage = system === null
      ? blastDamageAircraft(target.spec, rec.damage, amount, tick, owner)
      : damageFromHit(target.spec, rec.damage, system, tick, owner, hitScale, engine)
    // A hit by its own side (7e) or by itself is physical -- it still flashes
    // (`lastHit`) -- but does not change who is credited if the aircraft goes
    // down later: a wingman's graze must not steal the player's kill (Mark,
    // 2026-09-25; whole-branch review, 2026-09-26).
    const ownSide = owner === target.id || (sides !== null && sameSide(sides, owner, target.id))
    // Burning, the credit is already settled on whoever set it alight
    // (damage stages, Mark 2026-10-09): later hits only hurry the explosion.
    const lastHitBy = ownSide || rec.damage.burningSince !== null ? rec.lastHitBy : owner
    records[target.id] = point === null ? { ...rec, damage, lastHitBy } : { ...rec, damage, lastHitBy, lastHit: { tick, position: point } }
    if (ownSide && owner !== target.id && damage !== rec.damage) noteFriendlyFire(owner, 'aircraft', target.id)
    creditAircraftDamage(rec.damage, damage, owner, system !== null, target.spec.role, target.id)
  }

  const damageStructureAt = (s: StructureEntity, amount: number, owner: string): void => {
    const was = structureDamage[s.id]
    if (was === undefined) return
    const now = damageStructure(was, amount, tick, owner)
    structureDamage[s.id] = now
    const friendly = ownSideTarget(sides, targetSides?.structures, owner, s.id)
    if (friendly && was.destroyedTick === null) noteFriendlyFire(owner, 'structure', s.id)
    if (was.destroyedTick !== null || now.destroyedTick === null) return
    const shooter = records[owner]
    if (shooter === undefined) return
    // Own side: never RAZED or `killsByType` (ruling FF-4).
    if (friendly) {
      records[owner] = { ...shooter, friendlyKills: shooter.friendlyKills + 1 }
      return
    }
    if (enemyStructureIds !== null && !enemyStructureIds.has(s.id)) return
    const targetType: TargetType = s.kind === 'aaa' ? 'aaa' : 'building'
    records[owner] = {
      ...shooter,
      structuresDestroyed: shooter.structuresDestroyed + 1,
      killsByType: { ...shooter.killsByType, [targetType]: shooter.killsByType[targetType] + 1 },
    }
  }

  const damageShipAt = (ship: CombatShip, amount: number, owner: string): void => {
    const was = shipDamage[ship.id]
    if (was === undefined) return
    // `shipsSunk` is NOT credited here: a hull is sunk when it reaches the
    // bottom 90 s later, off the attacker this blow fixed (spec §3.6).
    shipDamage[ship.id] = damageShip(was, ship.spec.hullHp, amount, tick, owner)
    if (was.destroyedTick === null && ownSideTarget(sides, targetSides?.ships, owner, ship.id)) noteFriendlyFire(owner, 'ship', ship.id)
  }

  /** Spec §3.4: every structure, hull and airplane whose BOX CENTER is within
   *  `blastRadiusM` of the detonation takes `damage * (1 - d / radius)`, the
   *  direct target excluded -- so a near miss in the water still hurts. */
  const applyBlast = (point: Vec3, damage: number, radiusM: number, direct: Contact, owner: string): void => {
    const falloff = (center: Vec3): number | null => {
      const d = length(sub(center, point))
      return d < radiusM ? damage * (1 - d / radiusM) : null
    }
    for (const s of structures) {
      if (direct.kind === 'structure' && direct.structure.id === s.id) continue
      const amount = falloff(s.position)
      if (amount !== null) damageStructureAt(s, amount, owner)
    }
    for (const ship of afloat) {
      if (direct.kind === 'ship' && direct.ship.id === ship.id) continue
      const amount = falloff(hullCenter(ship))
      if (amount !== null) damageShipAt(ship, amount, owner)
    }
    for (const a of aircraft) {
      if (direct.kind === 'aircraft' && direct.aircraft.id === a.id) continue
      const amount = falloff(a.state.position)
      if (amount !== null) damageAircraftAt(a, amount, null, owner, null)
    }
  }

  /** A falling torpedo meets something. The sea, inside its drop envelope: it starts its run at its
   *  set depth, along its heading, with a splash. Anything else -- a bad drop, a deck, a hull, land,
   *  an airplane -- and it breaks up, harmlessly, counted against its owner for the HUD. */
  const enterWater = (p: Projectile, store: StoreType, contact: Contact, point: Vec3): void => {
    const heading = v3(p.velocity.x, 0, p.velocity.z)
    const runs = contact.kind === 'ground' && contact.sea && p.dud !== true && length(heading) > 1e-6
    impacts.push({ tick, cause: 'torpedo', outcome: runs ? 'entered' : 'broke-up', surface: contactSurface(contact, point, terrain, decks), point })
    if (!runs) {
      const rec = records[p.owner]
      if (rec !== undefined) records[p.owner] = { ...rec, torpedoesBrokeUp: rec.torpedoesBrokeUp + 1 }
      return
    }
    const at = v3(point.x, SEA_LEVEL_M - store.runDepthM!, point.z)
    alive.push({
      ...p, position: at, previous: at, velocity: scale(normalize(heading), store.runSpeedMps!),
      lifeS: store.runRangeM! / store.runSpeedMps!, runM: 0,
    })
  }

  /** A torpedo in the water: a straight run at its set speed and depth. Its hull contact is read at
   *  the waterline, where the hull box begins, since a hull box has no depth below it. A hit before
   *  the exploder arms is a dud; running aground or out of range ends it. */
  const runTorpedo = (before_: Projectile, store: StoreType, stepS: number, start: number): void => {
    const position = add(before_.position, scale(before_.velocity, stepS))
    const p: Projectile = {
      ...before_, previous: before_.position, position, lifeS: before_.lifeS - stepS,
      ageS: before_.ageS + stepS, runM: before_.runM! + store.runSpeedMps! * stepS,
    }
    const atWaterline = (q: Vec3): Vec3 => v3(q.x, SEA_LEVEL_M + 0.5, q.z)
    let hit: { t: number; ship: CombatShip } | null = null
    for (const ship of afloat) {
      const t = hullHit(atWaterline(p.previous), atWaterline(p.position), ship, start)
      if (t !== null && (hit === null || t < hit.t)) hit = { t, ship }
    }
    if (hit !== null) {
      if (p.runM! < store.armRunM!) return
      const point = atWaterline(add(p.previous, scale(sub(p.position, p.previous), hit.t)))
      impacts.push({ tick, cause: 'torpedo', outcome: 'detonated', surface: 'ship', point })
      damageShipAt(hit.ship, store.damage, p.owner)
      // Track D step 3 (D3 T3): the hole floods, on the side the torpedo came in on.
      const flooded = shipDamage[hit.ship.id]
      if (flooded !== undefined && flooded.destroyedTick === null) {
        const side = hitSide(hit.ship.state.position, hit.ship.state.headingRad, point)
        shipDamage[hit.ship.id] = { ...flooded, floods: [...(flooded.floods ?? []), floodFrom(store.damage, side, p.owner)] }
      }
      applyBlast(point, store.damage, store.blastRadiusM, { t: hit.t, kind: 'ship', ship: hit.ship }, p.owner)
      return
    }
    // Only land ends a run, not the seabed: the heightfield is not reliable bathymetry near shore (measured
    // 2026-10-09: with a seabed test, an in-game Mk 13 dropped off Leyte at its 3 m depth ended the tick it
    // entered the water).
    const floor = groundUnder(terrain, [], p.position.x, p.position.z)
    if (floor !== null && floor.surface !== 'water') {
      impacts.push({ tick, cause: 'torpedo', outcome: 'expired', surface: 'land', point: atWaterline(p.position) })
      return
    }
    if (p.lifeS <= 1e-12) {
      impacts.push({ tick, cause: 'torpedo', outcome: 'expired', surface: 'water', point: atWaterline(p.position) })
      return
    }
    alive.push(p)
  }

  for (const shot of flying) {
    const ownerSpec = specs.get(shot.p.owner)
    if (ownerSpec === undefined || shot.dt <= 0) continue
    const store = shot.p.kind === 'round' ? null : storeTypeOf(ownerSpec, shot.p.kind)
    if (shot.p.kind !== 'round' && store === null) continue // its content is gone
    // Only a round needs the owner's combat block; a bomber's bomb flies without one.
    const source = ownerSpec.combat
    if (store === null && source === undefined) continue
    if (shot.p.runM !== undefined && store !== null) {
      runTorpedo(shot.p, store, shot.dt, shot.start)
      continue
    }
    const ballistic = store === null ? gunBallistics(source!, shot.p.gunType) : null
    const burned = shot.p.kind === 'rocket' && store !== null
      ? { ...shot.p, velocity: burnedVelocity(shot.p.velocity, store.burnDeltaVMps ?? 0, store.burnS ?? 1, shot.p.ageS, shot.dt) }
      : shot.p
    const flown = flyProjectile(burned, shot.dt, wind, store !== null ? store.dragPerM : ballistic!.dragPerM)
    const p: Projectile = { ...flown, ageS: shot.p.ageS + shot.dt }
    const contact = nearestContact(p, shot.start, aircraft, afloat, structures, terrain, decks)
    if (contact === null) {
      if (p.lifeS > 1e-12) alive.push(p)
      // Ruling R3: only ordnance expiries are recorded.
      else if (p.kind !== 'round') impacts.push({ tick, cause: p.kind, outcome: 'expired', surface: 'air', point: p.position })
      continue
    }
    // A bomb that has not armed is a dud: removed, and nothing takes anything
    // (spec §3.4). Nor is it an impact (E1 Ruling R2).
    if (p.kind === 'bomb' && store !== null && p.ageS < (store.armS ?? 0)) continue
    const point = add(p.previous, scale(sub(p.position, p.previous), contact.t))
    if (p.kind === 'torpedo' && store !== null) {
      enterWater(p, store, contact, point)
      continue
    }
    impacts.push({ tick, cause: p.kind, outcome: 'detonated', surface: contactSurface(contact, point, terrain, decks), point })
    const damage = store === null ? source!.roundDamage : store.damage
    if (contact.kind === 'aircraft') damageAircraftAt(contact.aircraft, damage, store === null ? contact.system : null, p.owner, point, ballistic?.hitScale ?? 1, contact.engine)
    else if (contact.kind === 'ship') damageShipAt(contact.ship, damage, p.owner)
    else if (contact.kind === 'structure') damageStructureAt(contact.structure, damage, p.owner)
    if (store !== null) applyBlast(point, store.damage, store.blastRadiusM, contact, p.owner)
  }

  // Flooding (D3 T3) drains on its own clock, like sinking, before the sinking pass so a flood
  // that finishes a hull this tick starts it down this tick. A sunk or sinking hull stops flooding.
  for (const ship of ships) {
    let d = shipDamage[ship.id]
    if (d?.floods === undefined || d.floods.length === 0 || d.destroyedTick !== null) continue
    const left: (typeof d.floods)[number][] = []
    let port = d.floodedPortHp ?? 0
    let starboard = d.floodedStarboardHp ?? 0
    for (const f of d.floods) {
      const drain = Math.min(f.leftHp, f.rateHps * dt)
      d = damageShip(d, ship.spec.hullHp, drain, tick, f.attacker)
      if (f.side > 0) starboard += drain
      else port += drain
      if (f.leftHp - drain > 1e-9) left.push({ ...f, leftHp: f.leftHp - drain })
    }
    shipDamage[ship.id] = { ...d, floods: left, floodedPortHp: port, floodedStarboardHp: starboard }
  }

  // Sinking advances on its own clock, hit or not (spec §3.6), and crossing
  // the bottom is what credits `shipsSunk` -- to the attacker the killing
  // blow recorded, not to whoever was shooting 90 s later.
  for (const [id, d] of Object.entries(shipDamage)) {
    if (d.destroyedTick === null || d.sinkingFraction >= 1) continue
    const sinkingFraction = Math.min(1, d.sinkingFraction + dt / SINK_SECONDS)
    shipDamage[id] = { ...d, sinkingFraction }
    if (sinkingFraction < 1 || d.attacker === null) continue
    const shooter = records[d.attacker]
    if (shooter === undefined) continue
    // Own side on the bottom: a friendly kill, never scored (ruling FF-4).
    if (ownSideTarget(sides, targetSides?.ships, d.attacker, id)) {
      records[d.attacker] = { ...shooter, friendlyKills: shooter.friendlyKills + 1 }
      continue
    }
    const role = shipRoleById.get(id)
    const targetType: TargetType | null = role === undefined ? null : shipTargetType(role)
    records[d.attacker] = {
      ...shooter,
      shipsSunk: shooter.shipsSunk + 1,
      killsByType: targetType === null
        ? shooter.killsByType
        : { ...shooter.killsByType, [targetType]: shooter.killsByType[targetType] + 1 },
    }
  }

  return { aircraft: records, projectiles: alive, nextId, rngState, poolSaturated, ships: shipDamage, structures: structureDamage, impacts: appendImpacts(before.impacts, impacts) }
}

/** Down for good: destroyed by damage, or crashed/ditched. The same
 *  definition as the mission layer's `isDestroyed` (Ruling R13). */
export function isAircraftDown(
  records: CombatState['aircraft'],
  a: { readonly id: string; readonly impact: unknown },
): boolean {
  return a.impact !== null || (records[a.id]?.damage.destroyedAt ?? null) !== null
}

/** Down, or burning and so as good as down: what the AI stops chasing,
 *  following or fearing (damage stages, Mark 2026-10-09). Credit and the
 *  mission still wait for `isAircraftDown`. */
export function isAircraftDoomed(
  records: CombatState['aircraft'],
  a: { readonly id: string; readonly impact: unknown },
): boolean {
  return isAircraftDown(records, a) || (records[a.id]?.damage.burningSince ?? null) !== null
}

/**
 * Credits a kill for every aircraft that went down THIS tick without a
 * killing hit, to whoever last hit it (`AircraftCombat.lastHitBy`): Mark,
 * 2026-09-25, "an enemy plane that is destroyed for any reason after being
 * hit by the player should count as a kill". No time limit -- one hit is
 * enough, however long before the loss.
 *
 * A killing hit on an unburnt airframe sets `damage.attacker` and is
 * credited on the spot by `stepCombat`, so it is skipped here. A BURNING
 * airframe (damage stages, Mark 2026-10-09) is credited here, when it
 * explodes or hits the ground, to `damage.attacker`, the hit that set it
 * alight (or `lastHitBy`, which stops moving once it burns, when an overload
 * break-up cleared that). A downed aircraft stays down -- a wreck falls but
 * keeps its `destroyedAt`, a crashed one keeps its first impact -- so the
 * up-to-down transition happens once and so does the credit.
 *
 * `before`/`beforeAircraft` are the start of the tick, `after`/
 * `afterAircraft` the end. An aircraft absent from `beforeAircraft` (spawned
 * this tick) is skipped. Returns `after` itself when nothing was credited.
 *
 * Plan 7e: with `sides`, a loss last hit by its own side is that shooter's
 * `friendlyKills`, not a kill (spec §4.3).
 */
export function creditDownedAircraft(
  before: CombatState,
  after: CombatState,
  beforeAircraft: readonly CombatAircraft[],
  afterAircraft: readonly CombatAircraft[],
  sides: Readonly<Record<string, Side>> | null = null,
): CombatState {
  let records: Record<string, AircraftCombat> | null = null
  for (const a of afterAircraft) {
    const rec = after.aircraft[a.id]
    if (rec === undefined) continue
    const burnt = rec.damage.burningSince !== null
    if (!burnt && rec.damage.attacker !== null) continue // a direct kill, credited by `stepCombat`
    const credited = burnt ? rec.damage.attacker ?? rec.lastHitBy : rec.lastHitBy
    if (credited === null) continue
    if (!isAircraftDown(after.aircraft, a)) continue
    const was = beforeAircraft.find((b) => b.id === a.id)
    if (was === undefined || isAircraftDown(before.aircraft, was)) continue
    records ??= { ...after.aircraft }
    const shooter = records[credited]
    if (shooter === undefined) continue
    if (sides !== null && sameSide(sides, credited, a.id)) {
      records[credited] = { ...shooter, friendlyKills: shooter.friendlyKills + 1 }
      continue
    }
    const type = a.spec.role
    records[credited] = {
      ...shooter,
      kills: shooter.kills + 1,
      killsByType: { ...shooter.killsByType, [type]: shooter.killsByType[type] + 1 },
    }
  }
  return records === null ? after : { ...after, aircraft: records }
}
