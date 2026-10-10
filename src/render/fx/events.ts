import type { ContactSurface } from '../../sim/contact.js'
import { DT } from '../../sim/flight/model.js'
import type { RenderState } from '../../sim/interpolate.js'
import type { Impact } from '../../sim/loop.js'
import { qRotate } from '../../sim/math/quat.js'
import { add, length, scale, v3, ZERO, type Vec3 } from '../../sim/math/vec3.js'
import type { CombatState } from '../../sim/weapons/combat.js'
import type { CombatImpact } from '../../sim/weapons/impacts.js'
import { SEA_LEVEL_M } from '../../sim/world/terrain.js'
import type { RecipeId } from './catalog.js'
import { engineHealths, smokeLevel } from '../../sim/damage/model.js'

/**
 * Sim state -> effect events (ordnance-and-effects design §3.2). Pure. One
 * call per rendered frame. Edge memory follows the same rule the old
 * per-effect edge detectors used (deleted in E1 Task 10): a tick that moves
 * backwards is a new flight, and the old flight's edges are forgotten with it.
 */
export type FxTrigger = { readonly recipe: RecipeId; readonly position: Vec3; readonly velocity: Vec3 }
export type FxSustained = { readonly key: string; readonly recipe: RecipeId; readonly intensity: number; readonly position: Vec3; readonly velocity: Vec3 }
export type FxMemory = {
  readonly lastTick: number
  readonly lastImpactTick: number
  readonly seenCrashTick: Readonly<Record<string, number>>
  readonly seenKillTick: Readonly<Record<string, number>>
  readonly seenCollapseTick: Readonly<Record<string, number>>
}
/** Ring ticks start at 1 (the first step's tick), so 0 means "nothing seen". */
export const NO_FX_MEMORY: FxMemory = { lastTick: 0, lastImpactTick: 0, seenCrashTick: {}, seenKillTick: {}, seenCollapseTick: {} }

export type FxWorldView = {
  readonly tick: number
  readonly combat: Pick<CombatState, 'impacts' | 'aircraft' | 'ships' | 'structures' | 'projectiles'>
  readonly aircraft: readonly {
    readonly id: string; readonly impact: Impact | null; readonly state: { readonly velocity: Vec3 }
    /** For a multi-engine airplane's engine points; absent reads as single-engine. */
    readonly spec?: { readonly combat?: { readonly zones: readonly { readonly center: readonly [number, number, number]; readonly system: string; readonly engine?: number | undefined }[] } | undefined }
  }[]
  /** Parallel to `aircraft`: this frame's interpolated poses (frame.ts `posesFor`). */
  readonly poses: readonly RenderState[]
  /** World metres, per ship id: the view's smoke origin (Ruling R13). */
  readonly shipSmokeOrigins: ReadonlyMap<string, Vec3>
  /** World metres, per structure id: the rendered building's smoke anchor (Ruling R13). */
  readonly structureAnchors: ReadonlyMap<string, Vec3>
}

/** Seconds the kill trail rises from the wreck, fading (Ruling R6). Estimate. */
export const KILL_TRAIL_S = 20
/** Strike design §4: "a 60 s fading smoke column". */
export const COLLAPSE_SMOKE_S = 60
/** Smoke level above which black smoke joins the grey: the last stretch before the fire. ESTIMATE. */
export const SMOKE_BLACK_FROM = 0.7

/** Each engine's point, body frame, port to starboard: an indexed engine zone's center (a
 *  multi-engine airplane, damage stages round 2), or none. */
function enginePointsBody(a: FxWorldView['aircraft'][number]): Vec3[] {
  const zones = (a.spec?.combat?.zones ?? []).filter((z) => z.system === 'engine' && z.engine !== undefined)
  return [...zones].sort((p, q) => p.engine! - q.engine!).map((z) => v3(z.center[0], z.center[1], z.center[2]))
}

/** Where engine smoke leaves the airframe, body frame (+x nose): smoke.ts's
 *  first puff, `(3.2, 0.7, 0)`, carried over unchanged. */
export const ENGINE_SMOKE_OFFSET_BODY: Vec3 = v3(3.2, 0.7, 0)

/**
 * How long a rocket's motor flame shows, seconds. Rendering-only estimate:
 * `Projectile` carries no store-type field (only `kind`), so this cannot be
 * read off `content/aircraft/f6f-hellcat.json`'s `stores.types.hvar.burnS`
 * at runtime -- it is mirrored from that figure (1.0 s, itself an estimate
 * per that file's own `stores.source`), and will drift silently if that
 * content value ever changes.
 */
export const ROCKET_BURN_S = 1.0

/** The HVAR model's aft end, metres behind its origin along its axis: content/ordnance/hvar.glb's
 *  bounds min x is -0.758 (measured 2026-09-27; fxEvents.test.ts re-measures it). The axis sits
 *  0.09 m below the origin; ignored, against a 0.7-1.1 m flame (plan E2 Ruling R8). */
export const ROCKET_NOZZLE_AFT_M = 0.76

export function impactRecipe(i: Pick<CombatImpact, 'cause' | 'outcome' | 'surface'>): RecipeId | null {
  if (i.outcome === 'expired' || i.surface === 'air') return null
  if (i.cause === 'round') return `round.${i.surface}` as RecipeId
  // A torpedo's hit throws up the water column a near miss in the sea does; its water entry and a
  // break-up are the smaller rocket splash.
  if (i.cause === 'torpedo') return i.outcome === 'detonated' ? 'bomb.water' : 'rocket.water'
  const water = i.surface === 'water'
  if (i.cause === 'bomb') return water ? 'bomb.water' : 'bomb.land'
  return water ? 'rocket.water' : 'rocket.land'
}
export const crashRecipe = (s: ContactSurface): RecipeId => `crash.${s}` as RecipeId

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

export function nextFxEvents(prev: FxMemory, w: FxWorldView): { readonly memory: FxMemory; readonly triggers: readonly FxTrigger[]; readonly sustained: readonly FxSustained[] } {
  const from = w.tick < prev.lastTick ? NO_FX_MEMORY : prev
  const seenCrashTick: Record<string, number> = { ...from.seenCrashTick }
  const seenKillTick: Record<string, number> = { ...from.seenKillTick }
  const seenCollapseTick: Record<string, number> = { ...from.seenCollapseTick }
  const triggers: FxTrigger[] = []
  const sustained: FxSustained[] = []

  let lastImpactTick = from.lastImpactTick
  for (const i of w.combat.impacts) {
    if (i.tick <= from.lastImpactTick) continue
    lastImpactTick = Math.max(lastImpactTick, i.tick)
    const recipe = impactRecipe(i)
    if (recipe !== null) triggers.push({ recipe, position: i.point, velocity: ZERO })
  }

  w.aircraft.forEach((a, index) => {
    const pose = w.poses[index]
    const rec = w.combat.aircraft[a.id]
    if (pose === undefined || rec === undefined) return
    if (a.impact !== null && seenCrashTick[a.id] !== a.impact.tick) {
      seenCrashTick[a.id] = a.impact.tick
      triggers.push({ recipe: crashRecipe(a.impact.surface), position: a.impact.position, velocity: ZERO })
    }
    const destroyedAt = rec.damage.destroyedAt
    if (destroyedAt !== null) {
      if (seenKillTick[a.id] !== destroyedAt) {
        seenKillTick[a.id] = destroyedAt
        triggers.push({ recipe: 'kill.air', position: pose.position, velocity: ZERO })
      }
      const age = (w.tick - destroyedAt) * DT
      if (a.impact === null && age < KILL_TRAIL_S) {
        sustained.push({ key: `kill:${a.id}`, recipe: 'kill.air', intensity: 1 - age / KILL_TRAIL_S, position: pose.position, velocity: a.state.velocity })
      }
      // The wreck falls burning (damage stages, 2026-10-09), all the way down.
      if (a.impact === null) sustained.push({ key: `fire:${a.id}`, recipe: 'aircraft.fire', intensity: 1, position: pose.position, velocity: a.state.velocity })
    } else if (a.impact === null && rec.damage.burningSince !== null) {
      // From the worst engine: a bomber burns at a nacelle, a fighter at its nose.
      const healths = engineHealths(rec.damage)
      const worst = healths.indexOf(Math.min(...healths))
      const at = enginePointsBody(a)[worst] ?? ENGINE_SMOKE_OFFSET_BODY
      sustained.push({
        key: `fire:${a.id}`, recipe: 'aircraft.fire', intensity: 1,
        position: add(pose.position, qRotate(pose.attitude, at)), velocity: a.state.velocity,
      })
    } else if (a.impact === null) {
      // Damage stages round 2 (Mark): smoke follows overall damage, light, then heavy, then black
      // just before the fire. A multi-engine airplane smokes from each hit engine, and from the
      // fuselage for its structure.
      const points = enginePointsBody(a)
      const smoke = (key: string, level: number, body: Vec3): void => {
        if (level <= 0) return
        const position = add(pose.position, qRotate(pose.attitude, body))
        sustained.push({ key, recipe: 'engine.smoke', intensity: level, position, velocity: a.state.velocity })
        if (level > SMOKE_BLACK_FROM) sustained.push({ key: `${key}:black`, recipe: 'smoke.black', intensity: (level - SMOKE_BLACK_FROM) / (1 - SMOKE_BLACK_FROM), position, velocity: a.state.velocity })
      }
      if (rec.damage.engines === undefined) smoke(`engine:${a.id}`, smokeLevel(rec.damage), ENGINE_SMOKE_OFFSET_BODY)
      else {
        rec.damage.engines.forEach((h, i) => smoke(`engine:${a.id}#${i}`, clamp01(1 - h), points[i] ?? ENGINE_SMOKE_OFFSET_BODY))
        smoke(`engine:${a.id}`, smokeLevel({ ...rec.damage, engine: 1 }), ZERO)
      }
    }
  })

  for (const p of w.combat.projectiles) {
    if (p.kind !== 'rocket' || p.ageS >= ROCKET_BURN_S) continue
    const speed = length(p.velocity)
    const aft = speed > 1e-9 ? scale(p.velocity, -ROCKET_NOZZLE_AFT_M / speed) : ZERO
    sustained.push({ key: `rocket:${p.id}`, recipe: 'rocket.motor', intensity: 1, position: add(p.position, aft), velocity: p.velocity })
  }

  // D1: a running torpedo's wake, at the surface over it.
  for (const p of w.combat.projectiles) {
    if (p.kind !== 'torpedo' || p.runM === undefined) continue
    sustained.push({ key: `torpedo:${p.id}`, recipe: 'torpedo.wake', intensity: 1, position: v3(p.position.x, SEA_LEVEL_M + 0.2, p.position.z), velocity: ZERO })
  }

  for (const [id, d] of Object.entries(w.combat.ships)) {
    const origin = w.shipSmokeOrigins.get(id)
    if (origin === undefined || d.fire <= 0 || d.sinkingFraction >= 1) continue
    sustained.push({ key: `ship:${id}`, recipe: 'ship.fire', intensity: Math.min(1, d.fire), position: origin, velocity: ZERO })
  }

  for (const [id, d] of Object.entries(w.combat.structures)) {
    const anchor = w.structureAnchors.get(id)
    if (anchor === undefined || d.destroyedTick === null) continue
    if (seenCollapseTick[id] !== d.destroyedTick) {
      seenCollapseTick[id] = d.destroyedTick
      triggers.push({ recipe: 'structure.collapse', position: anchor, velocity: ZERO })
    }
    const age = (w.tick - d.destroyedTick) * DT
    if (age < COLLAPSE_SMOKE_S) sustained.push({ key: `structure:${id}`, recipe: 'structure.collapse', intensity: 1 - age / COLLAPSE_SMOKE_S, position: anchor, velocity: ZERO })
  }

  return { memory: { lastTick: w.tick, lastImpactTick, seenCrashTick, seenKillTick, seenCollapseTick }, triggers, sustained }
}
