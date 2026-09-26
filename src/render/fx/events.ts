import type { ContactSurface } from '../../sim/contact.js'
import { DT } from '../../sim/flight/model.js'
import type { RenderState } from '../../sim/interpolate.js'
import type { Impact } from '../../sim/loop.js'
import { qRotate } from '../../sim/math/quat.js'
import { add, v3, ZERO, type Vec3 } from '../../sim/math/vec3.js'
import type { CombatState } from '../../sim/weapons/combat.js'
import type { CombatImpact } from '../../sim/weapons/impacts.js'
import type { RecipeId } from './catalog.js'

/**
 * Sim state -> effect events (ordnance-and-effects design §3.2). Pure. One
 * call per rendered frame. Edge memory follows `hitFlash.ts`'s old rule
 * (`nextHitFlashes`, deleted in E1 Task 10): a tick that moves backwards is
 * a new flight, and the old flight's edges are forgotten with it.
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
  readonly combat: Pick<CombatState, 'impacts' | 'aircraft' | 'ships' | 'structures'>
  readonly aircraft: readonly { readonly id: string; readonly impact: Impact | null; readonly state: { readonly velocity: Vec3 } }[]
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
/** Where engine smoke leaves the airframe, body frame (+x nose): smoke.ts's
 *  first puff, `(3.2, 0.7, 0)`, carried over unchanged. */
export const ENGINE_SMOKE_OFFSET_BODY: Vec3 = v3(3.2, 0.7, 0)

export function impactRecipe(i: Pick<CombatImpact, 'cause' | 'outcome' | 'surface'>): RecipeId | null {
  if (i.outcome === 'expired' || i.surface === 'air') return null
  if (i.cause === 'round') return `round.${i.surface}` as RecipeId
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
        sustained.push({ key: `kill:${a.id}`, recipe: 'kill.air', intensity: 1 - age / KILL_TRAIL_S, position: pose.position, velocity: ZERO })
      }
    } else if (a.impact === null && rec.damage.engine < 1) {
      sustained.push({
        key: `engine:${a.id}`, recipe: 'engine.smoke', intensity: 1 - clamp01(rec.damage.engine),
        position: add(pose.position, qRotate(pose.attitude, ENGINE_SMOKE_OFFSET_BODY)), velocity: a.state.velocity,
      })
    }
  })

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
