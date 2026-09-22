import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import { createRng } from '../rng.js'
import { qRotate } from '../math/quat.js'
import { add, sub, scale, length, normalize, v3, ZERO, type Vec3 } from '../math/vec3.js'
import type { TerrainField } from '../world/terrain.js'
import { groundUnder } from '../world/ground.js'
import type { Deck } from '../world/deck.js'
import { healthyDamage, damageFromHit, type Damage } from '../damage/model.js'
import { inBody, segmentBox, tupleVector } from './geometry.js'
import type { DamageSystem } from './schema.js'
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
  readonly shots: number; readonly hits: number; readonly kills: number
  readonly lastHit: { readonly tick: number; readonly position: Vec3 } | null
  readonly stores: StoresState
  readonly shipsSunk: number
  readonly structuresDestroyed: number
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
      damage: healthyDamage(), shots: 0, hits: 0, kills: 0, lastHit: null,
      stores: stores[a.id] ?? emptyStores, shipsSunk: 0, structuresDestroyed: 0,
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

export function stepCombat(
  before: CombatState, aircraft: readonly CombatAircraft[], ships: readonly CombatShip[],
  // Threaded but not yet consumed: Task 6 (Plan 6b) reads this for
  // bomb/rocket-vs-structure hit detection. Prefixed `_` for now so
  // `@typescript-eslint/no-unused-vars` (argsIgnorePattern: '^_') stays
  // quiet; Task 6 drops the underscore when it starts reading it.
  _structures: readonly StructureEntity[],
  terrain: TerrainField | null, wind: Vec3 | null, decks: readonly Deck[], tick: number, dt: number,
): CombatState {
  const records: Record<string, AircraftCombat> = { ...before.aircraft }
  const flying: { p: Projectile; dt: number; start: number }[] =
    before.projectiles.map(p => ({ p, dt: Math.min(dt, p.lifeS), start: 0 }))
  let nextId = before.nextId, rngState = before.rngState, poolSaturated = before.poolSaturated

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
            const r1 = randomFrom(rngState); rngState = r1.state
            const r2 = randomFrom(rngState); rngState = r2.state
            const radius = Math.tan(spec.dispersionDeg * Math.PI / 180) * Math.sqrt(r1.value)
            const phi = 2 * Math.PI * r2.value
            const aim = normalize(add(direction, v3(0, radius * Math.cos(phi), radius * Math.sin(phi))))
            const t = cooldown / dt
            const bodyPosition = add(a.previous.position, scale(sub(a.state.position, a.previous.position), t))
            const carrierVelocity = add(a.previous.velocity, scale(sub(a.state.velocity, a.previous.velocity), t))
            const position = add(bodyPosition, qRotate(a.previous.attitude, origin))
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
  for (const shot of flying) {
    const source = specs.get(shot.p.owner)?.combat
    if (source === undefined || shot.dt <= 0) continue
    const p = flyProjectile(shot.p, shot.dt, wind, source.dragPerM)
    let first = groundHit(p.previous, p.position, terrain, decks) ?? Infinity
    let target: CombatAircraft | null = null
    let system: DamageSystem = 'engine'
    for (const a of aircraft) {
      if (a.id === p.owner || a.spec.combat === undefined) continue
      const startPosition = add(a.previous.position, scale(sub(a.state.position, a.previous.position), shot.start))
      // Endpoints are relative to the corresponding target pose; the chord
      // approximates rotation within one 60 Hz tick, not translation.
      const from = inBody(a.previous.attitude, sub(p.previous, startPosition))
      const to = inBody(a.state.attitude, sub(p.position, a.state.position))
      for (const z of a.spec.combat.zones) {
        const t = segmentBox(from, to, tupleVector(z.center), tupleVector(z.halfSize))
        if (t !== null && t < first) { first = t; target = a; system = z.system }
      }
    }
    for (const ship of ships) {
      const h = ship.state.headingRad
      const local = (p: Vec3, center: Vec3): Vec3 => {
        const d = sub(p, center)
        return v3(d.x * Math.sin(h) - d.z * Math.cos(h), d.y, d.x * Math.cos(h) + d.z * Math.sin(h))
      }
      const start = add(ship.previous.position, scale(sub(ship.state.position, ship.previous.position), shot.start))
      const t = segmentBox(local(p.previous, start), local(p.position, ship.state.position),
        v3(0, ship.spec.deckHeightM / 2, 0), v3(ship.spec.lengthM / 2, ship.spec.deckHeightM / 2, ship.spec.beamM / 2))
      if (t !== null && t < first) { first = t; target = null }
    }
    if (first !== Infinity) {
      if (target !== null) {
        const rec = records[target.id]!
        if (rec.damage.destroyedAt === null && target.impact === null) {
          const damage = damageFromHit(target.spec, rec.damage, system, tick, p.owner)
          records[target.id] = { ...rec, damage, lastHit: { tick, position: add(p.previous, scale(sub(p.position, p.previous), first)) } }
          const shooter = records[p.owner]!
          records[p.owner] = { ...shooter, hits: shooter.hits + 1, kills: shooter.kills + (damage.destroyedAt === null ? 0 : 1) }
        }
      }
    } else if (p.lifeS > 1e-12) alive.push(p)
  }
  return { aircraft: records, projectiles: alive, nextId, rngState, poolSaturated, ships: before.ships, structures: before.structures }
}
