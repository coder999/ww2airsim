import type { Vec3 } from '../math/vec3.js'

/**
 * What a bomb, rocket or round ended on (ordnance-and-effects design §3.1).
 * The first six are the spec's union; `'air'` is E1 Ruling R1 -- where a bomb
 * or rocket is when its `lifeS` runs out, which the spec's union has no
 * value for.
 */
export type ImpactSurface = 'water' | 'land' | 'deck' | 'aircraft' | 'ship' | 'structure' | 'air'

/** One entry of `CombatState.impacts`. `point` is the exact contact point
 *  `stepCombat` already computes for damage (or, for an expiry, where the
 *  projectile was), in world metres. */
export type CombatImpact = {
  readonly tick: number
  readonly cause: 'round' | 'bomb' | 'rocket' | 'torpedo'
  /** `entered` and `broke-up` are a torpedo's only: it reached the water and began its run, or it
   *  met the water outside its drop envelope (or met anything else first) and broke up. */
  readonly outcome: 'detonated' | 'expired' | 'entered' | 'broke-up'
  readonly surface: ImpactSurface
  readonly point: Vec3
}

/** Oldest entries fall off past this. `MAX_STEPS_PER_FRAME` (5) ticks of
 *  heavy gunfire fit many times over; impacts.test.ts pins the margin. */
export const IMPACT_RING_CAPACITY = 512

/**
 * The ring after one tick. Returns `ring` ITSELF when nothing was added, so a
 * quiet tick allocates nothing and consumers can compare references.
 *
 * Nothing in `src/sim/` reads the ring (tests/architecture/impactsRing.test.ts):
 * it exists for the renderer (`src/render/fx/events.ts`), and the bit-identity
 * gate (plan E1 Task 1) holds only because no sim decision depends on it.
 */
export function appendImpacts(ring: readonly CombatImpact[], added: readonly CombatImpact[]): readonly CombatImpact[] {
  if (added.length === 0) return ring
  const next = ring.concat(added)
  return next.length <= IMPACT_RING_CAPACITY ? next : next.slice(next.length - IMPACT_RING_CAPACITY)
}
