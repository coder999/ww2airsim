import { DT } from '../flight/model.js'
import { add, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import { flyProjectile, type Projectile } from './combat.js'
import { tupleVector } from './geometry.js'
import { gunBallistics, isPrimaryGun } from './gunTypes.js'
import type { CombatSpec } from './schema.js'

type GunMount = CombatSpec['guns'][number]

export type Harmonization = {
  /** Angle from the sight line (the eye, along body +x) DOWN to the mean
   *  impact point at `rangeM`. Positive means the sight is drawn below the
   *  boresight. */
  readonly depressionRad: number
  /** The range, along body +x, the sight is harmonized at: the guns'
   *  `convergenceM`. */
  readonly rangeM: number
  /** The reference guns' mean impact point at `rangeM`, in the shooter's
   *  BODY frame (meters from the body origin), for a shooter in level,
   *  unaccelerated flight. The chase-view pipper is drawn here. */
  readonly impactBody: Vec3
  /** How many guns the mean was taken over. */
  readonly gunCount: number
}

export type HarmonizationOptions = {
  /** Which guns the sight is harmonized to. Default: the PRIMARY guns
   *  (isPrimaryGun, src/sim/weapons/gunTypes.ts) -- every gun on an airplane
   *  with one gun type, the 7.7 mm pair on the A6M. Each gun's round is
   *  flown with its own type's ballistics. */
  readonly referenceGuns?: (gun: GunMount, index: number) => boolean
  /** The shooter's airspeed in the reference condition. Drag acts on the
   *  round's AIR-relative speed, which includes the carrier's, so this moves
   *  the answer slightly (measured 2026-09-25 for the F6F: 0.2833 deg at
   *  0 m/s, 0.2843 at 120, 0.2852 at 200 -- 0.002 deg, 1 cm at 300 m, over
   *  the whole combat envelope, so it is not worth tracking in flight). */
  readonly airspeedMps?: number
}

/** 120 m/s: the airborne spawns' speed, and the spike's reference. */
const REFERENCE_AIRSPEED_MPS = 120

/**
 * Where a gun battery's rounds pass at convergence range, and the angle a
 * reflector sight at `eyePointM` must be depressed by to mark that point.
 *
 * Pure and spec-driven (the shootdown spike, 2026-09-25): the guns aim at
 * body `(convergenceM, 0, 0)` (`stepCombat`, combat.ts), the eye sits above
 * that line (`view.eyePointM`), and gravity drops the rounds on the way, so a
 * sight drawn on the eye's own boresight marks a point the rounds never
 * reach -- 1.5 m above the F6F's 300 m impact, outside the target's 0.85 m
 * hit box. Each reference gun's round is flown with production
 * `flyProjectile` at the sim's own `DT`, from a shooter in level flight at
 * `airspeedMps`, with no dispersion, until it crosses body x = `convergenceM`
 * in the shooter's co-moving frame.
 *
 * The reference condition is level, unaccelerated flight: a turning or
 * climbing shooter's rounds curve relative to the sight, as a real fixed
 * reflector sight's did. That is deflection, the pilot's job.
 */
export function gunHarmonization(
  combat: CombatSpec,
  eyePointM: readonly [number, number, number],
  options: HarmonizationOptions = {},
): Harmonization {
  const select = options.referenceGuns ?? ((g: GunMount) => isPrimaryGun(combat, g))
  const guns = combat.guns.filter((g, i) => select(g, i))
  if (guns.length === 0) throw new Error('gunHarmonization: no reference gun selected')
  const airspeed = options.airspeedMps ?? REFERENCE_AIRSPEED_MPS
  const rangeM = combat.convergenceM
  const carrier = v3(airspeed, 0, 0)

  let sum = v3(0, 0, 0)
  for (const gun of guns) sum = add(sum, impactAt(gun, combat, carrier, rangeM))
  const impactBody = scale(sum, 1 / guns.length)
  const eye = tupleVector(eyePointM)
  const depressionRad = Math.atan2(eye.y - impactBody.y, impactBody.x - eye.x)
  return { depressionRad, rangeM, impactBody, gunCount: guns.length }
}

function impactAt(gun: GunMount, combat: CombatSpec, carrier: Vec3, rangeM: number): Vec3 {
  const ballistic = gunBallistics(combat, gun.type)
  const origin = tupleVector(gun.position)
  const direction = normalize(sub(v3(rangeM, 0, 0), origin))
  let p: Projectile = {
    owner: 'harmonization', id: 0, position: origin, previous: origin,
    velocity: add(carrier, scale(direction, ballistic.muzzleVelocityMps)),
    lifeS: combat.lifetimeS, tracer: false, kind: 'round', ageS: 0,
  }
  // Body frame = world frame translated by the shooter's travel; the
  // shooter flies level along +x at `carrier`, so its body origin is at
  // carrier * t.
  let t = 0
  let before = origin
  while (p.lifeS > 0) {
    p = flyProjectile(p, DT, null, ballistic.dragPerM)
    t += DT
    const body = sub(p.position, scale(carrier, t))
    if (body.x >= rangeM) {
      const f = (rangeM - before.x) / (body.x - before.x)
      return add(before, scale(sub(body, before), f))
    }
    before = body
  }
  throw new Error(`gunHarmonization: a round never reaches ${rangeM} m within its ${combat.lifetimeS} s lifetime`)
}
