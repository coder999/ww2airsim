import type { CombatSpec } from './schema.js'

type GunMount = CombatSpec['guns'][number]

export type GunBallistics = {
  readonly roundsPerMinute: number
  readonly muzzleVelocityMps: number
  readonly dragPerM: number
  readonly hitScale: number
}

/** The ballistics a round of gun type `type` flies with. `undefined` is an
 *  untyped mount: the top-level (primary) fields at hitScale 1, which is
 *  exactly what every mount fired with before per-gun types existed. */
export function gunBallistics(combat: CombatSpec, type: string | undefined): GunBallistics {
  if (type === undefined) {
    return { roundsPerMinute: combat.roundsPerMinute, muzzleVelocityMps: combat.muzzleVelocityMps, dragPerM: combat.dragPerM, hitScale: 1 }
  }
  const t = combat.gunTypes?.[type]
  if (t === undefined) throw new Error(`gunBallistics: gun type "${type}" is not in this aircraft's gunTypes`)
  return t
}

/** A mount that fires the top-level ballistic: the one the AI leads with and
 *  the sight is harmonized to by default. Untyped, or typed to a type whose
 *  muzzle velocity and drag equal the top level's. */
export function isPrimaryGun(combat: CombatSpec, gun: GunMount): boolean {
  if (gun.type === undefined) return true
  const t = combat.gunTypes?.[gun.type]
  return t !== undefined && t.muzzleVelocityMps === combat.muzzleVelocityMps && t.dragPerM === combat.dragPerM
}
