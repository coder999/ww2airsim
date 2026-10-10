import { z } from 'zod'
import { FX_SHEETS } from './sheetManifest.js'

/**
 * Effect recipes (ordnance-and-effects design §3.3). A recipe is a list of
 * emitters; `system.ts` runs them. Semantics, exactly:
 * - `burst`: `count` particles when the recipe is TRIGGERED.
 * - `stream` with `durationS`: a timed stream a trigger starts at its point.
 * - `stream` without `durationS`: a sustained stream, run only while a
 *   state-driven emitter of this recipe is active (`events.ts`'s
 *   `FxSustained`), at `ratePerS * intensity`, from that emitter's position.
 * Sizes and durations are estimates unless `source` cites a figure (spec
 * §3.3); E2 and E3 replace them with the baked sheets' own tuning and the
 * NHHC/NARA photographs (spec §5.1). E2 touches this file's NUMBERS only.
 */
export const RECIPE_IDS = [
  'bomb.land', 'bomb.water', 'rocket.land', 'rocket.water', 'rocket.motor',
  'round.land', 'round.water', 'round.deck', 'round.structure', 'round.ship', 'round.aircraft',
  'crash.land', 'crash.water', 'crash.deck',
  'kill.air', 'engine.smoke', 'smoke.black', 'aircraft.fire', 'ship.fire', 'structure.collapse',
] as const
export type RecipeId = (typeof RECIPE_IDS)[number]
/** Recipes `events.ts` drives as state-driven emitters (they carry a sustained stream). */
export const SUSTAINED_RECIPES: readonly RecipeId[] = ['engine.smoke', 'smoke.black', 'aircraft.fire', 'ship.fire', 'kill.air', 'structure.collapse', 'rocket.motor']

const range = z.tuple([z.number().nonnegative(), z.number().nonnegative()]).refine(([a, b]) => a <= b, 'range must be [min, max]')
const emitterSchema = z.object({
  mode: z.enum(['burst', 'stream']),
  sheet: z.enum([...FX_SHEETS, 'streak']),
  count: z.number().int().positive().optional(),
  ratePerS: z.number().positive().optional(),
  delayS: z.number().nonnegative().default(0),
  durationS: z.number().positive().optional(),
  lifeS: range,
  speedMps: range,
  direction: z.enum(['up', 'sphere', 'ring']),
  spreadDeg: z.number().min(0).max(180),
  radiusM: z.number().nonnegative().default(0),
  sizeM: z.tuple([z.number().positive(), z.number().positive()]),
  alpha: z.number().min(0).max(1),
  tint: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]),
  emissive: z.number().nonnegative().default(0),
  dragPerS: z.number().nonnegative(),
  accelYMps2: z.number(),
  inheritVelocity: z.number().min(0).max(1).default(0),
  spinRadPerS: z.number().nonnegative().default(0.2),
  seaKill: z.boolean().default(false),
  frameRateHz: z.number().positive().optional(),
  streakS: z.number().positive().optional(),
})
  .refine((e) => e.mode !== 'burst' || (e.count !== undefined && e.ratePerS === undefined && e.durationS === undefined), 'a burst has a count and nothing else')
  .refine((e) => e.mode !== 'stream' || (e.ratePerS !== undefined && e.count === undefined), 'a stream has a rate')
  .refine((e) => e.sheet !== 'streak' || e.streakS !== undefined, 'a streak needs streakS')
export type FxEmitter = z.output<typeof emitterSchema>
const recipeSchema = z.object({ emitters: z.array(emitterSchema).min(1), source: z.string().min(1) })
export type FxRecipe = z.output<typeof recipeSchema>
export type FxCatalog = Readonly<Record<RecipeId, FxRecipe>>
export const fxCatalogSchema = z.record(z.enum(RECIPE_IDS), recipeSchema)
  .refine((c) => RECIPE_IDS.every((id) => id in c), 'every recipe id must be defined')

type RawEmitter = z.input<typeof emitterSchema>
const ESTIMATE = 'estimate (sizes carried from E1 through the baked sheets\' fill, plan E2 Ruling R9; E3 replaces the water figures with cited ones, design §5.1)'
const DIRT: [number, number, number] = [0.3, 0.25, 0.19]
const DUST: [number, number, number] = [0.45, 0.39, 0.31]
const SMOKE: [number, number, number] = [0.1, 0.1, 0.11]
// Water's albedo x WATER_GAIN. The pack scales each sheet so its brightest lit texels reach 1
// (Ruling R6), and on the liquid water sheets the back-lit pass sets that scale: the sunlit
// passes sit at a median of ~0.23 against dust's ~0.45 (plan E2 Task 10, measured 2026-09-28),
// which drew grey spray. The gain puts the sunlit side back near white.
const WATER_GAIN = 2.5
const WATER: [number, number, number] = [0.85 * WATER_GAIN, 0.88 * WATER_GAIN, 0.9 * WATER_GAIN]
const SPARK: [number, number, number] = [1, 0.72, 0.38]
const GRAVITY = -9.81

/** Spec §3.3: "smaller versions of the above". Size and speed scale by `k`,
 *  counts and rates by `k` too, floored at one particle. */
const smaller = (emitters: readonly RawEmitter[], k: number): RawEmitter[] => emitters.map((e) => ({
  ...e,
  sizeM: [e.sizeM[0] * k, e.sizeM[1] * k],
  speedMps: [e.speedMps[0] * k, e.speedMps[1] * k],
  ...(e.count !== undefined ? { count: Math.max(1, Math.round(e.count * k)) } : {}),
  ...(e.ratePerS !== undefined ? { ratePerS: e.ratePerS * k } : {}),
  ...(e.durationS !== undefined ? { durationS: e.durationS * k } : {}),
}))

// Spawn radius is 0.3 of E1's start size; plan E2 Ruling R9 grew sizes by the fireball
// sheet's k = 1.56 while the visible size stayed put, so 0.3 / 1.56 keeps the radius too.
// The baked sheet burns in its first 19 of 64 frames, so `life` is about 3x the visible fire:
// E1's 1.2-1.8 s left 0.4-0.5 s of fire, and callers now pass double that (plan E2 Task 10, Mark's ruling).
const fireball = (count: number, size: [number, number], life: [number, number]): RawEmitter =>
  ({ mode: 'burst', sheet: 'fireball', count, lifeS: life, speedMps: [3, 10], direction: 'sphere', spreadDeg: 180, radiusM: size[0] * 0.19, sizeM: size, alpha: 1, tint: [1, 1, 1], emissive: 1, dragPerS: 1.5, accelYMps2: 3 })
const ejecta = (count: number): RawEmitter =>
  ({ mode: 'burst', sheet: 'streak', count, lifeS: [1.5, 3], speedMps: [25, 60], direction: 'up', spreadDeg: 50, sizeM: [0.6, 0.4], alpha: 1, tint: DIRT, dragPerS: 0.3, accelYMps2: GRAVITY, streakS: 0.06 })
const column = (rate: number, durationS: number, size: [number, number]): RawEmitter =>
  ({ mode: 'stream', sheet: 'smoke', ratePerS: rate, delayS: 0.5, durationS, lifeS: [8, 12], speedMps: [4, 8], direction: 'up', spreadDeg: 15, sizeM: size, alpha: 0.6, tint: SMOKE, dragPerS: 0.4, accelYMps2: 1.5 })
const waterColumn = (count: number, size: [number, number]): RawEmitter =>
  ({ mode: 'burst', sheet: 'water-column', count, lifeS: [2.5, 3.5], speedMps: [30, 45], direction: 'up', spreadDeg: 8, sizeM: size, alpha: 0.9, tint: WATER, dragPerS: 0.8, accelYMps2: GRAVITY, seaKill: true })
const crown = (count: number): RawEmitter =>
  ({ mode: 'burst', sheet: 'spray', count, lifeS: [2, 3], speedMps: [20, 35], direction: 'up', spreadDeg: 35, sizeM: [4.5, 13], alpha: 0.8, tint: WATER, dragPerS: 0.6, accelYMps2: GRAVITY, seaKill: true })
const surge = (count: number): RawEmitter =>
  ({ mode: 'burst', sheet: 'spray', count, lifeS: [3, 5], speedMps: [18, 28], direction: 'ring', spreadDeg: 5, sizeM: [6.7, 22], alpha: 0.5, tint: WATER, dragPerS: 1.2, accelYMps2: 0 })
const sparks = (count: number): RawEmitter =>
  ({ mode: 'burst', sheet: 'streak', count, lifeS: [0.12, 0.25], speedMps: [15, 30], direction: 'up', spreadDeg: 80, sizeM: [0.15, 0.1], alpha: 1, tint: SPARK, emissive: 3, dragPerS: 2, accelYMps2: GRAVITY, streakS: 0.03 })

const BOMB_LAND: RawEmitter[] = [
  fireball(6, [22, 47], [2.4, 3.6]),
  ejecta(40),
  { mode: 'burst', sheet: 'dust', count: 16, lifeS: [3, 5], speedMps: [15, 25], direction: 'ring', spreadDeg: 10, sizeM: [12, 34], alpha: 0.7, tint: DUST, dragPerS: 1.2, accelYMps2: 0.3 },
  column(6, 18, [12, 41]),
]
const BOMB_WATER: RawEmitter[] = [waterColumn(5, [9.2, 23]), crown(24), surge(16)]

const RAW: Record<RecipeId, { emitters: RawEmitter[]; source: string }> = {
  'bomb.land': { emitters: BOMB_LAND, source: ESTIMATE },
  'bomb.water': { emitters: BOMB_WATER, source: ESTIMATE },
  'rocket.land': { emitters: smaller(BOMB_LAND, 0.45), source: ESTIMATE },
  'rocket.water': { emitters: smaller(BOMB_WATER, 0.45), source: ESTIMATE },
  'round.land': { emitters: [{ mode: 'burst', sheet: 'dust', count: 2, lifeS: [0.8, 1.2], speedMps: [2, 5], direction: 'up', spreadDeg: 30, sizeM: [1.2, 3.9], alpha: 0.6, tint: DUST, dragPerS: 2, accelYMps2: 0.2 }], source: ESTIMATE },
  'round.water': { emitters: [{ mode: 'burst', sheet: 'spray', count: 2, lifeS: [0.6, 0.9], speedMps: [6, 10], direction: 'up', spreadDeg: 10, sizeM: [0.56, 1.8], alpha: 0.8, tint: WATER, dragPerS: 0.5, accelYMps2: GRAVITY, seaKill: true }], source: ESTIMATE },
  'round.deck': { emitters: [sparks(4), { mode: 'burst', sheet: 'dust', count: 1, lifeS: [0.6, 0.9], speedMps: [1, 3], direction: 'up', spreadDeg: 40, sizeM: [0.77, 2.3], alpha: 0.5, tint: DUST, dragPerS: 2, accelYMps2: 0.2 }], source: ESTIMATE },
  'round.structure': { emitters: [sparks(4), { mode: 'burst', sheet: 'dust', count: 1, lifeS: [0.6, 0.9], speedMps: [1, 3], direction: 'up', spreadDeg: 40, sizeM: [0.77, 2.3], alpha: 0.5, tint: DUST, dragPerS: 2, accelYMps2: 0.2 }], source: ESTIMATE },
  'round.ship': { emitters: [sparks(4), { mode: 'burst', sheet: 'smoke', count: 1, lifeS: [0.6, 0.9], speedMps: [1, 3], direction: 'up', spreadDeg: 40, sizeM: [0.58, 1.7], alpha: 0.4, tint: SMOKE, dragPerS: 2, accelYMps2: 0.2 }], source: ESTIMATE },
  // Ruling R4: the pre-E1 renderer's own 'hit' flash (2.5 m, 0.25 s), deleted in E1 Task 10.
  'round.aircraft': { emitters: [sparks(3), { ...fireball(1, [1.6, 3.9], [0.2, 0.3]), radiusM: 0 }], source: 'pre-E1 flashAppearance(\'hit\'): 2.5 m, 0.25 s (estimate, Plan 6)' },
  'crash.land': { emitters: [fireball(8, [28, 62], [2.8, 4]), ejecta(50), column(8, 30, [14, 46])], source: ESTIMATE },
  'crash.water': { emitters: [waterColumn(6, [12, 30]), crown(30), surge(20)], source: ESTIMATE },
  'crash.deck': { emitters: [fireball(6, [19, 44], [2.4, 3.6]), sparks(20), column(6, 20, [9.3, 30])], source: ESTIMATE },
  // Ruling R6: fireball on the kill edge; the trail is sustained at the wreck, which falls since
  // damage stages (2026-10-09). The dark fragments are the airframe's skin and spars going down.
  'kill.air': { emitters: [fireball(6, [16, 41], [2.4, 3.2]), sparks(16),
    { ...ejecta(30), direction: 'sphere', spreadDeg: 180, speedMps: [8, 30], lifeS: [3, 5], sizeM: [0.9, 0.6], tint: [0.06, 0.06, 0.07], dragPerS: 0.2, streakS: 0.04 },
    { mode: 'stream', sheet: 'smoke', ratePerS: 10, lifeS: [4, 7], speedMps: [1, 3], direction: 'sphere', spreadDeg: 180, sizeM: [3.5, 16], alpha: 0.7, tint: SMOKE, dragPerS: 0.6, accelYMps2: 0.8 }], source: ESTIMATE },
  // Today's smoke.ts: dark (0x23262b), opacity 0.25..0.8 with damage.
  // Damage stages round 2: grey, light at low intensity and heavy at high (rate follows intensity);
  // smoke.black joins it for the last stretch before the fire (events.ts SMOKE_BLACK_FROM).
  'engine.smoke': { emitters: [{ mode: 'stream', sheet: 'smoke', ratePerS: 14, lifeS: [2, 3.5], speedMps: [0.5, 2], direction: 'sphere', spreadDeg: 180, sizeM: [1.4, 6.9], alpha: 0.6, tint: [0.3, 0.3, 0.32], dragPerS: 1.5, accelYMps2: 0.5, inheritVelocity: 0.15 }], source: 'smoke.ts smokeAppearance (estimate, Plan 6); grey from damage stages round 2' },
  'smoke.black': { emitters: [{ mode: 'stream', sheet: 'smoke', ratePerS: 16, lifeS: [3, 5], speedMps: [0.5, 2], direction: 'sphere', spreadDeg: 180, sizeM: [2.2, 9], alpha: 0.75, tint: [0.05, 0.05, 0.06], dragPerS: 1.2, accelYMps2: 0.5, inheritVelocity: 0.12 }], source: 'estimate (damage stages round 2): engine.smoke, black and bigger' },
  // Plan E2 Ruling R8: the HVAR's motor, at its nozzle while it burns (events.ts ROCKET_BURN_S).
  // 90% inherited velocity leaves a plume of about 5 m behind a 300 m/s rocket.
  'rocket.motor': { emitters: [
    { mode: 'stream', sheet: 'flame', ratePerS: 90, lifeS: [0.05, 0.09], speedMps: [0, 2], direction: 'sphere', spreadDeg: 180, sizeM: [0.7, 1.1], alpha: 0.95, tint: [1, 1, 1], emissive: 1, dragPerS: 0, accelYMps2: 0, inheritVelocity: 0.9, frameRateHz: 24 },
    { mode: 'stream', sheet: 'smoke', ratePerS: 30, lifeS: [1.2, 2.2], speedMps: [0, 1], direction: 'sphere', spreadDeg: 180, sizeM: [0.5, 3], alpha: 0.35, tint: [0.62, 0.62, 0.64], dragPerS: 1.2, accelYMps2: 0.2 },
  ], source: 'estimate (plan E2 Ruling R8): burn time mirrors hvar.burnS 1.0 s; plume and exhaust-smoke sizes are estimates' },
  // Damage stages (2026-10-09): a burning airframe, from fire to explosion or impact. Flame trails
  // the engine as rocket.motor's does, inheriting most of the airplane's speed; thick black smoke after.
  'aircraft.fire': { emitters: [
    { mode: 'stream', sheet: 'flame', ratePerS: 60, lifeS: [0.15, 0.3], speedMps: [0, 2], direction: 'sphere', spreadDeg: 180, radiusM: 0.4, sizeM: [1.6, 2.8], alpha: 0.95, tint: [1, 1, 1], emissive: 1, dragPerS: 0, accelYMps2: 0, inheritVelocity: 0.85, frameRateHz: 24 },
    { mode: 'stream', sheet: 'smoke', ratePerS: 20, lifeS: [3, 5], speedMps: [0.5, 2], direction: 'sphere', spreadDeg: 180, sizeM: [2.5, 11], alpha: 0.75, tint: SMOKE, dragPerS: 1, accelYMps2: 0.6, inheritVelocity: 0.1 },
  ], source: 'estimate (damage stages, 2026-10-09): rocket.motor\'s flame grown to an engine fire; kill.air\'s smoke' },
  'ship.fire': { emitters: [
    { mode: 'stream', sheet: 'flame', ratePerS: 20, lifeS: [0.8, 1.2], speedMps: [1, 3], direction: 'up', spreadDeg: 20, radiusM: 3, sizeM: [4.6, 7], alpha: 0.9, tint: [1, 1, 1], emissive: 1, dragPerS: 1, accelYMps2: 2, frameRateHz: 12 },
    { mode: 'stream', sheet: 'smoke', ratePerS: 8, lifeS: [10, 14], speedMps: [3, 6], direction: 'up', spreadDeg: 12, radiusM: 3, sizeM: [9.3, 46], alpha: 0.65, tint: SMOKE, dragPerS: 0.3, accelYMps2: 1.2 },
  ], source: ESTIMATE },
  // Strike design §4: "a 60 s fading smoke column" (events.ts COLLAPSE_SMOKE_S).
  'structure.collapse': { emitters: [
    { mode: 'burst', sheet: 'dust', count: 24, lifeS: [3, 6], speedMps: [6, 14], direction: 'ring', spreadDeg: 25, radiusM: 6, sizeM: [9.3, 31], alpha: 0.75, tint: DUST, dragPerS: 1, accelYMps2: 0.3 },
    { mode: 'stream', sheet: 'smoke', ratePerS: 5, lifeS: [10, 14], speedMps: [2, 5], direction: 'up', spreadDeg: 15, radiusM: 4, sizeM: [6.9, 35], alpha: 0.55, tint: SMOKE, dragPerS: 0.3, accelYMps2: 1.2 },
  ], source: 'strike design §4 (60 s column); sizes estimate' },
}

export const FX_CATALOG: FxCatalog = fxCatalogSchema.parse(RAW) as FxCatalog
