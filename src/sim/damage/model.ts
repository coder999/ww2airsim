import type { AircraftSpec } from '../flight/schema.js'
import type { DamageSystem } from '../weapons/schema.js'

export type Damage = Readonly<Record<DamageSystem, number>> & {
  readonly structure: number
  readonly destroyedAt: number | null
  readonly attacker: string | null
}
export const healthyDamage = (): Damage => ({
  structure: 1, engine: 1, roll: 1, pitch: 1, yaw: 1, fuel: 1,
  leftGuns: 1, rightGuns: 1, destroyedAt: null, attacker: null,
})

/** `hitScale` (A6M spec §5) multiplies the target's `damagePerHit` for one
 *  round: a 20 mm shell is 3, a 7.7 mm bullet 0.4. Default 1 is every hit
 *  before per-gun types, bit for bit (x * 1 === x). */
export function damageFromHit(spec: AircraftSpec, before: Damage, system: DamageSystem, tick: number, attacker: string, hitScale = 1): Damage {
  const c = spec.combat
  if (c === undefined || before.destroyedAt !== null) return before
  const amount = c.damagePerHit * hitScale
  const structure = Math.max(0, before.structure - amount / c.structureHp)
  // Epsilon makes exactly twelve 10/120 hits lethal despite roundoff.
  const destroyed = structure < 1e-10
  return {
    ...before, structure: destroyed ? 0 : structure,
    [system]: Math.max(0, before[system] - amount / c.subsystemHp),
    destroyedAt: destroyed ? tick : null, attacker: destroyed ? attacker : before.attacker,
  }
}

export function ageDamage(spec: AircraftSpec, damage: Damage, dt: number): Damage {
  if (damage.engine === 1 || damage.engine === 0 || damage.destroyedAt !== null || spec.combat === undefined) return damage
  return { ...damage, engine: Math.max(0, damage.engine - (1 - damage.engine) * spec.combat.engineDecayPerS * dt) }
}

/** Healthy state returns the identical spec; existing flight math stays intact. */
export function damagedSpec(spec: AircraftSpec, damage: Damage): AircraftSpec {
  if (damage.engine === 1 && damage.roll === 1 && damage.pitch === 1 && damage.yaw === 1) return spec
  return {
    ...spec,
    engine: { ...spec.engine, maxPowerW: spec.engine.maxPowerW * damage.engine, staticThrustN: spec.engine.staticThrustN * damage.engine },
    rates: {
      ...spec.rates,
      maxRollRateDegPerSec: spec.rates.maxRollRateDegPerSec * damage.roll,
      maxPitchRateDegPerSec: spec.rates.maxPitchRateDegPerSec * damage.pitch,
      maxYawRateDegPerSec: spec.rates.maxYawRateDegPerSec * damage.yaw,
    },
  }
}
