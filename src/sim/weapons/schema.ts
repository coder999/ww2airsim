import { z } from 'zod'

const positive = z.number().finite().positive()
const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
export const SYSTEMS = ['engine', 'roll', 'pitch', 'yaw', 'fuel', 'leftGuns', 'rightGuns'] as const
export type DamageSystem = typeof SYSTEMS[number]

export const CombatSpecSchema = z.object({
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
  guns: z.array(z.object({
    position: point,
    rounds: z.number().int().min(1).max(10000),
    group: z.enum(['leftGuns', 'rightGuns']),
  }).strict()).min(1).max(16),
  zones: z.array(z.object({
    id: z.string().min(1),
    center: point,
    halfSize: z.tuple([positive, positive, positive]),
    system: z.enum(SYSTEMS),
  }).strict()).min(1).max(32).refine(zones => new Set(zones.map(z => z.id)).size === zones.length, { message: 'duplicate hit zone id' }),
  source: z.string().min(1),
}).strict()
export type CombatSpec = z.infer<typeof CombatSpecSchema>
