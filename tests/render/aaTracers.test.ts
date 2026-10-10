import { describe, expect, it } from 'vitest'
import { v3 } from '../../src/sim/math/vec3.js'
import type { Projectile } from '../../src/sim/weapons/combat.js'
import { AA_TRACER_CAPACITY, AA_TRACER_MIN_LENGTH_M, AA_TRACER_MIN_WIDTH_M, aaTracerInstances } from '../../src/render/scene/aaTracers.js'
import { tracerInstances } from '../../src/render/scene/tracers.js'

/** M2: AA tracers are their own mesh, long and thick enough to see at AA range, and an airplane's tracers do not use it. */
const round = (id: number, x: number, extra: Partial<Projectile> = {}): Projectile =>
  ({ owner: 'dd-1', id, position: v3(x, 100, 0), previous: v3(x - 14, 100, 0), velocity: v3(880, 0, 0), lifeS: 2, tracer: true, kind: 'round', ageS: 0, aa: 8, ...extra })
const EYE = v3(0, 100, 0)

describe('AA tracers (M2)', () => {
  it('draws only AA tracers, and the airplane tracer mesh draws none of them', () => {
    const mix = [round(1, 500), round(2, 600, { tracer: false }), { ...round(3, 700, { owner: 'f6f-1' }), aa: undefined } as unknown as Projectile]
    expect(aaTracerInstances(mix, EYE)).toHaveLength(1)
    expect(tracerInstances(mix).map((t) => t.position.x)).toEqual([700 - 0.5 * Math.max(14, 3)])
  })
  it('is longer than a tick of travel, and thicker the farther it is, but never thinner than a floor', () => {
    const [near, far] = aaTracerInstances([round(1, 50), round(2, 3000)], EYE)
    expect(near!.lengthM).toBeGreaterThanOrEqual(AA_TRACER_MIN_LENGTH_M)
    expect(near!.widthM).toBe(AA_TRACER_MIN_WIDTH_M)
    expect(far!.widthM).toBeGreaterThan(near!.widthM * 5)
    // Its front is the round's position; it trails behind along the travel.
    expect(far!.position.x).toBeLessThan(3000)
  })
  it('keeps the nearest when there are more than the mesh holds', () => {
    const many = Array.from({ length: AA_TRACER_CAPACITY + 50 }, (_, i) => round(i, 100 + i * 10))
    const out = aaTracerInstances(many, EYE)
    expect(out).toHaveLength(AA_TRACER_CAPACITY)
    expect(Math.max(...out.map((t) => t.position.x))).toBeLessThan(100 + (AA_TRACER_CAPACITY + 1) * 10)
  })
})
