import { z } from 'zod'

const positive = z.number().finite().positive()
const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
export const SYSTEMS = ['engine', 'roll', 'pitch', 'yaw', 'fuel', 'leftGuns', 'rightGuns'] as const
export type DamageSystem = typeof SYSTEMS[number]

/**
 * One gun's ballistics and hitting power (A6M Zero spec §5, Mark's decision
 * 2026-09-25), so a mixed battery -- the Zero's two 7.7 mm and two 20 mm -- is
 * not averaged into one gun. `hitScale` multiplies the TARGET's
 * `damagePerHit` for each round of this type that hits an aircraft.
 */
export const GunTypeSchema = z.object({
  roundsPerMinute: positive.max(2000),
  muzzleVelocityMps: positive.max(2000),
  dragPerM: z.number().finite().min(0).max(0.01),
  hitScale: positive.max(20),
}).strict()
export type GunType = z.infer<typeof GunTypeSchema>

export const CombatSpecSchema = z.object({
  /** The PRIMARY ballistic: an untyped mount fires with these, and the AI's
   *  lead (`src/sim/ai/pursuit.ts`) reads `muzzleVelocityMps` from here. */
  roundsPerMinute: positive.max(2000),
  muzzleVelocityMps: positive.max(2000),
  convergenceM: positive,
  dispersionDeg: z.number().finite().min(0).max(10),
  lifetimeS: positive.max(10),
  dragPerM: z.number().finite().min(0).max(0.01),
  damagePerHit: positive,
  roundDamage: positive,
  structureHp: positive,
  subsystemHp: positive,
  fuelLeakKgPerS: z.number().finite().min(0),
  engineDecayPerS: z.number().finite().min(0),
  /** Optional per-gun types; see `GunTypeSchema`. */
  gunTypes: z.record(z.string().min(1), GunTypeSchema).optional(),
  guns: z.array(z.object({
    position: point,
    rounds: z.number().int().min(1).max(10000),
    group: z.enum(['leftGuns', 'rightGuns']),
    /** A key of `gunTypes`; absent means the top-level ballistic. */
    type: z.string().min(1).optional(),
  }).strict()).min(1).max(16),
  zones: z.array(z.object({
    id: z.string().min(1),
    center: point,
    halfSize: z.tuple([positive, positive, positive]),
    system: z.enum(SYSTEMS),
  }).strict()).min(1).max(32).refine(zones => new Set(zones.map(z => z.id)).size === zones.length, { message: 'duplicate hit zone id' }),
  source: z.string().min(1),
}).strict().superRefine((c, ctx) => {
  for (const [i, g] of c.guns.entries()) {
    if (g.type !== undefined && c.gunTypes?.[g.type] === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['guns', i, 'type'], message: `gun type "${g.type}" is not in gunTypes` })
    }
  }
  // The AI leads with the top-level muzzle velocity, so at least one mount
  // must actually fire that ballistic, or the AI aims for rounds nobody fires.
  const primary = c.guns.some((g) => {
    if (g.type === undefined) return true
    const t = c.gunTypes?.[g.type]
    return t !== undefined && t.muzzleVelocityMps === c.muzzleVelocityMps && t.dragPerM === c.dragPerM
  })
  if (!primary) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['guns'], message: 'no mount fires the top-level (primary) ballistic' })
  }
})
export type CombatSpec = z.infer<typeof CombatSpecSchema>
