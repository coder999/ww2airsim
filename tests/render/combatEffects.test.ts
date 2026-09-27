import { describe, it, expect } from 'vitest'
import { createTracers, MIN_TRACER_LENGTH_M, quatFromXTo, tracerInstances, TRACER_CAPACITY } from '../../src/render/scene/tracers.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { Projectile } from '../../src/sim/weapons/combat.js'

const round = (over: Partial<Projectile> = {}): Projectile => ({
  owner: 'p', id: 1, position: v3(100, 500, 0), previous: v3(85, 500.2, 0), velocity: v3(880, -3, 0), lifeS: 2, tracer: true, kind: 'round', ageS: 0, ...over,
})

describe('tracers read the projectile list (Plan 6)', () => {
  it('draws only tracer rounds, as a streak ending at the round and pointing along its travel', () => {
    const [t, ...rest] = tracerInstances([round(), round({ id: 2, tracer: false })])
    expect(rest).toEqual([])
    expect(t!.lengthM).toBeCloseTo(Math.hypot(15, 0.2), 9)
    // The streak's front is the round's position: midpoint + half length along the direction.
    const dir = qRotate(t!.attitude, v3(1, 0, 0))
    const front = v3(t!.position.x + dir.x * t!.lengthM / 2, t!.position.y + dir.y * t!.lengthM / 2, t!.position.z + dir.z * t!.lengthM / 2)
    expect(front.x).toBeCloseTo(100, 9)
    expect(front.y).toBeCloseTo(500, 9)
    expect(front.z).toBeCloseTo(0, 9)
  })

  it('gives a round born this frame a visible minimum streak along its velocity', () => {
    const [t] = tracerInstances([round({ previous: v3(100, 500, 0), velocity: v3(0, 0, -880) })])
    expect(t!.lengthM).toBe(MIN_TRACER_LENGTH_M)
    const dir = qRotate(t!.attitude, v3(1, 0, 0))
    expect(dir.z).toBeCloseTo(-1, 9)
  })

  it('rotates +X onto any direction, including straight back', () => {
    for (const d of [v3(0, 1, 0), v3(0, 0, 1), v3(-1, 0, 0), v3(0.6, -0.8, 0)]) {
      const r = qRotate(quatFromXTo(d), v3(1, 0, 0))
      expect(r.x).toBeCloseTo(d.x, 9)
      expect(r.y).toBeCloseTo(d.y, 9)
      expect(r.z).toBeCloseTo(d.z, 9)
    }
  })

  it('is bounded by the pool, and the mesh count follows the list frame to frame', () => {
    const many = Array.from({ length: TRACER_CAPACITY + 40 }, (_, i) => round({ id: i }))
    expect(tracerInstances(many)).toHaveLength(TRACER_CAPACITY)
    const tracers = createTracers(8)
    tracers.update(many)
    expect(tracers.object.count).toBe(8)
    expect(tracers.object.visible).toBe(true)
    tracers.update([])
    expect(tracers.object.count).toBe(0)
    expect(tracers.object.visible).toBe(false)
  })
})
