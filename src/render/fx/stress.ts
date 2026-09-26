import { v3, ZERO, type Vec3 } from '../../sim/math/vec3.js'
import type { FxSustained, FxTrigger } from './events.js'

/** Named effects scenes for Tier 2 (`__ww2.fxStress`, DEV only). `budget`
 *  is spec §4.5's stress scene verbatim; the others are one effect each
 *  for the captures. Render-side injection, not sim events: what is
 *  measured is what the renderer draws. */
export const FX_STRESS_NAMES = ['budget', 'bomb-land', 'bomb-water', 'air-kill', 'smoke-base', 'cloud-fireball', 'eye-smoke', 'none'] as const
export type FxStressName = (typeof FX_STRESS_NAMES)[number]
export type FxStressScene = {
  readonly triggers: readonly FxTrigger[]
  readonly sustained: readonly FxSustained[]
  readonly roundsHz: number
  readonly center: Vec3
  readonly anchors: readonly { readonly name: string; readonly position: Vec3 }[]
}
/** Spec §4.5: "about 300 m from the target". */
export const STRESS_RANGE_M = 300
/** Close enough for the Tier 2 capture to resolve a one-pixel ground edge.
 *  The §4.5 budget scene continues to use STRESS_RANGE_M. */
const SMOKE_BASE_RANGE_M = 40

export function stressScene(name: FxStressName, eye: Vec3, look: Vec3, groundAt: (x: number, z: number) => number): FxStressScene {
  const h = Math.hypot(look.x, look.z) || 1
  const fwd = { x: look.x / h, z: look.z / h }, right = { x: -fwd.z, z: fwd.x }
  const ground = (along: number, across: number): Vec3 => {
    const x = eye.x + fwd.x * along + right.x * across, z = eye.z + fwd.z * along + right.z * across
    return v3(x, groundAt(x, z), z)
  }
  const len = Math.hypot(look.x, look.y, look.z) || 1
  const ahead = (d: number): Vec3 => v3(eye.x + (look.x / len) * d, eye.y + (look.y / len) * d, eye.z + (look.z / len) * d)
  const center = ground(STRESS_RANGE_M, 0)
  const t = (recipe: FxTrigger['recipe'], position: Vec3): FxTrigger => ({ recipe, position, velocity: ZERO })
  const s = (key: string, recipe: FxSustained['recipe'], position: Vec3): FxSustained => ({ key: `stress:${key}`, recipe, intensity: 1, position, velocity: ZERO })
  const empty = { triggers: [], sustained: [], roundsHz: 0, center, anchors: [] }
  switch (name) {
    case 'budget': {
      const kill = v3(center.x, center.y + 150, center.z)
      const bombs = Array.from({ length: 8 }, (_, k) => t('bomb.land', ground(STRESS_RANGE_M + (k >> 2) * 40 - 20, (k % 4) * 40 - 60)))
      const rockets = Array.from({ length: 32 }, (_, k) => t(k % 2 === 0 ? 'rocket.land' : 'rocket.water', ground(STRESS_RANGE_M + ((k >> 3) - 1.5) * 25, (k % 8) * 20 - 70)))
      return {
        triggers: [...bombs, ...rockets, t('structure.collapse', ground(STRESS_RANGE_M, -90)), t('kill.air', kill)],
        sustained: [s('ship', 'ship.fire', ground(STRESS_RANGE_M, 90)), s('structure', 'structure.collapse', ground(STRESS_RANGE_M, -90)), s('kill', 'kill.air', kill)],
        roundsHz: 20, center, anchors: [{ name: 'center', position: center }, { name: 'kill', position: kill }],
      }
    }
    case 'bomb-land': return { ...empty, triggers: [t('bomb.land', center)], anchors: [{ name: 'center', position: center }] }
    case 'bomb-water': return { ...empty, triggers: [t('bomb.water', center)], anchors: [{ name: 'center', position: center }] }
    case 'air-kill': { const p = ahead(400); return { ...empty, triggers: [t('kill.air', p)], sustained: [s('kill', 'kill.air', p)], anchors: [{ name: 'kill', position: p }] } }
    case 'smoke-base': { const base = ground(SMOKE_BASE_RANGE_M, 0); return { ...empty, sustained: [s('base', 'structure.collapse', base)], anchors: [{ name: 'base', position: base }] } }
    case 'cloud-fireball': { const p = ahead(800); return { ...empty, triggers: [t('kill.air', p)], anchors: [{ name: 'fireball', position: p }] } }
    case 'eye-smoke': return { ...empty, sustained: [s('plume', 'ship.fire', ahead(5)), s('column', 'structure.collapse', v3(eye.x, eye.y - 3, eye.z))], anchors: [] }
    case 'none': return empty
  }
}

/** The k-th gunfire burst: one round into land and one into water, spread
 *  over 60 m around `center` by a fixed low-discrepancy sequence. */
export function stressRounds(center: Vec3, k: number): readonly FxTrigger[] {
  const a = (k * 0.618034) % 1, b = (k * 0.414214) % 1
  return [
    { recipe: 'round.land', position: v3(center.x + (a - 0.5) * 60, center.y, center.z + (b - 0.5) * 60), velocity: ZERO },
    { recipe: 'round.water', position: v3(center.x + (b - 0.5) * 60, center.y, center.z + (a - 0.5) * 60 + 40), velocity: ZERO },
  ]
}
