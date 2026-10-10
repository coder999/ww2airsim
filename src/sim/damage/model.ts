import type { AircraftSpec } from '../flight/schema.js'
import { createRng } from '../rng.js'
import type { DamageSystem } from '../weapons/schema.js'

export type Damage = Readonly<Record<DamageSystem, number>> & {
  readonly structure: number
  /** The tick the airframe caught fire, or null. Burning is doomed: the fire
   *  drains what structure is left (`ageDamage`) until it explodes, unless it
   *  hits the ground first. Not a kill: that waits for the explosion or the
   *  impact (damage stages plan, Mark 2026-10-09). */
  readonly burningSince: number | null
  readonly destroyedAt: number | null
  readonly attacker: string | null
}
export const healthyDamage = (): Damage => ({
  structure: 1, engine: 1, roll: 1, pitch: 1, yaw: 1, fuel: 1,
  leftGuns: 1, rightGuns: 1, burningSince: null, destroyedAt: null, attacker: null,
})

/** Structure at or below which the airframe catches fire. ESTIMATE: a Zero
 *  (80 HP, 10 per .50 hit) burns after its sixth hit and explodes on its
 *  eighth, a Hellcat (120 HP) burns after its ninth. */
export const FIRE_AT_STRUCTURE = 0.25
/** Seconds a fire takes to burn FIRE_AT_STRUCTURE down to an explosion. ESTIMATE. */
export const BURN_S = 15
/** Engine health below which it sputters, the audio's own failing line (mix.ts ENGINE_FAILING_HEALTH). */
export const SPUTTER_BELOW = 0.5
/** Engine health below which it has stalled for good: no thrust. ESTIMATE. */
export const ENGINE_DEAD_BELOW = 0.15
/** One sputter decision per this many seconds. ESTIMATE. */
export const SPUTTER_WINDOW_S = 0.25
/** Fraction of windows cut out just above ENGINE_DEAD_BELOW; zero at SPUTTER_BELOW. ESTIMATE. */
export const SPUTTER_MAX_CUT = 0.6

/** Burning, or already exploded: no longer a threat, a target or a leader. */
export const isDoomed = (d: Damage): boolean => d.burningSince !== null || d.destroyedAt !== null

/** FNV-1a: the id half of every per-aircraft deterministic draw. */
export function idSeed(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/**
 * The engine's power fraction this tick: health above the sputter line, cut
 * to zero in a growing share of SPUTTER_WINDOW_S windows below it, nothing
 * once stalled, burning or destroyed. Deterministic in (tick, id), so replay
 * and the audio hear the same cuts the sim flew.
 */
export function engineOutput(d: Damage, tick: number, id: string, dt: number): number {
  if (d.burningSince !== null || d.destroyedAt !== null || d.engine < ENGINE_DEAD_BELOW) return 0
  if (d.engine >= SPUTTER_BELOW) return d.engine
  const cut = SPUTTER_MAX_CUT * (SPUTTER_BELOW - d.engine) / (SPUTTER_BELOW - ENGINE_DEAD_BELOW)
  const window = Math.floor((tick * dt) / SPUTTER_WINDOW_S)
  return createRng((idSeed(id) ^ Math.imul(window, 0x9e3779b1)) >>> 0)() < cut ? 0 : d.engine
}

/**
 * Structure after a loss, and what that loss sets alight or destroys. The
 * hit that sets an airframe alight names its `attacker`, as a killing blow
 * on an unburnt one does; later hits on a burning one change nothing but
 * how soon it explodes. A blow that destroys outright never sets it alight.
 * Credit follows: `stepCombat` credits a direct kill on the spot, and
 * `creditDownedAircraft` a burning one's when it explodes or hits the ground.
 */
export function withStructure(before: Damage, structure: number, tick: number, attacker: string | null): Damage {
  // Epsilon makes exactly twelve 10/120 hits lethal despite roundoff.
  const destroyed = structure < 1e-10
  const ignites = before.burningSince === null && !destroyed && structure <= FIRE_AT_STRUCTURE + 1e-10
  return {
    ...before, structure: destroyed ? 0 : structure,
    burningSince: ignites ? tick : before.burningSince,
    destroyedAt: destroyed ? tick : null,
    attacker: before.burningSince === null && (destroyed || ignites) ? attacker : before.attacker,
  }
}

/** `hitScale` (A6M spec §5) multiplies the target's `damagePerHit` for one
 *  round: a 20 mm shell is 3, a 7.7 mm bullet 0.4. Default 1 is every hit
 *  before per-gun types, bit for bit (x * 1 === x). */
export function damageFromHit(spec: AircraftSpec, before: Damage, system: DamageSystem, tick: number, attacker: string, hitScale = 1): Damage {
  const c = spec.combat
  if (c === undefined || before.destroyedAt !== null) return before
  const amount = c.damagePerHit * hitScale
  const after = withStructure(before, Math.max(0, before.structure - amount / c.structureHp), tick, attacker)
  return { ...after, [system]: Math.max(0, before[system] - amount / c.subsystemHp) }
}

/** One tick of damage that needs no hit: a hit engine running down
 *  (`engineDecayPerS`), and a fire burning the airframe out over BURN_S. */
export function ageDamage(spec: AircraftSpec, damage: Damage, dt: number, tick = 0): Damage {
  if (damage.destroyedAt !== null || spec.combat === undefined) return damage
  const aged = damage.engine === 1 || damage.engine === 0
    ? damage
    : { ...damage, engine: Math.max(0, damage.engine - (1 - damage.engine) * spec.combat.engineDecayPerS * dt) }
  if (aged.burningSince === null) return aged
  return withStructure(aged, Math.max(0, aged.structure - (FIRE_AT_STRUCTURE / BURN_S) * dt), tick, null)
}

/** Healthy state returns the identical spec; existing flight math stays intact.
 *  `engine` is the power fraction to fly, `engineOutput`'s when the caller has
 *  a tick; it defaults to plain health, as before damage stages. */
export function damagedSpec(spec: AircraftSpec, damage: Damage, engine = damage.engine): AircraftSpec {
  if (engine === 1 && damage.roll === 1 && damage.pitch === 1 && damage.yaw === 1) return spec
  return {
    ...spec,
    engine: { ...spec.engine, maxPowerW: spec.engine.maxPowerW * engine, staticThrustN: spec.engine.staticThrustN * engine },
    rates: {
      ...spec.rates,
      maxRollRateDegPerSec: spec.rates.maxRollRateDegPerSec * damage.roll,
      maxPitchRateDegPerSec: spec.rates.maxPitchRateDegPerSec * damage.pitch,
      maxYawRateDegPerSec: spec.rates.maxYawRateDegPerSec * damage.yaw,
    },
  }
}
