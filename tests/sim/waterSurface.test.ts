import { describe, expect, it } from 'vitest'
import { v3 } from '../../src/sim/math/vec3.js'
import { waterSupportVelocity } from '../../src/sim/waterOperations.js'
import { watercraftPoseAt, waterForceForWind, waterSurfaceAt, waterSurfaceContext } from '../../src/sim/waterSurface.js'

describe('shared support sea', () => {
  it('is deterministic, calm for explicit zero wind, and advances on simulation time', () => {
    expect(waterForceForWind(v3(0, 0, 0))).toBe(0)
    expect(waterSurfaceAt(waterSurfaceContext(5, v3(0, 0, 0)), 40, -12)).toEqual({
      heightM: 0, verticalSpeedMps: 0, slopeX: 0, slopeZ: 0,
    })
    const ctx = waterSurfaceContext(5, null)
    expect(waterSurfaceAt(ctx, 40, -12)).toEqual(waterSurfaceAt(ctx, 40, -12))
    expect(waterSurfaceAt(waterSurfaceContext(6, null), 40, -12).heightM).not.toBe(waterSurfaceAt(ctx, 40, -12).heightM)
  })

  it('reports the height velocity encountered by a craft moving across wave slopes', () => {
    const x = 40, z = -12, t = 5, dt = 1e-4
    const velocity = v3(31, 0, -4)
    const ctx = waterSurfaceContext(t, null)
    const sample = waterSurfaceAt(ctx, x, z)
    const support = waterSupportVelocity(v3(0, sample.verticalSpeedMps, 0), sample, velocity)
    const before = waterSurfaceAt(waterSurfaceContext(t - dt, null), x - velocity.x * dt, z - velocity.z * dt)
    const after = waterSurfaceAt(waterSurfaceContext(t + dt, null), x + velocity.x * dt, z + velocity.z * dt)
    expect((after.heightM - before.heightM) / (2 * dt)).toBeCloseTo(support.y, 5)
  })

  it('gives a long ship a calmer angular response than a flying-boat-sized hull', () => {
    const ctx = waterSurfaceContext(9, null)
    const small = watercraftPoseAt(ctx, 150, -70, 0.6, 20, 10)
    const carrier = watercraftPoseAt(ctx, 150, -70, 0.6, 265, 33)
    expect(Math.abs(carrier.pitchRad)).toBeLessThan(Math.abs(small.pitchRad))
    expect(Math.abs(carrier.rollRad)).toBeLessThan(Math.abs(small.rollRad))
  })
})
