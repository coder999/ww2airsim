import type { AircraftSpec, StoreType } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import { createRng } from '../rng.js'
import { qRotate } from '../math/quat.js'
import { add, sub, scale, length, normalize, v3, ZERO, type Vec3 } from '../math/vec3.js'
import { SEA_LEVEL_M, type TerrainField } from '../world/terrain.js'
import { groundUnder } from '../world/ground.js'
import type { Deck } from '../world/deck.js'
import { onGround } from '../ground.js'
import { healthyDamage, damageFromHit, type Damage } from '../damage/model.js'
import {
  damageFromStructuralOverload,
  initialStructuralStress,
  measureStructuralStress,
  type StructuralStress,
} from '../damage/overload.js'
import { inBody, segmentBox, tupleVector } from './geometry.js'
import type { CombatSpec, DamageSystem } from './schema.js'
import { emptyStores, type StoresState } from './stores.js'
import { healthyStructureDamage, type StructureDamage, type StructureEntity } from './structures.js'

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
    readonly hullHp: number; readonly role: 'carrier' | 'escort' | 'merchant'
  }
  readonly state: { readonly position: Vec3; readonly headingRad: number }
  readonly previous: { readonly position: Vec3; readonly headingRad: number }
}
export type AircraftCombat = {
  readonly guns: readonly GunState[]
  readonly damage: Damage
  readonly stress: StructuralStress
  readonly shots: number; readonly hits: number; readonly kills: number
  readonly lastHit: { readonly tick: number; readonly position: Vec3 } | null
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
}
export type Projectile = {
  readonly owner: string; readonly id: number; readonly position: Vec3; readonly previous: Vec3
  readonly velocity: Vec3; readonly lifeS: number; readonly tracer: boolean
  readonly kind: 'round' | 'bomb' | 'rocket'
  readonly ageS: number
}
export type ShipDamage = {
  readonly hp: number; readonly fire: number
  readonly destroyedTick: number | null; readonly attacker: string | null
  readonly sinkingFraction: number
}
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
      damage: healthyDamage(), stress: initialStructuralStress(a.state, a.spec.limits),
      shots: 0, hits: 0, kills: 0, lastHit: null,
      stores: stores[a.id] ?? emptyStores, shipsSunk: 0, structuresDestroyed: 0,
      bombsDropped: 0, rocketsFired: 0,
    }])),
    projectiles: [], nextId: 1, rngState: seed >>> 0, poolSaturated: 0,
    ships: Object.fromEntries(ships.map(s => [s.id, healthyShipDamage(s.hullHp)])),
    structures: Object.fromEntries(structures.map(s => [s.id, healthyStructureDamage(s.hp)])),
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
 * Aircraft and hulls use swept boxes below; they never use endpoint samples. */
function groundHit(from: Vec3, to: Vec3, terrain: TerrainField | null, decks: readonly Deck[]): number | null {
  if (terrain === null && decks.length === 0) return null
  const delta = sub(to, from)
  const steps = Math.max(1, Math.ceil(length(delta) / 2))
  const below = (t: number): boolean => {
    const p = add(from, scale(delta, t))
    const g = groundUnder(terrain, decks, p.x, p.z)
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
function seaHit(from: Vec3, to: Vec3, terrain: TerrainField | null, decks: readonly Deck[]): number | null {
  if (from.y <= SEA_LEVEL_M || to.y > SEA_LEVEL_M) return null
  const t = (from.y - SEA_LEVEL_M) / (from.y - to.y)
  const point = add(from, scale(sub(to, from), t))
  const under = groundUnder(terrain, decks, point.x, point.z)
  // Land (or a deck) above the waterline here: `groundHit` owns that contact.
  return under === null || under.heightM <= SEA_LEVEL_M ? t : null
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
  | { readonly t: number; readonly kind: 'ground' }
  | { readonly t: number; readonly kind: 'aircraft'; readonly aircraft: CombatAircraft; readonly system: DamageSystem }
  | { readonly t: number; readonly kind: 'ship'; readonly ship: CombatShip }
  | { readonly t: number; readonly kind: 'structure'; readonly structure: StructureEntity }

function nearestContact(
  p: Projectile, start: number, aircraft: readonly CombatAircraft[], ships: readonly CombatShip[],
  structures: readonly StructureEntity[], terrain: TerrainField | null, decks: readonly Deck[],
): Contact | null {
  const candidates: Contact[] = []
  const ground = groundHit(p.previous, p.position, terrain, decks)
  if (ground !== null) candidates.push({ t: ground, kind: 'ground' })
  const sea = seaHit(p.previous, p.position, terrain, decks)
  if (sea !== null) candidates.push({ t: sea, kind: 'ground' })
  for (const a of aircraft) {
    if (a.id === p.owner || a.spec.combat === undefined) continue
    const began = add(a.previous.position, scale(sub(a.state.position, a.previous.position), start))
    // Endpoints are relative to the corresponding target pose; the chord
    // approximates rotation within one 60 Hz tick, not translation.
    const from = inBody(a.previous.attitude, sub(p.previous, began))
    const to = inBody(a.state.attitude, sub(p.position, a.state.position))
    for (const z of a.spec.combat.zones) {
      const t = segmentBox(from, to, tupleVector(z.center), tupleVector(z.halfSize))
      if (t !== null) candidates.push({ t, kind: 'aircraft', aircraft: a, system: z.system })
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
  if (c === undefined || before.destroyedAt !== null) return before
  const structure = Math.max(0, before.structure - amount / c.structureHp)
  const destroyed = structure < 1e-10
  return {
    ...before, structure: destroyed ? 0 : structure,
    destroyedAt: destroyed ? tick : null, attacker: destroyed ? attacker : before.attacker,
  }
}

/** The one store type a rack (or a rail) carries, under the same
 *  one-type-per-mount assumption `storesSpec` already records and the shipped
 *  content satisfies. */
function storeTypeOf(spec: AircraftSpec, kind: 'bomb' | 'rocket'): StoreType | null {
  const s = spec.stores
  if (s === undefined) return null
  const mount = kind === 'bomb' ? s.racks[0] : s.rails[0]
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
  const draw = releaseDraw(cursor) // null draw: a bomb has no dispersion
  const bombs = stores.bombs - 1
  const rack = s.racks[(s.racks.length - 1 - bombs) % s.racks.length]!
  const type = s.types[rack.store]
  if (type === undefined) return null
  const position = mountWorld(a, tupleVector(rack.offset), 0)
  return {
    projectiles: [{
      owner: a.id, position, previous: position, velocity: a.previous.velocity,
      lifeS: type.lifetimeS, tracer: false, kind: 'bomb', ageS: 0,
    }],
    rngState: draw.state, stores: { ...stores, bombs },
  }
}

/** Rails outermost first, by how far out the rail is rather than by its order
 *  in content, so "the outermost remaining pair" (spec §3.2) survives a
 *  content file that lists its rails in another order. */
const railOrder = (rails: readonly { readonly offset: readonly [number, number, number] }[]): readonly number[] =>
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
    const aim = coneAim(normalize(sub(v3(combat.convergenceM, 0, 0), origin)), combat.dispersionDeg, draw.r1, draw.r2)
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
): CombatState {
  const records: Record<string, AircraftCombat> = { ...before.aircraft }
  const shipDamage: Record<string, ShipDamage> = { ...before.ships }
  const structureDamage: Record<string, StructureDamage> = { ...before.structures }
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
    const damage = a.impact === null
      ? damageFromStructuralOverload(rec.damage, stress, a.spec.limits, tick, dt)
      : rec.damage
    records[a.id] = { ...rec, stress, damage }
  }

  // Releases follow structural damage, so a surviving tick's ordnance and its rounds leave together and
  // the PRNG cursor is spent in one stated order (spec §3.7).
  for (const a of aircraft) {
    const combat = a.spec.combat, rec = records[a.id]
    if (combat === undefined || rec === undefined) continue
    const wantsBomb = a.controls.dropBomb === true, wantsRockets = a.controls.fireRockets === true
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
    const rocketsThisTick = wantsRockets ? emit(releaseRockets(a, combat, stores, rngState)) : 0
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
                velocity: add(carrierVelocity, scale(qRotate(a.previous.attitude, aim), spec.muzzleVelocityMps)),
                lifeS: spec.lifetimeS, tracer: fired % 5 === 0, kind: 'round', ageS: 0 },
              dt: dt - cooldown, start: t,
            })
          } else poolSaturated++
          cooldown += 60 / spec.roundsPerMinute
        }
      }
      return { ammo, shots: fired, cooldownS: Math.max(0, cooldown - dt) }
    })
    records[a.id] = { ...rec, guns, shots }
  }

  const alive: Projectile[] = []
  const specs = new Map(aircraft.map(a => [a.id, a.spec]))
  // A hull on the bottom "no longer blocks or takes anything" (spec §3.6), so
  // it leaves the candidate list entirely rather than being special-cased in
  // every test and reducer below. A hull still sinking blocks as it always did.
  const afloat = ships.filter(s => (shipDamage[s.id]?.sinkingFraction ?? 0) < 1)

  /** A kill by anything -- a round, a direct bomb, or blast -- lands on the
   *  owner's record; `hits` stays the gunnery statistic it has always been. */
  const creditAircraftDamage = (before_: Damage, after: Damage, owner: string, round: boolean): void => {
    const shooter = records[owner]
    if (shooter === undefined) return
    const killed = before_.destroyedAt === null && after.destroyedAt !== null
    if (!round && !killed) return
    records[owner] = { ...shooter, hits: shooter.hits + (round ? 1 : 0), kills: shooter.kills + (killed ? 1 : 0) }
  }

  const damageAircraftAt = (target: CombatAircraft, amount: number, system: DamageSystem | null, owner: string, point: Vec3 | null): void => {
    const rec = records[target.id]
    if (rec === undefined || rec.damage.destroyedAt !== null || target.impact !== null) return
    const damage = system === null
      ? blastDamageAircraft(target.spec, rec.damage, amount, tick, owner)
      : damageFromHit(target.spec, rec.damage, system, tick, owner)
    records[target.id] = point === null ? { ...rec, damage } : { ...rec, damage, lastHit: { tick, position: point } }
    creditAircraftDamage(rec.damage, damage, owner, system !== null)
  }

  const damageStructureAt = (s: StructureEntity, amount: number, owner: string): void => {
    const was = structureDamage[s.id]
    if (was === undefined) return
    const now = damageStructure(was, amount, tick, owner)
    structureDamage[s.id] = now
    if (was.destroyedTick !== null || now.destroyedTick === null) return
    if (enemyStructureIds !== null && !enemyStructureIds.has(s.id)) return
    const shooter = records[owner]
    if (shooter !== undefined) records[owner] = { ...shooter, structuresDestroyed: shooter.structuresDestroyed + 1 }
  }

  const damageShipAt = (ship: CombatShip, amount: number, owner: string): void => {
    const was = shipDamage[ship.id]
    if (was === undefined) return
    // `shipsSunk` is NOT credited here: a hull is sunk when it reaches the
    // bottom 90 s later, off the attacker this blow fixed (spec §3.6).
    shipDamage[ship.id] = damageShip(was, ship.spec.hullHp, amount, tick, owner)
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

  for (const shot of flying) {
    const ownerSpec = specs.get(shot.p.owner)
    const source = ownerSpec?.combat
    if (ownerSpec === undefined || source === undefined || shot.dt <= 0) continue
    const store = shot.p.kind === 'round' ? null : storeTypeOf(ownerSpec, shot.p.kind)
    if (shot.p.kind !== 'round' && store === null) continue // its content is gone
    const burned = shot.p.kind === 'rocket' && store !== null
      ? { ...shot.p, velocity: burnedVelocity(shot.p.velocity, store.burnDeltaVMps ?? 0, store.burnS ?? 1, shot.p.ageS, shot.dt) }
      : shot.p
    const flown = flyProjectile(burned, shot.dt, wind, store?.dragPerM ?? source.dragPerM)
    const p: Projectile = { ...flown, ageS: shot.p.ageS + shot.dt }
    const contact = nearestContact(p, shot.start, aircraft, afloat, structures, terrain, decks)
    if (contact === null) {
      if (p.lifeS > 1e-12) alive.push(p)
      continue
    }
    // A bomb that has not armed is a dud: removed, and nothing takes anything
    // (spec §3.4).
    if (p.kind === 'bomb' && store !== null && p.ageS < (store.armS ?? 0)) continue
    const point = add(p.previous, scale(sub(p.position, p.previous), contact.t))
    const damage = store === null ? source.roundDamage : store.damage
    if (contact.kind === 'aircraft') damageAircraftAt(contact.aircraft, damage, store === null ? contact.system : null, p.owner, point)
    else if (contact.kind === 'ship') damageShipAt(contact.ship, damage, p.owner)
    else if (contact.kind === 'structure') damageStructureAt(contact.structure, damage, p.owner)
    if (store !== null) applyBlast(point, store.damage, store.blastRadiusM, contact, p.owner)
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
    if (shooter !== undefined) records[d.attacker] = { ...shooter, shipsSunk: shooter.shipsSunk + 1 }
  }

  return { aircraft: records, projectiles: alive, nextId, rngState, poolSaturated, ships: shipDamage, structures: structureDamage }
}
