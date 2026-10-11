import { describe, expect, it } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import {
  ballisticGunLead, constantSpeedLead, gunLayingPose, nearestGunTarget, type GunLayingTarget,
} from '../../../src/sim/weapons/gunLaying.js'

const target = (
  id: string,
  side: 'allied' | 'axis',
  kind: GunLayingTarget['kind'],
  position: ReturnType<typeof v3>,
  velocity = v3(0, 0, 0),
  accel = v3(0, 0, 0),
): GunLayingTarget => ({ id, side, kind, position, velocity, accel })

describe('gun-laying target choice (Track M, M3)', () => {
  it('chooses the nearest accepted target and keeps world order on an exact tie', () => {
    const targets = [
      target('first', 'allied', 'aircraft', v3(100, 0, 0)),
      target('tied', 'allied', 'aircraft', v3(-100, 0, 0)),
      target('near-friendly', 'axis', 'aircraft', v3(10, 0, 0)),
      target('far', 'allied', 'aircraft', v3(200, 0, 0)),
    ]
    expect(nearestGunTarget(v3(0, 0, 0), targets, (t) => t.side !== 'axis')?.id).toBe('first')
  })

  it('lets the caller express an AA envelope without duplicating selection', () => {
    const targets = [
      target('surface', 'allied', 'ship', v3(20, 0, 0)),
      target('too-far', 'allied', 'aircraft', v3(2000, 0, 0)),
      target('air', 'allied', 'aircraft', v3(400, 0, 0)),
    ]
    const picked = nearestGunTarget(v3(0, 0, 0), targets, (t, d) => t.kind === 'aircraft' && d <= 1000)
    expect(picked?.id).toBe('air')
  })
})

describe('gun-laying lead', () => {
  it('constant-speed lead points ahead of a crossing target and includes acceleration', () => {
    const crossing = target('p', 'allied', 'aircraft', v3(0, 100, -1000), v3(100, 0, 0))
    const straight = constantSpeedLead(v3(0, 0, 0), crossing, 500)!
    expect(straight.direction.x).toBeGreaterThan(0)
    expect(straight.timeS).toBeGreaterThan(2)
    const turning = constantSpeedLead(v3(0, 0, 0), { ...crossing, accel: v3(10, 0, 0) }, 500)!
    expect(turning.direction.x).toBeGreaterThan(straight.direction.x)
  })

  it('light-AA lead compensates for crossing velocity and projectile drop', () => {
    const crossing = target('p', 'allied', 'aircraft', v3(0, 100, -600), v3(100, 0, 0))
    const direction = ballisticGunLead(v3(0, 0, 0), v3(0, 0, 0), crossing, 840, 0.0004, 2)!
    expect(direction.x).toBeGreaterThan(0)
    expect(direction.y).toBeGreaterThan((100 / Math.hypot(100, 600)))
  })

  it('rejects an invalid shell speed instead of publishing NaN', () => {
    const still = target('p', 'allied', 'ship', v3(1000, 0, 0))
    expect(constantSpeedLead(v3(0, 0, 0), still, 0)).toBeNull()
    expect(constantSpeedLead(v3(0, 0, 0), still, Number.NaN)).toBeNull()
  })
})

describe('world aim to rendered ship-mount pose', () => {
  const p = target('p', 'allied', 'aircraft', v3(0, 0, 0))

  it('uses port-positive training from the content rest bearing', () => {
    // Ship points north. East is 90 degrees starboard, so a bow-resting mount trains -90 degrees.
    expect(gunLayingPose('Turret1', p, v3(1, 0, 0), 0, 0)?.trainingRad).toBeCloseTo(-Math.PI / 2, 12)
    // The same world direction is dead ahead when the ship points east.
    expect(gunLayingPose('Turret1', p, v3(1, 0, 0), Math.PI / 2, 0)?.trainingRad).toBeCloseTo(0, 12)
    // A stern-resting mount turns through its shorter half-turn toward the bow.
    expect(Math.abs(gunLayingPose('Turret2', p, v3(0, 0, -1), 0, Math.PI)!.trainingRad)).toBeCloseTo(Math.PI, 12)
  })

  it('publishes elevation above level and refuses a zero vector', () => {
    expect(gunLayingPose('HeavyAA1', p, v3(0, 1, -1), 0, 0)?.elevationRad).toBeCloseTo(Math.PI / 4, 12)
    expect(gunLayingPose('HeavyAA1', p, v3(0, 0, 0), 0, 0)).toBeNull()
  })
})
